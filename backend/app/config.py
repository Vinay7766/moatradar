"""Configuration management for CMI Desk."""

from pathlib import Path
from typing import Literal

import httpx
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent.parent
ENV_FILE = BASE_DIR / ".env"

SupportedProvider = Literal["gemini", "openai", "anthropic", "groq", "ollama"]

PROVIDER_MODELS: dict[SupportedProvider, list[str]] = {
    "gemini": ["gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.7-flash", "gemini-3.8-flash"],
    "openai": ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini"],
    "anthropic": ["claude-sonnet-4-20250514", "claude-3-5-haiku-latest"],
    "groq": ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"],
    "ollama": [],
}


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

    default_llm_provider: SupportedProvider = "gemini"
    default_llm_model: str = "gemini-3.5-flash"

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

    def provider_unavailable_reason(self, provider: SupportedProvider) -> str | None:
        """Return None when provider is ready, otherwise an actionable user error message."""
        if provider == "ollama":
            base_url = self.ollama_base_url.strip().rstrip("/")
            if not base_url:
                return "OLLAMA_BASE_URL is not configured in .env."
            reachable, models = self.discover_ollama_models()
            if not reachable:
                return (
                    f"Ollama server is not reachable at {base_url}. "
                    "Start Ollama (e.g. 'ollama serve') or select another provider."
                )
            if not models:
                return (
                    f"Ollama is running at {base_url}, but no models are installed. "
                    "Pull one first (e.g. 'ollama pull llama3.2')."
                )
            return None

        if not self.get_api_key(provider):
            return (
                f"LLM provider '{provider}' has no API key configured in .env. "
                "Add the key in .env or select another configured provider."
            )
        return None

    def configured_providers(self) -> list[dict]:
        """Return non-sensitive provider availability metadata."""
        providers: list[dict] = []
        for provider, fallback_models in PROVIDER_MODELS.items():
            if provider == "ollama":
                reachable, discovered = self.discover_ollama_models()
                available = reachable and bool(discovered)
                models = discovered
            else:
                available = bool(self.get_api_key(provider))
                models = fallback_models
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


settings = Settings()
