import type { Overlay } from "@/components/editron/editor/version-7.0.0/types";

import { getChatToolMetadata } from "./chat-tool-registry";

type ChatCheckpointType = "before-llm" | "after-llm";

interface ChatCheckpointInput {
  sessionId: string;
  projectId: string;
  userId: string;
  overlays: Overlay[];
  description: string;
  type: ChatCheckpointType;
}

interface ChatCheckpoint {
  checkpointId: string;
}

interface ChatCheckpointStore {
  createCheckpoint(input: ChatCheckpointInput): Promise<ChatCheckpoint | null>;
}

type LoadProjectForChatTransaction = (
  userId: string,
  projectId: string,
) => Promise<{ overlays?: Overlay[] } | null | undefined>;

export interface ChatAiEditTransaction {
  sessionId: string;
  projectId: string;
  userId: string;
  beforeOverlays: Overlay[];
}

export interface ChatAiToolResult {
  toolName: string;
  result: unknown;
}

export interface ChatAiEditTransactionSummary {
  status: "not-needed" | "created" | "failed";
  mutatingToolNames: string[];
  checkpointIds: string[];
  beforeCheckpointId?: string;
  afterCheckpointId?: string;
  error?: string;
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

interface CompleteTransactionOptions {
  transaction: ChatAiEditTransaction;
  toolResults: ChatAiToolResult[];
  checkpointStore?: ChatCheckpointStore;
  loadProject?: LoadProjectForChatTransaction;
}

export function beginChatAiEditTransaction(input: {
  sessionId: string;
  projectId: string;
  userId: string;
  overlays: Overlay[];
}): ChatAiEditTransaction {
  return {
    sessionId: input.sessionId,
    projectId: input.projectId,
    userId: input.userId,
    beforeOverlays: cloneOverlays(input.overlays),
  };
}

export async function completeChatAiEditTransaction({
  transaction,
  toolResults,
  checkpointStore,
  loadProject,
}: CompleteTransactionOptions): Promise<ChatAiEditTransactionSummary> {
  const mutatingToolNames = mutatingSuccessfulToolNames(toolResults);
  if (!mutatingToolNames.length) {
    return {
      status: "not-needed",
      mutatingToolNames: [],
      checkpointIds: [],
    };
  }

  try {
    const services = await resolveTransactionServices(checkpointStore, loadProject);
    const beforeCheckpoint = await services.checkpointStore.createCheckpoint({
      sessionId: transaction.sessionId,
      projectId: transaction.projectId,
      userId: transaction.userId,
      overlays: transaction.beforeOverlays,
      description: `Before AI edit: ${mutatingToolNames.join(", ")}`,
      type: "before-llm",
    });

    const project = await services.loadProject(transaction.userId, transaction.projectId);
    const afterOverlays = Array.isArray(project?.overlays) ? project.overlays : [];
    const afterCheckpoint = await services.checkpointStore.createCheckpoint({
      sessionId: transaction.sessionId,
      projectId: transaction.projectId,
      userId: transaction.userId,
      overlays: cloneOverlays(afterOverlays),
      description: `After AI edit: ${mutatingToolNames.join(", ")}`,
      type: "after-llm",
    });

    return transactionSummary(mutatingToolNames, beforeCheckpoint, afterCheckpoint);
  } catch (error: unknown) {
    return {
      status: "failed",
      mutatingToolNames,
      checkpointIds: [],
      error: error instanceof Error ? error.message : "Failed to create AI edit checkpoints.",
    };
  }
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

  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    if (message?.role !== "assistant") continue;
    if (!message.checkpointIds?.length) continue;

    const beforeCheckpointId = nonEmptyString(message.checkpointIds[0]);
    const afterCheckpointId = nonEmptyString(message.checkpointIds[1]);
    const mutatingToolNames = mutatingSuccessfulToolNames(message.toolResults ?? []);
    const checkpointId = checkpointIdForRestoreAction(action, {
      beforeCheckpointId,
      afterCheckpointId,
      mutatingToolNames,
    });

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

async function resolveTransactionServices(
  checkpointStore?: ChatCheckpointStore,
  loadProject?: LoadProjectForChatTransaction,
): Promise<{ checkpointStore: ChatCheckpointStore; loadProject: LoadProjectForChatTransaction }> {
  const resolvedCheckpointStore =
    checkpointStore ?? (await import("../services/checkpoint-service")).checkpointService;

  if (loadProject) {
    return { checkpointStore: resolvedCheckpointStore, loadProject };
  }

  const { projectService } = await import("../services/project-service");
  return {
    checkpointStore: resolvedCheckpointStore,
    loadProject: projectService.loadProject.bind(projectService) as LoadProjectForChatTransaction,
  };
}

function transactionSummary(
  mutatingToolNames: string[],
  beforeCheckpoint: ChatCheckpoint | null,
  afterCheckpoint: ChatCheckpoint | null,
): ChatAiEditTransactionSummary {
  const checkpointIds = beforeCheckpoint || afterCheckpoint
    ? [beforeCheckpoint?.checkpointId ?? "", afterCheckpoint?.checkpointId ?? ""]
    : [];
  return {
    status: checkpointIds.length ? "created" : "not-needed",
    mutatingToolNames,
    checkpointIds,
    beforeCheckpointId: beforeCheckpoint?.checkpointId,
    afterCheckpointId: afterCheckpoint?.checkpointId,
  };
}

function cloneOverlays(overlays: Overlay[]): Overlay[] {
  return JSON.parse(JSON.stringify(overlays ?? [])) as Overlay[];
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

function checkpointIdForRestoreAction(
  action: ChatAiEditRestoreAction,
  input: {
    beforeCheckpointId?: string;
    afterCheckpointId?: string;
    mutatingToolNames: string[];
  },
): string | undefined {
  if (action === "undo") return input.beforeCheckpointId;
  if (input.mutatingToolNames.includes("restore_ai_edit_checkpoint")) {
    return input.beforeCheckpointId;
  }
  return input.afterCheckpointId;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
