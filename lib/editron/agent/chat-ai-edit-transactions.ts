import { getChatToolMetadata } from "./chat-tool-registry";

export interface ChatAiToolResult {
  toolName: string;
  result: unknown;
}

export type ChatAiEditRestoreAction = "undo" | "redo";
export type ChatAiEditRestoreStatus = "ready" | "no-intent" | "no-checkpoint" | "missing-target";

export interface ChatAiEditRestoreHistoryMessage {
  role: string;
  content?: string;
  checkpointIds?: string[];
  toolResults?: ChatAiToolResult[];
}

export interface ChatAiEditRestoreResolution {
  status: ChatAiEditRestoreStatus;
  action?: ChatAiEditRestoreAction;
  checkpointId?: string;
  beforeCheckpointId?: string;
  afterCheckpointId?: string;
  sourceMessageIndex?: number;
  mutatingToolNames: string[];
  message: string;
  useWith?: {
    restore_ai_edit_checkpoint: {
      checkpointId: string;
    };
  };
}

export function mutatingSuccessfulToolNames(toolResults: ChatAiToolResult[]): string[] {
  const names = toolResults
    .filter((toolResult) => getChatToolMetadata(toolResult.toolName)?.mutatesProject === true)
    .filter((toolResult) => isSuccessfulToolResult(toolResult.result))
    .map((toolResult) => toolResult.toolName);
  return Array.from(new Set(names));
}

export function isSuccessfulToolResult(result: unknown): boolean {
  const parsed = parseToolResult(result);
  if (!parsed) {
    return typeof result === "string" && !/^error\s*:/i.test(result.trim());
  }
  if (parsed.status === "error") return false;
  if (parsed.error && parsed.error !== null) return false;
  return parsed.status === "success" || parsed.status === undefined;
}

export function resolveChatAiEditRestoreTarget(
  history: ChatAiEditRestoreHistoryMessage[],
  input: { userMessage: string },
): ChatAiEditRestoreResolution {
  const action = restoreActionFromText(input.userMessage);
  if (!action) {
    return {
      status: "no-intent",
      mutatingToolNames: [],
      message: "No AI edit restore intent was detected.",
    };
  }

  if (action === "redo") {
    return {
      status: "no-checkpoint",
      action,
      mutatingToolNames: [],
      message: "Redo is unavailable because Editron does not yet have a receipt-bound replay chain that proves the post-undo state.",
    };
  }

  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    if (message?.role !== "assistant") continue;
    if (!message.checkpointIds?.length) continue;

    const beforeCheckpointId = nonEmptyString(message.checkpointIds[0]);
    const afterCheckpointId = nonEmptyString(message.checkpointIds[1]);
    const mutatingToolNames = mutatingSuccessfulToolNames(message.toolResults ?? []);
    const checkpointId = beforeCheckpointId;

    if (!checkpointId) {
      return {
        status: "missing-target",
        action,
        beforeCheckpointId,
        afterCheckpointId,
        sourceMessageIndex: index,
        mutatingToolNames,
        message: `Found AI edit checkpoint metadata, but no ${action} checkpoint target was available.`,
      };
    }

    return {
      status: "ready",
      action,
      checkpointId,
      beforeCheckpointId,
      afterCheckpointId,
      sourceMessageIndex: index,
      mutatingToolNames,
      useWith: {
        restore_ai_edit_checkpoint: { checkpointId },
      },
      message: `Resolved ${action} to checkpoint ${checkpointId}.`,
    };
  }

  return {
    status: "no-checkpoint",
    action,
    mutatingToolNames: [],
    message: `No prior AI edit checkpoint was available for ${action}.`,
  };
}

export function formatChatAiEditRestoreTargetForPrompt(resolution: ChatAiEditRestoreResolution): string {
  if (resolution.status === "no-intent") return "";
  if (resolution.status === "no-checkpoint" && resolution.action === "redo") {
    return [
      "AI edit restore resolver:",
      "status=no-checkpoint",
      "intent=redo",
      "Redo is unavailable because its receipt-bound replay chain has not been implemented. Do not restore afterCheckpointId or manually replay the edit.",
    ].join("\n");
  }
  if (resolution.status !== "ready" || !resolution.checkpointId || !resolution.action) {
    return [
      "AI edit restore resolver:",
      `status=${resolution.status}`,
      resolution.action ? `intent=${resolution.action}` : null,
      "No safe checkpoint target is available. Do not manually reverse edits; ask for a checkpoint ID or explain that undo is unavailable for this chat turn.",
    ].filter(Boolean).join("\n");
  }

  const toolNames = resolution.mutatingToolNames.length
    ? resolution.mutatingToolNames.join(", ")
    : "unknown mutating edit";
  return [
    "AI edit restore resolver:",
    "status=ready",
    `intent=${resolution.action}`,
    `checkpointId=${resolution.checkpointId}`,
    `sourceTools=${toolNames}`,
    "Call restore_ai_edit_checkpoint with exactly this checkpointId before doing anything else. Do not manually reverse overlays.",
  ].join("\n");
}

function parseToolResult(result: unknown): Record<string, unknown> | null {
  if (result && typeof result === "object") return result as Record<string, unknown>;
  if (typeof result !== "string") return null;
  const trimmed = result.trim();
  if (!trimmed || /^error\s*:/i.test(trimmed)) return null;
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function restoreActionFromText(text: string): ChatAiEditRestoreAction | null {
  const normalized = text.toLowerCase();
  if (/\b(?:redo|re-do|reapply|bring (?:it|that) back|restore after|put (?:it|that) back)\b/.test(normalized)) {
    return "redo";
  }
  if (/\b(?:undo|revert|go back|roll back|rollback|restore before|back out|remove that edit|reverse that edit)\b/.test(normalized)) {
    return "undo";
  }
  return null;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
