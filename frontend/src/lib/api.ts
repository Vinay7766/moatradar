import {
  getActiveByokProviders,
  getByokHeaders,
  loadByokConfig,
} from "./byokStorage";
import {
  AgentEvent,
  ChatMessage,
  CompetitorCandidate,
  CustomDocument,
  DossierSnapshot,
  MissionRun,
  MonitorInterval,
  OllamaCheckResult,
  ProviderInfo,
  RagCitation,
  SourceCitation,
  SupportedProvider,
  Workspace,
  WorkspaceMonitor,
} from "./types";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const isFormData =
    typeof FormData !== "undefined" && init?.body instanceof FormData;
  const headers: Record<string, string> = isFormData
    ? {}
    : { "Content-Type": "application/json" };

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...headers,
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const errBody = await res.json();
      if (errBody?.detail) detail = String(errBody.detail);
    } catch {
      // ignore non-json errors
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export async function fetchProviders(
  provider?: SupportedProvider | ""
): Promise<{
  default_provider: SupportedProvider | "";
  default_model: string;
  providers: ProviderInfo[];
}> {
  const activeProvider =
    provider || getActiveByokProviders(loadByokConfig())[0] || "";
  return apiFetch("/api/providers", {
    headers: getByokHeaders(activeProvider),
  });
}

export async function checkOllamaModel(model: string): Promise<OllamaCheckResult> {
  return apiFetch("/api/providers/ollama/check", {
    method: "POST",
    headers: getByokHeaders("ollama"),
    body: JSON.stringify({ model }),
  });
}

export async function fetchWorkspaces(): Promise<{ workspaces: Workspace[] }> {
  return apiFetch("/api/workspaces");
}

export async function fetchWorkspaceSnapshots(workspaceId: string): Promise<{
  workspace: Workspace;
  snapshots: DossierSnapshot[];
}> {
  return apiFetch(`/api/workspaces/${workspaceId}/snapshots`);
}

export async function startMission(payload: {
  workspace_id?: string | null;
  product_name: string;
  product_description: string;
  target_segment: string;
  seed_competitors: string[];
  llm_provider: SupportedProvider;
  llm_model: string;
}): Promise<{ workspace: Workspace; run: MissionRun }> {
  return apiFetch("/api/missions", {
    method: "POST",
    headers: getByokHeaders(payload.llm_provider),
    body: JSON.stringify(payload),
  });
}

export async function retryMission(
  runId: string,
  opts?: {
    skipCompetitors?: string[];
    llmProvider?: SupportedProvider;
    llmModel?: string;
  }
): Promise<{ status?: string; run_id?: string; run?: MissionRun }> {
  const activeProvider =
    opts?.llmProvider || getActiveByokProviders(loadByokConfig())[0];
  return apiFetch(`/api/missions/${runId}/retry`, {
    method: "POST",
    headers: getByokHeaders(activeProvider),
    body: JSON.stringify({
      skip_competitors: opts?.skipCompetitors ?? [],
      ...(opts?.llmProvider ? { llm_provider: opts.llmProvider } : {}),
      ...(opts?.llmModel ? { llm_model: opts.llmModel } : {}),
    }),
  });
}

export async function fetchMission(runId: string): Promise<{
  run: MissionRun;
  snapshot: DossierSnapshot | null;
  citations: SourceCitation[];
  events: AgentEvent[];
}> {
  return apiFetch(`/api/missions/${runId}`);
}

export async function approveCompetitors(
  runId: string,
  competitors: CompetitorCandidate[],
  provider?: SupportedProvider | ""
): Promise<{ status: string; run_id: string; approved_count: number }> {
  const activeProvider =
    provider || getActiveByokProviders(loadByokConfig())[0];
  return apiFetch(`/api/missions/${runId}/approve`, {
    method: "POST",
    headers: getByokHeaders(activeProvider),
    body: JSON.stringify({ competitors }),
  });
}

export function subscribeMissionEvents(
  runId: string,
  onEvent: (event: AgentEvent) => void,
  onError?: () => void
): () => void {
  const source = new EventSource(`${API_BASE}/api/missions/${runId}/events`);
  source.onmessage = (msg) => {
    try {
      const parsed = JSON.parse(msg.data) as AgentEvent;
      onEvent(parsed);
    } catch {
      // ignore malformed frames
    }
  };
  source.onerror = () => {
    onError?.();
  };
  return () => source.close();
}

export function getExportUrl(runId: string, format: "markdown" | "json"): string {
  return `${API_BASE}/api/missions/${runId}/export?format=${format}`;
}

function extractFilenameFromHeader(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const match = header.match(/filename\*?=(?:UTF-8''|")?([^";\n]+)"?/i);
  return match?.[1]?.trim() || fallback;
}

/**
 * Fetches a mission deliverable export from FastAPI and triggers a direct file download
 * (avoiding cross-origin <a href> navigation or accidental HTML capture).
 */
export async function downloadDossierExport(
  runId: string,
  format: "markdown" | "json",
): Promise<void> {
  const res = await fetch(getExportUrl(runId, format), {
    cache: "no-store",
  });
  if (!res.ok) {
    let detail = `Export failed (${res.status})`;
    try {
      const payload = (await res.json()) as { detail?: string };
      if (payload.detail) detail = payload.detail;
    } catch {
      // ignore non-JSON error body
    }
    throw new Error(detail);
  }

  const ext = format === "markdown" ? "md" : "json";
  const fallbackName = `moatradar-dossier-${runId.slice(0, 8)}.${ext}`;
  const filename = extractFilenameFromHeader(
    res.headers.get("Content-Disposition"),
    fallbackName,
  );
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function fetchChatHistory(
  workspaceId: string
): Promise<{ messages: ChatMessage[] }> {
  return apiFetch(`/api/workspaces/${workspaceId}/chat`);
}

export async function sendWorkspaceChat(
  workspaceId: string,
  payload: {
    question: string;
    llm_provider: SupportedProvider;
    llm_model: string;
  }
): Promise<{
  answer: string;
  citations: RagCitation[];
  message: ChatMessage;
}> {
  return apiFetch(`/api/workspaces/${workspaceId}/chat`, {
    method: "POST",
    headers: getByokHeaders(payload.llm_provider),
    body: JSON.stringify(payload),
  });
}

export async function fetchWorkspaceDocuments(
  wsId: string
): Promise<{ documents: CustomDocument[] }> {
  const data = await apiFetch<{ documents?: CustomDocument[] }>(
    `/api/workspaces/${wsId}/documents`
  );
  return { documents: data.documents ?? [] };
}

export async function uploadWorkspaceDocument(
  wsId: string,
  file: File
): Promise<{ document: CustomDocument }> {
  const formData = new FormData();
  formData.append("file", file);
  const data = await apiFetch<{ document?: CustomDocument } | CustomDocument>(
    `/api/workspaces/${wsId}/documents`,
    {
      method: "POST",
      body: formData,
    }
  );
  if ("document" in data && data.document) {
    return { document: data.document };
  }
  return { document: data as CustomDocument };
}

export async function deleteWorkspaceDocument(
  wsId: string,
  docId: string
): Promise<{ deleted?: boolean; status?: string }> {
  return apiFetch(`/api/workspaces/${wsId}/documents/${docId}`, {
    method: "DELETE",
  });
}

export async function fetchWorkspaceMonitor(
  wsId: string
): Promise<WorkspaceMonitor> {
  const data = await apiFetch<
    { monitor?: WorkspaceMonitor } | WorkspaceMonitor
  >(`/api/workspaces/${wsId}/monitor`);
  if ("monitor" in data && data.monitor) {
    return data.monitor;
  }
  return data as WorkspaceMonitor;
}

export async function updateWorkspaceMonitor(
  wsId: string,
  payload: {
    interval: MonitorInterval;
    webhook_url?: string | null;
    llm_provider?: SupportedProvider | "" | null;
    llm_model?: string | null;
  }
): Promise<WorkspaceMonitor> {
  const data = await apiFetch<
    { monitor?: WorkspaceMonitor } | WorkspaceMonitor
  >(`/api/workspaces/${wsId}/monitor`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  if ("monitor" in data && data.monitor) {
    return data.monitor;
  }
  return data as WorkspaceMonitor;
}
