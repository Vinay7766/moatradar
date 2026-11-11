import { ByokConfig, SupportedProvider } from "./types";

export const BYOK_STORAGE_KEY = "moatradar_byok_v1";

export const CLOUD_BYOK_PROVIDERS: SupportedProvider[] = [
  "gemini",
  "openai",
  "anthropic",
  "groq",
];

export function createEmptyByokConfig(): ByokConfig {
  return {
    apiKeys: {},
    ollamaBaseUrl: "",
  };
}

export function normalizeByokConfig(raw: unknown): ByokConfig {
  const empty = createEmptyByokConfig();
  if (!raw || typeof raw !== "object") {
    return empty;
  }

  const record = raw as Record<string, unknown>;
  const apiKeys: Partial<Record<SupportedProvider, string>> = {};

  if (record.apiKeys && typeof record.apiKeys === "object") {
    const rawKeys = record.apiKeys as Record<string, unknown>;
    for (const provider of CLOUD_BYOK_PROVIDERS) {
      const value = rawKeys[provider];
      if (typeof value === "string" && value.trim().length > 0) {
        apiKeys[provider] = value.trim();
      }
    }
  }

  const ollamaBaseUrl =
    typeof record.ollamaBaseUrl === "string" ? record.ollamaBaseUrl.trim() : "";

  return { apiKeys, ollamaBaseUrl };
}

export function loadByokConfig(): ByokConfig {
  if (typeof window === "undefined") {
    return createEmptyByokConfig();
  }
  try {
    const raw = window.localStorage.getItem(BYOK_STORAGE_KEY);
    if (!raw) return createEmptyByokConfig();
    return normalizeByokConfig(JSON.parse(raw));
  } catch {
    return createEmptyByokConfig();
  }
}

export function saveByokConfig(config: ByokConfig): ByokConfig {
  const normalized = normalizeByokConfig(config);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(BYOK_STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      // ignore storage quota or private-mode errors
    }
  }
  return normalized;
}

export function clearByokConfig(): ByokConfig {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(BYOK_STORAGE_KEY);
    } catch {
      // ignore storage errors
    }
  }
  return createEmptyByokConfig();
}

export function getActiveByokProviders(config: ByokConfig): SupportedProvider[] {
  return CLOUD_BYOK_PROVIDERS.filter((provider) => {
    const val = config.apiKeys[provider];
    return typeof val === "string" && val.trim().length > 0;
  });
}

export function getByokHeaders(
  provider?: SupportedProvider | "" | null
): Record<string, string> {
  const config = loadByokConfig();
  const headers: Record<string, string> = {};

  if (provider && provider !== "ollama") {
    const apiKey = config.apiKeys[provider]?.trim();
    if (apiKey) {
      headers["X-LLM-API-Key"] = apiKey;
    }
  }

  if (config.ollamaBaseUrl.trim()) {
    headers["X-Ollama-Base-URL"] = config.ollamaBaseUrl.trim();
  }

  return headers;
}
