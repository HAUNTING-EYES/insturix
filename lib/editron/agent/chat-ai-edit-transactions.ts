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
  const checkpointIds = [beforeCheckpoint?.checkpointId, afterCheckpoint?.checkpointId]
    .filter((checkpointId): checkpointId is string => Boolean(checkpointId));
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
