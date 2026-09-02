import type { LlmStatus } from "../../../types/llm";

export function spellNameToSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"] as const;
  const exponent = Math.max(
    0,
    Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1),
  );
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

/** Must satisfy backend `validate_stream_id` in `commands/llm.rs` (non-empty, 1–128 chars, `[A-Za-z0-9_-]+`). */
export function createStreamId(): string {
  return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function canSendChat(llmStatus: LlmStatus): boolean {
  return llmStatus === "ready" || llmStatus === "loaded";
}
