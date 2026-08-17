import path from 'node:path';
import { readFile } from 'node:fs/promises';

import { beforeAll, describe, expect, it } from 'vitest';

import { buildDevelopmentMechanicsMapV2 } from '@/lib/editron/research/open-ended-planner/development-cohort-mechanics-v2';
import {
  buildCanonicalDev03MeasuredEvidenceV2,
  type Dev03MeasuredEvidenceReceiptV2,
} from '@/lib/editron/research/open-ended-planner/dev03-measured-evidence-v2';

let measured: Readonly<Dev03MeasuredEvidenceReceiptV2>;

beforeAll(async () => {
  const [audioBytes, analyzerSourceBytes] = await Promise.all([
    readFile('.calibration-temp/open-ended-planner-v2/development-media/dev03-beats.wav'),
    readFile('lib/editron/services/media/beat-detection-service.ts'),
  ]);
  measured = await buildCanonicalDev03MeasuredEvidenceV2({ audioBytes, analyzerSourceBytes });
});

describe('open-ended planner V2 deterministic cohort mechanics', () => {
  it('preserves the honest DEV-04 stop and records a verified DEV-02 hybrid receipt', async () => {
    const mechanics = buildDevelopmentMechanicsMapV2({
      measuredDev03: measured,
      evidenceRoot: path.resolve('.calibration-temp/open-ended-planner-v2/cohort-mechanics'),
      runId: 'cohort-contract-test',
      createdAt: '2026-08-16T00:00:00.000Z',
      dev02MechanicsRunner: async ({ outputRoot }) => ({
        sourceStage6ReceiptHash: '1'.repeat(64),
        sourceStage6ReceiptPath: path.join(outputRoot, 'source-stage6.json'),
        hybridStage6ReceiptHash: '2'.repeat(64),
        hybridStage6ReceiptPath: path.join(outputRoot, 'hybrid-stage6.json'),
        hybridVideoPath: path.join(outputRoot, 'hybrid.mp4'),
        diagnostics: [],
      }),
    });
    const [dev02, dev04] = await Promise.all([mechanics['DEV-02'](), mechanics['DEV-04']()]);
    expect(dev02).toMatchObject({
      taskId: 'DEV-02', stage4Disposition: 'PASS', stage5Disposition: 'PROCEED',
      stage6Disposition: 'PASS', stateEffects: [],
    });
    expect(dev02.evidenceRefs).toContain(`hybridStage6:${'2'.repeat(64)}`);
    expect(dev04).toMatchObject({
      taskId: 'DEV-04', stage4Disposition: 'EXPECTED_CAPABILITY_GAP',
      stage5Disposition: 'CAPABILITY_GAP', stage6Disposition: 'CAPABILITY_GAP', stateEffects: [],
    });
  });

  it('rejects ambiguous evidence destinations and execution identities', () => {
    expect(() => buildDevelopmentMechanicsMapV2({
      measuredDev03: measured,
      evidenceRoot: 'relative/path',
      runId: 'short',
      createdAt: 'not-a-time',
    })).toThrow(/EVIDENCE_ROOT_NOT_ABSOLUTE/);
  });
});
