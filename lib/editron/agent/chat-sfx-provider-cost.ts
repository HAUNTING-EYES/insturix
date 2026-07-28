import {
  recordProviderCostEvent,
  type ProviderCostEventInput,
  type ProviderCostEventStatus,
} from '@/lib/financials/provider-cost-events';

export type ChatSfxProviderBranch = 'mirelo_video_to_audio' | 'cassetteai_fallback';

export interface ChatSfxProviderCostInput {
  status: Extract<ProviderCostEventStatus, 'success' | 'failed'>;
  userId: string;
  projectId: string;
  assetId: string;
  providerBranch: ChatSfxProviderBranch;
  model: string;
  requestedDurationSec: number;
  generatedMediaSeconds: number;
  outputCount: number;
  providerOutputProduced: boolean;
  bytesOut?: number;
  functionMs?: number;
  error?: unknown;
}

interface ChatSfxProviderCostDependencies {
  recordProviderCostEvent?: (input: ProviderCostEventInput) => ReturnType<typeof recordProviderCostEvent>;
}

export async function recordChatSfxProviderCost(
  input: ChatSfxProviderCostInput,
  dependencies: ChatSfxProviderCostDependencies = {},
) {
  const recorder = dependencies.recordProviderCostEvent ?? recordProviderCostEvent;
  const isBillableOutput = input.status === 'success' || input.providerOutputProduced;

  return recorder({
    idempotencyKey: [
      'editron',
      'chat-sfx',
      input.projectId,
      input.assetId,
      input.providerBranch,
      input.status,
    ].join(':'),
    status: input.status,
    userId: input.userId,
    projectId: input.projectId,
    assetId: input.assetId,
    service: 'editron',
    action: 'sfx_generation',
    route: 'chat-tool:add_sfx',
    provider: 'fal-ai',
    model: input.model,
    operation: 'sfx_generation',
    ...(!isBillableOutput ? { estimatedCostUsd: 0, actualCostUsd: 0 } : {}),
    units: {
      mediaSeconds: input.generatedMediaSeconds,
      requestCount: 1,
      bytesOut: input.bytesOut,
      functionMs: input.functionMs,
    },
    metadata: {
      providerBranch: input.providerBranch,
      providerOutputProduced: input.providerOutputProduced,
      requestedDurationSec: input.requestedDurationSec,
      outputCount: input.outputCount,
      errorClass: input.error instanceof Error ? input.error.name : undefined,
    },
  });
}
