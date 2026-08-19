import dev02Stage3EvidenceJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-stage3-evidence-pack-v2.json';

import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import { getCanonicalDev01Stage123V2 } from './dev01-stage123-canonical-v2';
import { DEV01_LOWERING_POLICY_V2R } from './dev01-lowering-policy-v2r';
import { DEV02_LOWERING_POLICY_V2R } from './dev02-lowering-policy-v2r';
import { DEV03_LOWERING_POLICY_V2R } from './dev03-lowering-policy-v2r';
import {
  buildCanonicalDev03BeatWithheldEvidenceV2,
  type Dev03MeasuredEvidenceReceiptV2,
} from './dev03-measured-evidence-v2';
import { getCanonicalDev03Stage123V2 } from './dev03-stage123-canonical-v2';
import { getCanonicalDev04ConnectedChainV2 } from './dev04-capability-gap-chain-v2';
import { DEV04_LOWERING_POLICY_V2R } from './dev04-lowering-policy-v2r';
import {
  buildCanonicalTextStageOnePacketV2,
  buildDev01TruthfulStageOneTextPacketV2,
  buildDevelopmentReferenceImageSequenceStageOnePacketV2,
} from './staged-packet-v2';
import {
  buildEvaluatorPolicyFreezeV2R,
  type EvaluatorConditionPolicyV2R,
} from './evaluator-freeze-v2r';
import type { V2RConnectedTaskV2 } from './v2r-connected-episode-v2r';

type JsonRecord = Record<string, unknown>;

export const V2R_BENCHMARK_TASK_REGISTRY_VERSION =
  'EDITRON_OE_V2R_BENCHMARK_TASK_REGISTRY_V2' as const;

export interface V2RBenchmarkTaskCaseV2 {
  caseId: string;
  task: Readonly<V2RConnectedTaskV2>;
  expected: Readonly<EvaluatorConditionPolicyV2R>;
}

export interface V2RBenchmarkTaskRegistryV2 {
  version: typeof V2R_BENCHMARK_TASK_REGISTRY_VERSION;
  authority: 'RESEARCH_ONLY_CANONICAL_TASK_REGISTRY_NO_PROJECT_MUTATION';
  cases: readonly Readonly<V2RBenchmarkTaskCaseV2>[];
  registrySha256: string;
}

export function buildV2RBenchmarkTaskRegistryV2(input: {
  dev03MeasuredEvidence: Readonly<Dev03MeasuredEvidenceReceiptV2>;
}): Readonly<V2RBenchmarkTaskRegistryV2> {
  const dev01 = getCanonicalDev01Stage123V2();
  const dev03 = getCanonicalDev03Stage123V2({
    measuredEvidence: input.dev03MeasuredEvidence,
    withheldEvidence: buildCanonicalDev03BeatWithheldEvidenceV2(),
  });
  const dev04 = getCanonicalDev04ConnectedChainV2();
  const cases: V2RBenchmarkTaskCaseV2[] = [
    taskCase('DEV-01', 'BASELINE', {
      taskId: 'DEV-01', conditionId: 'BASELINE', executionFormArm: 'FORCED_NATIVE',
      stageOnePacket: buildDev01TruthfulStageOneTextPacketV2('BASELINE'),
      evidencePack: dev01.evidencePacks.BASELINE,
      loweringPolicy: DEV01_LOWERING_POLICY_V2R,
    }),
    taskCase('DEV-01', 'VISUAL_EVIDENCE_WITHHELD', {
      taskId: 'DEV-01', conditionId: 'VISUAL_EVIDENCE_WITHHELD', executionFormArm: 'FORCED_NATIVE',
      stageOnePacket: buildDev01TruthfulStageOneTextPacketV2('VISUAL_EVIDENCE_WITHHELD'),
      evidencePack: dev01.evidencePacks.VISUAL_EVIDENCE_WITHHELD,
      loweringPolicy: DEV01_LOWERING_POLICY_V2R,
    }),
    taskCase('DEV-02', 'BASELINE', {
      taskId: 'DEV-02', conditionId: 'BASELINE', executionFormArm: 'FREE_CHOICE',
      stageOnePacket: buildDevelopmentReferenceImageSequenceStageOnePacketV2('DEV-02', 'BASELINE'),
      evidencePack: dev02Stage3EvidenceJson as JsonRecord,
      loweringPolicy: DEV02_LOWERING_POLICY_V2R,
    }),
    taskCase('DEV-03', 'BASELINE', {
      taskId: 'DEV-03', conditionId: 'BASELINE', executionFormArm: 'FORCED_NATIVE',
      stageOnePacket: buildCanonicalTextStageOnePacketV2({
        taskId: 'DEV-03', conditionId: 'BASELINE',
        canonicalInput: dev03.stageOneTextInputs.BASELINE,
      }),
      evidencePack: dev03.evidencePacks.BASELINE,
      loweringPolicy: DEV03_LOWERING_POLICY_V2R,
    }),
    taskCase('DEV-03', 'BEAT_EVIDENCE_WITHHELD', {
      taskId: 'DEV-03', conditionId: 'BEAT_EVIDENCE_WITHHELD', executionFormArm: 'FORCED_NATIVE',
      stageOnePacket: buildCanonicalTextStageOnePacketV2({
        taskId: 'DEV-03', conditionId: 'BEAT_EVIDENCE_WITHHELD',
        canonicalInput: dev03.stageOneTextInputs.BEAT_EVIDENCE_WITHHELD,
      }),
      evidencePack: dev03.evidencePacks.BEAT_EVIDENCE_WITHHELD,
      loweringPolicy: DEV03_LOWERING_POLICY_V2R,
    }),
    taskCase('DEV-04', 'BASELINE', {
      taskId: 'DEV-04', conditionId: 'BASELINE', executionFormArm: 'FREE_CHOICE',
      stageOnePacket: buildCanonicalTextStageOnePacketV2({
        taskId: 'DEV-04', conditionId: 'BASELINE', canonicalInput: dev04StageOneInput(),
      }),
      evidencePack: dev04.evidencePacks.BASELINE,
      loweringPolicy: DEV04_LOWERING_POLICY_V2R,
    }),
  ];
  assertUniqueCases(cases);
  const material = {
    version: V2R_BENCHMARK_TASK_REGISTRY_VERSION,
    authority: 'RESEARCH_ONLY_CANONICAL_TASK_REGISTRY_NO_PROJECT_MUTATION' as const,
    cases,
  };
  return deepFreezeV1({ ...material, registrySha256: hashCanonicalJsonV1(material) });
}

export function assertV2RBenchmarkTaskRegistryV2(
  candidate: unknown,
): Readonly<V2RBenchmarkTaskRegistryV2> {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new Error('V2R_TASK_REGISTRY_MISSING');
  }
  const registry = candidate as V2RBenchmarkTaskRegistryV2;
  if (registry.version !== V2R_BENCHMARK_TASK_REGISTRY_VERSION) {
    throw new Error('V2R_TASK_REGISTRY_VERSION_DRIFT');
  }
  assertUniqueCases(registry.cases);
  const { registrySha256, ...material } = registry;
  if (typeof registrySha256 !== 'string' || hashCanonicalJsonV1(material) !== registrySha256) {
    throw new Error('V2R_TASK_REGISTRY_HASH_DRIFT');
  }
  if (!isDeepFrozen(registry)) throw new Error('V2R_TASK_REGISTRY_NOT_IMMUTABLE');
  return registry;
}

function taskCase(
  taskId: string,
  conditionId: string,
  task: V2RConnectedTaskV2,
): V2RBenchmarkTaskCaseV2 {
  const expected = buildEvaluatorPolicyFreezeV2R().tasks
    .find((candidate) => candidate.taskId === taskId)?.conditions
    .find((candidate) => candidate.conditionId === conditionId);
  if (!expected) throw new Error(`V2R_TASK_REGISTRY_EXPECTATION_MISSING:${taskId}:${conditionId}`);
  return { caseId: `${taskId}:${conditionId}`, task, expected };
}

function assertUniqueCases(cases: readonly Readonly<V2RBenchmarkTaskCaseV2>[]): void {
  const ids = cases.map(({ caseId }) => caseId);
  if (ids.length !== 6 || new Set(ids).size !== ids.length) {
    throw new Error('V2R_TASK_REGISTRY_CASE_SET_INVALID');
  }
}

function dev04StageOneInput(): JsonRecord {
  return {
    taskId: 'DEV-04', conditionId: 'BASELINE',
    request: 'Put the title behind the moving person for the whole shot so their changing outline always stays in front. Do not hide the title when they are not crossing it.',
    projectFacts: {
      projectId: 'oe-dev-04', projectRevision: 'R2',
      timebase: {
        coordinateDomain: 'PROJECT_TICK', rate: { numerator: '30', denominator: '1' },
        duration: { start: '0', endExclusive: '240' },
      },
    },
    evidenceAvailability: [{ evidenceId: 'EV-DEV04-V1', kind: 'VISUAL_OCCLUSION_OBSERVATION' }],
    mediaPolicy: 'HASH_BOUND_SYNTHETIC_BENCHMARK_EVIDENCE_ONLY_NO_MEDIA_EGRESS',
  };
}

function isDeepFrozen(value: unknown, seen = new WeakSet<object>()): boolean {
  if (!value || typeof value !== 'object') return true;
  if (seen.has(value)) return true;
  seen.add(value);
  if (!Object.isFrozen(value)) return false;
  return Object.values(value).every((entry) => isDeepFrozen(entry, seen));
}
