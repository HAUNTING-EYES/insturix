import dev02EvidenceBoundJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-evidence-bound-intent-v2.json';
import dev02IntentJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-editorial-intent-v2.json';
import dev02EvidencePackJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-stage3-evidence-pack-v2.json';
import dev02BlueprintJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-reference-blueprint-v2.json';

import { deepFreezeV1 } from './contracts-v1';
import { getCanonicalDev01Stage123V2 } from './dev01-stage123-canonical-v2';
import { evaluateDev01StagesOneToThreeV2 } from './dev01-stage123-evaluator-v2';
import {
  type DevelopmentCohortTaskIdV2,
  type DevelopmentMechanicsReceiptV2,
  type DevelopmentStageEvaluationV2,
  type DevelopmentTaskCaseV2,
} from './development-cohort-runner-v2';
import type { Dev03MeasuredEvidenceReceiptV2 } from './dev03-measured-evidence-v2';
import { buildCanonicalDev03BeatWithheldEvidenceV2 } from './dev03-measured-evidence-v2';
import { getCanonicalDev03Stage123V2 } from './dev03-stage123-canonical-v2';
import { evaluateDev03StagesOneToThreeV2 } from './dev03-stage123-evaluator-v2';
import {
  evaluateDev04StagesOneToThreeV2,
  getCanonicalDev04ConnectedChainV2,
} from './dev04-capability-gap-chain-v2';
import { evaluateStage2RoutingArtifactV2 } from './stage2-routing-smoke-v2';
import { evaluateStage3EvidenceBindingArtifactV2 } from './stage3-evidence-binding-smoke-v2';
import {
  buildCanonicalTextStageOnePacketV2,
  buildDevelopmentReferenceImageSequenceStageOnePacketV2,
  buildDevelopmentStageOnePacketsV2,
  buildDev01TruthfulStageOneTextPacketV2,
} from './staged-packet-v2';

type JsonRecord = Record<string, unknown>;
type ModelStageV2 = 1 | 2 | 3;

export type DevelopmentMechanicsMapV2 = Readonly<Record<
  DevelopmentCohortTaskIdV2,
  () => Promise<Readonly<DevelopmentMechanicsReceiptV2>>
>>;

export function buildDevelopmentCohortCasesV2(input: {
  measuredDev03: Readonly<Dev03MeasuredEvidenceReceiptV2>;
  mechanics: DevelopmentMechanicsMapV2;
}): readonly DevelopmentTaskCaseV2[] {
  const dev01 = getCanonicalDev01Stage123V2();
  const dev03 = getCanonicalDev03Stage123V2({
    measuredEvidence: input.measuredDev03,
    withheldEvidence: buildCanonicalDev03BeatWithheldEvidenceV2(),
  });
  const dev04 = getCanonicalDev04ConnectedChainV2();
  const dev04StageOne = buildDevelopmentStageOnePacketsV2().find(({ packet }) =>
    packet.taskId === 'DEV-04' && packet.conditionId === 'BASELINE'
      && packet.inputArm === 'TEXT_EVIDENCE_ONLY');
  if (!dev04StageOne) throw new Error('DEV04_STAGE1_PACKET_MISSING');

  const cases: DevelopmentTaskCaseV2[] = [
    {
      taskId: 'DEV-01', conditionId: 'BASELINE', executionFormArm: 'FREE_CHOICE',
      stageOnePacket: buildDev01TruthfulStageOneTextPacketV2('BASELINE'),
      canonical: {
        referenceBlueprint: dev01.referenceBlueprints.BASELINE,
        editorialIntent: dev01.editorialIntent,
        evidencePack: dev01.evidencePacks.BASELINE,
        evidenceBoundIntent: dev01.evidenceBoundIntents.BASELINE,
      },
      evaluateStage: (stage, artifact) => stage === 1 ? stageOneHumanReview('DEV-01')
        : fromAssessment(evaluateDev01StagesOneToThreeV2({
            conditionId: 'BASELINE',
            referenceBlueprint: dev01.referenceBlueprints.BASELINE,
            editorialIntent: stage === 2 ? artifact : dev01.editorialIntent,
            evidencePack: dev01.evidencePacks.BASELINE,
            evidenceBoundIntent: stage === 3 ? artifact : dev01.evidenceBoundIntents.BASELINE,
          })),
      runDeterministicMechanics: input.mechanics['DEV-01'],
    },
    {
      taskId: 'DEV-02', conditionId: 'BASELINE', executionFormArm: 'FREE_CHOICE',
      stageOnePacket: buildDevelopmentReferenceImageSequenceStageOnePacketV2('DEV-02', 'BASELINE'),
      canonical: {
        referenceBlueprint: asRecord(dev02BlueprintJson),
        editorialIntent: asRecord(dev02IntentJson),
        evidencePack: asRecord(dev02EvidencePackJson),
        evidenceBoundIntent: asRecord(dev02EvidenceBoundJson),
      },
      evaluateStage: (stage, artifact) => evaluateDev02(stage, artifact),
      runDeterministicMechanics: input.mechanics['DEV-02'],
    },
    {
      taskId: 'DEV-03', conditionId: 'BASELINE', executionFormArm: 'FREE_CHOICE',
      stageOnePacket: buildCanonicalTextStageOnePacketV2({
        taskId: 'DEV-03', conditionId: 'BASELINE', canonicalInput: dev03.stageOneTextInputs.BASELINE,
      }),
      canonical: {
        referenceBlueprint: dev03.referenceBlueprints.BASELINE,
        editorialIntent: dev03.editorialIntent,
        evidencePack: dev03.evidencePacks.BASELINE,
        evidenceBoundIntent: dev03.evidenceBoundIntents.BASELINE,
      },
      evaluateStage: (stage, artifact) => stage === 1 ? stageOneHumanReview('DEV-03')
        : fromAssessment(evaluateDev03StagesOneToThreeV2({
            conditionId: 'BASELINE', measuredEvidence: input.measuredDev03,
            referenceBlueprint: dev03.referenceBlueprints.BASELINE,
            editorialIntent: stage === 2 ? artifact : dev03.editorialIntent,
            evidencePack: dev03.evidencePacks.BASELINE,
            evidenceBoundIntent: stage === 3 ? artifact : dev03.evidenceBoundIntents.BASELINE,
          })),
      runDeterministicMechanics: input.mechanics['DEV-03'],
    },
    {
      taskId: 'DEV-04', conditionId: 'BASELINE', executionFormArm: 'FREE_CHOICE',
      stageOnePacket: dev04StageOne,
      canonical: {
        referenceBlueprint: dev04.referenceBlueprint,
        editorialIntent: dev04.editorialIntent,
        evidencePack: dev04.evidencePacks.BASELINE,
        evidenceBoundIntent: dev04.evidenceBoundIntent,
      },
      evaluateStage: (stage, artifact) => stage === 1 ? stageOneHumanReview('DEV-04')
        : fromDisposition(evaluateDev04StagesOneToThreeV2({
            referenceBlueprint: dev04.referenceBlueprint,
            editorialIntent: stage === 2 ? artifact : dev04.editorialIntent,
            evidencePack: dev04.evidencePacks.BASELINE,
            evidenceBoundIntent: stage === 3 ? artifact : dev04.evidenceBoundIntent,
          })),
      runDeterministicMechanics: input.mechanics['DEV-04'],
    },
  ];
  return deepFreezeV1(cases);
}

function evaluateDev02(
  stage: ModelStageV2,
  artifact: Readonly<JsonRecord>,
): Readonly<DevelopmentStageEvaluationV2> {
  if (stage === 1) return stageOneHumanReview('DEV-02');
  const evaluation = stage === 2
    ? evaluateStage2RoutingArtifactV2(artifact)
    : evaluateStage3EvidenceBindingArtifactV2(artifact);
  const disposition = evaluation.disposition === 'PASS' ? 'PASS'
    : evaluation.disposition === 'CAPABILITY_BLOCKED' ? 'EXPECTED_CAPABILITY_GAP'
    : evaluation.disposition === 'UNVERIFIABLE' ? 'UNVERIFIABLE' : 'FAIL';
  return deepFreezeV1({ disposition, diagnostics: [...evaluation.diagnostics], dimensions: evaluation });
}

function stageOneHumanReview(taskId: DevelopmentCohortTaskIdV2): Readonly<DevelopmentStageEvaluationV2> {
  return deepFreezeV1({
    disposition: 'HUMAN_REVIEW_REQUIRED',
    diagnostics: [`${taskId}_STAGE1_SEMANTIC_RECONSTRUCTION_REQUIRES_BLIND_REVIEW`],
    dimensions: { schemaAndPacketBinding: 'PASS', semanticFidelity: 'PENDING_BLIND_REVIEW' },
  });
}

function fromAssessment(evaluation: Readonly<{ assessment: 'PASS' | 'FAIL'; diagnostics: readonly string[] }>) {
  return deepFreezeV1({
    disposition: evaluation.assessment,
    diagnostics: [...evaluation.diagnostics],
    dimensions: evaluation,
  });
}

function fromDisposition(evaluation: Readonly<{
  disposition: 'PASS' | 'FAIL' | 'UNVERIFIABLE'; diagnostics: readonly string[];
}>): Readonly<DevelopmentStageEvaluationV2> {
  return deepFreezeV1({
    disposition: evaluation.disposition,
    diagnostics: [...evaluation.diagnostics],
    dimensions: evaluation,
  });
}

function asRecord(value: unknown): JsonRecord {
  return value as JsonRecord;
}
