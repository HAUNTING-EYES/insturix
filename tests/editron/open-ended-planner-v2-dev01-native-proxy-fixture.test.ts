import { describe, expect, it } from 'vitest';

import { getSoundAudioDuckRegions } from '@/lib/editron/services/native-audio-evidence';
import {
  executeDev01TruthCutV2,
  getCanonicalDev01NativeProxyFixtureV2,
  hashCanonicalDev01NativeProxyFixtureV2,
  mapDev01SourceTimelineFrameV2,
  mapDev01SourceTimelineRangeV2,
  renderDev01TruthfulFrameV2,
  sha256Dev01FixtureBytesV2,
  synthesizeDev01StemPcm16V2,
} from '@/lib/editron/research/open-ended-planner/dev01-native-proxy-fixture-v2';

function pixel(frame: Buffer, width: number, x: number, y: number): number[] {
  const offset = (y * width + x) * 3;
  return [frame[offset], frame[offset + 1], frame[offset + 2]];
}

function rmsBetweenFrames(pcm: Buffer, startFrame: number, endFrame: number): number {
  const samplesPerFrame = 48_000 / 30;
  const firstSample = startFrame * samplesPerFrame;
  const endSample = endFrame * samplesPerFrame;
  let energy = 0;
  for (let sample = firstSample; sample < endSample; sample += 1) {
    const value = pcm.readInt16LE(sample * 2) / 32_768;
    energy += value * value;
  }
  return Math.sqrt(energy / Math.max(1, endSample - firstSample));
}

describe('open-ended planner V2 truthful DEV-01 native proxy fixture', () => {
  it('versions the correction instead of rewriting the issued mixed-audio fixture', () => {
    const fixture = getCanonicalDev01NativeProxyFixtureV2();
    expect(fixture.authority).toBe('RESEARCH_ONLY_NO_PROJECT_AUTHORITY');
    expect(fixture.supersedes.reasons).toEqual([
      'PRODUCT_REVEAL_FRAME_MISMATCH',
      'DIALOGUE_AND_BGM_NOT_SEPARABLE',
    ]);
    expect(new Set(Object.values(fixture.assets)).size).toBe(3);
    expect(hashCanonicalDev01NativeProxyFixtureV2()).toMatch(/^[a-f0-9]{64}$/);
  });

  it('makes the product appear at source frame 205, not the old proxy frame 180', () => {
    const width = 100;
    const height = 100;
    const before = renderDev01TruthfulFrameV2(204, width, height);
    const reveal = renderDev01TruthfulFrameV2(205, width, height);
    expect(pixel(before, width, 74, 50)).toEqual([18, 24, 38]);
    expect(pixel(reveal, width, 74, 50)).toEqual([247, 187, 52]);
    expect(() => renderDev01TruthfulFrameV2(480, width, height)).toThrow(/outside DEV-01 source/);
  });

  it('provides independently measurable dialogue and BGM stems', () => {
    const dialogue = synthesizeDev01StemPcm16V2('DIALOGUE');
    const bgm = synthesizeDev01StemPcm16V2('BGM');
    expect(sha256Dev01FixtureBytesV2(dialogue)).not.toBe(sha256Dev01FixtureBytesV2(bgm));
    expect(rmsBetweenFrames(dialogue, 60, 151)).toBeGreaterThan(0.05);
    expect(rmsBetweenFrames(dialogue, 151, 196)).toBe(0);
    expect(rmsBetweenFrames(dialogue, 196, 330)).toBeGreaterThan(0.05);
    expect(rmsBetweenFrames(bgm, 151, 196)).toBeGreaterThan(0.05);
  });

  it('binds the post-cut product reveal to the actual right child and local frame', () => {
    const result = executeDev01TruthCutV2();
    expect(result.framesCut).toBe(45);
    expect(result.newDurationInFrames).toBe(435);
    expect(mapDev01SourceTimelineFrameV2(150)).toBe(150);
    expect(mapDev01SourceTimelineFrameV2(151)).toBeNull();
    expect(mapDev01SourceTimelineFrameV2(195)).toBeNull();
    expect(mapDev01SourceTimelineFrameV2(196)).toBe(151);
    expect(mapDev01SourceTimelineFrameV2(205)).toBe(160);

    const host = result.splitChildren.find(({ beforeOverlayId }) => beforeOverlayId === 101);
    expect(host).toEqual({
      beforeOverlayId: 101,
      leftOverlayId: 101,
      rightOverlayId: 104,
      rightSourceStartFrame: 196,
      rightTimelineStartFrame: 151,
    });
    expect(160 - Number(host?.rightTimelineStartFrame)).toBe(9);
  });

  it('preserves the spoken ranges and keeps BGM identity independent from dialogue', () => {
    const fixture = getCanonicalDev01NativeProxyFixtureV2();
    const mapped = fixture.evidence.transcript.speechSourceRanges.map(
      mapDev01SourceTimelineRangeV2,
    );
    expect(mapped).toEqual(fixture.expected.outputSpeechRanges);
    expect(() => mapDev01SourceTimelineRangeV2([150, 197])).toThrow(
      /DEV01_SOURCE_RANGE_INTERSECTS_REMOVED_TIME/,
    );

    const result = executeDev01TruthCutV2();
    const bgm = result.overlays.find(({ id }) => id === 103);
    expect(bgm).toMatchObject({
      assetId: fixture.assets.bgmAssetId,
      from: 0,
      durationInFrames: 435,
    });
    expect(fixture.assets.bgmAssetId).not.toBe(fixture.assets.dialogueAssetId);
  });

  it('projects bound dialogue evidence to exact post-cut renderer ranges', () => {
    const fixture = getCanonicalDev01NativeProxyFixtureV2();
    const result = executeDev01TruthCutV2();
    const dialogueParts = result.overlays.filter(
      ({ assetId }) => assetId === fixture.assets.dialogueAssetId,
    );
    const renderedSpeechRanges = dialogueParts.flatMap((overlay) => (
      getSoundAudioDuckRegions(overlay) ?? []
    ));

    expect(renderedSpeechRanges).toEqual([
      { from: 60, durationInFrames: 91 },
      { from: 151, durationInFrames: 134 },
    ]);
    expect(renderedSpeechRanges.map(({ from, durationInFrames }) => (
      [from, from + durationInFrames]
    ))).toEqual(fixture.expected.outputSpeechRanges);
  });

  it('requires coordinate/split observability and declares real ducking storage semantics', () => {
    const amendments = getCanonicalDev01NativeProxyFixtureV2().operatorContractAmendments;
    expect(amendments.cutSection.requiredFields).toEqual([
      'receipt',
      'timelineCoordinateTransform',
      'splitChildren',
    ]);
    expect(amendments.applyAudioDucking).toEqual({
      storedState: 'overlay.styles.duckingConfig',
      rendererEffect: 'frame-time gain derived from bound speech evidence',
    });
  });
});
