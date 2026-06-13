export type LlmStatus = "notProvisioned" | "downloading" | "ready" | "loaded" | "error";

export interface LlmStatusResponse {
  status: LlmStatus;
  modelPath: string;
  bytesDownloaded?: number | null;
  totalBytes?: number | null;
  lastError?: string | null;
}

export interface DownloadProgressEvent {
  bytesDownloaded: number;
  totalBytes: number;
}

export interface TokenEvent {
  token: string;
}

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface RagSpellContext {
  id: number;
  name: string;
  school?: string | null;
  level: number;
  descriptionSnippet: string;
}

export interface LlmChatGrounding {
  searchTerms: string[];
  groundedSpells: RagSpellContext[];
}

export interface DoneEvent {
  fullResponse: string;
  cancelled: boolean;
  searchTerms: string[];
  groundedSpells: RagSpellContext[];
  timedOut: boolean;
}

export type EmbeddingsStatus =
  | "notProvisioned"
  | "downloading"
  | "initializing"
  | "ready"
  | "error";

export interface EmbeddingsStatusResponse {
  state: EmbeddingsStatus;
  downloadProgress?: number | null;
  errorMessage?: string | null;
}

export interface EmbeddingsDownloadProgressEvent {
  bytesDownloaded: number;
  totalBytes: number;
}

export interface ReindexProgressEvent {
  current: number;
  total: number;
}

export interface SpellSummary {
  id: number;
  name: string;
  school?: string | null;
  sphere?: string | null;
  level: number;
  classList?: string | null;
  components?: string | null;
  duration?: string | null;
  source?: string | null;
  isQuestSpell: 0 | 1;
  isCantrip: 0 | 1;
  tags?: string | null;
}

export interface SemanticSearchResult extends SpellSummary {
  cosineDistance: number;
}

export interface ReindexResult {
  total: number;
  indexed: number;
  skipped: number;
  failed: number;
}
