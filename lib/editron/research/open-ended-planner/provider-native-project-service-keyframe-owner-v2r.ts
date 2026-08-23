import {
  buildKeyframeMutationPatch,
  type KeyframeMutationPoint,
} from '@/lib/editron/services/keyframe-mutation';

import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  changedProjectProposalPathsV2R,
  projectProposalStateV2R,
} from './project-service-proposal-state-v2r';
import {
  issueProjectServiceIsolatedWriterRevisionV2R,
  type ProjectServiceIsolatedOperatorOwnerV2R,
} from './provider-native-project-service-clone-owner-v2r';
import type { ProviderNativeToolExecutionV2R }
  from './provider-native-tool-episode-v2r';
import type { Project, ProjectRevisionV1 } from '../../services/project-service';

type JsonRecord = Record<string, unknown>;

const KEYFRAME_OWNER_AUTHORITY =
  'PROJECTSERVICE_ISOLATED_FOCAL_SCALE_KEYFRAME_WRITER_V2R_1' as const;
const ALLOWED_ARGUMENT_FIELDS = new Set([
  'projectId', 'expectedProjectRevision', 'overlayId', 'property',
  'keyframes', 'focalPoint', 'evidenceIds',
]);

/**
 * Applies the technically unambiguous focal-scale subset of set_keyframes to
 * an isolated ProjectService proposal. Exact creative form remains owned by
 * the upstream resolver; missing focal evidence is never guessed as scale.
 */
export function createProviderNativeProjectServiceKeyframeOwnerV2R(): Readonly<
  ProjectServiceIsolatedOperatorOwnerV2R
> {
  const execute = async (input: Parameters<
    ProjectServiceIsolatedOperatorOwnerV2R['execute']
  >[0]): Promise<Readonly<ProviderNativeToolExecutionV2R>> => executeKeyframes(input);

  return {
    execute,
    replayCommitted: async (input) => {
      const replayed = await execute(input);
      if (hashCanonicalJsonV1(replayed)
        !== hashCanonicalJsonV1(input.recordedExecution)) {
        throw new Error('PROJECTSERVICE_ISOLATED_KEYFRAME_REPLAY_MISMATCH');
      }
      return replayed;
    },
  };
}

async function executeKeyframes(input: Readonly<{
  tenantId: string;
  userId: string;
  projectId: string;
  project: Project;
  baseRevision: Readonly<ProjectRevisionV1>;
  currentProjectRevision: string;
  call: Readonly<{
    operatorId: string;
    arguments: Readonly<JsonRecord>;
    turn: number;
  }>;
}>): Promise<Readonly<ProviderNativeToolExecutionV2R>> {
  if (input.call.operatorId !== 'set_keyframes') {
    return unverifiable('PROJECTSERVICE_ISOLATED_KEYFRAME_OPERATOR_UNSUPPORTED');
  }
  if (input.project.projectId !== input.projectId
    || input.project.userId !== input.userId
    || text(input.call.arguments.projectId) !== input.projectId) {
    return conflict('PROJECTSERVICE_ISOLATED_KEYFRAME_PROJECT_SCOPE_CONFLICT');
  }
  if (!Number.isSafeInteger(input.call.turn) || input.call.turn < 1) {
    return unverifiable('PROJECTSERVICE_ISOLATED_KEYFRAME_TURN_INVALID');
  }
  if (text(input.call.arguments.expectedProjectRevision) !== input.currentProjectRevision) {
    return conflict('PROJECTSERVICE_ISOLATED_KEYFRAME_REVISION_CONFLICT', {
      expectedProjectRevision: input.currentProjectRevision,
      suppliedProjectRevision: input.call.arguments.expectedProjectRevision ?? null,
    });
  }
  if (Object.keys(input.call.arguments).some((field) => !ALLOWED_ARGUMENT_FIELDS.has(field))) {
    return unverifiable('PROJECTSERVICE_ISOLATED_KEYFRAME_ARGUMENT_UNSUPPORTED');
  }
  if (input.call.arguments.property !== undefined
    && input.call.arguments.property !== 'scale') {
    return unverifiable('PROJECTSERVICE_ISOLATED_KEYFRAME_PROPERTY_UNSUPPORTED');
  }

  const overlayId = safeInteger(input.call.arguments.overlayId);
  const overlay = overlayId === null ? undefined : input.project.overlays.find(
    (candidate) => candidate.id === overlayId,
  );
  if (!overlay || !['video', 'image'].includes(String(overlay.type))) {
    return unverifiable('PROJECTSERVICE_ISOLATED_KEYFRAME_OVERLAY_UNVERIFIABLE');
  }
  const durationInFrames = safePositiveInteger(overlay.durationInFrames);
  const keyframes = durationInFrames === null
    ? null : keyframePoints(input.call.arguments.keyframes, durationInFrames);
  if (!keyframes) {
    return unverifiable('PROJECTSERVICE_ISOLATED_KEYFRAME_POINTS_INVALID');
  }
  const focalPoint = normalizedPoint(input.call.arguments.focalPoint);
  if (!focalPoint) {
    return unverifiable('PROJECTSERVICE_ISOLATED_KEYFRAME_FOCAL_REQUIRED');
  }
  const evidenceIds = stringArray(input.call.arguments.evidenceIds);
  if (evidenceIds === null) {
    return unverifiable('PROJECTSERVICE_ISOLATED_KEYFRAME_EVIDENCE_IDS_INVALID');
  }

  const beforeState = projectProposalStateV2R(input.project);
  const mutation = buildKeyframeMutationPatch({
    overlay: overlay as unknown as JsonRecord,
    property: 'scale',
    keyframes,
    focalPoint,
  });
  Object.assign(overlay, mutation.patch);
  const afterState = projectProposalStateV2R(input.project);
  const beforeStateSha256 = hashCanonicalJsonV1(beforeState);
  const afterStateSha256 = hashCanonicalJsonV1(afterState);
  if (beforeStateSha256 === afterStateSha256) {
    return unverifiable('PROJECTSERVICE_ISOLATED_KEYFRAME_NO_STATE_CHANGE');
  }
  const changedPaths = changedProjectProposalPathsV2R(beforeState, afterState);
  // Concrete keyframe writes share the clone-owned revision origin with cuts;
  // this adapter has no counter, map or independent proposal authority.
  const writerProjectRevision = issueProjectServiceIsolatedWriterRevisionV2R({
    writerAuthority: KEYFRAME_OWNER_AUTHORITY,
    tenantId: input.tenantId,
    userId: input.userId,
    projectId: input.projectId,
    canonicalBaseRevision: input.baseRevision,
    previousProjectRevision: input.currentProjectRevision,
    operatorId: input.call.operatorId,
    turn: input.call.turn,
    argumentSha256: hashCanonicalJsonV1(input.call.arguments),
    beforeStateSha256,
    afterStateSha256,
  });

  return deepFreezeV1({
    authority: 'RESEARCH_ISOLATED_NO_PROJECT_MUTATION' as const,
    disposition: 'OK' as const,
    output: {
      receipt: {
        status: 'PASS',
        projectRevision: writerProjectRevision,
        proof: {
          authority: KEYFRAME_OWNER_AUTHORITY,
          ownerRef: 'lib/editron/services/keyframe-mutation.ts#buildKeyframeMutationPatch',
          beforeStateSha256,
          afterStateSha256,
          changedPaths,
          overlayId,
          property: 'scale',
          keyframeCount: keyframes.length,
          localFrameRange: {
            startFrame: keyframes[0].frame,
            endFrame: keyframes[keyframes.length - 1].frame,
          },
          focalPoint,
          formAuthority: 'UPSTREAM_RESOLVER_SUPPLIED_VALUES_NOT_SELECTED_HERE',
        },
      },
    },
    evidenceIds,
  });
}

function keyframePoints(value: unknown, durationInFrames: number): KeyframeMutationPoint[] | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const result: KeyframeMutationPoint[] = [];
  let previousFrame = -1;
  for (const candidate of value) {
    if (!isRecord(candidate)
      || Object.keys(candidate).some((field) => !['frame', 'value', 'easing'].includes(field))) {
      return null;
    }
    const frame = safeInteger(candidate.frame);
    const pointValue = finiteNumber(candidate.value);
    const easing = candidate.easing;
    if (frame === null || frame <= previousFrame || frame >= durationInFrames
      || pointValue === null || pointValue <= 0
      || !['linear', 'ease-in', 'ease-out', 'ease-in-out'].includes(String(easing))) {
      return null;
    }
    result.push({
      frame,
      value: pointValue,
      easing: easing as KeyframeMutationPoint['easing'],
    });
    previousFrame = frame;
  }
  return result;
}

function normalizedPoint(value: unknown): { x: number; y: number } | null {
  if (!isRecord(value) || Object.keys(value).some((field) => !['x', 'y'].includes(field))) {
    return null;
  }
  const x = finiteNumber(value.x);
  const y = finiteNumber(value.y);
  return x !== null && y !== null && x >= 0 && x <= 1 && y >= 0 && y <= 1
    ? { x, y } : null;
}

function safePositiveInteger(value: unknown): number | null {
  const result = safeInteger(value);
  return result !== null && result > 0 ? result : null;
}

function safeInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && !Object.is(value, -0)
    ? value : null;
}

function stringArray(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((entry) => (
    typeof entry !== 'string' || !entry
  ))) return null;
  const result = [...value] as string[];
  return new Set(result).size === result.length ? result : null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function conflict(
  code: string,
  details: Readonly<JsonRecord> = {},
): Readonly<ProviderNativeToolExecutionV2R> {
  return deepFreezeV1({
    authority: 'RESEARCH_ISOLATED_NO_PROJECT_MUTATION' as const,
    disposition: 'CONFLICT' as const,
    output: {
      code,
      message: 'The isolated keyframe request conflicts with the bound proposal revision.',
      details,
    },
    evidenceIds: [] as const,
  });
}

function unverifiable(code: string): Readonly<ProviderNativeToolExecutionV2R> {
  return deepFreezeV1({
    authority: 'RESEARCH_ISOLATED_NO_PROJECT_MUTATION' as const,
    disposition: 'UNVERIFIABLE' as const,
    output: {
      code,
      message: 'The isolated keyframe owner cannot prove this request safely.',
    },
    evidenceIds: [] as const,
  });
}
