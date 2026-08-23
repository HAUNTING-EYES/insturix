import {
  buildPhase0RenderedStillEvidence,
  type Phase0RenderedStillEvidence,
} from '@/lib/editron/services/phase0-rendered-evidence-worker';
import type { Phase0FixtureProject }
  from '@/lib/editron/services/phase0-fixture-manifest';

import { hashCanonicalJsonV1 } from './contracts-v1';
import {
  bindProviderNativeDurableOutcomeProofReceiptV2R,
  type ProviderNativeOutcomeProofDispositionV2R,
} from './provider-native-durable-outcome-proof-v2r';
import { projectProposalStateV2R }
  from './project-service-proposal-state-v2r';
import type { ProjectServiceIsolatedOutcomeProofOwnerV2R }
  from './provider-native-project-service-clone-owner-v2r';

type JsonRecord = Record<string, unknown>;
type ProofInput = Parameters<ProjectServiceIsolatedOutcomeProofOwnerV2R['prove']>[0];
type RenderEvidenceBuilder = typeof buildPhase0RenderedStillEvidence;

export const PROVIDER_NATIVE_CUT_OUTCOME_PROOF_POLICY_VERSION_V2R =
  'EDITRON_PROVIDER_NATIVE_CUT_OUTCOME_PROOF_POLICY_V2R_1' as const;

const POLICY = {
  policyId: 'provider-native-cut-outcome-proof',
  policyVersion: PROVIDER_NATIVE_CUT_OUTCOME_PROOF_POLICY_VERSION_V2R,
  ownerRef: 'lib/editron/services/phase0-rendered-evidence-worker.ts#buildPhase0RenderedStillEvidence',
  supportedOperation: 'cut_section',
  supportedOperationCount: 1,
  requiredProofKinds: ['state', 'render'],
  timebaseCertification: 'CURRENT_NUMERIC_PROJECT_FPS_RESEARCH_ONLY',
} as const;

/**
 * Proves one already-selected cut on an isolated ProjectService clone. The
 * owner never resolves a cut range, mutates ProjectService or substitutes a
 * renderer. Missing/partial render evidence remains UNVERIFIABLE.
 */
export function createProviderNativeProjectServiceCutProofOwnerV2R(
  options: Readonly<{
    buildRenderedEvidence?: RenderEvidenceBuilder;
    now?: () => string;
  }> = {},
): Readonly<ProjectServiceIsolatedOutcomeProofOwnerV2R> {
  const buildRenderedEvidence = options.buildRenderedEvidence
    ?? buildPhase0RenderedStillEvidence;
  return {
    prove: async (input) => {
      const cut = assertOneCut(input);
      const requestedSampleFrames = boundaryFrames(
        cut.startFrame,
        input.project.durationInFrames,
      );
      let renderEvidence: Readonly<Phase0RenderedStillEvidence>;
      try {
        renderEvidence = await buildRenderedEvidence(
          input.project as unknown as Phase0FixtureProject,
          {
            baselineProject: input.baselineProject as unknown as Phase0FixtureProject,
            requestedSampleFrames,
            capturedAt: options.now?.(),
            comparisonMode: 'mutation-delta',
          },
        );
      } catch {
        renderEvidence = unavailableRenderEvidence(input.projectId, requestedSampleFrames, options);
      }
      const renderDisposition = assessRenderEvidence(
        renderEvidence,
        requestedSampleFrames,
        input.projectId,
      );
      const stateProofId = 'cut-state-proof';
      const renderProofId = 'cut-render-proof';
      const stateEvidenceSha256 = hashCanonicalJsonV1({
        policy: POLICY,
        proposalReceiptSha256: input.proposalReceipt.receiptSha256,
        baseStateSha256: input.proposalReceipt.baseStateSha256,
        finalStateSha256: input.proposalReceipt.finalStateSha256,
        callSha256: cut.callSha256,
        targetRange: { startFrame: cut.startFrame, endFrame: cut.endFrame },
        finalDurationInFrames: input.project.durationInFrames,
      });
      const renderEvidenceSha256 = hashCanonicalJsonV1(renderEvidence);
      return bindProviderNativeDurableOutcomeProofReceiptV2R({
        tenantId: input.tenantId,
        userId: input.userId,
        projectId: input.projectId,
        episodeId: input.checkpoint.episodeId,
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
        obligations: [
          {
            obligationId: 'cut-state', kind: 'state', disposition: 'PASS',
            proofReferenceIds: [stateProofId],
          },
          {
            obligationId: 'cut-render', kind: 'render',
            disposition: renderDisposition,
            proofReferenceIds: [renderProofId],
          },
        ],
        proofReferences: [
          { proofId: stateProofId, proofSha256: stateEvidenceSha256, disposition: 'PASS' },
          {
            proofId: renderProofId,
            proofSha256: renderEvidenceSha256,
            disposition: renderDisposition,
          },
        ],
        observedAt: renderEvidence.completedAt
          ?? renderEvidence.capturedAt ?? options.now?.() ?? new Date().toISOString(),
        summary: renderDisposition === 'PASS'
          ? 'The exact isolated cut state and requested boundary renders are present.'
          : 'The exact isolated cut state is valid, but rendered boundary proof is unavailable.',
      });
    },
  };
}

function assertOneCut(input: Readonly<ProofInput>): Readonly<{
  startFrame: number;
  endFrame: number;
  callSha256: string;
}> {
  if (input.project.projectId !== input.projectId
    || input.project.userId !== input.userId
    || input.baselineProject.projectId !== input.projectId
    || input.baselineProject.userId !== input.userId) fail('PROJECT_SCOPE_MISMATCH');
  if (hashCanonicalJsonV1(projectProposalStateV2R(input.baselineProject))
      !== input.proposalReceipt.baseStateSha256
    || hashCanonicalJsonV1(projectProposalStateV2R(input.project))
      !== input.proposalReceipt.finalStateSha256) fail('STATE_BINDING_MISMATCH');
  const operationReceipts = input.proposalReceipt.operationReceipts;
  if (operationReceipts.length !== 1
    || operationReceipts[0].operatorId !== 'cut_section') fail('OPERATION_SET_UNSUPPORTED');
  const operation = operationReceipts[0];
  const turn = input.episodeReceipt.turns.find((candidate) => candidate.turn === operation.turn);
  if (!turn) fail('EPISODE_TURN_MISSING');
  const modelCall = record(turn.modelCall);
  const argumentsValue = record(turn.normalizedArguments);
  const targetRange = record(argumentsValue.targetRange);
  const startFrame = safeFrame(targetRange.startFrame);
  const endFrame = safeFrame(targetRange.endFrame);
  const call = {
    operatorId: 'cut_section',
    arguments: argumentsValue,
    turn: operation.turn,
  };
  const callSha256 = hashCanonicalJsonV1(call);
  if (modelCall.name !== 'cut_section'
    || argumentsValue.projectId !== input.projectId
    || startFrame === null || endFrame === null || endFrame <= startFrame
    || operation.callSha256 !== callSha256
    || input.baselineProject.durationInFrames - (endFrame - startFrame)
      !== input.project.durationInFrames) fail('CUT_CALL_BINDING_INVALID');
  return { startFrame, endFrame, callSha256 };
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
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('RECORD_INVALID');
  return value as JsonRecord;
}

function safeFrame(value: unknown): number | null {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

function fail(code: string): never {
  throw new Error(`PROVIDER_NATIVE_CUT_OUTCOME_PROOF_${code}`);
}
