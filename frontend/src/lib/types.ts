export type SupportedProvider = "gemini" | "openai" | "anthropic" | "groq" | "ollama";

export type MissionStatus =
  | "discovering"
  | "awaiting_approval"
  | "researching"
  | "verifying"
  | "synthesizing"
  | "completed"
  | "failed";

export interface ProviderInfo {
  provider: SupportedProvider;
  configured: boolean;
  models: string[];
  default_model: string;
}

export interface Workspace {
  id: string;
  name: string;
  product_name: string;
  product_description: string;
  target_segment: string;
  created_at: string;
  snapshot_count?: number;
  last_snapshot_at?: string | null;
  latest_run_id?: string | null;
  latest_run_status?: MissionStatus | null;
}

export interface CompetitorCandidate {
  name: string;
  website: string;
  category: "direct" | "adjacent" | "substitute";
  rationale: string;
}

export interface FeatureComparisonRow {
  capability: string;
  category: string;
  importance: "high" | "medium" | "low";
  competitor_support: Record<string, string>;
  citation_urls: string[];
}

export interface PricingTierSnapshot {
  competitor_name: string;
  billing_model: string;
  free_tier: string;
  entry_price: string;
  mid_tier: string;
  enterprise_tier: string;
  key_packaging_gates: string[];
  pricing_url: string;
  citation_urls: string[];
}

export interface SwotAnalysis {
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  threats: string[];
}

export interface CompetitorBattlecard {
  competitor_name: string;
  website: string;
  positioning: string;
  target_icp: string;
  key_differentiators: string[];
  swot: SwotAnalysis;
  how_to_win: string[];
  landmines_to_avoid: string[];
  citation_urls: string[];
}

export interface VocSentimentItem {
  competitor_name: string;
  sentiment: "complaint" | "praise" | "switching_trigger";
  platform: "hacker_news" | "reddit" | "github" | "web_review";
  theme: string;
  evidence_quote: string;
  source_url: string;
}

export interface MomentumSignal {
  competitor_name: string;
  signal_type: "launch" | "community" | "open_source" | "news";
  headline: string;
  takeaway: string;
  source_url: string;
}

export interface OpportunityItem {
  title: string;
  problem_evidence: string;
  recommended_feature_or_bet: string;
  impact_score: number;
  effort_score: number;
  horizon: "Now (0-3m)" | "Next (3-6m)" | "Later (6-12m)";
  citation_urls: string[];
}

export interface DossierPayload {
  executive_brief_md: string;
  market_trends: string[];
  feature_matrix: FeatureComparisonRow[];
  pricing_matrix: PricingTierSnapshot[];
  battlecards: CompetitorBattlecard[];
  voc_insights: VocSentimentItem[];
  momentum_signals: MomentumSignal[];
  opportunities: OpportunityItem[];
}

export interface DiffChangeItem {
  category: "competitors" | "pricing" | "features" | "voc" | "opportunities";
  target: string;
  change_type: "added" | "removed" | "modified";
  summary: string;
}

export interface DiffSummary {
  previous_snapshot_id: string | null;
  previous_created_at: string | null;
  has_changes: boolean;
  headline: string;
  changes: DiffChangeItem[];
}

export interface SourceCitation {
  id: string;
  run_id: string;
  competitor_name: string;
  source_type: "web" | "pricing_page" | "hn" | "reddit" | "github";
  title: string;
  url: string;
  snippet: string;
  fetched_at: string;
}

export interface AgentEvent {
  id: string;
  run_id: string;
  node_name: string;
  event_type:
    | "status"
    | "tool_call"
    | "tool_result"
    | "hitl_interrupt"
    | "critic_review"
    | "retry_loop"
    | "completed"
    | "error";
  message: string;
  metadata: Record<string, unknown>;
  timestamp: string;
}

export interface MissionRun {
  id: string;
  workspace_id: string;
  thread_id: string;
  status: MissionStatus;
  llm_provider: SupportedProvider;
  llm_model: string;
  discovered_competitors: CompetitorCandidate[];
  approved_competitors: CompetitorCandidate[];
  critic_score: number | null;
  iteration_count: number;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
}

export interface DossierSnapshot {
  id: string;
  run_id: string;
  workspace_id: string;
  dossier: DossierPayload;
  diff_summary: DiffSummary | null;
  created_at: string;
}

export interface RagCitation {
  competitor_name: string;
  section: string;
  url: string;
  excerpt: string;
}

export interface ChatMessage {
  id: string;
  workspace_id: string;
  role: "user" | "assistant";
  content: string;
  citations: RagCitation[];
  created_at: string;
}
