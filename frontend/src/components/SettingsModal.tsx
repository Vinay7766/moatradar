"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { CLOUD_BYOK_PROVIDERS } from "@/lib/byokStorage";
import { ByokConfig, SupportedProvider } from "@/lib/types";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: ByokConfig;
  onSaveAndRefresh: (nextConfig: ByokConfig) => Promise<void>;
  onClearAll: () => Promise<void>;
}

const PROVIDER_META: Record<
  Exclude<SupportedProvider, "ollama">,
  { label: string; placeholder: string; hint: string }
> = {
  gemini: {
    label: "Google Gemini API Key",
    placeholder: "AIza...",
    hint: "Used for Gemini 2.5 Flash / Pro models",
  },
  openai: {
    label: "OpenAI API Key",
    placeholder: "sk-...",
    hint: "Used for GPT-4o / GPT-4.1 models",
  },
  anthropic: {
    label: "Anthropic API Key",
    placeholder: "sk-ant-...",
    hint: "Used for Claude Sonnet / Haiku models",
  },
  groq: {
    label: "Groq API Key",
    placeholder: "gsk_...",
    hint: "Used for fast Llama / Mixtral inference",
  },
};

export function SettingsModal({
  isOpen,
  onClose,
  config,
  onSaveAndRefresh,
  onClearAll,
}: SettingsModalProps) {
  if (!isOpen) return null;

  return (
    <SettingsModalDialog
      config={config}
      onClose={onClose}
      onSaveAndRefresh={onSaveAndRefresh}
      onClearAll={onClearAll}
    />
  );
}

function SettingsModalDialog({
  config,
  onClose,
  onSaveAndRefresh,
  onClearAll,
}: Omit<SettingsModalProps, "isOpen">) {
  const [apiKeys, setApiKeys] = useState<Partial<Record<SupportedProvider, string>>>(
    () => ({ ...config.apiKeys })
  );
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState(
    () => config.ollamaBaseUrl || ""
  );
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !isSaving && !isClearing) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, isSaving, isClearing]);

  function updateKey(provider: SupportedProvider, value: string) {
    setApiKeys((prev) => ({ ...prev, [provider]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      await onSaveAndRefresh({ apiKeys, ollamaBaseUrl });
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save BYOK settings."
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleClear() {
    setError(null);
    setIsClearing(true);
    try {
      setApiKeys({});
      setOllamaBaseUrl("");
      await onClearAll();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear keys.");
    } finally {
      setIsClearing(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 print:hidden"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSaving && !isClearing) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="byok-settings-title"
        className="w-full max-w-xl rounded-xl border border-slate-200 bg-white shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-100 text-teal-800 flex items-center justify-center">
              <KeyRound className="w-4 h-4" />
            </div>
            <div>
              <h2
                id="byok-settings-title"
                className="text-base font-semibold text-slate-900"
              >
                BYOK &amp; Local Ollama Settings
              </h2>
              <p className="text-xs text-slate-500">
                Bring your own provider API keys or custom Ollama endpoint
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving || isClearing}
            aria-label="Close settings modal"
            className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-200/70 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          <div className="flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-900">
            <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0 text-emerald-700" />
            <div>
              <p className="font-semibold">
                Stored locally in browser only — never sent to server DB
              </p>
              <p className="mt-0.5 text-emerald-800">
                Keys are saved in <code>localStorage</code> and sent ephemerally per request via{" "}
                <code>X-LLM-API-Key</code> / <code>X-Ollama-Base-URL</code> headers. They are never logged or persisted in SQLite.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {CLOUD_BYOK_PROVIDERS.map((provider) => {
              const meta =
                PROVIDER_META[provider as Exclude<SupportedProvider, "ollama">];
              const value = apiKeys[provider] || "";
              const isVisible = Boolean(revealed[provider]);
              const hasValue = value.trim().length > 0;

              return (
                <div key={provider} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor={`byok-${provider}`}
                      className="text-xs font-semibold text-slate-800"
                    >
                      {meta.label}
                    </label>
                    {hasValue && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                        <CheckCircle2 className="w-3 h-3" />
                        Active in browser
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="relative flex-1">
                      <input
                        id={`byok-${provider}`}
                        type={isVisible ? "text" : "password"}
                        value={value}
                        onChange={(e) => updateKey(provider, e.target.value)}
                        placeholder={meta.placeholder}
                        autoComplete="off"
                        className="w-full rounded-md border border-slate-300 px-3 py-2 pr-9 text-xs font-mono text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setRevealed((prev) => ({
                            ...prev,
                            [provider]: !prev[provider],
                          }))
                        }
                        aria-label={isVisible ? `Hide ${provider} key` : `Show ${provider} key`}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
                      >
                        {isVisible ? (
                          <EyeOff className="w-3.5 h-3.5" />
                        ) : (
                          <Eye className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                    {hasValue && (
                      <button
                        type="button"
                        onClick={() => updateKey(provider, "")}
                        aria-label={`Clear ${provider} key`}
                        className="p-2 rounded-md border border-slate-200 text-slate-500 hover:text-rose-700 hover:border-rose-200 hover:bg-rose-50 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500">{meta.hint}</p>
                </div>
              );
            })}
          </div>

          <div className="pt-2 border-t border-slate-100 space-y-1">
            <label
              htmlFor="byok-ollama-url"
              className="block text-xs font-semibold text-slate-800"
            >
              Custom Ollama Base URL (optional)
            </label>
            <input
              id="byok-ollama-url"
              type="url"
              value={ollamaBaseUrl}
              onChange={(e) => setOllamaBaseUrl(e.target.value)}
              placeholder="http://localhost:11434"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs font-mono text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
            />
            <p className="text-[11px] text-slate-500">
              Leave empty to use the backend&apos;s default <code>OLLAMA_BASE_URL</code>.
            </p>
          </div>

          {error && (
            <p role="alert" className="text-xs font-medium text-rose-700">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => void handleClear()}
              disabled={isSaving || isClearing}
              className="inline-flex items-center gap-1.5 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-50"
            >
              {isClearing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Trash2 className="w-3.5 h-3.5" />
              )}
              Clear All Browser Keys
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving || isClearing}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving || isClearing}
                className="inline-flex items-center gap-1.5 rounded-md bg-teal-700 px-4 py-2 text-xs font-medium text-white hover:bg-teal-800 disabled:opacity-50"
              >
                {isSaving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                Save &amp; Refresh Models
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
