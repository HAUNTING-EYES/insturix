import {
  CHAT_MINIMAL_READ_TOOLS,
  getChatCapabilityAuthorityContract,
} from './chat-command-authority';
import type { ChatRequestOwnerLicense } from './chat-request-owner';

interface WorkflowEvidenceReceipt {
  projectId?: string;
  projectRevision?: string;
  authorizedMutations?: Array<{ toolName: string }>;
}

interface WorkflowLedger {
  completedExecutions: Array<{
    evidenceReceipts: WorkflowEvidenceReceipt[];
  }>;
}

export interface ChatWorkflowPhase {
  kind: 'unrestricted' | 'evidence' | 'mutation' | 'mixed';
  callableToolNames: ReadonlySet<string>;
  authorizedMutationTools: ReadonlySet<string>;
}

export function resolveChatWorkflowPhase(input: {
  requestOwnerLicense?: ChatRequestOwnerLicense;
  ledger: WorkflowLedger;
  projectId?: string;
  projectRevision?: string | null;
}): ChatWorkflowPhase {
  const capabilities = input.requestOwnerLicense?.routingFacts?.requestedCapabilities ?? [];
  if (
    input.requestOwnerLicense?.owner !== 'semantic-editorial-planner'
    || capabilities.length === 0
  ) {
    return {
      kind: 'unrestricted',
      callableToolNames: new Set(),
      authorizedMutationTools: new Set(),
    };
  }

  const receipts = input.ledger.completedExecutions.flatMap(
    (execution) => execution.evidenceReceipts,
  );
  const activeRevision = input.projectRevision ?? latestProjectRevision(receipts, input.projectId);
  const currentReceipts = receipts.filter((receipt) =>
    (!input.projectId || receipt.projectId === input.projectId)
    && (!activeRevision || receipt.projectRevision === activeRevision),
  );
  const authorizedMutationTools = new Set(
    currentReceipts.flatMap((receipt) =>
      (receipt.authorizedMutations ?? []).map((mutation) => mutation.toolName),
    ),
  );
  const callableToolNames = new Set(CHAT_MINIMAL_READ_TOOLS);
  let localizedInEvidencePhase = false;
  let localizedInMutationPhase = false;

  for (const capability of capabilities) {
    const contract = getChatCapabilityAuthorityContract(capability);
    if (contract.authority !== 'localized-workflow') {
      for (const toolName of contract.callableTools) callableToolNames.add(toolName);
      continue;
    }

    const capabilityMutations = [...contract.mutationTools].filter(
      (toolName) => authorizedMutationTools.has(toolName),
    );
    if (capabilityMutations.length > 0) {
      localizedInMutationPhase = true;
      for (const toolName of capabilityMutations) callableToolNames.add(toolName);
      continue;
    }

    localizedInEvidencePhase = true;
    for (const toolName of contract.evidenceTools) callableToolNames.add(toolName);
  }

  return {
    kind: localizedInEvidencePhase && localizedInMutationPhase
      ? 'mixed'
      : localizedInMutationPhase
        ? 'mutation'
        : localizedInEvidencePhase
          ? 'evidence'
          : 'unrestricted',
    callableToolNames,
    authorizedMutationTools,
  };
}

export function filterChatToolsForWorkflowPhase<T extends { name: string }>(
  tools: readonly T[],
  input: Parameters<typeof resolveChatWorkflowPhase>[0],
): T[] {
  const phase = resolveChatWorkflowPhase(input);
  if (phase.kind === 'unrestricted') return [...tools];
  return tools.filter((tool) => phase.callableToolNames.has(tool.name));
}

function latestProjectRevision(
  receipts: WorkflowEvidenceReceipt[],
  projectId?: string,
): string | null {
  for (let index = receipts.length - 1; index >= 0; index -= 1) {
    const receipt = receipts[index];
    if ((!projectId || receipt?.projectId === projectId) && receipt?.projectRevision) {
      return receipt.projectRevision;
    }
  }
  return null;
}
