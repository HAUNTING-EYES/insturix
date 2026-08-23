import { cutTimelineRange } from '@/lib/editron/services/timeline-range-cut';

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

const CUT_OWNER_AUTHORITY =
  'PROJECTSERVICE_ISOLATED_CUT_PROPOSAL_WRITER_V2R_1' as const;

/**
 * Adapts the existing pure timeline-range owner to a ProjectService-owned
 * in-memory proposal clone. It never persists, advances the canonical Project
 * revision, or resolves a creative cut range on the model's behalf.
 */
export function createProviderNativeProjectServiceCutOwnerV2R(): Readonly<
  ProjectServiceIsolatedOperatorOwnerV2R
> {
  const execute = async (input: Parameters<
    ProjectServiceIsolatedOperatorOwnerV2R['execute']
  >[0]): Promise<Readonly<ProviderNativeToolExecutionV2R>> => executeCut(input);

  return {
    execute,
    replayCommitted: async (input) => {
      const replayed = await execute(input);
      if (hashCanonicalJsonV1(replayed)
        !== hashCanonicalJsonV1(input.recordedExecution)) {
        throw new Error('PROJECTSERVICE_ISOLATED_CUT_REPLAY_MISMATCH');
      }
      return replayed;
    },
  };
}

async function executeCut(input: Readonly<{
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
  if (input.call.operatorId !== 'cut_section') {
    return unverifiable('PROJECTSERVICE_ISOLATED_CUT_OPERATOR_UNSUPPORTED');
  }
  if (input.project.projectId !== input.projectId
    || input.project.userId !== input.userId
    || text(input.call.arguments.projectId) !== input.projectId) {
    return conflict('PROJECTSERVICE_ISOLATED_CUT_PROJECT_SCOPE_CONFLICT');
  }
  if (!Number.isSafeInteger(input.call.turn) || input.call.turn < 1) {
    return unverifiable('PROJECTSERVICE_ISOLATED_CUT_TURN_INVALID');
  }

  if (text(input.call.arguments.expectedProjectRevision) !== input.currentProjectRevision) {
    return conflict('PROJECTSERVICE_ISOLATED_CUT_REVISION_CONFLICT', {
      expectedProjectRevision: input.currentProjectRevision,
      suppliedProjectRevision: input.call.arguments.expectedProjectRevision ?? null,
    });
  }
  const constraints = optionalRecord(input.call.arguments.constraints);
  if (constraints === null || Object.keys(constraints).length) {
    return unverifiable('PROJECTSERVICE_ISOLATED_CUT_CONSTRAINTS_UNSUPPORTED');
  }
  const evidenceIds = stringArray(input.call.arguments.evidenceIds);
  if (evidenceIds === null) {
    return unverifiable('PROJECTSERVICE_ISOLATED_CUT_EVIDENCE_IDS_INVALID');
  }
  const targetRange = frameRange(input.call.arguments.targetRange);
  if (!targetRange || targetRange.endFrame > input.project.durationInFrames) {
    return unverifiable('PROJECTSERVICE_ISOLATED_CUT_RANGE_UNVERIFIABLE');
  }

  const beforeState = projectProposalStateV2R(input.project);
  const result = cutTimelineRange({
    overlays: input.project.overlays,
    ...targetRange,
    fps: input.project.fps,
    durationInFrames: input.project.durationInFrames,
  });
  input.project.overlays = result.overlays as Project['overlays'];
  input.project.durationInFrames = result.newDurationInFrames;
  const afterState = projectProposalStateV2R(input.project);
  const beforeStateSha256 = hashCanonicalJsonV1(beforeState);
  const afterStateSha256 = hashCanonicalJsonV1(afterState);
  const changedPaths = changedProjectProposalPathsV2R(beforeState, afterState);
  // Revision issuance stays at the ProjectService clone boundary; this cut
  // adapter owns no proposal counter, map or independent revision authority.
  const writerProjectRevision = issueProjectServiceIsolatedWriterRevisionV2R({
    writerAuthority: CUT_OWNER_AUTHORITY,
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
          authority: CUT_OWNER_AUTHORITY,
          ownerRef: 'lib/editron/services/timeline-range-cut.ts#cutTimelineRange',
          beforeStateSha256,
          afterStateSha256,
          changedPaths,
          framesCut: result.framesCut,
          timebase: {
            fps: input.project.fps,
            certification: 'CURRENT_NUMERIC_PROJECT_FPS_RESEARCH_ONLY',
          },
        },
      },
      timelineCoordinateTransform: result.timelineCoordinateTransform,
      splitChildren: result.splitChildren,
    },
    evidenceIds,
  });
}

function frameRange(value: unknown): { startFrame: number; endFrame: number } | null {
  if (!isRecord(value)) return null;
  const { startFrame, endFrame } = value;
  return Number.isSafeInteger(startFrame) && Number.isSafeInteger(endFrame)
    && Number(startFrame) >= 0 && Number(endFrame) > Number(startFrame)
    ? { startFrame: Number(startFrame), endFrame: Number(endFrame) }
    : null;
}

function optionalRecord(value: unknown): JsonRecord | null {
  if (value === undefined) return {};
  return isRecord(value) ? value : null;
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
      message: 'The isolated cut does not match the bound proposal revision.',
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
      message: 'The isolated cut owner cannot prove this request safely.',
    },
    evidenceIds: [] as const,
  });
}
