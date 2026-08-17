import { readFile } from 'node:fs/promises';

import { beforeAll, describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  assertDev03BeatAnalysisSufficientV2,
  buildCanonicalDev03BeatWithheldEvidenceV2,
  buildCanonicalDev03MeasuredEvidenceV2,
  Dev03EvidenceErrorV2,
  type Dev03MeasuredEvidenceReceiptV2,
} from '@/lib/editron/research/open-ended-planner/dev03-measured-evidence-v2';
import type { BeatAnalysis } from '@/lib/editron/services/media/types';

const AUDIO_PATH = '.calibration-temp/open-ended-planner-v2/development-media/dev03-beats.wav';
const ANALYZER_PATH = 'lib/editron/services/media/beat-detection-service.ts';

let audioBytes: Buffer;
let analyzerSourceBytes: Buffer;
let receipt: Readonly<Dev03MeasuredEvidenceReceiptV2>;

beforeAll(async () => {
  [audioBytes, analyzerSourceBytes] = await Promise.all([
    readFile(AUDIO_PATH),
    readFile(ANALYZER_PATH),
  ]);
  receipt = await buildCanonicalDev03MeasuredEvidenceV2({ audioBytes, analyzerSourceBytes });
});

describe('open-ended planner V2 DEV-03 measured evidence', () => {
  it('derives the issued beat evidence from exact decoded bytes and freezes its provenance', () => {
    expect(receipt).toMatchObject({
      artifactType: 'MeasuredEvidenceReceiptV2',
      taskId: 'DEV-03',
      conditionId: 'BASELINE',
      stageDisposition: 'READY_FOR_EVIDENCE_BINDING',
      projectBinding: { projectId: 'oe-dev-03', expectedProjectRevision: 'R11' },
      sourceBinding: {
        assetId: 'dev03-beats',
        artifactSha256: '62b685b0c90aeabe87bc695dfd7b0881386f2872b8fccd9020318056745ed3aa',
        byteLength: 1_920_044,
      },
      decodedAudio: { sampleRate: 48_000, channelCount: 1, sampleCount: 960_000, durationMs: 20_000 },
      analysis: { bpm: 120, bpmConfidence: 1, rawOnsetCount: 41, beatCount: 40, energyPeakCount: 20 },
    });
    expect(receipt.analyzerBinding).toMatchObject({
      implementationSha256: 'f1ad12eb6d3830c2f0fa25c4b58b4f59a9600cedbe9907861548e9b7f836d9eb',
      optionsHash: 'ed10924cb130bc89f5b726d750cbec1de926b08cd41dacee5856dc72948b50eb',
    });
    expect(hashCanonicalJsonV1(receipt)).toBe('dfe00f0f8fa03e2a8ab6fe9c909233ece8daa7a92b7efe0cc5c06b330f6bbb94');
    expect(Object.isFrozen(receipt)).toBe(true);
    expect(Object.isFrozen(receipt.analysis.strongPeaks)).toBe(true);
  });

  it('records the measured 119/239/359/479 strong peaks instead of the authored 120-frame recipe', () => {
    expect(receipt.analysis.strongPeaks).toEqual([
      { timeMs: 3_975, magnitude: 1, projectFrame: 119 },
      { timeMs: 7_975, magnitude: 1, projectFrame: 239 },
      { timeMs: 11_975, magnitude: 1, projectFrame: 359 },
      { timeMs: 15_975, magnitude: 1, projectFrame: 479 },
    ]);
    expect(receipt.analysis.finalStrongPeakFrame).toBe(479);
    expect(receipt.analysis.strongPeaks.map(({ projectFrame }) => projectFrame)).not.toContain(480);
    expect(receipt.analysis.beatFrames.at(-1)).toBe(599);
  });

  it('states the protected-range proof honestly without claiming intelligible dialogue', () => {
    expect(receipt.protectedAudioRange).toEqual({
      evidenceId: 'EV-DEV03-D1',
      coordinateDomain: 'PROJECT_TICK',
      range: [250, 350],
      proofClaim: 'PRESERVE_AUDIO_RANGE_BYTES_AND_TIMING',
    });
    expect(receipt.limitations).toEqual(['SYNTHETIC_TONAL_RANGE_NOT_INTELLIGIBLE_DIALOGUE']);
  });

  it('makes the withheld condition unexecutable before compilation or rendering', () => {
    const withheld = buildCanonicalDev03BeatWithheldEvidenceV2();
    expect(withheld).toEqual({
      artifactType: 'MeasuredEvidenceReceiptV2',
      schemaVersion: 'EDITRON_OE_DEV03_MEASURED_EVIDENCE_V2',
      taskId: 'DEV-03',
      conditionId: 'BEAT_EVIDENCE_WITHHELD',
      authority: 'HASH_BOUND_SYNTHETIC_BENCHMARK_EVIDENCE_ONLY_NO_PROJECT_MUTATION',
      stageDisposition: 'UNVERIFIABLE',
      visibleEvidenceIds: ['EV-DEV03-D1', 'EV-DEV03-T1'],
      missingEvidenceIds: ['EV-DEV03-B1'],
      failureDisposition: 'STOP_BEFORE_COMPILATION_OR_RENDER',
    });
    expect(Object.isFrozen(withheld)).toBe(true);
  });

  it('rejects missing or changed source bytes before analysis', async () => {
    await expectEvidenceCode(
      buildCanonicalDev03MeasuredEvidenceV2({ audioBytes: new Uint8Array(), analyzerSourceBytes }),
      'DEV03_AUDIO_BYTES_MISSING',
    );
    const changedAudio = Buffer.from(audioBytes);
    changedAudio[changedAudio.length - 1] ^= 1;
    await expectEvidenceCode(
      buildCanonicalDev03MeasuredEvidenceV2({ audioBytes: changedAudio, analyzerSourceBytes }),
      'DEV03_AUDIO_HASH_DRIFT',
    );
    const changedAnalyzer = Buffer.from(analyzerSourceBytes);
    changedAnalyzer[0] ^= 1;
    await expectEvidenceCode(
      buildCanonicalDev03MeasuredEvidenceV2({ audioBytes, analyzerSourceBytes: changedAnalyzer }),
      'DEV03_ANALYZER_HASH_DRIFT',
    );
  });

  it('rejects zero-confidence or weak-peak analyses instead of substituting 120 BPM', () => {
    expectEvidenceCodeSync(
      () => assertDev03BeatAnalysisSufficientV2(analysis({ bpm: 120, bpmConfidence: 0 })),
      'DEV03_BEAT_EVIDENCE_INSUFFICIENT',
    );
    expectEvidenceCodeSync(
      () => assertDev03BeatAnalysisSufficientV2(analysis({
        energyPeaks: [
          { timeMs: 1_000, magnitude: 1 },
          { timeMs: 2_000, magnitude: 0.5 },
          { timeMs: 3_000, magnitude: 0.5 },
          { timeMs: 4_000, magnitude: 0.5 },
        ],
      })),
      'DEV03_STRONG_PEAK_EVIDENCE_INSUFFICIENT',
    );
  });

  it('replays deterministically from the same media and analyzer bytes', async () => {
    const replay = await buildCanonicalDev03MeasuredEvidenceV2({ audioBytes, analyzerSourceBytes });
    expect(hashCanonicalJsonV1(replay)).toBe(hashCanonicalJsonV1(receipt));
    expect(replay).toEqual(receipt);
  });
});

function analysis(overrides: Partial<BeatAnalysis>): BeatAnalysis {
  const beats = [1_000, 2_000, 3_000, 4_000].map((timeMs, index) => ({ timeMs, strength: 1, isDownbeat: index === 0 }));
  return {
    beats, bpm: 120, bpmConfidence: 1, durationMs: 5_000, timeSignatureNumerator: 4,
    rawOnsets: beats.map(({ timeMs, strength }) => ({ timeMs, strength })),
    energyPeaks: beats.map(({ timeMs }) => ({ timeMs, magnitude: 1 })),
    ...overrides,
  };
}

async function expectEvidenceCode(promise: Promise<unknown>, expected: Dev03EvidenceErrorV2['code']): Promise<void> {
  await expect(promise).rejects.toMatchObject({ name: 'Dev03EvidenceErrorV2', code: expected });
}

function expectEvidenceCodeSync(run: () => void, expected: Dev03EvidenceErrorV2['code']): void {
  try { run(); } catch (error) {
    expect(error).toBeInstanceOf(Dev03EvidenceErrorV2);
    expect((error as Dev03EvidenceErrorV2).code).toBe(expected);
    return;
  }
  throw new Error(`Expected ${expected}`);
}
