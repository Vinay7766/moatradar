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
    <section className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col print:hidden">
      <div className="flex items-start justify-between gap-2 pb-3 border-b border-slate-100">
        <div className="flex items-start gap-2">
          <BellRing className="w-4 h-4 text-teal-700 mt-0.5 shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Scheduled Monitor &amp; Diff Webhook
            </h3>
            <p className="text-xs text-slate-500">
              Run recurring workspace diffs using server env keys or local Ollama.
            </p>
          </div>
        </div>
        <span
          className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
            interval === "off"
              ? "bg-slate-100 text-slate-600"
              : "bg-emerald-100 text-emerald-800"
          }`}
        >
          {interval === "off" ? "Paused" : `Active (${interval})`}
        </span>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-xs text-slate-500">
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
                className={`rounded-md border px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                  interval === option
                    ? "border-teal-700 bg-teal-50 text-teal-800"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {option === "off" ? "Off (Manual)" : option}
              </button>
            ))}
          </div>

          <div>
            <label
              htmlFor="monitor-webhook-url"
              className="block text-xs font-medium text-slate-700"
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
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label
                htmlFor="monitor-provider"
                className="block text-xs font-medium text-slate-700"
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
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-teal-600 focus:outline-none"
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
                className="block text-xs font-medium text-slate-700"
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
                className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none"
              />
            </div>
          </div>

          {monitor && (monitor.last_run_at || monitor.last_diff_headline || monitor.last_status) && (
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-700 space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1 font-medium text-slate-800">
                  <Clock className="w-3 h-3 text-slate-500" />
                  Last status: {monitor.last_status || "idle"}
                </span>
                {monitor.last_run_at && (
                  <span className="text-slate-500">
                    Last run: {new Date(monitor.last_run_at).toLocaleString()}
                  </span>
                )}
              </div>
              {monitor.next_run_at && interval !== "off" && (
                <p className="text-slate-500">
                  Next scheduled check: {new Date(monitor.next_run_at).toLocaleString()}
                </p>
              )}
              {monitor.last_diff_headline && (
                <p className="text-slate-800 font-medium">
                  Diff summary: {monitor.last_diff_headline}
                </p>
              )}
            </div>
          )}

          {error && (
            <p role="alert" className="text-xs font-medium text-rose-700">
              {error}
            </p>
          )}

          <div className="flex items-center justify-between gap-2 pt-1">
            {savedNotice ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Monitor settings saved
              </span>
            ) : (
              <span className="text-[11px] text-slate-400">
                Unattended runs never use browser-only BYOK keys.
              </span>
            )}
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 rounded-md bg-teal-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-800 disabled:opacity-50"
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
