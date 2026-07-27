import { createHash } from 'crypto';

import {
  getChatToolMetadata,
  type ChatToolPostconditionContract,
  type ChatToolRenderEvidenceModality,
  type ChatToolStatePostconditionKind,
} from './chat-tool-registry';
import {
  buildOverlayRenderTruthSnapshot,
  UnlicensedAudioInRenderError,
} from '../shared/render-request-payload';

export const CHAT_EDIT_POSTCONDITION_VERSION = 'editron-chat-postcondition-v1' as const;

type JsonRecord = Record<string, unknown>;

export interface ChatEditPostconditionTarget {
  overlayId: string;
  overlayType: string;
  state: 'created' | 'updated' | 'deleted';
  from: number | null;
  endFrame: number | null;
}

export interface ChatEditPostconditionVerification {
  version: typeof CHAT_EDIT_POSTCONDITION_VERSION;
  status: 'pass' | 'fail';
  toolName: string;
  stateExpectation: ChatToolStatePostconditionKind;
  reason: string;
  beforeStateHash: string;
  afterStateHash: string;
  stateChanged: boolean;
  requestedTargetIds: string[];
  affectedTargets: ChatEditPostconditionTarget[];
  renderEligibility: {
    inheritedIssues: Array<{ overlayId: string; reason: string }>;
    introducedIssues: Array<{ overlayId: string; reason: string }>;
  };
  renderVerification: {
    status: 'pending' | 'deferred';
    required: boolean;
    modalities: ChatToolPostconditionContract['render']['modalities'];
  };
}

export function enforceChatToolPostcondition(input: {
  toolName: string;
  args: unknown;
  output: unknown;
  beforeProject: unknown;
  afterProject: unknown;
}): { output: string; verification: ChatEditPostconditionVerification | null } {
  const envelope = parseRecord(input.output);
  const metadata = getChatToolMetadata(input.toolName);

  if (!metadata?.mutatesProject || envelope?.status !== 'success') {
    return { output: stringifyOutput(input.output), verification: null };
  }

  const verification = verifyChatToolPostcondition({
    toolName: input.toolName,
    args: input.args,
    resultData: envelope.data,
    beforeProject: input.beforeProject,
    afterProject: input.afterProject,
  });

  if (verification.status === 'fail') {
    return {
      verification,
      output: JSON.stringify({
        status: 'error',
        data: null,
        error: {
          code: 'CHAT_EDIT_POSTCONDITION_FAILED',
          message: verification.reason,
          details: { postconditionVerification: verification },
        },
        nextAction: 'stop',
      }),
    };
  }

  return {
    verification,
    output: JSON.stringify({
      ...envelope,
      data: {
        ...asRecord(envelope.data),
        postconditionVerification: verification,
      },
    }),
  };
}

export function verifyChatToolPostcondition(input: {
  toolName: string;
  args: unknown;
  resultData: unknown;
  beforeProject: unknown;
  afterProject: unknown;
}): ChatEditPostconditionVerification {
  const metadata = getChatToolMetadata(input.toolName);
  const contract = metadata?.postconditions;
  const before = projectSnapshot(input.beforeProject);
  const after = projectSnapshot(input.afterProject);
  const beforeStateHash = before?.stateHash ?? 'missing';
  const afterStateHash = after?.stateHash ?? 'missing';
  const stateChanged = before != null && after != null && beforeStateHash !== afterStateHash;
  const requestedTargetIds = resolveRequestedTargetIds(contract?.state.kind, input.args, input.resultData);
  const affectedTargets = before && after ? diffOverlayTargets(before.overlays, after.overlays) : [];
  const renderEligibility = classifyAffectedRenderEligibility({
    before,
    after,
  });
  const outcome = renderEligibility.introducedIssues.length > 0
    ? {
        pass: false,
        deferred: false,
        reason: renderEligibility.introducedIssues
          .map((issue) => issue.reason)
          .join('; '),
      }
    : evaluateStateExpectation({
        contract,
        before,
        after,
        stateChanged,
        requestedTargetIds,
        affectedTargets,
        resultData: input.resultData,
      });
  const renderEligibleTargets = affectedTargets.filter((target) => (
    !renderEligibility.inheritedIssues.some((issue) => issue.overlayId === target.overlayId)
  ));
  const modalities = outcome.deferred
    ? []
    : renderEligibleTargets.length === 0 && affectedTargets.length > 0
      ? []
      : resolveRenderVerificationModalities(
          renderEligibleTargets,
          contract?.render.modalities ?? ['visual', 'audio'],
        );

  return {
    version: CHAT_EDIT_POSTCONDITION_VERSION,
    status: outcome.pass ? 'pass' : 'fail',
    toolName: input.toolName,
    stateExpectation: contract?.state.kind ?? 'project-state-changed',
    reason: outcome.reason,
    beforeStateHash,
    afterStateHash,
    stateChanged,
    requestedTargetIds,
    affectedTargets,
    renderEligibility,
    renderVerification: {
      status: outcome.deferred || modalities.length === 0 ? 'deferred' : 'pending',
      required: !outcome.deferred && modalities.length > 0,
      modalities,
    },
  };
}

function classifyAffectedRenderEligibility(input: {
  before: ProjectSnapshot | null;
  after: ProjectSnapshot | null;
}): ChatEditPostconditionVerification['renderEligibility'] {
  const inheritedIssues: Array<{ overlayId: string; reason: string }> = [];
  const introducedIssues: Array<{ overlayId: string; reason: string }> = [];
  if (!input.after) return { inheritedIssues, introducedIssues };

  for (const [overlayId, afterIssue] of input.after.renderEligibilityIssues) {
    const beforeIssue = input.before?.renderEligibilityIssues.get(overlayId);
    const beforeOverlay = input.before?.overlays.get(overlayId);
    const afterOverlay = input.after.overlays.get(overlayId);
    const issue = { overlayId, reason: afterIssue };
    const sameProvenance = input.before
      ? renderEligibilityProvenanceIdentity(beforeOverlay)
        === renderEligibilityProvenanceIdentity(afterOverlay)
      : false;
    const exposureDidNotExpand = renderEligibilityExposureDidNotExpand(
      beforeOverlay,
      afterOverlay,
    );
    if (beforeIssue === afterIssue && sameProvenance && exposureDidNotExpand) {
      inheritedIssues.push(issue);
    } else {
      introducedIssues.push(issue);
    }
  }
  return { inheritedIssues, introducedIssues };
}

function renderEligibilityProvenanceIdentity(overlay: JsonRecord | undefined): string {
  if (!overlay) return 'missing';
  return stableDigest({
    type: overlay.type,
    assetId: overlay.assetId,
    r2Key: overlay.r2Key,
    content: overlay.content,
    row: overlay.row,
    mediaRole: overlay.mediaRole,
    audioRole: overlay.audioRole,
    hasNativeAudio: overlay.hasNativeAudio,
    audioRights: overlay.audioRights,
    musicRights: overlay.musicRights,
    generatedVideoReceipt: overlay.generatedVideoReceipt,
  });
}

function renderEligibilityExposureDidNotExpand(
  beforeOverlay: JsonRecord | undefined,
  afterOverlay: JsonRecord | undefined,
): boolean {
  if (!beforeOverlay || !afterOverlay) return false;
  const before = audioExposure(beforeOverlay);
  const after = audioExposure(afterOverlay);
  const epsilon = 0.0001;
  return after.durationFrames <= before.durationFrames + epsilon
    && after.gain <= before.gain + epsilon
    && after.sourceStartFrame >= before.sourceStartFrame - epsilon
    && after.sourceEndFrame <= before.sourceEndFrame + epsilon
    && after.mixIdentity === before.mixIdentity;
}

function audioExposure(overlay: JsonRecord): {
  durationFrames: number;
  gain: number;
  sourceStartFrame: number;
  sourceEndFrame: number;
  mixIdentity: string;
} {
  const styles = asRecord(overlay.styles);
  const timelineStart = finiteNumber(overlay.audioStartFrame ?? overlay.from) ?? 0;
  const explicitTimelineEnd = finiteNumber(overlay.audioEndFrame);
  const durationFrames = explicitTimelineEnd === null
    ? Math.max(0, finiteNumber(overlay.durationInFrames) ?? 0)
    : Math.max(0, explicitTimelineEnd - timelineStart);
  const gain = Math.max(0, finiteNumber(styles.volume ?? overlay.volume) ?? 1);
  const sourceStartFrame = Math.max(
    0,
    finiteNumber(overlay.startFromSound ?? overlay.videoStartTime ?? overlay.sourceStartFrame) ?? 0,
  );
  const playbackRate = Math.max(
    0.0001,
    finiteNumber(overlay.playbackRate ?? overlay.speed) ?? 1,
  );
  return {
    durationFrames,
    gain,
    sourceStartFrame,
    sourceEndFrame: sourceStartFrame + durationFrames * playbackRate,
    mixIdentity: stableDigest({
      duckingConfig: styles.duckingConfig,
      fadeIn: styles.fadeIn,
      fadeInDuration: styles.fadeInDuration,
      fadeOut: styles.fadeOut,
      fadeOutDuration: styles.fadeOutDuration,
      audioFadeInDuration: styles.audioFadeInDuration,
      audioFadeOutDuration: styles.audioFadeOutDuration,
    }),
  };
}

function resolveRenderVerificationModalities(
  affectedTargets: ChatEditPostconditionTarget[],
  declared: ChatToolRenderEvidenceModality[],
): ChatToolRenderEvidenceModality[] {
  if (affectedTargets.length === 0) return declared;
  const modalities = new Set<ChatToolRenderEvidenceModality>();
  for (const target of affectedTargets) {
    const type = target.overlayType.toLowerCase();
    if (type === 'audio' || type === 'sound') {
      modalities.add('audio');
      continue;
    }
    if (type === 'video') {
      for (const modality of declared) modalities.add(modality);
      continue;
    }
    modalities.add('visual');
  }
  return Array.from(modalities);
}

interface ProjectSnapshot {
  stateHash: string;
  overlays: Map<string, JsonRecord>;
  renderEligibilityIssues: Map<string, string>;
}

export function buildChatProjectRevision(value: unknown): string | null {
  return projectSnapshot(value)?.stateHash ?? null;
}

function projectSnapshot(value: unknown): ProjectSnapshot | null {
  const project = asRecord(value);
  if (Object.keys(project).length === 0) return null;
  const scrubbed = scrubVolatileTransportFields(project) as JsonRecord;
  const overlays = Array.isArray(scrubbed.overlays) ? scrubbed.overlays.map(asRecord) : [];
  const overlayMap = new Map(overlays.map((overlay) => [String(overlay.id ?? ''), overlay]));
  return {
    stateHash: materialStateFingerprint(scrubbed),
    overlays: overlayMap,
    renderEligibilityIssues: new Map(
      overlays.flatMap((overlay) => {
        const overlayId = String(overlay.id ?? '');
        if (!overlayId) return [];
        const issue = overlayRenderEligibilityIssue(overlay);
        return issue ? [[overlayId, issue] as const] : [];
      }),
    ),
  };
}

function evaluateStateExpectation(input: {
  contract: ChatToolPostconditionContract | null | undefined;
  before: ProjectSnapshot | null;
  after: ProjectSnapshot | null;
  stateChanged: boolean;
  requestedTargetIds: string[];
  affectedTargets: ChatEditPostconditionTarget[];
  resultData: unknown;
}): { pass: boolean; reason: string; deferred: boolean } {
  if (!input.contract) {
    return { pass: false, reason: 'Mutating tool has no declared postcondition contract.', deferred: false };
  }
  if (!input.before || !input.after) {
    return {
      pass: false,
      reason: 'Canonical project state could not be loaded before and after the mutation.',
      deferred: false,
    };
  }

  const affectedIds = new Set(input.affectedTargets.map((target) => target.overlayId));
  const createdIds = new Set(input.affectedTargets.filter((target) => target.state === 'created').map((target) => target.overlayId));
  const updatedIds = new Set(input.affectedTargets.filter((target) => target.state === 'updated').map((target) => target.overlayId));
  const deletedIds = new Set(input.affectedTargets.filter((target) => target.state === 'deleted').map((target) => target.overlayId));
  const targets = input.requestedTargetIds;

  switch (input.contract.state.kind) {
    case 'overlay-created': {
      const pass = targets.length > 0
        ? targets.every((id) => createdIds.has(id))
        : createdIds.size > 0;
      return {
        pass,
        reason: pass
          ? 'The created overlay exists in canonical project state.'
          : 'Tool reported success, but the requested overlay was not created in canonical project state.',
        deferred: false,
      };
    }
    case 'overlay-updated': {
      const pass = targets.length > 0
        ? targets.every((id) => updatedIds.has(id))
        : updatedIds.size > 0;
      return {
        pass,
        reason: pass
          ? 'The requested overlay mutation is present in canonical project state.'
          : 'Tool reported success, but the requested overlay did not change in canonical project state.',
        deferred: false,
      };
    }
    case 'overlay-deleted': {
      const pass = targets.length > 0
        ? targets.every((id) => deletedIds.has(id))
        : deletedIds.size > 0;
      return {
        pass,
        reason: pass
          ? 'The requested overlay is absent from canonical project state.'
          : 'Tool reported success, but the requested overlay still exists in canonical project state.',
        deferred: false,
      };
    }
    case 'overlay-set-changed': {
      const pass = affectedIds.size > 0;
      return {
        pass,
        reason: pass
          ? 'The canonical overlay set changed.'
          : 'Tool reported success, but the canonical overlay set did not change.',
        deferred: false,
      };
    }
    case 'project-state-changed-or-durable-operation-queued': {
      const queue = verifyDurableOperationQueue(input.resultData);
      if (queue.matched) return queue;
      return {
        pass: input.stateChanged,
        reason: input.stateChanged
          ? 'Canonical project state changed.'
          : 'Tool reported success, but canonical project state did not change and no durable operation was queued.',
        deferred: false,
      };
    }
    case 'project-state-changed':
    default:
      return {
        pass: input.stateChanged,
        reason: input.stateChanged
          ? 'Canonical project state changed.'
          : 'Tool reported success, but canonical project state did not change.',
        deferred: false,
      };
  }
}

function verifyDurableOperationQueue(
  resultData: unknown,
): { matched: boolean; pass: boolean; reason: string; deferred: boolean } {
  const result = asRecord(resultData);
  const dispatch = asRecord(result.dispatch);
  const authority = asRecord(dispatch.authority);
  const queueStatus = authority.queueStatus ?? result.queueStatus ?? result.status;
  const uploadBatchId = typeof authority.uploadBatchId === 'string'
    ? authority.uploadBatchId.trim()
    : '';
  const jobIdValue = authority.jobId ?? result.jobId;
  const jobId = typeof jobIdValue === 'string'
    ? jobIdValue.trim()
    : '';
  const acceptedQueueStatus = queueStatus === 'queued'
    || queueStatus === 'already-queued'
    || queueStatus === 'completed';
  const scriptQueueAccepted = dispatch.status === 'queued'
    && dispatch.owner === 'phase2-script-planner'
    && acceptedQueueStatus
    && (queueStatus === 'queued' || queueStatus === 'already-queued')
    && uploadBatchId.length > 0;
  const directorQueueAccepted = dispatch.status === 'queued'
    && dispatch.owner === 'director-unified-planner'
    && acceptedQueueStatus
    && jobId.length > 0;
  const standaloneQueueAccepted = Object.keys(dispatch).length === 0
    && acceptedQueueStatus
    && jobId.length > 0;
  const matched = dispatch.status === 'queued' || jobId.length > 0 || uploadBatchId.length > 0;
  const pass = scriptQueueAccepted || directorQueueAccepted || standaloneQueueAccepted;
  return {
    matched,
    pass,
    reason: pass
      ? 'The durable operation was accepted by its owning queue.'
      : matched
        ? 'Tool reported a queued operation without a valid durable receipt.'
        : 'No durable operation was queued.',
    deferred: pass,
  };
}

function resolveRequestedTargetIds(
  kind: ChatToolStatePostconditionKind | undefined,
  args: unknown,
  resultData: unknown,
): string[] {
  if (kind === 'overlay-created') {
    return uniqueIds(collectIds(resultData, new Set([
      'id',
      'overlayId',
      'overlayIds',
      'createdOverlayId',
      'createdOverlayIds',
      'transitionId',
    ])));
  }
  if (kind === 'overlay-updated' || kind === 'overlay-deleted') {
    return uniqueIds(collectIds(args, new Set([
      'id',
      'overlayId',
      'targetId',
      'targetOverlayId',
      'soundOverlayId',
      'captionOverlayId',
      'targetIds',
      'overlayIds',
    ])));
  }
  return [];
}

function collectIds(value: unknown, keys: Set<string>, currentKey?: string): string[] {
  if (Array.isArray(value)) return value.flatMap((entry) => collectIds(entry, keys, currentKey));
  if (!value || typeof value !== 'object') {
    if (currentKey && keys.has(currentKey) && (typeof value === 'string' || typeof value === 'number')) {
      return [String(value)];
    }
    return [];
  }
  return Object.entries(value as JsonRecord).flatMap(([key, entry]) => collectIds(entry, keys, key));
}

function diffOverlayTargets(
  before: Map<string, JsonRecord>,
  after: Map<string, JsonRecord>,
): ChatEditPostconditionTarget[] {
  const ids = new Set([...before.keys(), ...after.keys()]);
  const targets: ChatEditPostconditionTarget[] = [];
  for (const id of ids) {
    if (!id) continue;
    const previous = before.get(id);
    const next = after.get(id);
    if (!previous && next) targets.push(targetFromOverlay(id, next, 'created'));
    else if (previous && !next) targets.push(targetFromOverlay(id, previous, 'deleted'));
    else if (previous && next && overlayFingerprint(previous) !== overlayFingerprint(next)) {
      targets.push(targetFromOverlay(id, next, 'updated'));
    }
  }
  return targets;
}

function targetFromOverlay(
  overlayId: string,
  overlay: JsonRecord,
  state: ChatEditPostconditionTarget['state'],
): ChatEditPostconditionTarget {
  const from = finiteNumber(overlay.from);
  const duration = finiteNumber(overlay.durationInFrames);
  return {
    overlayId,
    overlayType: typeof overlay.type === 'string' ? overlay.type : 'unknown',
    state,
    from,
    endFrame: from != null && duration != null ? from + duration : null,
  };
}

function overlayFingerprint(overlay: JsonRecord): string {
  try {
    return stableDigest(buildOverlayRenderTruthSnapshot(overlay));
  } catch (error) {
    if (!(error instanceof UnlicensedAudioInRenderError)) throw error;
    return stableDigest({
      renderEligibility: error.code,
      overlay,
    });
  }
}

function overlayRenderEligibilityIssue(overlay: JsonRecord): string | null {
  try {
    buildOverlayRenderTruthSnapshot(overlay);
    return null;
  } catch (error) {
    if (error instanceof UnlicensedAudioInRenderError) return error.message;
    throw error;
  }
}

const CHAT_RENDERABLE_PROJECT_FIELDS = [
  'overlays',
  'aspectRatio',
  'playerDimensions',
  'fps',
  'durationInFrames',
  'name',
  'thumbnail',
  'brand',
  'brandId',
  'metadata',
  'projectMetadata',
  'sourceAssetIds',
  'mediaAssetIds',
  'videoAssets',
  'audioAssets',
  'imageAssets',
  'sourceAssets',
  'uploadBatchId',
  'primaryAssetId',
  'storyline',
  'editorialPreferences',
  'productionBrief',
] as const;

function materialStateFingerprint(project: JsonRecord): string {
  const renderableState: JsonRecord = {};
  for (const field of CHAT_RENDERABLE_PROJECT_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(project, field)) renderableState[field] = project[field];
  }
  return stableDigest(renderableState);
}

function stableDigest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as JsonRecord)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]),
  );
}

function scrubVolatileTransportFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrubVolatileTransportFields);
  if (!value || typeof value !== 'object') return value;
  const output: JsonRecord = {};
  for (const [key, entry] of Object.entries(value as JsonRecord)) {
    const normalized = key.toLowerCase();
    if (
      normalized === 'url'
      || normalized === 'src'
      || normalized.endsWith('signedurl')
      || normalized.endsWith('resolvedurl')
      || normalized.endsWith('downloadurl')
      || normalized.endsWith('streamurl')
      || normalized === 'urlexpiresat'
    ) continue;
    output[key] = scrubVolatileTransportFields(entry);
  }
  return output;
}

function parseRecord(value: unknown): JsonRecord | null {
  if (value && typeof value === 'object') return value as JsonRecord;
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed as JsonRecord : null;
  } catch {
    return null;
  }
}

function stringifyOutput(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function uniqueIds(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function finiteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
