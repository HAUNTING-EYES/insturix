import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import { DEV01_LOWERING_POLICY_V2R } from './dev01-lowering-policy-v2r';
import {
  getCanonicalDev01NativeProxyFixtureV2,
  sha256Dev01FixtureBytesV2,
} from './dev01-native-proxy-fixture-v2';
import type {
  Dev01Stage6ArtifactBindingV2,
  Dev01Stage6ProjectSnapshotV2,
  Dev01Stage6RenderProofV2,
  Dev01Stage6RendererV2,
} from './dev01-stage6-native-proxy-contract-v2';
import {
  executeDev01Stage6ObservationOperatorV2R,
  isDev01Stage6ObservationOperatorV2R,
} from './dev01-stage6-observation-adapters-v2r';
import { executeDev01Stage6OperatorV2R } from './dev01-stage6-operator-adapters-v2r';
import { renderDev01Stage6NativeProxyV2 } from './dev01-stage6-native-proxy-renderer-v2';
import {
  bindDev01ProviderNativeAudioProofPolicyV2R,
  validateDev01Stage6RenderProofV2,
  type Dev01BoundAudioProofPolicyV2R,
  type Dev01Stage6RenderProofValidationV2,
} from './dev01-stage6-render-proof-validator-v2';
import {
  isProviderNativeProofGateEligibleV2R,
  runProviderNativeToolEpisodeV2R,
  type ProviderNativeEpisodeContextV2R,
  type ProviderNativeEpisodeReceiptV2R,
  type ProviderNativeInvokeResponseV2R,
  type ProviderNativeToolExecutionV2R,
} from './provider-native-tool-episode-v2r';
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

export const PROVIDER_NATIVE_DEV01_CONNECTED_EPISODE_VERSION_V2R =
  'EDITRON_PROVIDER_NATIVE_DEV01_CONNECTED_EPISODE_V2R_5' as const;

export interface ProviderNativeDev01ConnectedReceiptV2R {
  version: typeof PROVIDER_NATIVE_DEV01_CONNECTED_EPISODE_VERSION_V2R;
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

export async function runProviderNativeDev01ConnectedEpisodeV2R(input: {
  route: Readonly<ProviderNativeRouteV2R>;
  context: Readonly<ProviderNativeEpisodeContextV2R>;
  invoke: (request: Readonly<SerializedProviderNativeTurnV2R>) => Promise<ProviderNativeInvokeResponseV2R>;
  outputDir: string;
  executionId: string;
  createdAt: string;
  renderer?: Dev01Stage6RendererV2;
}): Promise<Readonly<ProviderNativeDev01ConnectedReceiptV2R>> {
  validateInput(input);
  const session = new Dev01IsolatedSession(input.context);
  const adapter = findV2RStage6TaskAdapter('DEV-01');
  if (!adapter) throw new Error('PROVIDER_NATIVE_DEV01_STAGE6_ADAPTER_MISSING');
  const adapterRegistry = buildV2RStage6TaskAdapterRegistry();
  const providerEpisode = await runProviderNativeToolEpisodeV2R({
    route: input.route,
    context: input.context,
    eligibleOperatorIds: adapter.supportedOperatorIds,
    invoke: input.invoke,
    executeIsolated: (call) => session.execute(call),
  });
  const finalized = await finalizeExecution({
    providerEpisode, session, renderer: input.renderer ?? renderDev01Stage6NativeProxyV2,
    outputDir: input.outputDir, route: input.route, context: input.context, invoke: input.invoke,
  });
  const material = {
    version: PROVIDER_NATIVE_DEV01_CONNECTED_EPISODE_VERSION_V2R,
    authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION' as const,
    executionIdentity: { executionId: input.executionId, createdAt: input.createdAt },
    stage6Adapter: {
      registrySha256: adapterRegistry.registrySha256,
      adapterId: adapter.adapterId,
      ownerRef: adapter.ownerRef,
      supportedOperatorIds: adapter.supportedOperatorIds,
      executionAuthority: adapter.executionAuthority,
      proofRequirement: adapter.proofRequirement,
    },
    providerEpisode,
    causalPolicySha256: hashCanonicalJsonV1(DEV01_LOWERING_POLICY_V2R),
    execution: finalized.execution,
    productOutcome: finalized.productOutcome,
    stateEffects: [] as const,
  };
  return deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
}

class Dev01IsolatedSession {
  private readonly fixture = getCanonicalDev01NativeProxyFixtureV2();
  private readonly before = clone(this.fixture.project) as Dev01Stage6ProjectSnapshotV2;
  private current = clone(this.before);
  private readonly evidenceIds: ReadonlySet<string>;
  private readonly outputs = new Map<string, JsonRecord[]>();
  private readonly mutationStages = new Set<string>();
  private readonly changedPaths = new Set<string>();
  private audioProofRepairAllowance = 0;
  private audioProofRepairCount = 0;
  readonly trace: JsonRecord[] = [];

  constructor(private readonly context: Readonly<ProviderNativeEpisodeContextV2R>) {
    this.evidenceIds = new Set(collectEvidenceIds(context.evidence));
  }

  async execute(call: Readonly<{
    operatorId: string; arguments: Readonly<JsonRecord>; turn: number;
  }>): Promise<Readonly<ProviderNativeToolExecutionV2R>> {
    const beforeStateHash = hashCanonicalJsonV1(this.current);
    try {
      this.assertEvidence(call.operatorId, call.arguments);
      this.assertCausalBindings(call.operatorId, call.arguments);
      if (call.operatorId === 'apply_audio_ducking' && !this.mutationStages.has('CUT')) {
        throw new Error('PROVIDER_NATIVE_DEV01_CUT_REQUIRED_BEFORE_DUCKING');
      }
      const result = isDev01Stage6ObservationOperatorV2R(call.operatorId)
        ? executeDev01Stage6ObservationOperatorV2R({
            operatorId: call.operatorId, inputs: call.arguments,
            currentProject: this.current, fixture: this.fixture,
          })
        : executeDev01Stage6OperatorV2R({
            operatorId: call.operatorId, inputs: call.arguments,
            originalProject: this.before, currentProject: this.current, fixture: this.fixture,
          });
      if (result.mutationStage && this.mutationStages.has(result.mutationStage)) {
        if (result.mutationStage !== 'DUCK' || this.audioProofRepairAllowance !== 1) {
          throw new Error(`PROVIDER_NATIVE_DEV01_MUTATION_REPEATED:${result.mutationStage}`);
        }
        this.audioProofRepairAllowance = 0;
        this.audioProofRepairCount += 1;
      }
      if (result.nextProject) this.current = clone(result.nextProject);
      if (result.mutationStage) this.mutationStages.add(result.mutationStage);
      for (const changedPath of result.changedPaths) this.changedPaths.add(changedPath);
      const prior = this.outputs.get(call.operatorId) ?? [];
      this.outputs.set(call.operatorId, [...prior, clone(result.outputs)]);
      this.trace.push({
        turn: call.turn, operatorId: call.operatorId, disposition: 'OK',
        argumentHash: hashCanonicalJsonV1(call.arguments), outputHash: hashCanonicalJsonV1(result.outputs),
        beforeStateHash, afterStateHash: hashCanonicalJsonV1(this.current),
        changedPaths: [...result.changedPaths],
      });
      return {
        authority: 'RESEARCH_ISOLATED_NO_PROJECT_MUTATION', disposition: 'OK',
        output: result.outputs, evidenceIds: collectEvidenceIds([call.arguments, result.outputs]),
      };
    } catch (error) {
      const message = errorMessage(error);
      const disposition = failureDisposition(message);
      this.trace.push({
        turn: call.turn, operatorId: call.operatorId, disposition,
        argumentHash: hashCanonicalJsonV1(call.arguments), beforeStateHash,
        afterStateHash: hashCanonicalJsonV1(this.current), changedPaths: [], error: message,
      });
      return {
        authority: 'RESEARCH_ISOLATED_NO_PROJECT_MUTATION', disposition,
        output: { code: failureCode(message), message }, evidenceIds: [],
      };
    }
  }

  snapshot(): Readonly<JsonRecord> {
    return {
      beforeStateHash: hashCanonicalJsonV1(this.before),
      afterStateHash: hashCanonicalJsonV1(this.current),
      changedPaths: [...this.changedPaths].sort(compareUtf16),
      mutationStages: [...this.mutationStages].sort(compareUtf16),
      audioProofRepairCount: this.audioProofRepairCount,
      currentProject: clone(this.current), trace: clone(this.trace),
    };
  }

  authorizeSingleAudioProofRepair(): void {
    if (!this.mutationStages.has('DUCK') || this.audioProofRepairAllowance !== 0
      || this.audioProofRepairCount !== 0) {
      throw new Error('PROVIDER_NATIVE_DEV01_AUDIO_PROOF_REPAIR_NOT_AUTHORIZED');
    }
    this.audioProofRepairAllowance = 1;
  }

  hasAppliedAudioProofRepair(): boolean { return this.audioProofRepairCount === 1; }

  private assertEvidence(operatorId: string, args: Readonly<JsonRecord>): void {
    const required = REQUIRED_EVIDENCE_BY_OPERATOR[operatorId];
    if (!required) return;
    if (!this.evidenceIds.has(required)) {
      throw new Error(`PROVIDER_NATIVE_DEV01_EVIDENCE_UNAVAILABLE:${operatorId}:${required}`);
    }
    const supplied = strings(args.evidenceIds);
    if (args.evidenceIds !== undefined && !supplied.includes(required)) {
      throw new Error(`PROVIDER_NATIVE_DEV01_EVIDENCE_UNBOUND:${operatorId}:${required}`);
    }
  }

  private assertCausalBindings(operatorId: string, args: Readonly<JsonRecord>): void {
    const policy = record(DEV01_LOWERING_POLICY_V2R);
    const rules = {
      ...record(policy.fieldBindings),
      ...record(record(policy.operatorFieldBindings)[operatorId]),
    };
    for (const [field, value] of Object.entries(args)) {
      const rule = record(rules[field]);
      if (!Object.keys(rule).length || rule.source === 'MODEL_INPUT') continue;
      if (rule.source === 'REVISION_PROJECT_ID' && value !== this.fixture.project.projectId) {
        throw new Error(`PROVIDER_NATIVE_DEV01_PROJECT_ID_DRIFT:${operatorId}`);
      }
      if (rule.source === 'REVISION_EXPECTED_REVISION' && value !== this.fixture.project.projectRevision) {
        throw new Error(`PROVIDER_NATIVE_DEV01_PROJECT_REVISION_DRIFT:${operatorId}`);
      }
      if (rule.source === 'STATIC' && !same(value, rule.staticValue)) {
        throw new Error(`PROVIDER_NATIVE_DEV01_STATIC_BINDING_DRIFT:${operatorId}:${field}`);
      }
      if (rule.source === 'EVIDENCE_IDS'
        && strings(value).some((evidenceId) => !this.evidenceIds.has(evidenceId))) {
        throw new Error(`PROVIDER_NATIVE_DEV01_EVIDENCE_ID_UNKNOWN:${operatorId}:${field}`);
      }
      if (rule.source === 'NODE_OUTPUT' && !this.matchesProducerValue(value, records(rule.producers))) {
        throw new Error(`PROVIDER_NATIVE_DEV01_CAUSAL_OUTPUT_NOT_BOUND:${operatorId}:${field}`);
      }
    }
  }

  private matchesProducerValue(value: unknown, producers: readonly JsonRecord[]): boolean {
    return producers.some((producer) => (this.outputs.get(String(producer.operatorId)) ?? []).some((output) => {
      let candidate: unknown = output[String(producer.outputName)];
      for (const segment of strings(producer.projectionPath)) candidate = record(candidate)[segment];
      return same(value, candidate);
    }));
  }
}

const REQUIRED_EVIDENCE_BY_OPERATOR: Readonly<Record<string, string>> = {
  find_transcript_moment: 'EV-DEV01-T1', resolve_transcript_edit: 'EV-DEV01-T1',
  cut_section: 'EV-DEV01-T1', find_visual_moment: 'EV-DEV01-V1',
  resolve_keyframe_edit: 'EV-DEV01-V1', set_keyframes: 'EV-DEV01-V1',
  find_audio_moment: 'EV-DEV01-A1', apply_audio_ducking: 'EV-DEV01-A1',
};

interface Dev01ProofAttemptV2R {
  ordinal: 0 | 1;
  disposition: 'PASS' | 'FAIL';
  reasonCodes: readonly string[];
  artifacts: readonly Dev01Stage6ArtifactBindingV2[];
  renderProof?: Dev01Stage6RenderProofV2;
  renderProofValidation?: Readonly<Dev01Stage6RenderProofValidationV2>;
  audioProofPolicy?: Readonly<Dev01BoundAudioProofPolicyV2R>;
  error?: string;
}

async function finalizeExecution(input: {
  providerEpisode: Readonly<ProviderNativeEpisodeReceiptV2R>;
  session: Dev01IsolatedSession;
  renderer: Dev01Stage6RendererV2;
  outputDir: string;
  route: Readonly<ProviderNativeRouteV2R>;
  context: Readonly<ProviderNativeEpisodeContextV2R>;
  invoke: (request: Readonly<SerializedProviderNativeTurnV2R>) => Promise<ProviderNativeInvokeResponseV2R>;
}): Promise<Readonly<{ execution: JsonRecord; productOutcome: ProviderNativeProductOutcomeV2R }>> {
  const snapshot = input.session.snapshot();
  if (!isProviderNativeProofGateEligibleV2R(input.providerEpisode.terminal.disposition)) {
    return {
      execution: { disposition: 'NOT_RUN_PROVIDER_TERMINAL', session: withoutProject(snapshot) },
      productOutcome: mapProviderNativeNonProofTerminalToProductOutcomeV2R(
        input.providerEpisode.terminal.disposition,
      ),
    };
  }
  const missing = ['CUT', 'PUSH', 'DUCK'].filter((stage) => !strings(snapshot.mutationStages).includes(stage));
  if (missing.length) return {
    execution: {
      disposition: 'FAIL', reasonCodes: ['MODEL_FALSE_SUCCESS_REQUIRED_MUTATIONS_MISSING'],
      missingMutationStages: missing, session: withoutProject(snapshot),
    },
    productOutcome: 'FAIL',
  };
  const firstAttempt = await renderProofAttempt(input, snapshot, 0);
  if (firstAttempt.disposition === 'PASS') return passedExecution(snapshot, firstAttempt, null, [firstAttempt]);
  if (!isAudioOnlyProofRepairEligible(firstAttempt)) {
    return {
      execution: {
        disposition: 'FAIL', reasonCodes: ['RENDER_OR_PROOF_FAILURE'],
        session: withoutProject(snapshot), proofAttempts: [firstAttempt],
      },
      productOutcome: 'FAIL',
    };
  }

  input.session.authorizeSingleAudioProofRepair();
  const repairContext = buildAudioProofRepairContext(input.context, snapshot, firstAttempt);
  const proofRepairEpisode = await runProviderNativeToolEpisodeV2R({
    route: input.route, context: repairContext,
    eligibleOperatorIds: ['apply_audio_ducking'], invoke: input.invoke,
    executeIsolated: (call) => input.session.execute(call),
  });
  if (!isProviderNativeProofGateEligibleV2R(proofRepairEpisode.terminal.disposition)) {
    return {
      execution: {
        disposition: 'FAIL', reasonCodes: ['PROOF_REPAIR_PROVIDER_TERMINAL'],
        session: withoutProject(input.session.snapshot()), proofAttempts: [firstAttempt],
        proofRepairEpisode,
      },
      productOutcome: mapProviderNativeNonProofTerminalToProductOutcomeV2R(
        proofRepairEpisode.terminal.disposition,
      ),
    };
  }
  if (!input.session.hasAppliedAudioProofRepair()) {
    return {
      execution: {
        disposition: 'FAIL', reasonCodes: ['MODEL_PROOF_REPAIR_MUTATION_MISSING'],
        session: withoutProject(input.session.snapshot()), proofAttempts: [firstAttempt],
        proofRepairEpisode,
      },
      productOutcome: 'FAIL',
    };
  }
  const repairedSnapshot = input.session.snapshot();
  const secondAttempt = await renderProofAttempt(input, repairedSnapshot, 1);
  if (secondAttempt.disposition === 'PASS') {
    return passedExecution(repairedSnapshot, secondAttempt, proofRepairEpisode, [firstAttempt, secondAttempt]);
  }
  return {
    execution: {
      disposition: 'FAIL', reasonCodes: ['RENDER_OR_PROOF_FAILURE_AFTER_BOUNDED_REPAIR'],
      session: withoutProject(repairedSnapshot), proofAttempts: [firstAttempt, secondAttempt],
      proofRepairEpisode,
    },
    productOutcome: 'FAIL',
  };
}

async function renderProofAttempt(
  input: Pick<Parameters<typeof finalizeExecution>[0], 'renderer' | 'outputDir'>,
  snapshot: Readonly<JsonRecord>,
  ordinal: 0 | 1,
): Promise<Readonly<Dev01ProofAttemptV2R>> {
  try {
    const rendered = await input.renderer({
      projectSnapshot: record(snapshot.currentProject),
      outputDir: path.join(input.outputDir, `proof-attempt-${ordinal}`),
    });
    const audioProofPolicy = bindDev01ProviderNativeAudioProofPolicyV2R(snapshot.currentProject);
    const renderProofValidation = validateDev01Stage6RenderProofV2(rendered.proof, audioProofPolicy);
    const artifacts = await bindArtifacts(rendered.artifactPaths);
    return {
      ordinal, disposition: renderProofValidation.assessment,
      reasonCodes: [...renderProofValidation.diagnostics], artifacts,
      renderProof: rendered.proof, renderProofValidation, audioProofPolicy,
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
): Promise<readonly Dev01Stage6ArtifactBindingV2[]> {
  return Promise.all(Object.entries(artifactPaths).map(async ([artifactId, artifactPath]) => {
    const bytes = await readFile(artifactPath);
    if (!bytes.length) throw new Error(`PROVIDER_NATIVE_DEV01_ARTIFACT_EMPTY:${artifactId}`);
    return {
      artifactId: artifactId as Dev01Stage6ArtifactBindingV2['artifactId'],
      path: artifactPath, sha256: sha256Dev01FixtureBytesV2(bytes), byteLength: bytes.length,
    };
  }));
}

function passedExecution(
  snapshot: Readonly<JsonRecord>,
  finalAttempt: Readonly<Dev01ProofAttemptV2R>,
  proofRepairEpisode: Readonly<ProviderNativeEpisodeReceiptV2R> | null,
  proofAttempts: readonly Readonly<Dev01ProofAttemptV2R>[],
): Readonly<{ execution: JsonRecord; productOutcome: ProviderNativeProductOutcomeV2R }> {
  return {
    execution: {
      disposition: 'PASS', session: withoutProject(snapshot), artifacts: finalAttempt.artifacts,
      renderProof: finalAttempt.renderProof, renderProofValidation: finalAttempt.renderProofValidation,
      audioProofPolicy: finalAttempt.audioProofPolicy, proofAttempts,
      ...(proofRepairEpisode ? { proofRepairEpisode } : {}),
      proof: { state: 'PASS', reloadEquivalent: 'PASS', renderedVisual: 'PASS', renderedAudio: 'PASS', projectMutation: 'NONE' },
    },
    productOutcome: 'PASS',
  };
}

function isAudioOnlyProofRepairEligible(attempt: Readonly<Dev01ProofAttemptV2R>): boolean {
  return attempt.reasonCodes.length > 0 && attempt.reasonCodes.every((reason) => [
    'AUDIO_DUCK_ENVELOPE_INVALID', 'AUDIO_DIALOGUE_OR_PEAK_INVALID',
  ].includes(reason));
}

function buildAudioProofRepairContext(
  context: Readonly<ProviderNativeEpisodeContextV2R>,
  snapshot: Readonly<JsonRecord>,
  attempt: Readonly<Dev01ProofAttemptV2R>,
): ProviderNativeEpisodeContextV2R {
  const project = record(snapshot.currentProject);
  const bgm = records(project.overlays).find((overlay) => overlay.assetId === 'dev01-bgm-truth-v2') ?? {};
  return {
    episodeId: `${context.episodeId}:audio-proof-repair-1`,
    objective: 'Repair only the failed rendered BGM ducking proof. Preserve every existing picture and timing edit.',
    activeTarget: {
      ...context.activeTarget,
      proofRepair: {
        repairOrdinal: 1, allowedOperatorIds: ['apply_audio_ducking'],
        observedRenderProof: attempt.renderProof?.audio,
        validation: attempt.renderProofValidation,
        boundAudioProofPolicy: attempt.audioProofPolicy,
      },
    },
    revisionBinding: context.revisionBinding,
    projectState: {
      projectId: project.projectId, projectRevision: project.projectRevision,
      currentBgmOverlay: { overlayId: bgm.id, styles: bgm.styles },
    },
    evidence: context.evidence,
    preservationRules: [...context.preservationRules, 'PRESERVE_ALL_PICTURE_AND_TIMELINE_STATE_DURING_AUDIO_REPAIR'],
    authorityAndPolicy: {
      ...context.authorityAndPolicy,
      proofRepair: { maximumRepairs: 1, allowedOperatorIds: ['apply_audio_ducking'] },
    },
    budget: {
      maxTurns: 3, maxOutputTokensPerTurn: context.budget.maxOutputTokensPerTurn,
      maxIdenticalCalls: 1,
    },
  };
}

function validateInput(input: {
  context: Readonly<ProviderNativeEpisodeContextV2R>; executionId: string; createdAt: string;
}): void {
  const target = record(input.context.activeTarget);
  const revision = record(input.context.revisionBinding);
  if (target.taskId !== 'DEV-01' || !['BASELINE', 'VISUAL_EVIDENCE_WITHHELD'].includes(String(target.conditionId))) {
    throw new Error('PROVIDER_NATIVE_DEV01_CONTEXT_TASK_INVALID');
  }
  if (revision.projectId !== 'oe-dev-01' || revision.expectedProjectRevision !== 'R7') {
    throw new Error('PROVIDER_NATIVE_DEV01_CONTEXT_REVISION_INVALID');
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{7,127}$/.test(input.executionId)) {
    throw new Error('PROVIDER_NATIVE_DEV01_EXECUTION_ID_INVALID');
  }
  const createdAt = new Date(input.createdAt);
  if (Number.isNaN(createdAt.getTime()) || createdAt.toISOString() !== input.createdAt) {
    throw new Error('PROVIDER_NATIVE_DEV01_CREATED_AT_INVALID');
  }
}

function failureDisposition(message: string): 'FAIL' | 'UNVERIFIABLE' | 'CONFLICT' {
  if (message.includes('EVIDENCE_UNAVAILABLE') || message.includes('_UNRESOLVED:')) return 'UNVERIFIABLE';
  if (message.includes('PROJECT_REVISION_DRIFT') || message.includes('PROJECT_ID_DRIFT')) return 'CONFLICT';
  return 'FAIL';
}
function failureCode(message: string): string { return message.split(':', 1)[0] || 'PROVIDER_NATIVE_DEV01_EXECUTION_FAILED'; }
function withoutProject(snapshot: Readonly<JsonRecord>): JsonRecord { const { currentProject: _omitted, ...rest } = snapshot; return rest; }
function collectEvidenceIds(value: unknown): string[] {
  const found = new Set<string>();
  const visit = (entry: unknown, key = ''): void => {
    if (typeof entry === 'string' && (key === 'evidenceId' || key === 'evidenceIds')) found.add(entry);
    else if (Array.isArray(entry)) entry.forEach((item) => visit(item, key));
    else if (entry && typeof entry === 'object') Object.entries(entry as JsonRecord).forEach(([childKey, child]) => visit(child, childKey));
  };
  visit(value);
  return [...found].sort(compareUtf16);
}
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : 'Unknown DEV-01 session error'; }
function record(value: unknown): JsonRecord { return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}; }
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.map(record) : []; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []; }
function same(left: unknown, right: unknown): boolean {
  if (left === undefined || right === undefined) return left === right;
  return hashCanonicalJsonV1(left) === hashCanonicalJsonV1(right);
}
function compareUtf16(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
