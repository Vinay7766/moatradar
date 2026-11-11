"""Multi-provider LangChain chat model factory."""

from langchain_core.language_models.chat_models import BaseChatModel

from app.config import Settings, SupportedProvider, settings


class LlmConfigurationError(RuntimeError):
    """Raised when the requested LLM provider lacks an API key or valid configuration."""


def create_chat_model(
    provider: SupportedProvider,
    model_name: str,
    temperature: float = 0.2,
    app_settings: Settings | None = None,
) -> BaseChatModel:
    """Instantiate a real LangChain chat model for the requested provider."""
    cfg = app_settings or settings
    if provider == "ollama":
        base_url = cfg.ollama_base_url.strip().rstrip("/")
        if not base_url:
            raise LlmConfigurationError("OLLAMA_BASE_URL is not configured in .env.")
        from langchain_ollama import ChatOllama

        return ChatOllama(
            model=model_name,
            base_url=base_url,
            temperature=temperature,
        )

    api_key = cfg.get_api_key(provider)
    if not api_key:
        raise LlmConfigurationError(
            f"API key for provider '{provider}' is not configured in .env."
        )

    if provider == "gemini":
        from langchain_google_genai import ChatGoogleGenerativeAI

        return ChatGoogleGenerativeAI(
            model=model_name,
            google_api_key=api_key,
            temperature=temperature,
        )

    if provider == "openai":
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(
            model=model_name,
            api_key=api_key,
            temperature=temperature,
        )

    if provider == "anthropic":
        from langchain_anthropic import ChatAnthropic

        return ChatAnthropic(
            model=model_name,
            api_key=api_key,
            temperature=temperature,
        )

    if provider == "groq":
        from langchain_groq import ChatGroq

        return ChatGroq(
            model=model_name,
            api_key=api_key,
            temperature=temperature,
        )

    raise LlmConfigurationError(f"Unsupported LLM provider: {provider}")
