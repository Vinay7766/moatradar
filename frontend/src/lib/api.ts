import {
  AgentEvent,
  ChatMessage,
  CompetitorCandidate,
  DossierSnapshot,
  MissionRun,
  OllamaCheckResult,
  ProviderInfo,
  RagCitation,
  SourceCitation,
  SupportedProvider,
  Workspace,
} from "./types";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
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

export async function fetchProviders(): Promise<{
  default_provider: SupportedProvider | "";
  default_model: string;
  providers: ProviderInfo[];
}> {
  return apiFetch("/api/providers");
}

export async function checkOllamaModel(model: string): Promise<OllamaCheckResult> {
  return apiFetch("/api/providers/ollama/check", {
    method: "POST",
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
    body: JSON.stringify(payload),
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
  competitors: CompetitorCandidate[]
): Promise<{ status: string; run_id: string; approved_count: number }> {
  return apiFetch(`/api/missions/${runId}/approve`, {
    method: "POST",
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
    body: JSON.stringify(payload),
  });
}
