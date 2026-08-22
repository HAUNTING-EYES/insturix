import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { materializeHoldoutMediaV2R }
  from '@/lib/editron/research/open-ended-planner/holdout-media-materializer-v2r';
import { proveSealedHoldoutH01NativeOutcomeV2R }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-h01-native-proof-v2r';
import { proveSealedHoldoutH02NativeOutcomeV2R }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-h02-native-proof-v2r';
import { proveSealedHoldoutH03HybridOutcomeV2R }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-h03-hybrid-proof-v2r';
import { proveSealedHoldoutH04NativeOutcomeV2R }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-h04-native-proof-v2r';
import { proveSealedHoldoutH05NativeOutcomeV2R }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-h05-native-proof-v2r';
import { proveSealedHoldoutNoEditOutcomeV2R }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-no-edit-proof-v2r';

import {
  finishSealedHoldoutScriptV2R,
  runScriptedBudgetedSealedHoldoutV2R,
  type SealedHoldoutScriptedCallV2R,
} from './helpers/sealed-holdout-v2r-test-driver';

type Script = readonly SealedHoldoutScriptedCallV2R[];
type ScriptedResult = Awaited<ReturnType<typeof runScriptedBudgetedSealedHoldoutV2R>>;
type ProofReceipt = Readonly<{
  assessment: string; receiptSha256: string; stateEffects: readonly unknown[];
}>;

const scratch: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(scratch.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const scripts: Readonly<Record<string, Script>> = {
  'HOLD-01:C1': [
    call('read_project_file', { projectId: 'oe-hold-01', expectedProjectRevision: 'R9' }),
    call('find_visual_moment', { projectId: 'oe-hold-01', query: 'align outgoing round clock with incoming round product dial', evidenceIds: ['E1'] }),
    call('get_timeline_view', { projectId: 'oe-hold-01', expectedProjectRevision: 'R9' }),
    call('use_matching_footage', {
      projectId: 'oe-hold-01', expectedProjectRevision: 'R9', assetId: 'h01-dial',
      targetRange: { startFrame: 150, endFrame: 300 },
      sourceRange: { startFrame: 30, endFrame: 180 }, evidenceIds: ['E1', 'E2'],
      constraints: { transition: 'HARD_CUT_ONLY' },
    }),
    finishSealedHoldoutScriptV2R('READY_FOR_PROOF', ['E1', 'E2']),
  ],
  'HOLD-02:C1': [
    call('inspect_user_asset', { projectId: 'oe-hold-02', assetId: 'h02-door' }),
    call('read_project_file', { projectId: 'oe-hold-02', expectedProjectRevision: 'R4' }),
    call('add_overlay', {
      projectId: 'oe-hold-02', expectedProjectRevision: 'R4', assetId: 'h02-door',
      targetRange: { startFrame: 0, endFrame: 75 }, sourceRange: { startFrame: 30, endFrame: 105 },
    }),
    call('add_overlay', {
      projectId: 'oe-hold-02', assetId: 'h02-process', targetRange: { startFrame: 75, endFrame: 165 },
      sourceRange: { startFrame: 0, endFrame: 90 },
      argumentReferences: [{ targetField: 'expectedProjectRevision', resultReferenceId: 'result_t3_1' }],
    }),
    call('add_overlay', {
      projectId: 'oe-hold-02', assetId: 'h02-door', targetRange: { startFrame: 165, endFrame: 240 },
      sourceRange: { startFrame: 240, endFrame: 315 },
      argumentReferences: [{ targetField: 'expectedProjectRevision', resultReferenceId: 'result_t4_1' }],
    }),
    finishSealedHoldoutScriptV2R('READY_FOR_PROOF', ['E1', 'E2']),
  ],
  'HOLD-03:C1': [
    call('find_visual_moment', { projectId: 'oe-hold-03', query: 'Resolve the measured six-window reference layout and face-safe title region.', evidenceIds: ['E1', 'E2'] }),
    call('get_timeline_view', { projectId: 'oe-hold-03', expectedProjectRevision: 'R12' }),
    call('generated_composition_program', {
      projectId: 'oe-hold-03', expectedProjectRevision: 'R12', assetIds: ['h03-a', 'h03-b'],
      targetRange: { startFrame: 90, endFrame: 270 },
      referenceBlueprintId: 'HOLD-03-REFERENCE-BLUEPRINT-V2R-1',
      layoutSpec: { panelCount: 6, geometry: 'ASYMMETRIC_NORMALIZED_BOUNDS', gutters: true, titleSafeBand: { left: 0.15, top: 0.43, width: 0.70, height: 0.14 } },
      motionSpec: { entryFrames: [0, 24], stableFrames: [24, 150], exitFrames: [150, 180], relationship: 'OPPOSED_HORIZONTAL_SIDES_AND_VERTICAL_CENTRE' },
      typographySpec: { text: 'EVENT\nMOMENT', alignment: 'CENTER', fontAssetId: 'font-noto-sans-v27-regular' },
      constraints: { referencePixelsForbidden: true, preserveOutsideRange: true, returnBinding: { overlayId: 'ov-full', assetId: 'h03-a', sourceFrame: 270 }, titleFaceOverlapMaximumPixels: 0 },
      evidenceIds: ['E1', 'E2', 'E3'],
    }),
    finishSealedHoldoutScriptV2R('READY_FOR_PROOF', ['E1', 'E2', 'E3']),
  ],
  'HOLD-04:C1': [
    call('get_video_transcription', { projectId: 'oe-hold-04', assetId: 'h04-host' }),
    call('get_timeline_view', { projectId: 'oe-hold-04', expectedProjectRevision: 'R6' }),
    call('cut_section', {
      projectId: 'oe-hold-04', expectedProjectRevision: 'R6',
      targetRange: { startFrame: 120, endFrame: 225 }, evidenceIds: ['E1', 'E2'],
      constraints: { retainOccurrence: 'SECOND', preserveCaptionPresentation: true },
    }),
    finishSealedHoldoutScriptV2R('READY_FOR_PROOF', ['E1', 'E2']),
  ],
  'HOLD-05:C1': [
    call('find_visual_moment', { projectId: 'oe-hold-05', query: 'track the moving speaker for a vertical reframe' }),
    call('get_timeline_view', { projectId: 'oe-hold-05', expectedProjectRevision: 'R14' }),
    call('reframe_project', {
      projectId: 'oe-hold-05', expectedProjectRevision: 'R14',
      reframePlan: { targetAspectRatio: '9:16', trackingMode: 'FOLLOW_SPATIAL_EVIDENCE', preserveAuthoredLayout: true },
      evidenceIds: ['E1', 'E2'], constraints: { noStaticCenterCrop: true, preserveDuration: true },
    }),
    finishSealedHoldoutScriptV2R('READY_FOR_PROOF', ['E1', 'E2']),
  ],
  'HOLD-06:C1': [
    call('list_user_assets', { projectId: 'oe-hold-06' }),
    call('read_project_file', { projectId: 'oe-hold-06', expectedProjectRevision: 'R5' }),
    finishSealedHoldoutScriptV2R('POLICY_BLOCKED', ['E1', 'E2']),
  ],
  'HOLD-07:C1': [
    call('read_project_file', { projectId: 'oe-hold-07', expectedProjectRevision: 'R17' }),
    finishSealedHoldoutScriptV2R('CONFLICT', ['E1']),
  ],
  'HOLD-08:C1': [
    call('find_visual_moment', { projectId: 'oe-hold-08', query: 'moving fine-contour subject isolation' }),
    finishSealedHoldoutScriptV2R('CAPABILITY_GAP', ['E1']),
  ],
};

describe('sealed holdout complete zero-inference gate V2R', () => {
  it('composes current CAP, accounting, isolated execution, evaluation, and all proof adapters', async () => {
    const root = await mkdtemp(join(tmpdir(), 'editron-sealed-complete-zero-inference-'));
    scratch.push(root);
    const mediaManifest = await materializeHoldoutMediaV2R(join(root, 'media'));
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new Error('ZERO_INFERENCE_GATE_FORBIDS_NETWORK'),
    );
    const rows: Array<Record<string, unknown>> = [];

    for (const [caseId, caseScript] of Object.entries(scripts)) {
      const result = await runScriptedBudgetedSealedHoldoutV2R({
        caseId,
        calls: caseScript,
        argumentHandoffMode: ['HOLD-02:C1', 'HOLD-03:C1'].includes(caseId)
          ? 'OPAQUE_RESULT_REFERENCES' : 'DIRECT_ARGUMENTS',
      });
      const proof = await prove(
        caseId,
        result,
        mediaManifest,
        join(root, caseId.replace(':', '-')),
      );
      expect(result.routeBindingReceipt).toMatchObject({
        inferenceCallsAuthorized: 0,
        providerContextEgress: 'DENY',
        assessment: 'PASS_ACCOUNTING_BINDING_NO_INFERENCE',
        stateEffects: [],
      });
      expect(result.budgetedEpisode.runtimeBudget.assessment).toBe('ACCOUNTED_WITHIN_BUDGET');
      expect(result.trace.stateEffects).toEqual([]);
      expect(result.evaluation.stateEffects).toEqual([]);
      expect(proof.stateEffects).toEqual([]);
      rows.push({
        caseId,
        manifestSha256: result.manifest.manifestSha256,
        scriptedProviderTurns: result.scriptedProviderTurns,
        routeBindingReceiptSha256: result.routeBindingReceipt.receiptSha256,
        runtimeBudgetReceiptSha256: result.budgetedEpisode.runtimeBudget.receiptSha256,
        traceSha256: result.trace.artifactSha256,
        evaluationReceiptSha256: result.evaluation.receiptSha256,
        proofAssessment: proof.assessment,
        proofReceiptSha256: proof.receiptSha256,
      });
    }

    const receiptMaterial = {
      version: 'EDITRON_OE_COMPLETE_ZERO_INFERENCE_GATE_V2R_1',
      authority: 'SCRIPTED_RESEARCH_HARNESS_NO_PROVIDER_OR_PROJECT_AUTHORITY',
      externalNetworkCalls: 0,
      externalInferenceCalls: 0,
      realProjectMutations: 0,
      scriptedCaseCount: rows.length,
      rows,
    } as const;
    const receipt = { ...receiptMaterial, receiptSha256: hashCanonicalJsonV1(receiptMaterial) };
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(receipt.scriptedCaseCount).toBe(8);
    expect(new Set(rows.map(({ manifestSha256 }) => manifestSha256)).size).toBe(1);
    expect(rows.every(({ proofAssessment }) => String(proofAssessment).startsWith('PASS_RESEARCH_')))
      .toBe(true);
    expect(receipt.receiptSha256).toMatch(/^[a-f0-9]{64}$/);
  }, 300_000);
});

function call(name: string, args: Record<string, unknown>): SealedHoldoutScriptedCallV2R {
  return { name, arguments: args };
}

async function prove(
  caseId: string,
  result: ScriptedResult,
  mediaManifest: Awaited<ReturnType<typeof materializeHoldoutMediaV2R>>,
  outputDirectory: string,
): Promise<ProofReceipt> {
  const common = {
    manifest: result.manifest, trace: result.trace, evaluation: result.evaluation,
  };
  if (caseId === 'HOLD-01:C1') return proveSealedHoldoutH01NativeOutcomeV2R({ ...common, caseId, mediaManifest, outputDirectory });
  if (caseId === 'HOLD-02:C1') return proveSealedHoldoutH02NativeOutcomeV2R({ ...common, caseId, mediaManifest, outputDirectory });
  if (caseId === 'HOLD-03:C1') return proveSealedHoldoutH03HybridOutcomeV2R({ ...common, caseId, mediaManifest, outputDirectory });
  if (caseId === 'HOLD-04:C1') return proveSealedHoldoutH04NativeOutcomeV2R({ ...common, caseId, mediaManifest, outputDirectory });
  if (caseId === 'HOLD-05:C1') return proveSealedHoldoutH05NativeOutcomeV2R({ ...common, caseId, mediaManifest, outputDirectory });
  return proveSealedHoldoutNoEditOutcomeV2R({ ...common, caseId });
}
