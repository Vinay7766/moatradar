"use client";

import { useState } from "react";
import { BellRing, CheckCircle2, Clock, Loader2, Save } from "lucide-react";
import {
  MonitorInterval,
  ProviderInfo,
  SupportedProvider,
  WorkspaceMonitor,
} from "@/lib/types";

interface MonitorSettingsPanelProps {
  workspaceId: string;
  monitor: WorkspaceMonitor | null;
  providers: ProviderInfo[];
  defaultProvider: SupportedProvider | "";
  defaultModel: string;
  onSave: (payload: {
    interval: MonitorInterval;
    webhook_url: string | null;
    llm_provider: SupportedProvider | "" | null;
    llm_model: string | null;
  }) => Promise<void>;
  isLoading?: boolean;
}

export function MonitorSettingsPanel({
  workspaceId,
  monitor,
  providers,
  defaultProvider,
  defaultModel,
  onSave,
  isLoading = false,
}: MonitorSettingsPanelProps) {
  const formKey = `${workspaceId}:${monitor?.interval ?? "off"}:${monitor?.webhook_url ?? ""}:${monitor?.llm_provider ?? ""}:${monitor?.llm_model ?? ""}`;

  return (
    <MonitorSettingsForm
      key={formKey}
      monitor={monitor}
      providers={providers}
      defaultProvider={defaultProvider}
      defaultModel={defaultModel}
      onSave={onSave}
      isLoading={isLoading}
    />
  );
}

function MonitorSettingsForm({
  monitor,
  providers,
  defaultProvider,
  defaultModel,
  onSave,
  isLoading,
}: Omit<MonitorSettingsPanelProps, "workspaceId">) {
  const [interval, setInterval] = useState<MonitorInterval>(
    monitor?.interval || "off"
  );
  const [webhookUrl, setWebhookUrl] = useState(monitor?.webhook_url || "");
  const [llmProvider, setLlmProvider] = useState<SupportedProvider | "">(
    (monitor?.llm_provider as SupportedProvider | "") || defaultProvider || ""
  );
  const [llmModel, setLlmModel] = useState(
    monitor?.llm_model || defaultModel || ""
  );
  const [isSaving, setIsSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSavedNotice(false);
    setIsSaving(true);
    try {
      await onSave({
        interval,
        webhook_url: webhookUrl.trim() || null,
        llm_provider: llmProvider || null,
        llm_model: llmModel.trim() || null,
      });
      setSavedNotice(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save monitor schedule."
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-800 bg-[#0f1623] p-4 flex flex-col shadow-xl print:hidden">
      <div className="flex items-start justify-between gap-2 pb-3 border-b border-slate-800">
        <div className="flex items-start gap-2">
          <BellRing className="w-4 h-4 text-teal-400 mt-0.5 shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-slate-100">
              Scheduled Monitor &amp; Diff Webhook
            </h3>
            <p className="text-xs text-slate-400">
              Run recurring workspace diffs using server env keys or local Ollama.
            </p>
          </div>
        </div>
        <span
          className={`px-2 py-0.5 rounded-full text-[11px] font-medium border ${
            interval === "off"
              ? "border-slate-700 bg-slate-900 text-slate-400"
              : "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
          }`}
        >
          {interval === "off" ? "Paused" : `Active (${interval})`}
        </span>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-xs text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading monitor config...
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-3 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {(["off", "daily", "weekly"] as MonitorInterval[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  setInterval(option);
                  setSavedNotice(false);
                }}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium capitalize transition-colors cursor-pointer ${
                  interval === option
                    ? "border-teal-500/50 bg-teal-500/15 text-teal-200"
                    : "border-slate-800 bg-slate-950 text-slate-400 hover:bg-slate-900 hover:text-slate-200"
                }`}
              >
                {option === "off" ? "Off (Manual)" : option}
              </button>
            ))}
          </div>

          <div>
            <label
              htmlFor="monitor-webhook-url"
              className="block text-xs font-medium text-slate-300"
            >
              Webhook Alert URL (optional, public HTTPS/HTTP)
            </label>
            <input
              id="monitor-webhook-url"
              type="url"
              value={webhookUrl}
              onChange={(e) => {
                setWebhookUrl(e.target.value);
                setSavedNotice(false);
              }}
              placeholder="https://hooks.slack.com/services/..."
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-teal-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label
                htmlFor="monitor-provider"
                className="block text-xs font-medium text-slate-300"
              >
                Monitor Provider
              </label>
              <select
                id="monitor-provider"
                value={llmProvider}
                onChange={(e) => {
                  const next = e.target.value as SupportedProvider | "";
                  const meta = providers.find((p) => p.provider === next);
                  setLlmProvider(next);
                  if (meta?.default_model) {
                    setLlmModel(meta.default_model);
                  }
                  setSavedNotice(false);
                }}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-100 focus:border-teal-500 focus:outline-none"
              >
                <option value="">Default server provider</option>
                {providers.map((p) => (
                  <option key={p.provider} value={p.provider}>
                    {p.provider.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="monitor-model"
                className="block text-xs font-medium text-slate-300"
              >
                Monitor Model
              </label>
              <input
                id="monitor-model"
                type="text"
                value={llmModel}
                onChange={(e) => {
                  setLlmModel(e.target.value);
                  setSavedNotice(false);
                }}
                placeholder="e.g. gemini-2.5-flash or gemma4:12b"
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-teal-500 focus:outline-none"
              />
            </div>
          </div>

          {monitor &&
            (monitor.last_run_at ||
              monitor.last_diff_headline ||
              monitor.last_status) && (
              <div className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-[11px] text-slate-300 space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1 font-medium text-slate-200">
                    <Clock className="w-3 h-3 text-slate-400" />
                    Last status: {monitor.last_status || "idle"}
                  </span>
                  {monitor.last_run_at && (
                    <span className="text-slate-500">
                      Last run: {new Date(monitor.last_run_at).toLocaleString()}
                    </span>
                  )}
                </div>
                {monitor.next_run_at && interval !== "off" && (
                  <p className="text-slate-400">
                    Next scheduled check:{" "}
                    {new Date(monitor.next_run_at).toLocaleString()}
                  </p>
                )}
                {monitor.last_diff_headline && (
                  <p className="text-teal-300 font-medium">
                    Diff summary: {monitor.last_diff_headline}
                  </p>
                )}
              </div>
            )}

          {error && (
            <p role="alert" className="text-xs font-medium text-rose-400">
              {error}
            </p>
          )}

          <div className="flex items-center justify-between gap-2 pt-1">
            {savedNotice ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Monitor settings saved
              </span>
            ) : (
              <span className="text-[11px] text-slate-500">
                Unattended runs never use browser-only BYOK keys.
              </span>
            )}
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-teal-400 disabled:opacity-50 cursor-pointer"
            >
              {isSaving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              Save Monitor
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
