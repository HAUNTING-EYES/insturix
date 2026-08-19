import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import { executeDev01Stage6GenericLoweredV2 } from './dev01-stage6-generic-lowered-executor-v2r';
import { executeDev03Stage6GenericLoweredV2 } from './dev03-stage6-generic-lowered-executor-v2r';
import type { GenericLoweringResultV2R } from './generic-lowerer-v2r';

type JsonRecord = Record<string, unknown>;

export const V2R_STAGE6_TASK_ADAPTER_REGISTRY_VERSION =
  'EDITRON_OE_V2R_STAGE6_TASK_ADAPTER_REGISTRY_V1' as const;

export interface V2RStage6TaskAdapterDescriptor {
  taskId: 'DEV-01' | 'DEV-03';
  adapterId: string;
  ownerRef: string;
  supportedOperatorIds: readonly string[];
  executionAuthority: 'RESEARCH_PROXY_ONLY_NO_PROJECT_MUTATION';
  proofRequirement: 'REAL_RENDERED_VISUAL_AND_AUDIO_PROOF';
}

export interface V2RStage6TaskAdapterRegistry {
  version: typeof V2R_STAGE6_TASK_ADAPTER_REGISTRY_VERSION;
  adapters: readonly Readonly<V2RStage6TaskAdapterDescriptor>[];
  registrySha256: string;
}

export interface V2RStage6TaskExecutionResult {
  receipt: Readonly<JsonRecord>;
  receiptPath: string;
}

const ADAPTERS: readonly V2RStage6TaskAdapterDescriptor[] = [
  {
    taskId: 'DEV-01',
    adapterId: 'DEV01_CAUSAL_NATIVE_PROXY_V2R',
    ownerRef: 'dev01-stage6-generic-lowered-executor-v2r.ts#executeDev01Stage6GenericLoweredV2',
    supportedOperatorIds: [
      'read_project_file', 'get_timeline_view', 'get_video_transcription',
      'find_transcript_moment', 'resolve_transcript_edit', 'cut_section',
      'find_visual_moment', 'resolve_keyframe_edit', 'set_keyframes',
      'find_audio_moment', 'apply_audio_ducking',
    ],
    executionAuthority: 'RESEARCH_PROXY_ONLY_NO_PROJECT_MUTATION',
    proofRequirement: 'REAL_RENDERED_VISUAL_AND_AUDIO_PROOF',
  },
  {
    taskId: 'DEV-03',
    adapterId: 'DEV03_CAUSAL_NATIVE_PROXY_V2R',
    ownerRef: 'dev03-stage6-generic-lowered-executor-v2r.ts#executeDev03Stage6GenericLoweredV2',
    supportedOperatorIds: [
      'read_project_file', 'get_timeline_view', 'find_audio_moment',
      'sync_cuts_to_beats', 'apply_camera_shake',
    ],
    executionAuthority: 'RESEARCH_PROXY_ONLY_NO_PROJECT_MUTATION',
    proofRequirement: 'REAL_RENDERED_VISUAL_AND_AUDIO_PROOF',
  },
];

export function buildV2RStage6TaskAdapterRegistry(): Readonly<V2RStage6TaskAdapterRegistry> {
  const material = {
    version: V2R_STAGE6_TASK_ADAPTER_REGISTRY_VERSION,
    adapters: ADAPTERS,
  };
  return deepFreezeV1({ ...material, registrySha256: hashCanonicalJsonV1(material) });
}

export function findV2RStage6TaskAdapter(
  taskId: string,
): Readonly<V2RStage6TaskAdapterDescriptor> | null {
  return buildV2RStage6TaskAdapterRegistry().adapters
    .find((adapter) => adapter.taskId === taskId) ?? null;
}

export async function executeV2RStage6TaskAdapter(input: {
  taskId: string;
  lowering: Readonly<GenericLoweringResultV2R>;
  evidencePack: unknown;
  executionId: string;
  createdAt: string;
  outputDir: string;
}): Promise<V2RStage6TaskExecutionResult> {
  if (input.taskId === 'DEV-01') {
    return executeDev01Stage6GenericLoweredV2({
      lowering: input.lowering,
      executionId: input.executionId,
      createdAt: input.createdAt,
      outputDir: input.outputDir,
    });
  }
  if (input.taskId === 'DEV-03') {
    return executeDev03Stage6GenericLoweredV2({
      lowering: input.lowering,
      evidencePack: input.evidencePack,
      executionId: input.executionId,
      createdAt: input.createdAt,
      outputDir: input.outputDir,
    });
  }
  throw new Error(`V2R_STAGE6_TASK_ADAPTER_UNAVAILABLE:${input.taskId}`);
}
