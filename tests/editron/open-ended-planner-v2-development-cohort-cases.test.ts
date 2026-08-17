import { readFile } from 'node:fs/promises';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  buildDevelopmentCohortCasesV2,
  type DevelopmentMechanicsMapV2,
} from '@/lib/editron/research/open-ended-planner/development-cohort-cases-v2';
import type { DevelopmentCohortTaskIdV2 } from '@/lib/editron/research/open-ended-planner/development-cohort-runner-v2';
import {
  buildCanonicalDev03MeasuredEvidenceV2,
  type Dev03MeasuredEvidenceReceiptV2,
} from '@/lib/editron/research/open-ended-planner/dev03-measured-evidence-v2';

type JsonRecord = Record<string, unknown>;
let measured: Readonly<Dev03MeasuredEvidenceReceiptV2>;

beforeAll(async () => {
  const [audioBytes, analyzerSourceBytes] = await Promise.all([
    readFile('.calibration-temp/open-ended-planner-v2/development-media/dev03-beats.wav'),
    readFile('lib/editron/services/media/beat-detection-service.ts'),
  ]);
  measured = await buildCanonicalDev03MeasuredEvidenceV2({ audioBytes, analyzerSourceBytes });
});

describe('open-ended planner V2 development cohort task policies', () => {
  it('binds all four tasks and keeps Stage 1 semantic fidelity for blind review', () => {
    const cases = buildDevelopmentCohortCasesV2({ measuredDev03: measured, mechanics });
    expect(cases.map(({ taskId }) => taskId)).toEqual(['DEV-01', 'DEV-02', 'DEV-03', 'DEV-04']);
    for (const task of cases) {
      expect(task.evaluateStage(1, task.canonical.referenceBlueprint)).toMatchObject({
        disposition: 'HUMAN_REVIEW_REQUIRED',
        dimensions: { schemaAndPacketBinding: 'PASS', semanticFidelity: 'PENDING_BLIND_REVIEW' },
      });
    }
  });

  it('passes canonical routing/evidence while preserving expected DEV-02 capability gaps', () => {
    const cases = buildDevelopmentCohortCasesV2({ measuredDev03: measured, mechanics });
    const results = Object.fromEntries(cases.map((task) => [task.taskId, [
      task.evaluateStage(2, task.canonical.editorialIntent).disposition,
      task.evaluateStage(3, task.canonical.evidenceBoundIntent).disposition,
    ]]));
    expect(results).toEqual({
      'DEV-01': ['PASS', 'PASS'],
      'DEV-02': ['EXPECTED_CAPABILITY_GAP', 'EXPECTED_CAPABILITY_GAP'],
      'DEV-03': ['PASS', 'PASS'],
      'DEV-04': ['PASS', 'PASS'],
    });
  });

  it('fails dishonest or incomplete routing instead of substituting canonical answers', () => {
    const cases = buildDevelopmentCohortCasesV2({ measuredDev03: measured, mechanics });
    for (const task of cases) {
      const tampered = structuredClone(task.canonical.editorialIntent) as JsonRecord;
      if (task.taskId === 'DEV-02') tampered.executionForm = 'NATIVE';
      else if (task.taskId === 'DEV-04') tampered.executionForm = 'NATIVE';
      else tampered.nodes = [];
      expect(task.evaluateStage(2, tampered).disposition, task.taskId).toBe('FAIL');
    }
  });
});

const mechanics: DevelopmentMechanicsMapV2 = {
  'DEV-01': () => Promise.resolve(mechanicsReceipt('DEV-01')),
  'DEV-02': () => Promise.resolve(mechanicsReceipt('DEV-02')),
  'DEV-03': () => Promise.resolve(mechanicsReceipt('DEV-03')),
  'DEV-04': () => Promise.resolve(mechanicsReceipt('DEV-04')),
};

function mechanicsReceipt(taskId: DevelopmentCohortTaskIdV2) {
  const capabilityGap = taskId === 'DEV-04';
  return {
    taskId,
    authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION' as const,
    stage4Disposition: capabilityGap ? 'EXPECTED_CAPABILITY_GAP' as const : 'PASS' as const,
    stage5Disposition: capabilityGap ? 'CAPABILITY_GAP' as const : 'PROCEED' as const,
    stage6Disposition: capabilityGap ? 'CAPABILITY_GAP' as const : 'PASS' as const,
    stateEffects: [] as const,
    evidenceRefs: [`test:${taskId}`],
  };
}
