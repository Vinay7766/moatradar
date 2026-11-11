"""Configuration management for MoatRadar."""

from pathlib import Path
from typing import Any, Literal

import httpx
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent.parent
ENV_FILE = BASE_DIR / ".env"

SupportedProvider = Literal["gemini", "openai", "anthropic", "groq", "ollama"]
SUPPORTED_PROVIDERS: tuple[SupportedProvider, ...] = (
    "gemini",
    "openai",
    "anthropic",
    "groq",
    "ollama",
)


class Settings(BaseSettings):
    """Application settings loaded from environment variables or .env."""

    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    gemini_api_key: str = Field(default="")
    openai_api_key: str = Field(default="")
    anthropic_api_key: str = Field(default="")
    groq_api_key: str = Field(default="")
    ollama_base_url: str = Field(default="http://127.0.0.1:11434")

    default_llm_provider: str = Field(default="")
    default_llm_model: str = Field(default="")

    sqlite_db_path: str = str(BASE_DIR / "backend" / "data" / "cmi_desk.db")
    chroma_persist_dir: str = str(BASE_DIR / "backend" / "data" / "chroma")
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    max_critic_iterations: int = 2
    max_competitors: int = 6
    http_timeout_seconds: float = 10.0

    def get_api_key(self, provider: SupportedProvider) -> str:
        """Return API key for cloud providers, or empty string for local Ollama."""
        if provider == "ollama":
            return ""
        mapping = {
            "gemini": self.gemini_api_key,
            "openai": self.openai_api_key,
            "anthropic": self.anthropic_api_key,
            "groq": self.groq_api_key,
        }
        return mapping[provider].strip()

    def discover_ollama_models(self) -> tuple[bool, list[str]]:
        """Probe local Ollama `/api/tags` and return `(reachable, installed_model_names)`."""
        base_url = self.ollama_base_url.strip().rstrip("/")
        if not base_url:
            return False, []
        try:
            response = httpx.get(f"{base_url}/api/tags", timeout=0.8)
            response.raise_for_status()
            payload = response.json()
            names = [
                str(item.get("name")).strip()
                for item in payload.get("models", [])
                if isinstance(item, dict) and item.get("name")
            ]
        except (httpx.HTTPError, ValueError):
            return False, []
        return True, names

    def discover_provider_models(self, provider: SupportedProvider) -> list[str]:
        """Dynamically query live model IDs from configured providers without hardcoding."""
        if provider == "ollama":
            _, names = self.discover_ollama_models()
            return names

        api_key = self.get_api_key(provider)
        if not api_key:
            return []

        try:
            if provider == "gemini":
                resp = httpx.get(
                    "https://generativelanguage.googleapis.com/v1beta/models",
                    params={"key": api_key, "pageSize": 50},
                    timeout=1.5,
                )
                resp.raise_for_status()
                items = resp.json().get("models", [])
                return [
                    str(m.get("name", "")).removeprefix("models/")
                    for m in items
                    if isinstance(m, dict)
                    and "generateContent" in (m.get("supportedGenerationMethods") or [])
                    and m.get("name")
                ]

            if provider in {"openai", "groq"}:
                url = (
                    "https://api.openai.com/v1/models"
                    if provider == "openai"
                    else "https://api.groq.com/openai/v1/models"
                )
                resp = httpx.get(
                    url,
                    headers={"Authorization": f"Bearer {api_key}"},
                    timeout=1.5,
                )
                resp.raise_for_status()
                items = resp.json().get("data", [])
                return sorted(
                    str(m["id"]) for m in items if isinstance(m, dict) and m.get("id")
                )

            if provider == "anthropic":
                resp = httpx.get(
                    "https://api.anthropic.com/v1/models",
                    headers={
                        "x-api-key": api_key,
                        "anthropic-version": "2023-06-01",
                    },
                    timeout=1.5,
                )
                resp.raise_for_status()
                items = resp.json().get("data", [])
                return [
                    str(m["id"]) for m in items if isinstance(m, dict) and m.get("id")
                ]
        except (httpx.HTTPError, ValueError):
            return []
        return []

    def check_ollama_model(self, model_name: str) -> dict[str, Any]:
        """Verify whether Ollama is reachable and has the requested model installed."""
        target = model_name.strip()
        base_url = self.ollama_base_url.strip().rstrip("/")
        if not base_url:
            return {
                "reachable": False,
                "available": False,
                "model": target,
                "installed_models": [],
                "details": {},
                "detail": "OLLAMA_BASE_URL is not configured in .env.",
            }

        reachable, installed = self.discover_ollama_models()
        if not reachable:
            return {
                "reachable": False,
                "available": False,
                "model": target,
                "installed_models": [],
                "details": {},
                "detail": f"Ollama server is not reachable at {base_url}. Run 'ollama serve' first.",
            }

        if not target:
            return {
                "reachable": True,
                "available": False,
                "model": "",
                "installed_models": installed,
                "details": {},
                "detail": "Enter an Ollama model tag to check (e.g. gemma4:12b).",
            }

        matched = target in installed or (
            ":" not in target and f"{target}:latest" in installed
        )
        if not matched:
            return {
                "reachable": True,
                "available": False,
                "model": target,
                "installed_models": installed,
                "details": {},
                "detail": (
                    f"Model '{target}' is not installed on Ollama. "
                    f"Pull it first with: ollama pull {target}"
                ),
            }

        details: dict[str, Any] = {}
        try:
            show_resp = httpx.post(
                f"{base_url}/api/show",
                json={"model": target},
                timeout=1.2,
            )
            if show_resp.status_code == 200:
                show_data = show_resp.json()
                raw_details = show_data.get("details")
                if isinstance(raw_details, dict):
                    details = {
                        k: v
                        for k, v in raw_details.items()
                        if k in {"family", "parameter_size", "quantization_level", "format"}
                    }
        except (httpx.HTTPError, ValueError):
            details = {}

        return {
            "reachable": True,
            "available": True,
            "model": target,
            "installed_models": installed,
            "details": details,
            "detail": f"Model '{target}' is installed and ready on Ollama.",
        }

    def provider_unavailable_reason(
        self, provider: SupportedProvider, model_name: str = ""
    ) -> str | None:
        """Return None when provider (and Ollama model, if applicable) is ready."""
        if provider == "ollama":
            status = self.check_ollama_model(model_name)
            if not status["reachable"]:
                return str(status["detail"])
            if model_name.strip() and not status["available"]:
                return str(status["detail"])
            return None

        if not self.get_api_key(provider):
            return (
                f"LLM provider '{provider}' has no API key configured in .env. "
                "Add the key in .env or select another configured provider."
            )
        return None

    def configured_providers(self) -> list[dict[str, Any]]:
        """Return non-sensitive provider availability metadata without hardcoded models."""
        providers: list[dict[str, Any]] = []
        for provider in SUPPORTED_PROVIDERS:
            if provider == "ollama":
                available, models = self.discover_ollama_models()
            else:
                available = bool(self.get_api_key(provider))
                models = self.discover_provider_models(provider) if available else []
            providers.append(
                {
                    "provider": provider,
                    "configured": available,
                    "models": models,
                    "default_model": models[0] if models else "",
                }
            )
        return providers

    @property
    def cors_origin_list(self) -> list[str]:
        """Parse comma-separated CORS origins."""
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    def with_overrides(
        self,
        provider: SupportedProvider | None = None,
        api_key: str | None = None,
        ollama_base_url: str | None = None,
    ) -> "Settings":
        """Return an ephemeral Settings copy with per-request BYOK/Ollama overrides."""
        updates: dict[str, Any] = {}
        if ollama_base_url is not None and ollama_base_url.strip():
            updates["ollama_base_url"] = ollama_base_url.strip()
        if (
            api_key is not None
            and api_key.strip()
            and provider in {"gemini", "openai", "anthropic", "groq"}
        ):
            updates[f"{provider}_api_key"] = api_key.strip()
        return self.model_copy(update=updates) if updates else self.model_copy()


settings = Settings()
