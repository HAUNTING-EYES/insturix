import { describe, expect, it } from 'vitest';

import { OverlayType } from '@/components/editron/editor/version-7.0.0/types';
import {
  DEV02_FORCED_NATIVE_BASELINE_HASH_V1, DEV02_FORCED_NATIVE_BASELINE_V1,
  buildDev02ForcedNativeOverlaysV1,
} from '@/lib/editron/research/open-ended-planner/dev02-forced-native-baseline-v1';
import { executeDev02ForcedNativeBaselineV1 } from '@/lib/editron/research/open-ended-planner/dev02-forced-native-renderer-v1';
import { evaluateDev02RenderedTargetCandidateV1 } from '@/lib/editron/research/open-ended-planner/generated-composition-dev02-rendered-proof-v1';
import { hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { DEV02_GENERATED_COMPOSITION_PROGRAM_V1 } from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-generated-composition-program-v1';

describe('DEV-02 forced native baseline', () => {
  it('binds a research-only native plan without project mutation', () => {
    const overlays = buildDev02ForcedNativeOverlaysV1();
    expect(DEV02_FORCED_NATIVE_BASELINE_V1.authority).toBe('RESEARCH_PROXY_ONLY_NO_PROJECT_MUTATION');
    expect(DEV02_FORCED_NATIVE_BASELINE_V1.stateEffects).toEqual([]);
    expect(DEV02_FORCED_NATIVE_BASELINE_V1.overlayPlanHash).toBe(hashCanonicalJsonV1(overlays));
    expect(DEV02_FORCED_NATIVE_BASELINE_HASH_V1).toMatch(/^[a-f0-9]{64}$/);
    expect(overlays).toHaveLength(16);
    expect(DEV02_FORCED_NATIVE_BASELINE_V1.editability).toMatchObject({
      overlayCount: 16, keyframeTrackCount: 7, keyframeCount: 14, crossElementRelationshipCount: 0,
    });
  });

  it('uses actual native overlays and an explicit post-island continuation', () => {
    const overlays = buildDev02ForcedNativeOverlaysV1();
    expect(overlays.filter(({ type }) => type === OverlayType.VIDEO)).toHaveLength(8);
    expect(overlays.filter(({ type }) => type === OverlayType.IMAGE)).toHaveLength(6);
    expect(overlays.filter(({ type }) => type === OverlayType.TEXT)).toHaveLength(1);
    expect(overlays.filter(({ type }) => type === OverlayType.SHAPE)).toHaveLength(1);
    const continuation = overlays.find(({ id }) => id === 2015);
    expect(continuation).toMatchObject({ type: OverlayType.VIDEO, assetId: 'dev02-close', from: 180, durationInFrames: 165, videoStartTime: 180 });
  });

  it('records the native keyframe-expansion cost instead of claiming relational editability', () => {
    const overlays = buildDev02ForcedNativeOverlaysV1();
    const holdCovers = overlays.filter(({ from, durationInFrames }) => from === 108 && durationInFrames === 37);
    expect(holdCovers).toHaveLength(4);
    expect(DEV02_GENERATED_COMPOSITION_PROGRAM_V1.declaredLayers).toHaveLength(6);
    expect(DEV02_FORCED_NATIVE_BASELINE_V1.editability.limitation).toContain('independent values/keyframes');
  });

  it('fails target proof before reading files when candidate identity is forged', async () => {
    await expect(evaluateDev02RenderedTargetCandidateV1({
      candidateId: 'dev02-native', candidateKind: 'NATIVE', candidateHash: 'forged',
      canvas: { width: 1080, height: 1920 }, stills: [],
    })).rejects.toThrow('candidate hash is invalid');
  });

  it('fails target proof when the frozen frame schedule is incomplete', async () => {
    await expect(evaluateDev02RenderedTargetCandidateV1({
      candidateId: 'dev02-native', candidateKind: 'NATIVE', candidateHash: 'a'.repeat(64),
      canvas: { width: 1080, height: 1920 }, stills: [],
    })).rejects.toThrow('frame schedule drift');
  });

  it('rejects malformed execution identity before accessing fixtures', async () => {
    await expect(executeDev02ForcedNativeBaselineV1({ outputDir: '.calibration-temp/never-created', executionId: '', createdAt: 'invalid' }))
      .rejects.toThrow('DEV02_NATIVE_EXECUTION_IDENTITY_INVALID');
  });
});
