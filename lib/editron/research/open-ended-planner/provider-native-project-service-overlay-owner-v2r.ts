import {
  buildChatAddOverlayForm,
  chatAddOverlaySchema,
  type ChatAddOverlayInput,
  type ChatAddOverlayForm,
} from '@/lib/editron/agent/chat-add-overlay-form';

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
import type { Project } from '../../services/project-service';

type JsonRecord = Record<string, unknown>;
type ExecuteInput = Parameters<ProjectServiceIsolatedOperatorOwnerV2R['execute']>[0];

const OVERLAY_OWNER_AUTHORITY =
  'PROJECTSERVICE_ISOLATED_ADD_OVERLAY_PROPOSAL_WRITER_V2R_1' as const;
const FORM_ARGUMENT_FIELDS = Object.freeze(Object.keys(chatAddOverlaySchema.shape));
const FORM_ARGUMENT_FIELD_SET = new Set(FORM_ARGUMENT_FIELDS);
const ALLOWED_ARGUMENT_FIELDS = new Set([
  'projectId',
  'expectedProjectRevision',
  'evidenceIds',
  ...FORM_ARGUMENT_FIELDS,
]);

/**
 * Applies the already-resolved live add_overlay form to an in-memory
 * ProjectService proposal clone. It does not resolve intent, inspect assets,
 * call ProjectService persistence, or certify opaque evidence references.
 */
export function createProviderNativeProjectServiceOverlayOwnerV2R(): Readonly<
  ProjectServiceIsolatedOperatorOwnerV2R
> {
  const execute = async (input: ExecuteInput): Promise<
    Readonly<ProviderNativeToolExecutionV2R>
  > => executeOverlay(input);

  return {
    execute,
    replayCommitted: async (input) => {
      const replayed = await execute(input);
      if (hashCanonicalJsonV1(replayed)
        !== hashCanonicalJsonV1(input.recordedExecution)) {
        throw new Error('PROJECTSERVICE_ISOLATED_OVERLAY_REPLAY_MISMATCH');
      }
      return replayed;
    },
  };
}

async function executeOverlay(
  input: ExecuteInput,
): Promise<Readonly<ProviderNativeToolExecutionV2R>> {
  if (input.call.operatorId !== 'add_overlay') {
    return unverifiable('PROJECTSERVICE_ISOLATED_OVERLAY_OPERATOR_UNSUPPORTED');
  }
  if (input.project.projectId !== input.projectId
    || input.project.userId !== input.userId
    || text(input.call.arguments.projectId) !== input.projectId) {
    return conflict('PROJECTSERVICE_ISOLATED_OVERLAY_PROJECT_SCOPE_CONFLICT');
  }
  if (!Number.isSafeInteger(input.call.turn) || input.call.turn < 1) {
    return unverifiable('PROJECTSERVICE_ISOLATED_OVERLAY_TURN_INVALID');
  }
  if (text(input.call.arguments.expectedProjectRevision)
    !== input.currentProjectRevision) {
    return conflict('PROJECTSERVICE_ISOLATED_OVERLAY_REVISION_CONFLICT', {
      expectedProjectRevision: input.currentProjectRevision,
      suppliedProjectRevision: input.call.arguments.expectedProjectRevision ?? null,
    });
  }
  if (Object.keys(input.call.arguments).some(
    (field) => !ALLOWED_ARGUMENT_FIELDS.has(field),
  )) {
    return unverifiable('PROJECTSERVICE_ISOLATED_OVERLAY_ARGUMENT_UNSUPPORTED');
  }

  const evidenceIds = stringArray(input.call.arguments.evidenceIds);
  if (evidenceIds === null) {
    return unverifiable('PROJECTSERVICE_ISOLATED_OVERLAY_EVIDENCE_IDS_INVALID');
  }
  const parsed = chatAddOverlaySchema.safeParse(
    pickFormArguments(input.call.arguments),
  );
  if (!parsed.success) {
    return unverifiable('PROJECTSERVICE_ISOLATED_OVERLAY_FORM_INPUT_INVALID');
  }
  const request = parsed.data;
  if (isMediaOverlay(request) && evidenceIds.length === 0) {
    return unverifiable('PROJECTSERVICE_ISOLATED_OVERLAY_MEDIA_EVIDENCE_REQUIRED');
  }
  if (!validProjectFrameRange(request, input.project.durationInFrames)) {
    return unverifiable('PROJECTSERVICE_ISOLATED_OVERLAY_RANGE_UNVERIFIABLE');
  }
  if (request.row !== undefined
    && (!Number.isSafeInteger(request.row) || request.row < 0)) {
    return unverifiable('PROJECTSERVICE_ISOLATED_OVERLAY_ROW_INVALID');
  }
  const overlayId = nextOverlayId(input.project);
  if (overlayId === null) {
    return unverifiable('PROJECTSERVICE_ISOLATED_OVERLAY_IDENTITY_UNVERIFIABLE');
  }

  const beforeState = projectProposalStateV2R(input.project);
  let form: ReturnType<typeof buildChatAddOverlayForm>;
  try {
    form = buildChatAddOverlayForm({
      request,
      project: input.project,
      overlayId,
    });
  } catch {
    return unverifiable('PROJECTSERVICE_ISOLATED_OVERLAY_FORM_UNVERIFIABLE');
  }
  const overlay = compactUndefined(form.overlay) as ChatAddOverlayForm;
  const nextOverlays = [
    ...input.project.overlays,
    overlay as unknown as Project['overlays'][number],
  ];
  const afterState = projectProposalStateV2R({
    ...input.project,
    overlays: nextOverlays,
  });
  const beforeStateSha256 = hashCanonicalJsonV1(beforeState);
  const afterStateSha256 = hashCanonicalJsonV1(afterState);
  if (beforeStateSha256 === afterStateSha256) {
    return unverifiable('PROJECTSERVICE_ISOLATED_OVERLAY_NO_STATE_CHANGE');
  }
  input.project.overlays = nextOverlays;
  const changedPaths = changedProjectProposalPathsV2R(beforeState, afterState);
  const writerProjectRevision = issueProjectServiceIsolatedWriterRevisionV2R({
    writerAuthority: OVERLAY_OWNER_AUTHORITY,
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
          authority: OVERLAY_OWNER_AUTHORITY,
          ownerRef: 'lib/editron/agent/chat-add-overlay-form.ts#buildChatAddOverlayForm',
          proposalAdapterRef: 'provider-native-project-service-overlay-owner-v2r.ts#createProviderNativeProjectServiceOverlayOwnerV2R',
          canonicalMutationOwnerRef: 'lib/editron/services/project-service.ts#ProjectService.addOverlay',
          canonicalMutationOwnerCalled: false,
          beforeStateSha256,
          afterStateSha256,
          changedPaths,
          overlayId,
          overlayType: request.type,
          projectFrameRange: {
            startFrame: request.start,
            endExclusiveFrame: request.start + request.duration,
          },
          resolvedPosition: form.position,
          formInputSha256: hashCanonicalJsonV1(request),
          evidenceReferenceValidation:
            'OPAQUE_REFERENCES_CARRIED_UPSTREAM_EVIDENCE_OWNER_REQUIRED',
          formAuthority: 'CALLER_SUPPLIED_FORM_VALUES_NOT_SELECTED_HERE',
        },
      },
    },
    evidenceIds,
  });
}

function pickFormArguments(argumentsValue: Readonly<JsonRecord>): JsonRecord {
  return Object.fromEntries(Object.entries(argumentsValue).filter(
    ([field]) => FORM_ARGUMENT_FIELD_SET.has(field),
  ));
}

function isMediaOverlay(input: ChatAddOverlayInput): boolean {
  return input.type === 'image' || input.type === 'video' || input.type === 'sound';
}

function validProjectFrameRange(
  input: ChatAddOverlayInput,
  projectDurationInFrames: number,
): boolean {
  if (!Number.isSafeInteger(input.start) || input.start < 0
    || !Number.isSafeInteger(input.duration) || input.duration <= 0
    || !Number.isSafeInteger(projectDurationInFrames)
    || projectDurationInFrames < 0) {
    return false;
  }
  const endExclusiveFrame = input.start + input.duration;
  return Number.isSafeInteger(endExclusiveFrame)
    && endExclusiveFrame <= projectDurationInFrames;
}

function nextOverlayId(project: Readonly<Project>): number | null {
  const ids = project.overlays.map(({ id }) => id);
  if (ids.some((id) => !Number.isSafeInteger(id) || id < 0)
    || new Set(ids).size !== ids.length) {
    return null;
  }
  const maximum = ids.length ? Math.max(...ids) : 0;
  return maximum < Number.MAX_SAFE_INTEGER ? maximum + 1 : null;
}

function stringArray(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((entry) => (
    typeof entry !== 'string' || !entry.trim()
  ))) return null;
  const result = [...value] as string[];
  return new Set(result).size === result.length ? result : null;
}

function compactUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(compactUndefined);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as JsonRecord)
    .filter(([, child]) => child !== undefined)
    .map(([key, child]) => [key, compactUndefined(child)]));
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
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
      message: 'The isolated overlay request conflicts with the bound proposal revision.',
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
      message: 'The isolated overlay owner cannot prove this request safely.',
    },
    evidenceIds: [] as const,
  });
}
