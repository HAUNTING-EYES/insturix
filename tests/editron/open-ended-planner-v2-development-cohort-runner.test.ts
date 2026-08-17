import { readFile } from 'node:fs/promises';

import { beforeAll, describe, expect, it } from 'vitest';

import dev02EvidenceBoundJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-evidence-bound-intent-v2.json';
import dev02IntentJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-editorial-intent-v2.json';
import dev02EvidencePackJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-stage3-evidence-pack-v2.json';
import dev02BlueprintJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-reference-blueprint-v2.json';
import { getCanonicalDev01Stage123V2 } from '@/lib/editron/research/open-ended-planner/dev01-stage123-canonical-v2';
import {
  runDevelopmentCohortV2,
  type DevelopmentCohortTaskIdV2,
  type DevelopmentModelRouteV2,
  type DevelopmentTaskCaseV2,
} from '@/lib/editron/research/open-ended-planner/development-cohort-runner-v2';
import {
  buildCanonicalDev03BeatWithheldEvidenceV2,
  buildCanonicalDev03MeasuredEvidenceV2,
} from '@/lib/editron/research/open-ended-planner/dev03-measured-evidence-v2';
import { getCanonicalDev03Stage123V2 } from '@/lib/editron/research/open-ended-planner/dev03-stage123-canonical-v2';
import { getCanonicalDev04ConnectedChainV2 } from '@/lib/editron/research/open-ended-planner/dev04-capability-gap-chain-v2';
import {
  buildCanonicalTextStageOnePacketV2,
  buildDevelopmentReferenceImageSequenceStageOnePacketV2,
  buildDevelopmentStageOnePacketsV2,
  buildDev01TruthfulStageOneTextPacketV2,
  type HashedStagePacketV2,
} from '@/lib/editron/research/open-ended-planner/staged-packet-v2';

type JsonRecord = Record<string, unknown>;
let tasks: DevelopmentTaskCaseV2[];

beforeAll(async () => {
  const [audioBytes, analyzerSourceBytes] = await Promise.all([
    readFile('.calibration-temp/open-ended-planner-v2/development-media/dev03-beats.wav'),
    readFile('lib/editron/services/media/beat-detection-service.ts'),
  ]);
  const dev01 = getCanonicalDev01Stage123V2();
  const dev03 = getCanonicalDev03Stage123V2({
    measuredEvidence: await buildCanonicalDev03MeasuredEvidenceV2({ audioBytes, analyzerSourceBytes }),
    withheldEvidence: buildCanonicalDev03BeatWithheldEvidenceV2(),
  });
  const dev04 = getCanonicalDev04ConnectedChainV2();
  const dev04StageOne = buildDevelopmentStageOnePacketsV2().find(({ packet }) =>
    packet.taskId === 'DEV-04' && packet.conditionId === 'BASELINE'
      && packet.inputArm === 'TEXT_EVIDENCE_ONLY');
  if (!dev04StageOne) throw new Error('DEV04_STAGE1_PACKET_MISSING');

  tasks = [
    taskCase('DEV-01', buildDev01TruthfulStageOneTextPacketV2('BASELINE'), {
      referenceBlueprint: dev01.referenceBlueprints.BASELINE,
      editorialIntent: dev01.editorialIntent,
      evidencePack: dev01.evidencePacks.BASELINE,
      evidenceBoundIntent: dev01.evidenceBoundIntents.BASELINE,
    }),
    taskCase('DEV-02', buildDevelopmentReferenceImageSequenceStageOnePacketV2('DEV-02', 'BASELINE'), {
      referenceBlueprint: asRecord(dev02BlueprintJson),
      editorialIntent: asRecord(dev02IntentJson),
      evidencePack: asRecord(dev02EvidencePackJson),
      evidenceBoundIntent: asRecord(dev02EvidenceBoundJson),
    }),
    taskCase('DEV-03', buildCanonicalTextStageOnePacketV2({
      taskId: 'DEV-03', conditionId: 'BASELINE', canonicalInput: dev03.stageOneTextInputs.BASELINE,
    }), {
      referenceBlueprint: dev03.referenceBlueprints.BASELINE,
      editorialIntent: dev03.editorialIntent,
      evidencePack: dev03.evidencePacks.BASELINE,
      evidenceBoundIntent: dev03.evidenceBoundIntents.BASELINE,
    }),
    taskCase('DEV-04', dev04StageOne, {
      referenceBlueprint: dev04.referenceBlueprint,
      editorialIntent: dev04.editorialIntent,
      evidencePack: dev04.evidencePacks.BASELINE,
      evidenceBoundIntent: dev04.evidenceBoundIntent,
    }),
  ];
});

describe('open-ended planner V2 fair development cohort runner', () => {
  it('scores the same twelve isolated competencies per route and runs mechanics once per task', async () => {
    const mechanicsCalls = new Map<string, number>();
    const boundTasks = tasks.map((task) => ({
      ...task,
      runDeterministicMechanics: async () => {
        mechanicsCalls.set(task.taskId, (mechanicsCalls.get(task.taskId) ?? 0) + 1);
        return mechanicsReceipt(task.taskId);
      },
    }));
    const routes = [acceptedRoute('route-a', boundTasks), acceptedRoute('route-b', boundTasks)];

    const receipt = await runDevelopmentCohortV2({ tasks: boundTasks, routes });

    expect(receipt.routes).toHaveLength(2);
    expect(receipt.routes.map(({ rows }) => rows.length)).toEqual([12, 12]);
    expect(receipt.routes.flatMap(({ rows }) => rows)
      .every(({ evaluation }) => evaluation.disposition === 'PASS')).toBe(true);
    expect(Object.fromEntries(mechanicsCalls)).toEqual({
      'DEV-01': 1, 'DEV-02': 1, 'DEV-03': 1, 'DEV-04': 1,
    });
    expect(receipt.routes[0].rows.map(({ packetHash }) => packetHash))
      .toEqual(receipt.routes[1].rows.map(({ packetHash }) => packetHash));
    expect(receipt).toMatchObject({
      authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION',
      handoffMode: 'ISOLATED_COMPETENCY_WITH_EVALUATOR_APPROVED_CANONICAL_PRIOR',
      actualProviderCostUsd: 0,
      providerCostCoverage: 'COMPLETE',
      unpricedRouteIds: [],
      stage7Disposition: 'PENDING_REAL_HUMAN_REVIEW',
      stateEffects: [],
    });
  });

  it('rejects an incomplete task cohort and an invalid mechanics receipt', async () => {
    await expect(runDevelopmentCohortV2({
      tasks: tasks.slice(0, 3), routes: [acceptedRoute('route-a', tasks)],
    })).rejects.toThrow('COHORT_TASK_SET_INCOMPLETE');

    const invalid = tasks.map((task) => task.taskId === 'DEV-03' ? {
      ...task,
      runDeterministicMechanics: async () => ({
        ...mechanicsReceipt('DEV-03'), stateEffects: ['MUTATED_PROJECT'],
      }) as never,
    } : task);
    await expect(runDevelopmentCohortV2({
      tasks: invalid, routes: [acceptedRoute('route-a', invalid)],
    })).rejects.toThrow('COHORT_MECHANICS_RECEIPT_INVALID:DEV-03');
  });

  it('keeps failed, mis-bound, and schema-invalid provider rows unverifiable without fallback', async () => {
    const route = acceptedRoute('adversarial', tasks, (packet, accepted) => {
      if (packet.packet.taskId === 'DEV-01' && packet.packet.stage === 1) {
        const { artifact: _artifact, ...failure } = accepted;
        return { ...failure, disposition: 'PROVIDER_ERROR' };
      }
      if (packet.packet.taskId === 'DEV-02' && packet.packet.stage === 2) {
        return { ...accepted, packetHash: '0'.repeat(64) };
      }
      if (packet.packet.taskId === 'DEV-03' && packet.packet.stage === 3) {
        return { ...accepted, artifact: { artifactType: 'EvidenceBoundIntentGraphV2', taskId: 'DEV-03' } };
      }
      return accepted;
    });

    const receipt = await runDevelopmentCohortV2({ tasks, routes: [route] });
    const rows = receipt.routes[0].rows;
    expect(rows.find(({ taskId, stage }) => taskId === 'DEV-01' && stage === 1)?.evaluation)
      .toMatchObject({ disposition: 'UNVERIFIABLE', diagnostics: ['TRANSPORT_NOT_ACCEPTED:PROVIDER_ERROR'] });
    expect(rows.find(({ taskId, stage }) => taskId === 'DEV-02' && stage === 2)?.evaluation)
      .toMatchObject({ disposition: 'UNVERIFIABLE', diagnostics: ['PROVIDER_RUN_BINDING_INVALID'] });
    expect(rows.find(({ taskId, stage }) => taskId === 'DEV-03' && stage === 3)?.evaluation)
      .toMatchObject({ disposition: 'UNVERIFIABLE' });
  });
});

function taskCase(
  taskId: DevelopmentCohortTaskIdV2,
  stageOnePacket: HashedStagePacketV2,
  canonical: DevelopmentTaskCaseV2['canonical'],
): DevelopmentTaskCaseV2 {
  return {
    taskId, conditionId: 'BASELINE', executionFormArm: 'FREE_CHOICE', stageOnePacket, canonical,
    evaluateStage: () => ({ disposition: 'PASS', diagnostics: [] }),
    runDeterministicMechanics: async () => mechanicsReceipt(taskId),
  };
}

function acceptedRoute(
  routeId: string,
  sourceTasks: readonly DevelopmentTaskCaseV2[],
  mutate?: (
    packet: HashedStagePacketV2,
    accepted: Awaited<ReturnType<DevelopmentModelRouteV2['runStage']>>,
  ) => Awaited<ReturnType<DevelopmentModelRouteV2['runStage']>>,
): DevelopmentModelRouteV2 {
  return {
    routeId, claimedModelIdentity: `fake/${routeId}`, costBasis: 'USD_METERED',
    runStage: async (packet) => {
      const task = sourceTasks.find(({ taskId }) => taskId === packet.packet.taskId);
      if (!task) throw new Error(`FAKE_TASK_MISSING:${packet.packet.taskId}`);
      const artifact = packet.packet.stage === 1
        ? task.canonical.referenceBlueprint
        : packet.packet.stage === 2 ? task.canonical.editorialIntent : task.canonical.evidenceBoundIntent;
      const accepted = {
        runVersion: 'EDITRON_OE_PROVIDER_STAGE_RUN_V2' as const,
        authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION' as const,
        packetHash: packet.packetHash,
        disposition: 'ARTIFACT_ACCEPTED' as const,
        attempts: [],
        artifact,
      };
      return mutate?.(packet, accepted) ?? accepted;
    },
  };
}

function mechanicsReceipt(taskId: DevelopmentCohortTaskIdV2) {
  const capabilityGap = taskId === 'DEV-04';
  return {
    taskId,
    authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION' as const,
    stage4Disposition: capabilityGap ? 'EXPECTED_CAPABILITY_GAP' as const : 'PASS' as const,
    stage5Disposition: capabilityGap ? 'CAPABILITY_GAP' as const : 'PROCEED' as const,
    stage6Disposition: capabilityGap ? 'CAPABILITY_GAP' as const : 'PASS' as const,
    stateEffects: [] as const,
    evidenceRefs: [`research-mechanics:${taskId}`],
  };
}

function asRecord(value: unknown): JsonRecord {
  return value as JsonRecord;
}
