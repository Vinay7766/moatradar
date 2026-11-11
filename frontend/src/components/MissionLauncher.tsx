"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Play,
  Sparkles,
  XCircle,
} from "lucide-react";
import { checkOllamaModel } from "@/lib/api";
import {
  OllamaCheckResult,
  ProviderInfo,
  SupportedProvider,
} from "@/lib/types";

interface MissionLauncherProps {
  providers: ProviderInfo[];
  selectedProvider: SupportedProvider | "";
  selectedModel: string;
  onChangeProvider: (provider: SupportedProvider | "", model: string) => void;
  onLaunch: (payload: {
    product_name: string;
    product_description: string;
    target_segment: string;
    seed_competitors: string[];
  }) => Promise<void>;
  isSubmitting: boolean;
  initialProduct?: {
    product_name: string;
    product_description: string;
    target_segment: string;
  } | null;
}

export function MissionLauncher({
  providers,
  selectedProvider,
  selectedModel,
  onChangeProvider,
  onLaunch,
  isSubmitting,
  initialProduct,
}: MissionLauncherProps) {
  const [productName, setProductName] = useState(
    initialProduct?.product_name || ""
  );
  const [description, setDescription] = useState(
    initialProduct?.product_description || ""
  );
  const [segment, setSegment] = useState(initialProduct?.target_segment || "");
  const [seedInput, setSeedInput] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [checkingOllama, setCheckingOllama] = useState(false);
  const [ollamaCheck, setOllamaCheck] = useState<OllamaCheckResult | null>(null);

  const activeProviderMeta = providers.find(
    (p) => p.provider === selectedProvider
  );
  const anyConfigured = providers.some((p) => p.configured);

  async function verifyOllama(modelToCheck: string): Promise<OllamaCheckResult | null> {
    const trimmed = modelToCheck.trim();
    if (!trimmed) {
      setFormError("Enter an Ollama model name first (e.g. gemma4:12b).");
      return null;
    }
    setCheckingOllama(true);
    setFormError(null);
    try {
      const res = await checkOllamaModel(trimmed);
      setOllamaCheck(res);
      return res;
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Failed to check Ollama model availability."
      );
      return null;
    } finally {
      setCheckingOllama(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (productName.trim().length < 2) {
      setFormError("Enter a product or market topic name (min 2 chars).");
      return;
    }
    if (description.trim().length < 10) {
      setFormError("Provide a short product description (min 10 chars).");
      return;
    }
    if (segment.trim().length < 2) {
      setFormError("Specify your target PM segment or ICP.");
      return;
    }
    if (!selectedProvider) {
      setFormError("Select a configured LLM provider.");
      return;
    }
    if (!selectedModel.trim()) {
      setFormError("Enter or select an LLM model name.");
      return;
    }
    if (selectedProvider === "ollama") {
      const status =
        ollamaCheck && ollamaCheck.model === selectedModel.trim()
          ? ollamaCheck
          : await verifyOllama(selectedModel);
      if (!status || !status.available) {
        setFormError(
          status?.detail || `Ollama model '${selectedModel.trim()}' is not available.`
        );
        return;
      }
    }

    const seeds = seedInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 6);

    try {
      await onLaunch({
        product_name: productName.trim(),
        product_description: description.trim(),
        target_segment: segment.trim(),
        seed_competitors: seeds,
      });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to launch mission.");
    }
  }

  return (
    <section className="bg-white border border-slate-200 rounded-lg p-6">
      <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-teal-700">
            <Sparkles className="w-3.5 h-3.5" />
            Live Multi-Agent Pipeline
          </div>
          <h2 className="mt-1 text-lg font-semibold text-slate-900">
            Launch Competitive Intelligence Mission
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Agents run live zero-key web, pricing, Hacker News, Reddit, and GitHub searches with Critic verification.
          </p>
        </div>
      </div>

      {!anyConfigured && (
        <div
          role="alert"
          className="mt-4 flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
        >
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-700" />
          <div>
            <p className="font-medium">No LLM provider ready</p>
            <p className="text-xs text-amber-800 mt-0.5">
              Set a key in <code>.env</code> (<code>GEMINI_API_KEY</code>, <code>OPENAI_API_KEY</code>, <code>ANTHROPIC_API_KEY</code>, or <code>GROQ_API_KEY</code>) or start local Ollama (<code>ollama serve</code> + <code>ollama pull &lt;model&gt;</code>) and refresh.
            </p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="product-name"
              className="block text-sm font-medium text-slate-800"
            >
              Your Product or Market Topic
            </label>
            <input
              id="product-name"
              type="text"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="e.g., Linear, Figma, AI Incident Triage Desk"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
            />
          </div>

          <div>
            <label
              htmlFor="target-segment"
              className="block text-sm font-medium text-slate-800"
            >
              Target Customer Segment (ICP)
            </label>
            <input
              id="target-segment"
              type="text"
              value={segment}
              onChange={(e) => setSegment(e.target.value)}
              placeholder="e.g., B2B SaaS Product & Engineering Teams"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="product-description"
            className="block text-sm font-medium text-slate-800"
          >
            Product Scope & Value Proposition
          </label>
          <textarea
            id="product-description"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what your product does, key workflows, and what competitive questions you need answered."
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-1">
            <label
              htmlFor="seed-competitors"
              className="block text-sm font-medium text-slate-800"
            >
              Seed Competitors (optional)
            </label>
            <input
              id="seed-competitors"
              type="text"
              value={seedInput}
              onChange={(e) => setSeedInput(e.target.value)}
              placeholder="e.g., Klue, Crayon, Kompyte"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
            />
          </div>

          <div>
            <label
              htmlFor="llm-provider"
              className="block text-sm font-medium text-slate-800"
            >
              LLM Provider
            </label>
            <select
              id="llm-provider"
              value={selectedProvider}
              onChange={(e) => {
                const next = e.target.value as SupportedProvider | "";
                const meta = providers.find((p) => p.provider === next);
                setOllamaCheck(null);
                onChangeProvider(next, meta?.default_model || "");
              }}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
            >
              <option value="">Select provider...</option>
              {providers.map((p) => (
                <option key={p.provider} value={p.provider}>
                  {p.provider.toUpperCase()}{" "}
                  {p.configured
                    ? "(Ready)"
                    : p.provider === "ollama"
                      ? "(Server offline)"
                      : "(Key missing)"}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="llm-model"
              className="block text-sm font-medium text-slate-800"
            >
              Model
            </label>
            <div className="mt-1 flex gap-2">
              <input
                id="llm-model"
                type="text"
                list="provider-models-datalist"
                value={selectedModel}
                onChange={(e) => {
                  setOllamaCheck(null);
                  onChangeProvider(selectedProvider, e.target.value);
                }}
                placeholder={
                  selectedProvider === "ollama"
                    ? "Enter Ollama model (e.g. gemma4:12b)"
                    : "Enter or choose model ID"
                }
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
              />
              {selectedProvider === "ollama" && (
                <button
                  type="button"
                  onClick={() => void verifyOllama(selectedModel)}
                  disabled={checkingOllama || !selectedModel.trim()}
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-100 disabled:opacity-50"
                >
                  {checkingOllama ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    "Check"
                  )}
                </button>
              )}
            </div>
            <datalist id="provider-models-datalist">
              {(activeProviderMeta?.models || []).map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
            {selectedProvider === "ollama" && ollamaCheck && (
              <p
                className={`mt-1.5 flex items-center gap-1.5 text-xs font-medium ${
                  ollamaCheck.available ? "text-emerald-700" : "text-rose-700"
                }`}
              >
                {ollamaCheck.available ? (
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <XCircle className="w-3.5 h-3.5 shrink-0" />
                )}
                <span>
                  {ollamaCheck.detail}
                  {ollamaCheck.available && ollamaCheck.details?.parameter_size
                    ? ` (${ollamaCheck.details.parameter_size})`
                    : ""}
                </span>
              </p>
            )}
          </div>
        </div>

        {formError && (
          <p role="alert" className="text-sm text-rose-700 font-medium">
            {formError}
          </p>
        )}

        <div className="flex items-center justify-end pt-2">
          <button
            type="submit"
            disabled={
              isSubmitting ||
              checkingOllama ||
              !activeProviderMeta?.configured ||
              !selectedModel.trim()
            }
            className="inline-flex items-center gap-2 rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Play className="w-4 h-4" />
            {isSubmitting ? "Starting Discovery..." : "Run Discovery & HITL Review"}
          </button>
        </div>
      </form>
    </section>
  );
}
