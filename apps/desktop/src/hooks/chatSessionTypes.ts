import type { LlmChatGrounding, RagSpellContext } from "../types/llm";

export interface ChatDisplayMessageBase {
  id: string;
}

export interface UserDisplayMessage extends ChatDisplayMessageBase {
  kind: "user";
  content: string;
}

export interface AssistantDisplayMessage extends ChatDisplayMessageBase {
  kind: "assistant";
  content: string;
  grounding: LlmChatGrounding | null;
  groundedSpells: RagSpellContext[];
  isStreaming: boolean;
  cancelled: boolean;
  timedOut: boolean;
}

export interface SystemDisplayMessage extends ChatDisplayMessageBase {
  kind: "system";
  content: string;
}

export type ChatDisplayMessage =
  | UserDisplayMessage
  | AssistantDisplayMessage
  | SystemDisplayMessage;
