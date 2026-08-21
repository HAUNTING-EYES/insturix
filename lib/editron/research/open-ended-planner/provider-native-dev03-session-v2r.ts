import { hashCanonicalJsonV1 } from './contracts-v1';
import { DEV03_LOWERING_POLICY_V2R } from './dev03-lowering-policy-v2r';
import { getCanonicalDev03NativeProxyFixtureV2 } from './dev03-native-proxy-fixture-v2';
import type { Dev03Stage6ProjectSnapshotV2 } from './dev03-stage6-native-proxy-contract-v2';
import { executeDev03Stage6OperatorV2R } from './dev03-stage6-operator-adapters-v2r';
import type {
  ProviderNativeEpisodeContextV2R,
  ProviderNativeToolExecutionV2R,
} from './provider-native-tool-episode-v2r';

type JsonRecord = Record<string, unknown>;
type MutationStageV2R = 'ALIGN' | 'SHAKE';

export interface ProviderNativeDev03SessionSnapshotV2R {
  beforeStateHash: string;
  alignedStateHash: string | null;
  shakenStateHash: string | null;
  currentStateHash: string;
  currentProjectRevision: string;
  changedPaths: readonly string[];
  mutationStages: readonly MutationStageV2R[];
  shakeProofRepairCount: number;
  trace: readonly Readonly<JsonRecord>[];
}

export class ProviderNativeDev03IsolatedSessionV2R {
  private readonly fixture = getCanonicalDev03NativeProxyFixtureV2();
  private readonly before = clone(this.fixture.project) as Dev03Stage6ProjectSnapshotV2;
  private current = clone(this.before);
  private aligned: Dev03Stage6ProjectSnapshotV2 | null = null;
  private shaken: Dev03Stage6ProjectSnapshotV2 | null = null;
  private readonly evidencePack: Readonly<JsonRecord>;
  private readonly evidenceIds: ReadonlySet<string>;
  private readonly outputs = new Map<string, JsonRecord[]>();
  private readonly mutationStages = new Set<MutationStageV2R>();
  private readonly changedPaths = new Set<string>();
  private readonly trace: JsonRecord[] = [];
  private shakeProofRepairAllowance = 0;
  private shakeProofRepairCount = 0;

  constructor(private readonly context: Readonly<ProviderNativeEpisodeContextV2R>) {
    const target = record(context.activeTarget);
    this.evidencePack = {
      taskId: 'DEV-03',
      conditionId: target.conditionId,
      facts: clone(context.evidence),
    };
    this.evidenceIds = new Set(collectEvidenceIds(context.evidence));
  }

  async execute(call: Readonly<{
    operatorId: string;
    arguments: Readonly<JsonRecord>;
    turn: number;
  }>): Promise<Readonly<ProviderNativeToolExecutionV2R>> {
    const beforeStateHash = hashCanonicalJsonV1(this.current);
    const beforeProjectRevision = projectRevision(this.current);
    try {
      this.assertEvidence(call.operatorId, call.arguments);
      this.assertCausalBindings(call.operatorId, call.arguments);
      if (call.operatorId === 'apply_camera_shake' && !this.mutationStages.has('ALIGN')) {
        throw new Error('PROVIDER_NATIVE_DEV03_ALIGNMENT_REQUIRED_BEFORE_SHAKE');
      }
      const ownerArguments: JsonRecord = { ...clone(call.arguments) };
      delete ownerArguments.expectedProjectRevision;
      const result = executeDev03Stage6OperatorV2R({
        operatorId: call.operatorId,
        inputs: ownerArguments,
        currentProject: this.current,
        fixture: this.fixture,
        evidencePack: this.evidencePack,
      });
      if (result.mutationStage && this.mutationStages.has(result.mutationStage)) {
        if (result.mutationStage !== 'SHAKE' || this.shakeProofRepairAllowance !== 1) {
          throw new Error(`PROVIDER_NATIVE_DEV03_MUTATION_REPEATED:${result.mutationStage}`);
        }
        this.shakeProofRepairAllowance = 0;
        this.shakeProofRepairCount += 1;
      }
      const nextProject = result.nextProject ? clone(result.nextProject) : null;
      if (result.mutationStage && !nextProject) {
        throw new Error(`PROVIDER_NATIVE_DEV03_MUTATION_STATE_MISSING:${result.mutationStage}`);
      }
      if (result.mutationStage && nextProject) {
        nextProject.projectRevision = issueResearchProjectRevision({
          beforeProjectRevision,
          mutationStage: result.mutationStage,
          candidateStateHash: hashCanonicalJsonV1(nextProject),
        });
      }
      const afterProject = nextProject ?? this.current;
      const toolOutputs = normalizeToolOutputs(call.operatorId, result.outputs, {
        projectRevision: projectRevision(afterProject),
        afterStateHash: hashCanonicalJsonV1(afterProject),
      });
      if (nextProject) this.current = clone(nextProject);
      if (result.mutationStage) {
        this.mutationStages.add(result.mutationStage);
        if (result.mutationStage === 'ALIGN') this.aligned = clone(this.current);
        if (result.mutationStage === 'SHAKE') this.shaken = clone(this.current);
      }
      for (const changedPath of result.changedPaths) this.changedPaths.add(changedPath);
      const prior = this.outputs.get(call.operatorId) ?? [];
      this.outputs.set(call.operatorId, [...prior, clone(toolOutputs)]);
      this.trace.push({
        turn: call.turn,
        operatorId: call.operatorId,
        disposition: 'OK',
        argumentHash: hashCanonicalJsonV1(call.arguments),
        outputHash: hashCanonicalJsonV1(toolOutputs),
        beforeStateHash,
        afterStateHash: hashCanonicalJsonV1(this.current),
        beforeProjectRevision,
        afterProjectRevision: projectRevision(this.current),
        changedPaths: [...result.changedPaths],
      });
      return {
        authority: 'RESEARCH_ISOLATED_NO_PROJECT_MUTATION',
        disposition: 'OK',
        output: toolOutputs,
        evidenceIds: collectEvidenceIds([call.arguments, toolOutputs]),
      };
    } catch (error) {
      const message = errorMessage(error);
      const disposition = failureDisposition(message);
      this.trace.push({
        turn: call.turn,
        operatorId: call.operatorId,
        disposition,
        argumentHash: hashCanonicalJsonV1(call.arguments),
        beforeStateHash,
        afterStateHash: hashCanonicalJsonV1(this.current),
        beforeProjectRevision,
        afterProjectRevision: projectRevision(this.current),
        changedPaths: [],
        error: message,
      });
      return {
        authority: 'RESEARCH_ISOLATED_NO_PROJECT_MUTATION',
        disposition,
        output: { code: failureCode(message), message },
        evidenceIds: [],
      };
    }
  }

  snapshot(): Readonly<ProviderNativeDev03SessionSnapshotV2R> {
    return {
      beforeStateHash: hashCanonicalJsonV1(this.before),
      alignedStateHash: this.aligned ? hashCanonicalJsonV1(this.aligned) : null,
      shakenStateHash: this.shaken ? hashCanonicalJsonV1(this.shaken) : null,
      currentStateHash: hashCanonicalJsonV1(this.current),
      currentProjectRevision: projectRevision(this.current),
      changedPaths: [...this.changedPaths].sort(compareUtf16),
      mutationStages: [...this.mutationStages].sort(compareUtf16),
      shakeProofRepairCount: this.shakeProofRepairCount,
      trace: clone(this.trace),
    };
  }

  authorizeSingleShakeProofRepair(): void {
    if (!this.mutationStages.has('SHAKE') || this.shakeProofRepairAllowance !== 0
      || this.shakeProofRepairCount !== 0) {
      throw new Error('PROVIDER_NATIVE_DEV03_SHAKE_PROOF_REPAIR_NOT_AUTHORIZED');
    }
    this.shakeProofRepairAllowance = 1;
  }

  hasAppliedShakeProofRepair(): boolean {
    return this.shakeProofRepairCount === 1;
  }

  shakeProofRepairBinding(): Readonly<JsonRecord> {
    const alignment = record(this.latestOutput('sync_cuts_to_beats', 'result'));
    const receipt = record(this.latestOutput('apply_camera_shake', 'receipt'));
    const proof = record(receipt.proof);
    return {
      projectId: this.fixture.project.projectId,
      expectedProjectRevision: projectRevision(this.current),
      overlayId: alignment.finalHitOverlayId,
      targetFrame: alignment.finalStrongPeakFrame,
      priorEffectPlan: clone(proof.requestedEffectPlan),
      requiredEvidenceIds: ['EV-DEV03-B1', 'EV-DEV03-T1'],
    };
  }

  currentRevisionBinding(): Readonly<{
    projectId: string;
    expectedProjectRevision: string;
  }> {
    return {
      projectId: this.fixture.project.projectId,
      expectedProjectRevision: projectRevision(this.current),
    };
  }

  renderState(): Readonly<{
    alignedProjectSnapshot: Dev03Stage6ProjectSnapshotV2;
    shakenProjectSnapshot: Dev03Stage6ProjectSnapshotV2;
  }> {
    if (!this.aligned) throw new Error('PROVIDER_NATIVE_DEV03_ALIGNMENT_SNAPSHOT_MISSING');
    if (!this.shaken) throw new Error('PROVIDER_NATIVE_DEV03_SHAKE_SNAPSHOT_MISSING');
    return {
      alignedProjectSnapshot: clone(this.aligned),
      shakenProjectSnapshot: clone(this.shaken),
    };
  }

  private assertEvidence(operatorId: string, args: Readonly<JsonRecord>): void {
    const required = REQUIRED_EVIDENCE_BY_OPERATOR[operatorId] ?? [];
    for (const evidenceId of required) {
      if (!this.evidenceIds.has(evidenceId)) {
        throw new Error(`PROVIDER_NATIVE_DEV03_EVIDENCE_UNAVAILABLE:${operatorId}:${evidenceId}`);
      }
    }
    const supplied = strings(args.evidenceIds);
    if (args.evidenceIds !== undefined) {
      for (const evidenceId of required) {
        if (!supplied.includes(evidenceId)) {
          throw new Error(`PROVIDER_NATIVE_DEV03_EVIDENCE_UNBOUND:${operatorId}:${evidenceId}`);
        }
      }
      if (supplied.some((evidenceId) => !this.evidenceIds.has(evidenceId))) {
        throw new Error(`PROVIDER_NATIVE_DEV03_EVIDENCE_ID_UNKNOWN:${operatorId}`);
      }
    }
  }

  private assertCausalBindings(operatorId: string, args: Readonly<JsonRecord>): void {
    if (args.projectId !== undefined && args.projectId !== this.fixture.project.projectId) {
      throw new Error(`PROVIDER_NATIVE_DEV03_PROJECT_ID_DRIFT:${operatorId}`);
    }
    if (args.expectedProjectRevision !== undefined
      && args.expectedProjectRevision !== projectRevision(this.current)) {
      throw new Error(`PROVIDER_NATIVE_DEV03_PROJECT_REVISION_DRIFT:${operatorId}`);
    }
    if (operatorId === 'sync_cuts_to_beats') {
      const audioResult = this.latestOutput('find_audio_moment', 'result');
      if (!same(args.beatPlan, audioResult)) {
        throw new Error('PROVIDER_NATIVE_DEV03_BEAT_PLAN_NOT_BOUND_TO_AUDIO_RESULT');
      }
      const timelineFact = this.fact('TIMELINE_SNAPSHOT');
      const constraintFact = this.fact('BEAT_SYNC_CONSTRAINTS');
      if (!same(args.overlayIds, timelineFact.overlayIds)) {
        throw new Error('PROVIDER_NATIVE_DEV03_OVERLAY_SET_NOT_BOUND_TO_TIMELINE_EVIDENCE');
      }
      if (!same(args.beatSyncConstraints, constraintFact.constraints)) {
        throw new Error('PROVIDER_NATIVE_DEV03_CONSTRAINTS_NOT_BOUND_TO_EVIDENCE');
      }
    }
    if (operatorId === 'apply_camera_shake') {
      const alignment = record(this.latestOutput('sync_cuts_to_beats', 'result'));
      if (!same(args.overlayId, alignment.finalHitOverlayId)
        || !same(args.targetFrame, alignment.finalStrongPeakFrame)) {
        throw new Error('PROVIDER_NATIVE_DEV03_SHAKE_TARGET_NOT_BOUND_TO_ALIGNMENT_RESULT');
      }
    }
  }

  private latestOutput(operatorId: string, outputName: string): unknown {
    const outputs = this.outputs.get(operatorId) ?? [];
    const latest = outputs.at(-1);
    if (!latest || !(outputName in latest)) {
      throw new Error(`PROVIDER_NATIVE_DEV03_CAUSAL_OUTPUT_MISSING:${operatorId}:${outputName}`);
    }
    return latest[outputName];
  }

  private fact(kind: string): JsonRecord {
    const found = records(this.evidencePack.facts).find((candidate) => candidate.kind === kind);
    if (!found) throw new Error(`PROVIDER_NATIVE_DEV03_EVIDENCE_FACT_MISSING:${kind}`);
    return found;
  }
}

const REQUIRED_EVIDENCE_BY_OPERATOR: Readonly<Record<string, readonly string[]>> = {
  find_audio_moment: ['EV-DEV03-B1'],
  sync_cuts_to_beats: ['EV-DEV03-B1', 'EV-DEV03-D1', 'EV-DEV03-T1'],
  apply_camera_shake: ['EV-DEV03-B1', 'EV-DEV03-T1'],
};

export function providerNativeDev03CausalPolicySha256V2R(): string {
  return hashCanonicalJsonV1(DEV03_LOWERING_POLICY_V2R);
}

function normalizeToolOutputs(
  operatorId: string,
  outputs: Readonly<JsonRecord>,
  state: Readonly<{ projectRevision: string; afterStateHash: string }>,
): JsonRecord {
  if (operatorId === 'read_project_file' || operatorId === 'get_timeline_view') {
    return {
      ...clone(outputs),
      evidence: {
        ...record(outputs.evidence),
        projectRevision: state.projectRevision,
      },
    };
  }
  if (operatorId !== 'sync_cuts_to_beats' && operatorId !== 'apply_camera_shake') {
    return clone(outputs);
  }
  const ownerReceipt = record(outputs.receipt);
  if (ownerReceipt.result !== 'PASS') {
    throw new Error(`PROVIDER_NATIVE_DEV03_OWNER_RECEIPT_INVALID:${operatorId}`);
  }
  return {
    ...clone(outputs),
    receipt: {
      status: 'PASS',
      projectRevision: state.projectRevision,
      proof: {
        ...clone(ownerReceipt),
        afterStateHash: state.afterStateHash,
      },
    },
  };
}

function issueResearchProjectRevision(input: Readonly<{
  beforeProjectRevision: string;
  mutationStage: MutationStageV2R;
  candidateStateHash: string;
}>): string {
  return `OE-DEV03-${hashCanonicalJsonV1({
    authority: 'RESEARCH_ISOLATED_WRITER_REVISION_V2R',
    ...input,
  })}`;
}

function projectRevision(project: Readonly<Dev03Stage6ProjectSnapshotV2>): string {
  if (typeof project.projectRevision !== 'string' || !project.projectRevision) {
    throw new Error('PROVIDER_NATIVE_DEV03_PROJECT_REVISION_MISSING');
  }
  return project.projectRevision;
}

function failureDisposition(message: string): 'FAIL' | 'UNVERIFIABLE' | 'CONFLICT' {
  if (message.includes('EVIDENCE_UNAVAILABLE') || message.includes('MEASURED_BEAT_FACT_MISSING')) {
    return 'UNVERIFIABLE';
  }
  if (message.includes('PROJECT_REVISION_DRIFT') || message.includes('PROJECT_ID_DRIFT')) {
    return 'CONFLICT';
  }
  return 'FAIL';
}

function failureCode(message: string): string {
  return message.split(':', 1)[0] || 'PROVIDER_NATIVE_DEV03_EXECUTION_FAILED';
}

function collectEvidenceIds(value: unknown): string[] {
  const found = new Set<string>();
  const visit = (entry: unknown, key = ''): void => {
    if (typeof entry === 'string' && (key === 'evidenceId' || key === 'evidenceIds')) found.add(entry);
    else if (Array.isArray(entry)) entry.forEach((item) => visit(item, key));
    else if (entry && typeof entry === 'object') {
      Object.entries(entry as JsonRecord).forEach(([childKey, child]) => visit(child, childKey));
    }
  };
  visit(value);
  return [...found].sort(compareUtf16);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown DEV-03 session error';
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.map(record) : [];
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function same(left: unknown, right: unknown): boolean {
  return hashCanonicalJsonV1(left) === hashCanonicalJsonV1(right);
}

function compareUtf16(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
