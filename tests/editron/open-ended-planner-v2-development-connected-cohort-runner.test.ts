import { readFile } from 'node:fs/promises';

import { beforeAll, describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { buildDevelopmentCohortCasesV2, type DevelopmentMechanicsMapV2 } from '@/lib/editron/research/open-ended-planner/development-cohort-cases-v2';
import { runConnectedDevelopmentCohortV2 } from '@/lib/editron/research/open-ended-planner/development-connected-cohort-runner-v2';
import { buildConnectedDevelopmentStage4OwnerForTaskV2 } from '@/lib/editron/research/open-ended-planner/development-connected-stage4-owners-v2';
import {
  type DevelopmentCohortTaskIdV2,
  type DevelopmentModelRouteV2,
  type DevelopmentTaskCaseV2,
} from '@/lib/editron/research/open-ended-planner/development-cohort-runner-v2';
import {
  buildCanonicalDev03MeasuredEvidenceV2,
  type Dev03MeasuredEvidenceReceiptV2,
} from '@/lib/editron/research/open-ended-planner/dev03-measured-evidence-v2';
import type { ProviderStageRunV2 } from '@/lib/editron/research/open-ended-planner/provider-transport-v2';
import type { HashedStagePacketV2 } from '@/lib/editron/research/open-ended-planner/staged-packet-v2';

type JsonRecord = Record<string, unknown>;

let measured: Readonly<Dev03MeasuredEvidenceReceiptV2>;

beforeAll(async () => {
  const [audioBytes, analyzerSourceBytes] = await Promise.all([
    readFile('.calibration-temp/open-ended-planner-v2/development-media/dev03-beats.wav'),
    readFile('lib/editron/services/media/beat-detection-service.ts'),
  ]);
  measured = await buildCanonicalDev03MeasuredEvidenceV2({ audioBytes, analyzerSourceBytes });
});

describe('open-ended planner V2 connected development cohort', () => {
  it('runs every task through actual same-route artifacts and the matching existing owner', async () => {
    const tasks = buildDevelopmentCohortCasesV2({ measuredDev03: measured, mechanics: mechanics() });
    const byTask = new Map(tasks.map((task) => [task.taskId, task]));
    const route: DevelopmentModelRouteV2 = {
      routeId: 'CONNECTED_FAKE', claimedModelIdentity: 'fake/connected', costBasis: 'USD_METERED',
      runStage: async (packet) => accepted(packet, artifactFor(byTask.get(packet.packet.taskId as DevelopmentCohortTaskIdV2)!, packet)),
    };
    const receipt = await runConnectedDevelopmentCohortV2({
      tasks,
      routes: [route],
      ownerForTask: ({ taskId }) => buildConnectedDevelopmentStage4OwnerForTaskV2({
        taskId,
        measuredDev03: measured,
      }),
    });

    expect(receipt.routes[0].rows.map(({ taskId, stage5Decision }) => [taskId, stage5Decision.disposition])).toEqual([
      ['DEV-01', 'PROCEED'], ['DEV-02', 'PROCEED'], ['DEV-03', 'PROCEED'], ['DEV-04', 'CAPABILITY_GAP'],
    ]);
    expect(receipt).toMatchObject({
      handoffMode: 'CONNECTED_SAME_ROUTE_ACTUAL_PRIOR_ARTIFACT_THROUGH_STAGE5',
      stage6Disposition: 'PENDING_CONNECTED_PROXY_EXECUTION',
      stateEffects: [],
    });
    const { receiptHash, ...unsigned } = receipt;
    expect(receiptHash).toBe(hashCanonicalJsonV1(unsigned));
    expect(receipt.routes[0].rows.every(({ stage14Receipt }) =>
      stage14Receipt.stage123Receipt.rows[1].priorArtifactHash
        === stage14Receipt.stage123Receipt.rows[0].artifactHash)).toBe(true);
  });

  it('rejects an incomplete task set before any provider call', async () => {
    const tasks = buildDevelopmentCohortCasesV2({ measuredDev03: measured, mechanics: mechanics() });
    let calls = 0;
    const route: DevelopmentModelRouteV2 = {
      routeId: 'NEVER', claimedModelIdentity: 'fake/never', costBasis: 'USD_METERED',
      runStage: async () => { calls += 1; throw new Error('must not run'); },
    };
    await expect(runConnectedDevelopmentCohortV2({
      tasks: tasks.slice(0, 3), routes: [route],
      ownerForTask: () => buildConnectedDevelopmentStage4OwnerForTaskV2({ taskId: 'DEV-01', measuredDev03: measured }),
    })).rejects.toThrow('CONNECTED_COHORT_TASK_SET_INCOMPLETE');
    expect(calls).toBe(0);
  });
});

function artifactFor(task: DevelopmentTaskCaseV2, packet: HashedStagePacketV2): JsonRecord {
  const stage = packet.packet.stage;
  const artifact = structuredClone(stage === 1 ? task.canonical.referenceBlueprint
    : stage === 2 ? task.canonical.editorialIntent : task.canonical.evidenceBoundIntent) as JsonRecord;
  if (task.taskId === 'DEV-02' && stage === 1) {
    (artifact.globalEditorialLanguage as JsonRecord[])[0].observation += ' Connected wording.';
  }
  if (task.taskId === 'DEV-02' && stage === 2) {
    (artifact.unresolvedRequirements as JsonRecord[])[0].detail += ' Connected wording.';
  }
  return artifact;
}

function accepted(packet: HashedStagePacketV2, artifact: JsonRecord): Readonly<ProviderStageRunV2> {
  return {
    runVersion: 'EDITRON_OE_PROVIDER_STAGE_RUN_V2', authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION',
    packetHash: packet.packetHash, disposition: 'ARTIFACT_ACCEPTED', attempts: [], artifact,
  };
}

function mechanics(): DevelopmentMechanicsMapV2 {
  return {
    'DEV-01': mechanic('DEV-01'),
    'DEV-02': mechanic('DEV-02'),
    'DEV-03': mechanic('DEV-03'),
    'DEV-04': mechanic('DEV-04'),
  };
}

function mechanic(taskId: DevelopmentCohortTaskIdV2): DevelopmentMechanicsMapV2[DevelopmentCohortTaskIdV2] {
  return async () => ({
    taskId,
    authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION' as const,
    stage4Disposition: taskId === 'DEV-04' ? 'EXPECTED_CAPABILITY_GAP' as const : 'PASS' as const,
    stage5Disposition: taskId === 'DEV-04' ? 'CAPABILITY_GAP' as const : 'PROCEED' as const,
    stage6Disposition: taskId === 'DEV-04' ? 'CAPABILITY_GAP' as const : 'PASS' as const,
    stateEffects: [] as const,
    evidenceRefs: [],
  });
}
