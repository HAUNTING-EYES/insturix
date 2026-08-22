import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { materializeHoldoutMediaV2R }
  from '@/lib/editron/research/open-ended-planner/holdout-media-materializer-v2r';
import {
  proveSealedHoldoutH01NativeOutcomeV2R,
  SEALED_HOLDOUT_H01_C2_NATIVE_PROOF_VERSION_V2R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-h01-native-proof-v2r';
import {
  proveSealedHoldoutH02NativeOutcomeV2R,
  SEALED_HOLDOUT_H02_C2_NATIVE_PROOF_VERSION_V2R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-h02-native-proof-v2r';
import {
  proveSealedHoldoutH04NativeOutcomeV2R,
  SEALED_HOLDOUT_H04_C2_NATIVE_PROOF_VERSION_V2R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-h04-native-proof-v2r';

import {
  finishSealedHoldoutScriptV2R,
  runScriptedBudgetedSealedHoldoutV2R,
  type SealedHoldoutScriptedCallV2R,
} from './helpers/sealed-holdout-v2r-test-driver';

const scratch: string[] = [];
afterEach(async () => {
  await Promise.all(scratch.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('sealed holdout C2 rendered proof adapters V2R', () => {
  it('proves every noisy arm that is allowed to proceed without weakening C1', async () => {
    const root = await mkdtemp(join(tmpdir(), 'editron-sealed-c2-proof-'));
    scratch.push(root);
    const mediaManifest = await materializeHoldoutMediaV2R(join(root, 'media'));

    const h01 = await runScriptedBudgetedSealedHoldoutV2R({
      caseId: 'HOLD-01:C2', calls: h01Calls(),
    });
    expect(h01.evaluation).toMatchObject({
      assessment: 'READY_FOR_PROOF', executionForm: 'NATIVE', proofRequired: true,
    });
    const h01Proof = await proveSealedHoldoutH01NativeOutcomeV2R({
      manifest: h01.manifest, caseId: 'HOLD-01:C2', trace: h01.trace,
      evaluation: h01.evaluation, mediaManifest, outputDirectory: join(root, 'h01'),
    });
    expect(h01Proof).toMatchObject({
      version: SEALED_HOLDOUT_H01_C2_NATIVE_PROOF_VERSION_V2R,
      caseId: 'HOLD-01:C2', assessment: 'PASS_RESEARCH_RENDERED_NATIVE_PROXY',
    });

    const h02 = await runScriptedBudgetedSealedHoldoutV2R({
      caseId: 'HOLD-02:C2', calls: h02Calls(),
      argumentHandoffMode: 'OPAQUE_RESULT_REFERENCES',
    });
    expect(h02.evaluation).toMatchObject({
      assessment: 'READY_FOR_PROOF', executionForm: 'NATIVE', proofRequired: true,
    });
    const h02Proof = await proveSealedHoldoutH02NativeOutcomeV2R({
      manifest: h02.manifest, caseId: 'HOLD-02:C2', trace: h02.trace,
      evaluation: h02.evaluation, mediaManifest, outputDirectory: join(root, 'h02'),
    });
    expect(h02Proof).toMatchObject({
      version: SEALED_HOLDOUT_H02_C2_NATIVE_PROOF_VERSION_V2R,
      caseId: 'HOLD-02:C2', assessment: 'PASS_RESEARCH_RENDERED_NATIVE_PROXY',
    });

    const h04 = await runScriptedBudgetedSealedHoldoutV2R({
      caseId: 'HOLD-04:C2', calls: h04Calls(),
    });
    expect(h04.evaluation).toMatchObject({
      assessment: 'READY_FOR_PROOF', executionForm: 'NATIVE', proofRequired: true,
    });
    const h04Proof = await proveSealedHoldoutH04NativeOutcomeV2R({
      manifest: h04.manifest, caseId: 'HOLD-04:C2', trace: h04.trace,
      evaluation: h04.evaluation, mediaManifest, outputDirectory: join(root, 'h04'),
    });
    expect(h04Proof).toMatchObject({
      version: SEALED_HOLDOUT_H04_C2_NATIVE_PROOF_VERSION_V2R,
      caseId: 'HOLD-04:C2',
      assessment: 'PASS_RESEARCH_NATIVE_OWNER_AND_RENDERED_AV_PROXY',
    });
  }, 300_000);
});

function h01Calls(): readonly SealedHoldoutScriptedCallV2R[] {
  return [
    call('read_project_file', { projectId: 'oe-hold-01', expectedProjectRevision: 'R9' }),
    call('find_visual_moment', {
      projectId: 'oe-hold-01', query: 'align outgoing clock with incoming round dial',
      evidenceIds: ['E1'],
    }),
    call('get_timeline_view', { projectId: 'oe-hold-01', expectedProjectRevision: 'R9' }),
    call('use_matching_footage', {
      projectId: 'oe-hold-01', expectedProjectRevision: 'R9', assetId: 'h01-dial',
      targetRange: { startFrame: 150, endFrame: 300 },
      sourceRange: { startFrame: 30, endFrame: 180 }, evidenceIds: ['E1', 'E2'],
      constraints: { transition: 'HARD_CUT_ONLY' },
    }),
    finishSealedHoldoutScriptV2R('READY_FOR_PROOF', ['E1', 'E2']),
  ];
}

function h02Calls(): readonly SealedHoldoutScriptedCallV2R[] {
  return [
    call('inspect_user_asset', { projectId: 'oe-hold-02', assetId: 'h02-door' }),
    call('read_project_file', { projectId: 'oe-hold-02', expectedProjectRevision: 'R4' }),
    call('add_overlay', {
      projectId: 'oe-hold-02', expectedProjectRevision: 'R4', assetId: 'h02-door',
      targetRange: { startFrame: 0, endFrame: 75 }, sourceRange: { startFrame: 30, endFrame: 105 },
    }),
    call('add_overlay', {
      projectId: 'oe-hold-02', assetId: 'h02-process',
      targetRange: { startFrame: 75, endFrame: 165 }, sourceRange: { startFrame: 0, endFrame: 90 },
      argumentReferences: [{ targetField: 'expectedProjectRevision', resultReferenceId: 'result_t3_1' }],
    }),
    call('add_overlay', {
      projectId: 'oe-hold-02', assetId: 'h02-door',
      targetRange: { startFrame: 165, endFrame: 240 }, sourceRange: { startFrame: 240, endFrame: 315 },
      argumentReferences: [{ targetField: 'expectedProjectRevision', resultReferenceId: 'result_t4_1' }],
    }),
    finishSealedHoldoutScriptV2R('READY_FOR_PROOF', ['E1', 'E2']),
  ];
}

function h04Calls(): readonly SealedHoldoutScriptedCallV2R[] {
  return [
    call('get_video_transcription', { projectId: 'oe-hold-04', assetId: 'h04-host' }),
    call('get_timeline_view', { projectId: 'oe-hold-04', expectedProjectRevision: 'R6' }),
    call('cut_section', {
      projectId: 'oe-hold-04', expectedProjectRevision: 'R6',
      targetRange: { startFrame: 120, endFrame: 225 }, evidenceIds: ['E1', 'E2'],
      constraints: { retainOccurrence: 'SECOND', preserveCaptionPresentation: true },
    }),
    finishSealedHoldoutScriptV2R('READY_FOR_PROOF', ['E1', 'E2']),
  ];
}

function call(
  name: string,
  argumentsValue: Readonly<Record<string, unknown>>,
): SealedHoldoutScriptedCallV2R {
  return { name, arguments: argumentsValue };
}
