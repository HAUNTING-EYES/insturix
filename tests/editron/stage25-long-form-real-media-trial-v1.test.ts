import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  finalizeStage25LongFormRealMediaTrialV1,
  type Stage25LongFormRealMediaTrialInputV1,
} from '@/lib/editron/research/open-ended-planner/stage25-long-form-real-media-trial-v1';
import { normalizeStage25LongFormProbeStreamsV1 }
  from './helpers/stage25-long-form-real-media-pts-v1';

describe('Stage 2.5 long-form actual-container trial V1', () => {
  it('binds full-source PTS coverage and refuses to call partial context complete', () => {
    const receipt = finalizeStage25LongFormRealMediaTrialV1(validInput());

    expect(receipt).toMatchObject({
      assessment: 'PASS_LOCAL_LONG_FORM_MEDIA_AND_WINDOW_MECHANICS',
      proofCeiling: 'LOCAL_SYNTHETIC_LONG_DURATION_CONTAINER_AND_BOUNDED_WINDOW_EVIDENCE',
      fullHydration: {
        disposition: 'PASS_COMPLETE_CONTEXT',
        selected: ['START', 'MIDDLE', 'END'],
        omitted: [],
      },
      constrainedHydration: {
        disposition: 'UNVERIFIABLE_CONTEXT_BUDGET',
        selected: ['START', 'MIDDLE'],
        omitted: [{ windowId: 'END', reason: 'WINDOW_COUNT_BUDGET' }],
      },
      providerInferenceCalls: 0,
      networkCalls: 0,
      productRenderCalls: 0,
      canonicalProjectMutations: 0,
      stateEffects: [],
    });
    expect(receipt.whatHasNotBeenChecked).toContain('SEMANTIC_RETRIEVAL_ACCURACY');
    expect(Object.isFrozen(receipt)).toBe(true);
    const material = { ...receipt } as Record<string, unknown>;
    delete material.receiptSha256;
    expect(receipt.receiptSha256).toBe(hashCanonicalJsonV1(material));
  });

  it('canonicalizes window presentation order before selection and hashing', () => {
    const baseline = validInput();
    const permuted = validInput();
    (permuted as unknown as { windows: unknown[] }).windows.reverse();
    const left = finalizeStage25LongFormRealMediaTrialV1(baseline);
    const right = finalizeStage25LongFormRealMediaTrialV1(permuted);
    expect(right.windows).toEqual(left.windows);
    expect(right.receiptSha256).toBe(left.receiptSha256);
  });

  it('rejects dirty source, incomplete coverage and forged media identity', () => {
    const dirty = validInput();
    (dirty.source as unknown as { relevantStatusEntries: string[] }).relevantStatusEntries = [
      ' M lib/editron/unsafe.ts',
    ];
    expect(() => finalizeStage25LongFormRealMediaTrialV1(dirty))
      .toThrow('STAGE25_LONG_FORM_REAL_MEDIA_SOURCE_SCOPE_DIRTY_OR_EMPTY');

    const incomplete = validInput();
    (incomplete.ptsIndex as { verifiedFrameCount: string }).verifiedFrameCount = '485514';
    expect(() => finalizeStage25LongFormRealMediaTrialV1(incomplete))
      .toThrow('STAGE25_LONG_FORM_REAL_MEDIA_PTS_COVERAGE_INVALID');

    const forged = validInput();
    (forged.media as { sourceVersionSha256: string }).sourceVersionSha256 = 'x'.repeat(64);
    expect(() => finalizeStage25LongFormRealMediaTrialV1(forged))
      .toThrow('STAGE25_LONG_FORM_REAL_MEDIA_MEDIA_SHA');
  });

  it('rejects shifted window coordinates, wrong decoded counts and false artifact accounting', () => {
    const shifted = validInput();
    (shifted.windows[1] as unknown as { startPts: string }).startPts = '1';
    expect(() => finalizeStage25LongFormRealMediaTrialV1(shifted))
      .toThrow('STAGE25_LONG_FORM_REAL_MEDIA_WINDOW_RANGE_INVALID');

    const decoded = validInput();
    (decoded.windows[0].video as unknown as { frameCount: number }).frameCount = 59;
    expect(() => finalizeStage25LongFormRealMediaTrialV1(decoded))
      .toThrow();

    const accounting = validInput();
    accounting.localArtifactCount -= 1;
    expect(() => finalizeStage25LongFormRealMediaTrialV1(accounting))
      .toThrow('STAGE25_LONG_FORM_REAL_MEDIA_TRIAL_COUNTS_INVALID');
  });

  it('keeps the operator local and free of provider/project authority', () => {
    const files = [
      'tests/editron/helpers/stage25-long-form-real-media-codec-v1.ts',
      'tests/editron/helpers/stage25-long-form-real-media-pts-v1.ts',
      'tests/editron/helpers/stage25-long-form-real-media-operator-v1.ts',
    ];
    const source = files.map((file) => readFileSync(path.join(process.cwd(), file), 'utf8')).join('\n');
    for (const forbidden of [
      'fetch(', 'generateContent(', 'ProjectService', 'PlanService', 'getDatabase(',
      'OPENAI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY',
    ]) expect(source, forbidden).not.toContain(forbidden);
  });

  it('normalizes local ffprobe PTS integers exactly like the production probe boundary', () => {
    expect(normalizeStage25LongFormProbeStreamsV1([{
      start_pts: 0,
      duration_ts: 486_000_515,
    }, {
      start_pts: -4_500,
      duration_ts: -1,
    }])).toEqual([{
      start_pts: '0',
      duration_ts: '486000515',
    }, {
      start_pts: '-4500',
      duration_ts: null,
    }]);
  });
});

function validInput(): Stage25LongFormRealMediaTrialInputV1 {
  const frameCount = 485_515;
  const starts = [900, Math.floor((frameCount - 60) / 2), frameCount - 960];
  const ids = ['START', 'MIDDLE', 'END'] as const;
  return {
    source: {
      commitSha: 'a'.repeat(40), treeSha: 'b'.repeat(40),
      relevantScopeSha256: 'c'.repeat(64), relevantTrackedFileCount: 1_900,
      relevantStatusEntries: [],
    },
    toolchain: { ffmpegIdentity: 'ffmpeg version 8.1', ffprobeIdentity: 'ffprobe version 8.1' },
    media: {
      artifact: artifact('long-form-source.mp4', '1', 68_000_000),
      sourceVersionSha256: '2'.repeat(64), technicalObservationSha256: '3'.repeat(64),
      mapBindingSha256: '4'.repeat(64), width: 160, height: 90,
      videoCodec: 'h264', audioCodec: 'aac', averageFrameRate: '30000/1001',
      sourceTimebase: '1/30000', sourceStartPts: '0',
      sourceEndExclusivePts: String(BigInt(frameCount) * BigInt(1001)),
      frameCount, uniformFrameDurationTicks: '1001', sampleRate: 48_000, channelCount: 2,
    },
    ptsIndex: {
      manifestContentSha256: '5'.repeat(64), verificationSha256: '6'.repeat(64),
      coverageSha256: '7'.repeat(64), batchCount: 10,
      verifiedFrameCount: String(frameCount), startPts: '0',
      endExclusivePts: String(BigInt(frameCount) * BigInt(1001)), cadence: 'CFR',
      peakRssBytes: 250_000_000,
    },
    windows: starts.map((start, index) => ({
      windowId: ids[index]!, priorityOrdinal: index as 0 | 1 | 2,
      startFrameOrdinal: String(start), endExclusiveFrameOrdinal: String(start + 60),
      startPts: String(BigInt(start) * BigInt(1001)),
      endExclusivePts: String(BigInt(start + 60) * BigInt(1001)),
      video: { ...artifact(`${ids[index]!.toLowerCase()}-window.mp4`, String(8 + index), 120_000),
        frameCount: 60 as const, width: 160 as const, height: 90 as const,
        videoCodec: 'h264' as const, audioCodec: 'aac' as const },
      still: artifact(`${ids[index]!.toLowerCase()}-still.png`, String(11 + index), 12_000),
      audio: { ...artifact(`${ids[index]!.toLowerCase()}-audio.wav`, String(14 + index), 385_000),
        sampleRate: 48_000 as const, channelCount: 2 as const, sampleCount: 96_096 },
    })),
    timings: { materializeMs: 160_000, ptsScanAndVerifyMs: 20_000, hydrateMs: 4_000 },
    localFixtureCodecCalls: 10, localArtifactCount: 21,
  };
}
function artifact(fileName: string, digit: string, byteLength: number) {
  return { fileName, sha256: digit.repeat(64).slice(0, 64), byteLength };
}
