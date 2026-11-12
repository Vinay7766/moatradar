"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  GraduationCap,
  KeyRound,
  Loader2,
  Play,
  Sparkles,
  XCircle,
} from "lucide-react";
import { checkOllamaModel } from "@/lib/api";
import { getActiveByokProviders } from "@/lib/byokStorage";
import {
  ByokConfig,
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
  byokConfig?: ByokConfig;
  onOpenSettings?: () => void;
  onOpenWorkflowXRay?: (mode: "live" | "tutor") => void;
}

export function MissionLauncher({
  providers,
  selectedProvider,
  selectedModel,
  onChangeProvider,
  onLaunch,
  isSubmitting,
  initialProduct,
  byokConfig,
  onOpenSettings,
  onOpenWorkflowXRay,
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

  const activeByokProviders = byokConfig ? getActiveByokProviders(byokConfig) : [];
  const activeProviderMeta = providers.find(
    (p) => p.provider === selectedProvider
  );
  const selectedProviderReady = Boolean(
    activeProviderMeta?.configured ||
      (selectedProvider &&
        selectedProvider !== "ollama" &&
        activeByokProviders.includes(selectedProvider))
  );
  const anyConfigured =
    providers.some((p) => p.configured) || activeByokProviders.length > 0;

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
    <section className="rounded-xl border border-slate-800 bg-[#0f1623] p-6 shadow-xl">
      <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-teal-400">
            <Sparkles className="w-3.5 h-3.5" />
            Live Multi-Agent Pipeline
          </div>
          <h2 className="mt-1 text-lg font-semibold text-slate-100">
            Launch Competitive Intelligence Mission
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Agents run live zero-key web, pricing, Hacker News, Reddit, and GitHub searches with Critic verification.
          </p>
        </div>

        {onOpenWorkflowXRay && (
          <button
            type="button"
            onClick={() => onOpenWorkflowXRay("tutor")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-teal-500/40 bg-teal-500/15 px-3 py-1.5 text-xs font-semibold text-teal-200 hover:bg-teal-500/25 transition-colors cursor-pointer"
          >
            <GraduationCap className="w-3.5 h-3.5 text-teal-400" />
            Explore 3D Workflow &amp; AI Tutor
          </button>
        )}
      </div>

      {!initialProduct && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Quick Templates:
          </span>
          {[
            {
              label: "AI Code Editors",
              name: "CodeFlow AI",
              desc: "Collaborative AI IDE with codebase indexing, PR review agents, and local model privacy.",
              segment: "Mid-market & Enterprise Engineering Teams",
              seeds: "Cursor, Windsurf, GitHub Copilot",
            },
            {
              label: "Product Analytics",
              name: "PulseMetric",
              desc: "Self-serve funnel analytics, session replay, and automated cohort insights for SaaS PMs.",
              segment: "Series A-C B2B SaaS Product Teams",
              seeds: "PostHog, Mixpanel, Amplitude",
            },
            {
              label: "Sales Compete Intel",
              name: "MoatRadar",
              desc: "Autonomous multi-agent competitive research, battlecards, and pricing diff monitoring.",
              segment: "B2B SaaS Product Marketing & PMs",
              seeds: "Klue, Crayon, Kompyte",
            },
          ].map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => {
                setProductName(preset.name);
                setDescription(preset.desc);
                setSegment(preset.segment);
                setSeedInput(preset.seeds);
                setFormError(null);
              }}
              className="rounded-full border border-slate-700/80 bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-300 hover:border-teal-500/50 hover:bg-teal-500/15 hover:text-teal-200 transition-colors cursor-pointer"
            >
              + {preset.label}
            </button>
          ))}
        </div>
      )}

      {!anyConfigured && (
        <div
          role="alert"
          className="mt-4 flex flex-wrap items-start justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-400" />
            <div>
              <p className="font-medium text-amber-100">No LLM provider ready</p>
              <p className="text-xs text-amber-200/80 mt-0.5">
                Add your own browser key in <strong>API Keys</strong> (bottom-left), set a key in <code>.env</code>, or start local Ollama (<code>ollama serve</code>). No key yet? Try the zero-key Interactive AI Tutor.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {onOpenSettings && (
              <button
                type="button"
                onClick={onOpenSettings}
                className="inline-flex items-center gap-1.5 rounded-md border border-amber-400/50 bg-slate-900 px-2.5 py-1 text-xs font-medium text-amber-200 hover:bg-slate-800 cursor-pointer"
              >
                <KeyRound className="w-3.5 h-3.5" />
                Add Browser Key
              </button>
            )}
            {onOpenWorkflowXRay && (
              <button
                type="button"
                onClick={() => onOpenWorkflowXRay("tutor")}
                className="inline-flex items-center gap-1.5 rounded-md bg-teal-500 px-2.5 py-1 text-xs font-semibold text-slate-950 hover:bg-teal-400 cursor-pointer"
              >
                <GraduationCap className="w-3.5 h-3.5" />
                Launch Zero-Key AI Tutor
              </button>
            )}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="product-name"
              className="block text-xs font-semibold uppercase tracking-wide text-slate-300"
            >
              Your Product or Market Topic
            </label>
            <input
              id="product-name"
              type="text"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="e.g., Linear, Figma, AI Incident Triage Desk"
              className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950/90 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>

          <div>
            <label
              htmlFor="target-segment"
              className="block text-xs font-semibold uppercase tracking-wide text-slate-300"
            >
              Target Customer Segment (ICP)
            </label>
            <input
              id="target-segment"
              type="text"
              value={segment}
              onChange={(e) => setSegment(e.target.value)}
              placeholder="e.g., B2B SaaS Product & Engineering Teams"
              className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950/90 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="product-description"
            className="block text-xs font-semibold uppercase tracking-wide text-slate-300"
          >
            Product Scope &amp; Value Proposition
          </label>
          <textarea
            id="product-description"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what your product does, key workflows, and what competitive questions you need answered."
            className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950/90 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-1">
            <label
              htmlFor="seed-competitors"
              className="block text-xs font-semibold uppercase tracking-wide text-slate-300"
            >
              Seed Competitors (optional)
            </label>
            <input
              id="seed-competitors"
              type="text"
              value={seedInput}
              onChange={(e) => setSeedInput(e.target.value)}
              placeholder="e.g., Klue, Crayon, Kompyte"
              className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950/90 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>

          <div>
            <label
              htmlFor="llm-provider"
              className="block text-xs font-semibold uppercase tracking-wide text-slate-300"
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
              className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
            >
              <option value="">Select provider...</option>
              {providers.map((p) => {
                const hasByok = activeByokProviders.includes(p.provider);
                const ready = p.configured || hasByok;
                return (
                  <option key={p.provider} value={p.provider}>
                    {p.provider.toUpperCase()}{" "}
                    {ready
                      ? hasByok
                        ? "(Ready · BYOK)"
                        : "(Ready)"
                      : p.provider === "ollama"
                        ? "(Server offline)"
                        : "(Key missing)"}
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <label
              htmlFor="llm-model"
              className="block text-xs font-semibold uppercase tracking-wide text-slate-300"
            >
              Model
            </label>
            <div className="mt-1.5 flex gap-2">
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
                className="w-full rounded-lg border border-slate-700 bg-slate-950/90 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
              {selectedProvider === "ollama" && (
                <button
                  type="button"
                  onClick={() => void verifyOllama(selectedModel)}
                  disabled={checkingOllama || !selectedModel.trim()}
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
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
                  ollamaCheck.available ? "text-emerald-400" : "text-rose-400"
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
          <p role="alert" className="text-sm text-rose-400 font-medium">
            {formError}
          </p>
        )}

        <div className="flex items-center justify-end pt-2">
          <button
            type="submit"
            disabled={
              isSubmitting ||
              checkingOllama ||
              !selectedProviderReady ||
              !selectedModel.trim()
            }
            className="inline-flex items-center gap-2 rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-slate-950 shadow-sm shadow-teal-500/20 hover:bg-teal-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <Play className="w-4 h-4" />
            {isSubmitting ? "Starting Discovery..." : "Run Discovery & HITL Review"}
          </button>
        </div>
      </form>
    </section>
  );
}
