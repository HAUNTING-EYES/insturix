import {
  buildKeyframeMutationPatch,
  type KeyframeMutationPoint,
} from '@/lib/editron/services/keyframe-mutation';
import {
  buildPhase0RenderedStillEvidence,
  type Phase0RenderedStillEvidence,
} from '@/lib/editron/services/phase0-rendered-evidence-worker';
import type { Phase0FixtureProject }
  from '@/lib/editron/services/phase0-fixture-manifest';
import { cutTimelineRange } from '@/lib/editron/services/timeline-range-cut';
import type { Project } from '@/lib/editron/services/project-service';

import { hashCanonicalJsonV1 } from './contracts-v1';
import {
  bindProviderNativeDurableOutcomeProofReceiptV2R,
  bindProviderNativeExecutionBoundOutcomeProofReceiptV2R,
  type ProviderNativeOutcomeProofDispositionV2R,
} from './provider-native-durable-outcome-proof-v2r';
import { projectProposalStateV2R }
  from './project-service-proposal-state-v2r';
import type { ProjectServiceIsolatedOutcomeProofOwnerV2R }
  from './provider-native-project-service-clone-owner-v2r';

type JsonRecord = Record<string, unknown>;
type ProofInput = Parameters<ProjectServiceIsolatedOutcomeProofOwnerV2R['prove']>[0];
type ExecutionBoundProofInput = Parameters<NonNullable<
  ProjectServiceIsolatedOutcomeProofOwnerV2R['proveExecutionBound']
>>[0];
type RenderEvidenceBuilder = typeof buildPhase0RenderedStillEvidence;
type OperationReceipt = ProofInput['proposalReceipt']['operationReceipts'][number];

interface BoundEditClaim {
  cut: Readonly<{
    startFrame: number;
    endFrame: number;
    callSha256: string;
  }>;
  cutOnlyProject: Project;
  cutOnlyStateSha256: string;
  focalScale?: Readonly<{
    overlayId: number;
    callSha256: string;
    localStartFrame: number;
    localEndFrame: number;
    timelineEndFrame: number;
    focalPoint: Readonly<{ x: number; y: number }>;
  }>;
}

interface VisualExpectation {
  frame: number;
  delta: 'changed' | 'unchanged';
  activeOverlayId?: number;
}

export const PROVIDER_NATIVE_CUT_OUTCOME_PROOF_POLICY_VERSION_V2R =
  'EDITRON_PROVIDER_NATIVE_CUT_OUTCOME_PROOF_POLICY_V2R_2' as const;

const POLICY = {
  policyId: 'provider-native-cut-focal-scale-outcome-proof',
  policyVersion: PROVIDER_NATIVE_CUT_OUTCOME_PROOF_POLICY_VERSION_V2R,
  stateOwnerRefs: [
    'lib/editron/services/timeline-range-cut.ts#cutTimelineRange',
    'lib/editron/services/keyframe-mutation.ts#buildKeyframeMutationPatch',
  ],
  renderOwnerRef: 'lib/editron/services/phase0-rendered-evidence-worker.ts#buildPhase0RenderedStillEvidence',
  comparisonOwnerRef: 'lib/editron/services/phase0-rendered-aesthetic-scoring.ts#buildPhase0RenderedAestheticEvidence',
  supportedOperationSequences: [
    ['cut_section'],
    ['cut_section', 'set_keyframes'],
  ],
  requiredProofKinds: ['state', 'render', 'visual'],
  timebaseCertification: 'CURRENT_NUMERIC_PROJECT_FPS_RESEARCH_ONLY',
} as const;

/**
 * Proves one selected cut, optionally followed by one selected focal-scale
 * keyframe mutation, on an isolated ProjectService clone. The owner never
 * resolves creative form, mutates ProjectService or substitutes a renderer.
 * Missing or uninspected render evidence remains UNVERIFIABLE.
 */
export function createProviderNativeProjectServiceCutProofOwnerV2R(
  options: Readonly<{
    buildRenderedEvidence?: RenderEvidenceBuilder;
    now?: () => string;
  }> = {},
): Readonly<ProjectServiceIsolatedOutcomeProofOwnerV2R> {
  const buildRenderedEvidence = options.buildRenderedEvidence
    ?? buildPhase0RenderedStillEvidence;
  const legacyOwner: Readonly<Pick<
    ProjectServiceIsolatedOutcomeProofOwnerV2R,
    'prove'
  >> = {
    prove: async (input) => {
      const claim = assertSupportedEdit(input);
      const cutFrames = boundaryFrames(
        claim.cut.startFrame,
        input.project.durationInFrames,
      );
      const cutEvidence = await renderEvidenceOrUnavailable({
        buildRenderedEvidence,
        project: input.project,
        baselineProject: input.baselineProject,
        requestedSampleFrames: cutFrames,
        projectId: input.projectId,
        options,
      });
      const cutRenderDisposition = assessRenderEvidence(
        cutEvidence,
        cutFrames,
        input.projectId,
      );
      const cutExpectations = cutVisualExpectations(
        claim.cut.startFrame,
        cutFrames,
      );
      const cutVisualDisposition = assessVisualEvidence(
        cutEvidence,
        cutExpectations,
      );

      const focalFrames = claim.focalScale
        ? [claim.focalScale.timelineEndFrame] : [];
      const focalEvidence = claim.focalScale
        ? await renderEvidenceOrUnavailable({
            buildRenderedEvidence,
            project: input.project,
            baselineProject: claim.cutOnlyProject,
            requestedSampleFrames: focalFrames,
            auditedOverlayIds: [claim.focalScale.overlayId],
            projectId: input.projectId,
            options,
          })
        : null;
      const focalRenderDisposition = focalEvidence
        ? assessRenderEvidence(focalEvidence, focalFrames, input.projectId)
        : null;
      const focalExpectations: VisualExpectation[] = claim.focalScale
        ? [{
            frame: claim.focalScale.timelineEndFrame,
            delta: 'changed',
            activeOverlayId: claim.focalScale.overlayId,
          }]
        : [];
      const focalVisualDisposition = focalEvidence
        ? assessVisualEvidence(focalEvidence, focalExpectations)
        : null;

      const stateProofId = 'edit-state-proof';
      const cutRenderProofId = 'cut-render-proof';
      const cutVisualProofId = 'cut-visual-proof';
      const stateEvidenceSha256 = hashCanonicalJsonV1({
        policy: POLICY,
        proposalReceiptSha256: input.proposalReceipt.receiptSha256,
        baseStateSha256: input.proposalReceipt.baseStateSha256,
        cutOnlyStateSha256: claim.cutOnlyStateSha256,
        finalStateSha256: input.proposalReceipt.finalStateSha256,
        cut: claim.cut,
        focalScale: claim.focalScale ?? null,
        finalDurationInFrames: input.project.durationInFrames,
      });
      const obligations = [
        obligation('edit-state', 'state', 'PASS', stateProofId),
        obligation('cut-render', 'render', cutRenderDisposition, cutRenderProofId),
        obligation('cut-visual', 'visual', cutVisualDisposition, cutVisualProofId),
      ];
      const proofReferences = [
        proofReference(stateProofId, stateEvidenceSha256, 'PASS'),
        proofReference(
          cutRenderProofId,
          hashCanonicalJsonV1(cutEvidence),
          cutRenderDisposition,
        ),
        proofReference(
          cutVisualProofId,
          hashCanonicalJsonV1({ evidence: cutEvidence, expectations: cutExpectations }),
          cutVisualDisposition,
        ),
      ];
      if (focalEvidence && focalRenderDisposition && focalVisualDisposition) {
        const focalRenderProofId = 'focal-scale-render-proof';
        const focalVisualProofId = 'focal-scale-visual-proof';
        obligations.push(
          obligation(
            'focal-scale-render',
            'render',
            focalRenderDisposition,
            focalRenderProofId,
          ),
          obligation(
            'focal-scale-visual',
            'visual',
            focalVisualDisposition,
            focalVisualProofId,
          ),
        );
        proofReferences.push(
          proofReference(
            focalRenderProofId,
            hashCanonicalJsonV1(focalEvidence),
            focalRenderDisposition,
          ),
          proofReference(
            focalVisualProofId,
            hashCanonicalJsonV1({
              evidence: focalEvidence,
              expectations: focalExpectations,
            }),
            focalVisualDisposition,
          ),
        );
      }
      const allPass = proofReferences.every(
        ({ disposition }) => disposition === 'PASS',
      );
      return bindProviderNativeDurableOutcomeProofReceiptV2R({
        tenantId: input.tenantId,
        userId: input.userId,
        projectId: input.projectId,
        episodeId: input.episodeId,
        subject: {
          episodeReceiptSha256: input.episodeReceipt.receiptSha256,
          resumedReceiptSha256: input.resumedReceiptSha256,
          proposalReceiptSha256: input.proposalReceipt.receiptSha256,
          finalStateSha256: input.proposalReceipt.finalStateSha256,
        },
        proofPolicy: {
          policyId: POLICY.policyId,
          policyVersion: POLICY.policyVersion,
          policySha256: hashCanonicalJsonV1(POLICY),
        },
        obligations,
        proofReferences,
        observedAt: latestObservedAt(
          [cutEvidence, ...(focalEvidence ? [focalEvidence] : [])],
          options,
        ),
        summary: allPass
          ? 'The exact isolated edit state and operation-specific rendered deltas pass.'
          : 'The exact isolated edit state passes, but one or more rendered claims failed or remain unverifiable.',
      });
    },
  };
  return {
    ...legacyOwner,
    proveExecutionBound: async (input: Readonly<ExecutionBoundProofInput>) => {
      const { executionTrace, ...legacyInput } = input;
      const legacy = await legacyOwner.prove({
        ...legacyInput,
        resumedReceiptSha256: executionTrace.receiptSha256,
      });
      return bindProviderNativeExecutionBoundOutcomeProofReceiptV2R({
        tenantId: input.tenantId,
        userId: input.userId,
        projectId: input.projectId,
        episodeId: input.episodeId,
        subject: {
          episodeReceiptSha256: input.episodeReceipt.receiptSha256,
          executionTrace,
          proposalReceiptSha256: input.proposalReceipt.receiptSha256,
          finalStateSha256: input.proposalReceipt.finalStateSha256,
        },
        proofPolicy: legacy.proofPolicy,
        obligations: legacy.obligations,
        proofReferences: legacy.proofReferences,
        observedAt: legacy.observedAt,
        summary: legacy.summary,
      });
    },
  };
}

function assertSupportedEdit(input: Readonly<ProofInput>): BoundEditClaim {
  if (input.project.projectId !== input.projectId
    || input.project.userId !== input.userId
    || input.baselineProject.projectId !== input.projectId
    || input.baselineProject.userId !== input.userId) fail('PROJECT_SCOPE_MISMATCH');
  const baseStateSha256 = hashCanonicalJsonV1(
    projectProposalStateV2R(input.baselineProject),
  );
  const finalStateSha256 = hashCanonicalJsonV1(
    projectProposalStateV2R(input.project),
  );
  if (baseStateSha256 !== input.proposalReceipt.baseStateSha256
    || finalStateSha256 !== input.proposalReceipt.finalStateSha256) {
    fail('STATE_BINDING_MISMATCH');
  }
  const receipts = input.proposalReceipt.operationReceipts;
  if (receipts.length !== 1 && receipts.length !== 2) {
    fail('OPERATION_SET_UNSUPPORTED');
  }
  const cutCall = boundCall(input, receipts[0], 'cut_section');
  const cutArguments = record(cutCall.arguments);
  const cutRange = frameRange(cutArguments.targetRange);
  if (cutArguments.projectId !== input.projectId || !cutRange) {
    fail('CUT_CALL_BINDING_INVALID');
  }
  const cutOnlyProject = structuredClone(input.baselineProject) as Project;
  const cutResult = cutTimelineRange({
    overlays: cutOnlyProject.overlays,
    ...cutRange,
    fps: cutOnlyProject.fps,
    durationInFrames: cutOnlyProject.durationInFrames,
  });
  cutOnlyProject.overlays = cutResult.overlays as Project['overlays'];
  cutOnlyProject.durationInFrames = cutResult.newDurationInFrames;
  const cutOnlyStateSha256 = hashCanonicalJsonV1(
    projectProposalStateV2R(cutOnlyProject),
  );
  if (receipts[0].beforeStateSha256 !== baseStateSha256
    || receipts[0].afterStateSha256 !== cutOnlyStateSha256) {
    fail('CUT_STATE_RECONSTRUCTION_MISMATCH');
  }
  const cut = { ...cutRange, callSha256: cutCall.callSha256 };
  if (receipts.length === 1) {
    if (cutOnlyStateSha256 !== finalStateSha256) fail('CUT_FINAL_STATE_MISMATCH');
    return { cut, cutOnlyProject, cutOnlyStateSha256 };
  }

  if (receipts[1].beforeStateSha256 !== cutOnlyStateSha256
    || receipts[0].afterStateSha256 !== receipts[1].beforeStateSha256) {
    fail('OPERATION_STATE_CHAIN_MISMATCH');
  }
  const focalCall = boundCall(input, receipts[1], 'set_keyframes');
  const focalArguments = record(focalCall.arguments);
  if (focalArguments.projectId !== input.projectId
    || focalArguments.expectedProjectRevision !== receipts[0].writerProjectRevision
    || (focalArguments.property !== undefined && focalArguments.property !== 'scale')) {
    fail('FOCAL_REVISION_HANDOFF_INVALID');
  }
  const overlayId = safeFrame(focalArguments.overlayId);
  const focalPoint = normalizedPoint(focalArguments.focalPoint);
  const cutOnlyOverlay = overlayId === null ? undefined : cutOnlyProject.overlays.find(
    (candidate) => candidate.id === overlayId,
  );
  const keyframes = cutOnlyOverlay
    ? keyframePoints(focalArguments.keyframes, Number(cutOnlyOverlay.durationInFrames))
    : null;
  if (overlayId === null || !cutOnlyOverlay || !keyframes || !focalPoint) {
    fail('FOCAL_CALL_BINDING_INVALID');
  }
  const expectedFinalProject = structuredClone(cutOnlyProject);
  const expectedOverlay = expectedFinalProject.overlays.find(
    (candidate) => candidate.id === overlayId,
  );
  if (!expectedOverlay) fail('FOCAL_OVERLAY_MISSING');
  Object.assign(expectedOverlay, buildKeyframeMutationPatch({
    overlay: expectedOverlay as unknown as JsonRecord,
    property: 'scale',
    keyframes,
    focalPoint,
  }).patch);
  const expectedFinalStateSha256 = hashCanonicalJsonV1(
    projectProposalStateV2R(expectedFinalProject),
  );
  if (expectedFinalStateSha256 !== finalStateSha256
    || receipts[1].afterStateSha256 !== finalStateSha256) {
    fail('FOCAL_FINAL_STATE_MISMATCH');
  }
  const finalOverlay = input.project.overlays.find(
    (candidate) => candidate.id === overlayId,
  );
  const timelineFrom = finalOverlay ? safeFrame(finalOverlay.from) : null;
  const timelineEndFrame = timelineFrom === null
    ? null : timelineFrom + keyframes[keyframes.length - 1].frame;
  if (timelineEndFrame === null || timelineEndFrame >= input.project.durationInFrames
    || timelineEndFrame <= cutRange.startFrame) {
    fail('FOCAL_SAMPLE_FRAME_UNSUPPORTED');
  }
  return {
    cut,
    cutOnlyProject,
    cutOnlyStateSha256,
    focalScale: {
      overlayId,
      callSha256: focalCall.callSha256,
      localStartFrame: keyframes[0].frame,
      localEndFrame: keyframes[keyframes.length - 1].frame,
      timelineEndFrame,
      focalPoint,
    },
  };
}

function boundCall(
  input: Readonly<ProofInput>,
  operation: Readonly<OperationReceipt>,
  operatorId: string,
): Readonly<{ arguments: unknown; callSha256: string }> {
  if (operation.operatorId !== operatorId) fail('OPERATION_ORDER_UNSUPPORTED');
  const turn = input.episodeReceipt.turns.find((candidate) => candidate.turn === operation.turn);
  if (!turn) fail('EPISODE_TURN_MISSING');
  const modelCall = record(turn.modelCall);
  const call = {
    operatorId,
    arguments: turn.normalizedArguments,
    turn: operation.turn,
  };
  const callSha256 = hashCanonicalJsonV1(call);
  const auditMaterial = {
    operatorId,
    turn: operation.turn,
    callSha256,
    beforeStateSha256: operation.beforeStateSha256,
    afterStateSha256: operation.afterStateSha256,
    changedPaths: operation.changedPaths,
    executionSha256: operation.executionSha256,
    writerProjectRevision: operation.writerProjectRevision,
  };
  if (modelCall.name !== operatorId
    || operation.callSha256 !== callSha256
    || hashCanonicalJsonV1(turn.execution) !== operation.executionSha256
    || hashCanonicalJsonV1(auditMaterial) !== operation.operationReceiptSha256) {
    fail('OPERATION_AUDIT_BINDING_INVALID');
  }
  return { arguments: turn.normalizedArguments, callSha256 };
}

function boundaryFrames(startFrame: number, durationInFrames: number): number[] {
  if (!Number.isSafeInteger(durationInFrames) || durationInFrames < 1) {
    fail('FINAL_DURATION_INVALID');
  }
  return [...new Set([
    Math.max(0, Math.min(durationInFrames - 1, startFrame - 1)),
    Math.max(0, Math.min(durationInFrames - 1, startFrame)),
  ])].sort((left, right) => left - right);
}

function assessRenderEvidence(
  evidence: Readonly<Phase0RenderedStillEvidence>,
  requested: readonly number[],
  projectId: string,
): ProviderNativeOutcomeProofDispositionV2R {
  const rendered = new Set(evidence.renderedFrames.map(({ frame }) => frame));
  return evidence.version === 'editron-phase0-rendered-still-evidence-v1'
    && evidence.source === 'phase0-rendered-evidence-worker'
    && evidence.projectId === projectId
    && evidence.status === 'completed'
    && evidence.statusReason === null
    && evidence.completedAt !== null
    && evidence.artifactPackStatus === 'ready'
    && evidence.requestedSampleFrames.length === requested.length
    && evidence.requestedSampleFrames.every((frame, index) => frame === requested[index])
    && evidence.renderedFrames.length === requested.length
    && rendered.size === requested.length
    && evidence.renderedFrames.every(({ baselineUrl }) => Boolean(baselineUrl))
    && evidence.failedFrames.length === 0
    && requested.every((frame) => rendered.has(frame))
    ? 'PASS' : 'UNVERIFIABLE';
}

async function renderEvidenceOrUnavailable(input: Readonly<{
  buildRenderedEvidence: RenderEvidenceBuilder;
  project: Readonly<Project>;
  baselineProject: Readonly<Project>;
  requestedSampleFrames: number[];
  auditedOverlayIds?: number[];
  projectId: string;
  options: Readonly<{ now?: () => string }>;
}>): Promise<Readonly<Phase0RenderedStillEvidence>> {
  try {
    return await input.buildRenderedEvidence(
      input.project as unknown as Phase0FixtureProject,
      {
        baselineProject: input.baselineProject as unknown as Phase0FixtureProject,
        requestedSampleFrames: input.requestedSampleFrames,
        ...(input.auditedOverlayIds
          ? { auditedOverlayIds: input.auditedOverlayIds }
          : {}),
        capturedAt: input.options.now?.(),
        comparisonMode: 'mutation-delta',
      },
    );
  } catch {
    return unavailableRenderEvidence(
      input.projectId,
      input.requestedSampleFrames,
      input.options,
    );
  }
}

function assessVisualEvidence(
  evidence: Readonly<Phase0RenderedStillEvidence>,
  expectations: readonly Readonly<VisualExpectation>[],
): ProviderNativeOutcomeProofDispositionV2R {
  if (!expectations.length) return 'UNVERIFIABLE';
  const report = evidence.renderedAestheticReport;
  if (!report?.summary || !Array.isArray(report.frames)
    || report.summary.mutationStatus === undefined) return 'UNVERIFIABLE';
  if (report.summary.mutationStatus === 'fail'
    || report.summary.absoluteQualityStatus === 'fail') return 'FAIL';
  if (report.summary.mutationStatus !== 'pass') return 'UNVERIFIABLE';
  const byFrame = new Map(report.frames.map((frame) => [frame.frame, frame]));
  for (const expectation of expectations) {
    const frame = byFrame.get(expectation.frame);
    if (!frame || !Number.isSafeInteger(frame.mutationPixelCount)
      || !Number.isSafeInteger(frame.sampledPixelCount)
      || Number(frame.sampledPixelCount) < 1) return 'UNVERIFIABLE';
    const changed = Number(frame.mutationPixelCount) > 0;
    if (changed !== (expectation.delta === 'changed')) return 'FAIL';
    if (expectation.activeOverlayId !== undefined) {
      if (!Array.isArray(frame.activeOverlayIds)) return 'UNVERIFIABLE';
      if (!frame.activeOverlayIds.includes(expectation.activeOverlayId)) return 'FAIL';
    }
  }
  return 'PASS';
}

function cutVisualExpectations(
  startFrame: number,
  requestedFrames: readonly number[],
): VisualExpectation[] {
  if (requestedFrames.length < 2) return [];
  return [
    { frame: startFrame - 1, delta: 'unchanged' },
    { frame: startFrame, delta: 'changed' },
  ];
}

function frameRange(value: unknown): { startFrame: number; endFrame: number } | null {
  if (!isRecord(value)) return null;
  const startFrame = safeFrame(value.startFrame);
  const endFrame = safeFrame(value.endFrame);
  return startFrame !== null && endFrame !== null && endFrame > startFrame
    ? { startFrame, endFrame }
    : null;
}

function keyframePoints(
  value: unknown,
  durationInFrames: number,
): KeyframeMutationPoint[] | null {
  if (!Number.isSafeInteger(durationInFrames) || durationInFrames < 1
    || !Array.isArray(value) || value.length < 2) return null;
  const points: KeyframeMutationPoint[] = [];
  let previousFrame = -1;
  for (const candidate of value) {
    if (!isRecord(candidate)) return null;
    const frame = safeFrame(candidate.frame);
    const pointValue = finiteNumber(candidate.value);
    const easing = candidate.easing;
    if (frame === null || frame <= previousFrame || frame >= durationInFrames
      || pointValue === null || pointValue <= 0
      || !['linear', 'ease-in', 'ease-out', 'ease-in-out'].includes(String(easing))) {
      return null;
    }
    points.push({
      frame,
      value: pointValue,
      easing: easing as KeyframeMutationPoint['easing'],
    });
    previousFrame = frame;
  }
  return points;
}

function normalizedPoint(value: unknown): { x: number; y: number } | null {
  if (!isRecord(value)) return null;
  const x = finiteNumber(value.x);
  const y = finiteNumber(value.y);
  return x !== null && y !== null && x >= 0 && x <= 1 && y >= 0 && y <= 1
    ? { x, y }
    : null;
}

function latestObservedAt(
  evidence: readonly Readonly<Phase0RenderedStillEvidence>[],
  options: Readonly<{ now?: () => string }>,
): string {
  return evidence
    .flatMap((entry) => [entry.completedAt, entry.capturedAt])
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? options.now?.() ?? new Date().toISOString();
}

function obligation(
  obligationId: string,
  kind: 'state' | 'render' | 'visual',
  disposition: ProviderNativeOutcomeProofDispositionV2R,
  proofId: string,
) {
  return { obligationId, kind, disposition, proofReferenceIds: [proofId] } as const;
}

function proofReference(
  proofId: string,
  proofSha256: string,
  disposition: ProviderNativeOutcomeProofDispositionV2R,
) {
  return { proofId, proofSha256, disposition } as const;
}

function unavailableRenderEvidence(
  projectId: string,
  requestedSampleFrames: number[],
  options: Readonly<{ now?: () => string }>,
): Phase0RenderedStillEvidence {
  const capturedAt = options.now?.() ?? new Date().toISOString();
  return {
    version: 'editron-phase0-rendered-still-evidence-v1',
    status: 'failed', statusReason: 'isolated_proof_render_threw',
    source: 'phase0-rendered-evidence-worker', projectId, capturedAt,
    completedAt: capturedAt, functionName: null, serveUrl: null,
    region: 'unknown', sampleLimit: requestedSampleFrames.length,
    requestedSampleFrames, renderedFrames: [],
    failedFrames: [{ frame: -1, renderKind: 'worker', error: 'isolated-proof-render-threw' }],
    artifactPackStatus: 'not-renderable',
    artifactPackIssues: ['isolated-proof-render-threw'],
  };
}

function record(value: unknown): JsonRecord {
  if (!isRecord(value)) fail('RECORD_INVALID');
  return value;
}

function safeFrame(value: unknown): number | null {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && !Object.is(value, -0)
    ? value
    : null;
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function fail(code: string): never {
  throw new Error(`PROVIDER_NATIVE_CUT_OUTCOME_PROOF_${code}`);
}
