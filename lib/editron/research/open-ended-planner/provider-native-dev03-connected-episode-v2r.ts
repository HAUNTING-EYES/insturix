import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import { sha256Dev03FixtureBytesV2 } from './dev03-native-proxy-fixture-v2';
import {
  DEV03_STAGE6_ARTIFACT_IDS_V2,
  type Dev03Stage6ArtifactBindingV2,
  type Dev03Stage6RenderProofV2,
  type Dev03Stage6RendererV2,
} from './dev03-stage6-native-proxy-contract-v2';
import { renderDev03Stage6NativeProxyV2 } from './dev03-stage6-native-proxy-renderer-v2';
import {
  validateDev03Stage6RenderProofV2,
  type Dev03Stage6RenderProofValidationV2,
} from './dev03-stage6-render-proof-validator-v2';
import {
  ProviderNativeDev03IsolatedSessionV2R,
  providerNativeDev03CausalPolicySha256V2R,
} from './provider-native-dev03-session-v2r';
import {
  isProviderNativeProofGateEligibleV2R,
  runProviderNativeToolEpisodeV2R,
  type ProviderNativeEpisodeContextV2R,
  type ProviderNativeEpisodeReceiptV2R,
  type ProviderNativeInvokeResponseV2R,
} from './provider-native-tool-episode-v2r';
import type { ProviderNativeArgumentHandoffModeV2R } from './provider-native-result-references-v2r';
import type {
  ProviderNativeRouteV2R,
  SerializedProviderNativeTurnV2R,
} from './provider-native-tool-codecs-v2r';
import {
  mapProviderNativeNonProofTerminalToProductOutcomeV2R,
  type ProviderNativeProductOutcomeV2R,
} from './provider-native-product-outcome-v2r';
import {
  buildV2RStage6TaskAdapterRegistry,
  findV2RStage6TaskAdapter,
} from './v2r-stage6-task-adapter-registry';

type JsonRecord = Record<string, unknown>;

export const PROVIDER_NATIVE_DEV03_CONNECTED_EPISODE_VERSION_V2R =
  'EDITRON_PROVIDER_NATIVE_DEV03_CONNECTED_EPISODE_V2R_5' as const;

export interface ProviderNativeDev03ConnectedReceiptV2R {
  version: typeof PROVIDER_NATIVE_DEV03_CONNECTED_EPISODE_VERSION_V2R;
  authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION';
  executionIdentity: Readonly<{ executionId: string; createdAt: string }>;
  stage6Adapter: Readonly<JsonRecord>;
  providerEpisode: Readonly<ProviderNativeEpisodeReceiptV2R>;
  causalPolicySha256: string;
  execution: Readonly<JsonRecord>;
  productOutcome: ProviderNativeProductOutcomeV2R;
  stateEffects: readonly [];
  receiptSha256: string;
}

export async function runProviderNativeDev03ConnectedEpisodeV2R(input: {
  route: Readonly<ProviderNativeRouteV2R>;
  context: Readonly<ProviderNativeEpisodeContextV2R>;
  ownerEvidenceContext?: Readonly<ProviderNativeEpisodeContextV2R>;
  invoke: (request: Readonly<SerializedProviderNativeTurnV2R>) => Promise<ProviderNativeInvokeResponseV2R>;
  outputDir: string;
  executionId: string;
  createdAt: string;
  argumentHandoffMode?: ProviderNativeArgumentHandoffModeV2R;
  eligibleOperatorIds?: readonly string[];
  renderer?: Dev03Stage6RendererV2;
}): Promise<Readonly<ProviderNativeDev03ConnectedReceiptV2R>> {
  validateInput(input);
  const ownerEvidenceContext = input.ownerEvidenceContext ?? input.context;
  if (input.ownerEvidenceContext) {
    assertSeparatedContextBinding(input.context, input.ownerEvidenceContext);
  }
  const session = new ProviderNativeDev03IsolatedSessionV2R(ownerEvidenceContext);
  const adapter = findV2RStage6TaskAdapter('DEV-03');
  if (!adapter) throw new Error('PROVIDER_NATIVE_DEV03_STAGE6_ADAPTER_MISSING');
  const eligibleOperatorIds = input.eligibleOperatorIds ?? adapter.supportedOperatorIds;
  requireOperatorPermutation(eligibleOperatorIds, adapter.supportedOperatorIds);
  const registry = buildV2RStage6TaskAdapterRegistry();
  const providerEpisode = await runProviderNativeToolEpisodeV2R({
    route: input.route,
    context: input.context,
    eligibleOperatorIds,
    argumentHandoffMode: input.argumentHandoffMode,
    invoke: input.invoke,
    executeIsolated: (call) => session.execute(call),
  });
  const finalized = await finalizeExecution({
    providerEpisode,
    session,
    renderer: input.renderer ?? renderDev03Stage6NativeProxyV2,
    outputDir: input.outputDir,
    route: input.route,
    context: input.context,
    invoke: input.invoke,
    argumentHandoffMode: input.argumentHandoffMode,
  });
  const material = {
    version: PROVIDER_NATIVE_DEV03_CONNECTED_EPISODE_VERSION_V2R,
    authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION' as const,
    executionIdentity: { executionId: input.executionId, createdAt: input.createdAt },
    stage6Adapter: {
      registrySha256: registry.registrySha256,
      adapterId: adapter.adapterId,
      ownerRef: adapter.ownerRef,
      supportedOperatorIds: adapter.supportedOperatorIds,
      executionAuthority: adapter.executionAuthority,
      proofRequirement: adapter.proofRequirement,
    },
    providerEpisode,
    causalPolicySha256: providerNativeDev03CausalPolicySha256V2R(),
    execution: finalized.execution,
    productOutcome: finalized.productOutcome,
    stateEffects: [] as const,
  };
  return deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
}

async function finalizeExecution(input: {
  providerEpisode: Readonly<ProviderNativeEpisodeReceiptV2R>;
  session: ProviderNativeDev03IsolatedSessionV2R;
  renderer: Dev03Stage6RendererV2;
  outputDir: string;
  route: Readonly<ProviderNativeRouteV2R>;
  context: Readonly<ProviderNativeEpisodeContextV2R>;
  invoke: (request: Readonly<SerializedProviderNativeTurnV2R>) => Promise<ProviderNativeInvokeResponseV2R>;
  argumentHandoffMode?: ProviderNativeArgumentHandoffModeV2R;
}): Promise<Readonly<{ execution: JsonRecord; productOutcome: ProviderNativeProductOutcomeV2R }>> {
  const snapshot = input.session.snapshot();
  if (!isProviderNativeProofGateEligibleV2R(input.providerEpisode.terminal.disposition)) {
    return {
      execution: { disposition: 'NOT_RUN_PROVIDER_TERMINAL', session: snapshot },
      productOutcome: mapProviderNativeNonProofTerminalToProductOutcomeV2R(
        input.providerEpisode.terminal.disposition,
      ),
    };
  }
  const missing = ['ALIGN', 'SHAKE'].filter((stage) => !snapshot.mutationStages.includes(
    stage as 'ALIGN' | 'SHAKE',
  ));
  if (missing.length) {
    return {
      execution: {
        disposition: 'FAIL',
        reasonCodes: ['MODEL_FALSE_SUCCESS_REQUIRED_MUTATIONS_MISSING'],
        missingMutationStages: missing,
        session: snapshot,
      },
      productOutcome: 'FAIL',
    };
  }
  const firstAttempt = await renderProofAttempt(input, 0);
  if (firstAttempt.disposition === 'PASS') {
    return passedExecution(snapshot, firstAttempt, null, [firstAttempt]);
  }
  if (!isShakeOnlyProofRepairEligible(firstAttempt)) {
    return {
      execution: {
        disposition: 'FAIL',
        reasonCodes: ['RENDER_OR_PROOF_FAILURE'],
        session: snapshot,
        proofAttempts: [firstAttempt],
      },
      productOutcome: 'FAIL',
    };
  }

  input.session.authorizeSingleShakeProofRepair();
  const proofRepairEpisode = await runProviderNativeToolEpisodeV2R({
    route: input.route,
    context: buildShakeProofRepairContext(input.context, input.session, firstAttempt),
    eligibleOperatorIds: ['apply_camera_shake'],
    invoke: input.invoke,
    argumentHandoffMode: input.argumentHandoffMode,
    executeIsolated: (call) => input.session.execute(call),
  });
  if (!isProviderNativeProofGateEligibleV2R(proofRepairEpisode.terminal.disposition)) {
    return {
      execution: {
        disposition: 'FAIL', reasonCodes: ['PROOF_REPAIR_PROVIDER_TERMINAL'],
        session: input.session.snapshot(), proofAttempts: [firstAttempt], proofRepairEpisode,
      },
      productOutcome: mapProviderNativeNonProofTerminalToProductOutcomeV2R(
        proofRepairEpisode.terminal.disposition,
      ),
    };
  }
  if (!input.session.hasAppliedShakeProofRepair()) {
    return {
      execution: {
        disposition: 'FAIL', reasonCodes: ['MODEL_PROOF_REPAIR_MUTATION_MISSING'],
        session: input.session.snapshot(), proofAttempts: [firstAttempt], proofRepairEpisode,
      },
      productOutcome: 'FAIL',
    };
  }
  const repairedSnapshot = input.session.snapshot();
  const secondAttempt = await renderProofAttempt(input, 1);
  if (secondAttempt.disposition === 'PASS') {
    return passedExecution(repairedSnapshot, secondAttempt, proofRepairEpisode, [firstAttempt, secondAttempt]);
  }
  return {
    execution: {
      disposition: 'FAIL', reasonCodes: ['RENDER_OR_PROOF_FAILURE_AFTER_BOUNDED_REPAIR'],
      session: repairedSnapshot, proofAttempts: [firstAttempt, secondAttempt], proofRepairEpisode,
    },
    productOutcome: 'FAIL',
  };
}

interface Dev03ProofAttemptV2R {
  ordinal: 0 | 1;
  disposition: 'PASS' | 'FAIL';
  reasonCodes: readonly string[];
  artifacts: readonly Dev03Stage6ArtifactBindingV2[];
  renderProof?: Dev03Stage6RenderProofV2;
  renderProofValidation?: Readonly<Dev03Stage6RenderProofValidationV2>;
  error?: string;
}

async function renderProofAttempt(
  input: Pick<Parameters<typeof finalizeExecution>[0], 'session' | 'renderer' | 'outputDir'>,
  ordinal: 0 | 1,
): Promise<Readonly<Dev03ProofAttemptV2R>> {
  try {
    const rendered = await input.renderer({
      ...input.session.renderState(),
      outputDir: path.join(input.outputDir, `proof-attempt-${ordinal}`),
    });
    const renderProofValidation = validateDev03Stage6RenderProofV2(rendered.proof);
    const artifacts = await bindArtifacts(rendered.artifactPaths);
    return {
      ordinal,
      disposition: renderProofValidation.assessment,
      reasonCodes: renderProofValidation.diagnostics,
      artifacts,
      renderProof: rendered.proof,
      renderProofValidation,
    };
  } catch (error) {
    return {
      ordinal, disposition: 'FAIL', reasonCodes: ['RENDER_OR_PROOF_ATTEMPT_EXCEPTION'],
      artifacts: [], error: errorMessage(error),
    };
  }
}

async function bindArtifacts(
  artifactPaths: Readonly<Record<string, string>>,
): Promise<readonly Dev03Stage6ArtifactBindingV2[]> {
  return Promise.all(DEV03_STAGE6_ARTIFACT_IDS_V2.map(async (artifactId) => {
    const artifactPath = path.resolve(artifactPaths[artifactId]);
    const bytes = await readFile(artifactPath);
    if (!bytes.length) throw new Error(`PROVIDER_NATIVE_DEV03_ARTIFACT_EMPTY:${artifactId}`);
    return {
      artifactId, path: artifactPath,
      sha256: sha256Dev03FixtureBytesV2(bytes), byteLength: bytes.length,
    };
  }));
}

function isShakeOnlyProofRepairEligible(attempt: Readonly<Dev03ProofAttemptV2R>): boolean {
  return attempt.reasonCodes.length > 0
    && attempt.reasonCodes.every((reason) => reason === 'VISUAL_SHAKE_OR_NEUTRAL_RETURN_INVALID');
}

function buildShakeProofRepairContext(
  context: Readonly<ProviderNativeEpisodeContextV2R>,
  session: ProviderNativeDev03IsolatedSessionV2R,
  attempt: Readonly<Dev03ProofAttemptV2R>,
): ProviderNativeEpisodeContextV2R {
  const revisionBinding = session.currentRevisionBinding();
  return {
    episodeId: `${context.episodeId}:shake-proof-repair-1`,
    objective: 'Repair only the failed rendered camera-shake visibility or neutral-return proof. Preserve the existing beat alignment, audio, timing, sources, and all non-shake state.',
    activeTarget: {
      ...context.activeTarget,
      proofRepair: {
        repairOrdinal: 1,
        allowedOperatorIds: ['apply_camera_shake'],
        existingAppliedShake: session.shakeProofRepairBinding(),
        observedVisualProof: attempt.renderProof?.visual,
        validation: attempt.renderProofValidation,
      },
    },
    revisionBinding,
    projectState: {
      ...context.projectState,
      projectId: revisionBinding.projectId,
      projectRevision: revisionBinding.expectedProjectRevision,
    },
    evidence: context.evidence,
    preservationRules: [...context.preservationRules, 'PRESERVE_EXISTING_BEAT_ALIGNMENT_AUDIO_AND_NON_SHAKE_STATE'],
    authorityAndPolicy: context.authorityAndPolicy,
    budget: { maxTurns: 2, maxOutputTokensPerTurn: 1024, maxIdenticalCalls: 1 },
  };
}

function passedExecution(
  snapshot: Readonly<JsonRecord>,
  finalAttempt: Readonly<Dev03ProofAttemptV2R>,
  proofRepairEpisode: Readonly<ProviderNativeEpisodeReceiptV2R> | null,
  proofAttempts: readonly Readonly<Dev03ProofAttemptV2R>[],
): Readonly<{ execution: JsonRecord; productOutcome: ProviderNativeProductOutcomeV2R }> {
  return {
    execution: {
      disposition: 'PASS', session: snapshot,
      artifacts: finalAttempt.artifacts,
      renderProof: finalAttempt.renderProof,
      renderProofValidation: finalAttempt.renderProofValidation,
      proofAttempts,
      ...(proofRepairEpisode ? { proofRepairEpisode } : {}),
      proof: {
        state: 'PASS', reloadEquivalent: 'PASS', renderedVisual: 'PASS',
        renderedAudio: 'PASS', projectMutation: 'NONE',
      },
    },
    productOutcome: 'PASS',
  };
}

function validateInput(input: {
  context: Readonly<ProviderNativeEpisodeContextV2R>;
  executionId: string;
  createdAt: string;
}): void {
  const target = record(input.context.activeTarget);
  const revision = record(input.context.revisionBinding);
  if (target.taskId !== 'DEV-03'
    || !['BASELINE', 'BEAT_EVIDENCE_WITHHELD'].includes(String(target.conditionId))) {
    throw new Error('PROVIDER_NATIVE_DEV03_CONTEXT_TASK_INVALID');
  }
  if (revision.projectId !== 'oe-dev-03' || revision.expectedProjectRevision !== 'R11') {
    throw new Error('PROVIDER_NATIVE_DEV03_CONTEXT_REVISION_INVALID');
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{7,127}$/.test(input.executionId)) {
    throw new Error('PROVIDER_NATIVE_DEV03_EXECUTION_ID_INVALID');
  }
  const createdAt = new Date(input.createdAt);
  if (Number.isNaN(createdAt.getTime()) || createdAt.toISOString() !== input.createdAt) {
    throw new Error('PROVIDER_NATIVE_DEV03_CREATED_AT_INVALID');
  }
}

function assertSeparatedContextBinding(
  modelContext: Readonly<ProviderNativeEpisodeContextV2R>,
  ownerEvidenceContext: Readonly<ProviderNativeEpisodeContextV2R>,
): void {
  const modelTarget = record(modelContext.activeTarget);
  const ownerTarget = record(ownerEvidenceContext.activeTarget);
  const modelRevision = record(modelContext.revisionBinding);
  const ownerRevision = record(ownerEvidenceContext.revisionBinding);
  const visibility = record(record(modelContext.authorityAndPolicy).evidenceVisibility);
  if (modelTarget.taskId !== ownerTarget.taskId
    || modelTarget.conditionId !== ownerTarget.conditionId
    || hashCanonicalJsonV1(modelRevision) !== hashCanonicalJsonV1(ownerRevision)
    || hashCanonicalJsonV1(modelContext.projectState)
      !== hashCanonicalJsonV1(ownerEvidenceContext.projectState)
    || !['PRE_RESOLVED_EVIDENCE', 'RESOLVER_HANDOFF_REQUIRED'].includes(
      String(visibility.mode),
    )
    || visibility.ownerEvidenceContextSha256
      !== hashCanonicalJsonV1(ownerEvidenceContext)) {
    throw new Error('PROVIDER_NATIVE_DEV03_SEPARATED_CONTEXT_BINDING_INVALID');
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown DEV-03 connector error';
}

function requireOperatorPermutation(
  actual: readonly string[],
  authority: readonly string[],
): void {
  if (actual.length !== authority.length
    || new Set(actual).size !== actual.length
    || actual.some((operatorId) => !authority.includes(operatorId))) {
    throw new Error('PROVIDER_NATIVE_DEV03_OPERATOR_PERMUTATION_INVALID');
  }
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}
