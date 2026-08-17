import { createHash } from 'node:crypto';

import { analyzeBeatsFull } from '@/lib/editron/services/media/beat-detection-service';
import type { BeatAnalysis, BeatDetectionOptions } from '@/lib/editron/services/media/types';

import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';

const AUDIO_SHA256 = '62b685b0c90aeabe87bc695dfd7b0881386f2872b8fccd9020318056745ed3aa';
const ANALYZER_SHA256 = 'f1ad12eb6d3830c2f0fa25c4b58b4f59a9600cedbe9907861548e9b7f836d9eb';
const PROJECT_FRAMES = 600;
const SAMPLE_RATE = 48_000;
const SAMPLE_COUNT = 960_000;
const FPS = 30;
const STRONG_PEAK_RELATIVE_FLOOR = 0.99;
const MINIMUM_STRONG_PEAKS = 4;
const MINIMUM_BPM_CONFIDENCE = 0.8;

export const DEV03_BEAT_ANALYSIS_OPTIONS_V2: Readonly<Required<BeatDetectionOptions>> = deepFreezeV1({
  fftSize: 2_048,
  hopSize: 512,
  minBPM: 40,
  maxBPM: 240,
  timeSignature: 4,
  topEnergyPeaks: 20,
  energySnapToleranceMs: 50,
});

export type Dev03EvidenceErrorCodeV2 =
  | 'DEV03_AUDIO_BYTES_MISSING'
  | 'DEV03_AUDIO_HASH_DRIFT'
  | 'DEV03_ANALYZER_HASH_DRIFT'
  | 'DEV03_AUDIO_CONTAINER_INVALID'
  | 'DEV03_AUDIO_DECODE_FAILED'
  | 'DEV03_DECODED_AUDIO_DRIFT'
  | 'DEV03_BEAT_EVIDENCE_INSUFFICIENT'
  | 'DEV03_STRONG_PEAK_EVIDENCE_INSUFFICIENT';

export class Dev03EvidenceErrorV2 extends Error {
  constructor(readonly code: Dev03EvidenceErrorCodeV2, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'Dev03EvidenceErrorV2';
  }
}

export interface Dev03MeasuredEvidenceReceiptV2 {
  artifactType: 'MeasuredEvidenceReceiptV2';
  schemaVersion: 'EDITRON_OE_DEV03_MEASURED_EVIDENCE_V2';
  taskId: 'DEV-03';
  conditionId: 'BASELINE';
  authority: 'HASH_BOUND_SYNTHETIC_BENCHMARK_EVIDENCE_ONLY_NO_PROJECT_MUTATION';
  stageDisposition: 'READY_FOR_EVIDENCE_BINDING';
  projectBinding: { projectId: 'oe-dev-03'; expectedProjectRevision: 'R11' };
  projectTimebase: {
    coordinateDomain: 'PROJECT_TICK';
    rate: { numerator: '30'; denominator: '1' };
    duration: { start: '0'; endExclusive: '600' };
  };
  sourceBinding: {
    evidenceId: 'EV-DEV03-B1';
    assetId: 'dev03-beats';
    artifactSha256: string;
    byteLength: number;
    container: 'WAV';
    sampleFormat: 'PCM_S16LE';
  };
  analyzerBinding: {
    implementation: 'lib/editron/services/media/beat-detection-service.ts#analyzeBeatsFull';
    implementationSha256: string;
    options: Readonly<Required<BeatDetectionOptions>>;
    optionsHash: string;
  };
  decodedAudio: {
    sampleRate: number;
    channelCount: number;
    sampleCount: number;
    durationMs: number;
  };
  analysis: {
    bpm: number;
    bpmConfidence: number;
    rawOnsetCount: number;
    rawOnsetsHash: string;
    beatCount: number;
    beatFrames: number[];
    downbeatFrames: number[];
    energyPeakCount: number;
    energyPeaksHash: string;
    strongPeakPolicy: {
      policyId: 'RELATIVE_TO_MAX_MAGNITUDE_V1';
      relativeFloor: number;
      minimumPeakCount: number;
      frameRounding: 'NEAREST_PROJECT_TICK';
    };
    strongPeaks: Array<{ timeMs: number; magnitude: number; projectFrame: number }>;
    finalStrongPeakFrame: number;
  };
  protectedAudioRange: {
    evidenceId: 'EV-DEV03-D1';
    coordinateDomain: 'PROJECT_TICK';
    range: readonly [250, 350];
    proofClaim: 'PRESERVE_AUDIO_RANGE_BYTES_AND_TIMING';
  };
  limitations: readonly ['SYNTHETIC_TONAL_RANGE_NOT_INTELLIGIBLE_DIALOGUE'];
}

export interface Dev03WithheldEvidenceReceiptV2 {
  artifactType: 'MeasuredEvidenceReceiptV2';
  schemaVersion: 'EDITRON_OE_DEV03_MEASURED_EVIDENCE_V2';
  taskId: 'DEV-03';
  conditionId: 'BEAT_EVIDENCE_WITHHELD';
  authority: 'HASH_BOUND_SYNTHETIC_BENCHMARK_EVIDENCE_ONLY_NO_PROJECT_MUTATION';
  stageDisposition: 'UNVERIFIABLE';
  visibleEvidenceIds: readonly ['EV-DEV03-D1', 'EV-DEV03-T1'];
  missingEvidenceIds: readonly ['EV-DEV03-B1'];
  failureDisposition: 'STOP_BEFORE_COMPILATION_OR_RENDER';
}

export async function buildCanonicalDev03MeasuredEvidenceV2(input: {
  audioBytes: Uint8Array;
  analyzerSourceBytes: Uint8Array;
}): Promise<Readonly<Dev03MeasuredEvidenceReceiptV2>> {
  requireBytes(input.audioBytes, 'DEV03_AUDIO_BYTES_MISSING');
  requireBytes(input.analyzerSourceBytes, 'DEV03_ANALYZER_HASH_DRIFT');
  const artifactSha256 = sha256Bytes(input.audioBytes);
  if (artifactSha256 !== AUDIO_SHA256) {
    throw new Dev03EvidenceErrorV2('DEV03_AUDIO_HASH_DRIFT', 'DEV-03 audio bytes do not match the issued fixture');
  }
  const implementationSha256 = sha256Bytes(input.analyzerSourceBytes);
  if (implementationSha256 !== ANALYZER_SHA256) {
    throw new Dev03EvidenceErrorV2('DEV03_ANALYZER_HASH_DRIFT', 'DEV-03 analyzer source does not match the issued implementation');
  }
  const header = parseIssuedPcmWav(input.audioBytes);
  let decoded: { sampleRate?: number; channelData?: Float32Array[] };
  try {
    const decode = (await import('audio-decode')).default;
    decoded = await decode(exactArrayBuffer(input.audioBytes));
  } catch (error) {
    throw new Dev03EvidenceErrorV2('DEV03_AUDIO_DECODE_FAILED', 'DEV-03 audio could not be decoded', { cause: error });
  }
  const channels = Array.isArray(decoded.channelData) ? decoded.channelData : [];
  const primary = channels[0];
  if (decoded.sampleRate !== SAMPLE_RATE || channels.length !== 1 || !(primary instanceof Float32Array)
    || primary.length !== SAMPLE_COUNT || header.sampleCount !== SAMPLE_COUNT) {
    throw new Dev03EvidenceErrorV2('DEV03_DECODED_AUDIO_DRIFT', 'DEV-03 decoded PCM properties drifted from the issued fixture');
  }
  const analysis = await analyzeBeatsFull({
    sampleRate: decoded.sampleRate,
    length: primary.length,
    numberOfChannels: channels.length,
    getChannelData: (channel) => channels[channel] ?? primary,
    duration: primary.length / decoded.sampleRate,
  }, DEV03_BEAT_ANALYSIS_OPTIONS_V2);
  return buildReceipt(artifactSha256, implementationSha256, input.audioBytes.byteLength, channels, analysis);
}

export function buildCanonicalDev03BeatWithheldEvidenceV2(): Readonly<Dev03WithheldEvidenceReceiptV2> {
  return deepFreezeV1({
    artifactType: 'MeasuredEvidenceReceiptV2', schemaVersion: 'EDITRON_OE_DEV03_MEASURED_EVIDENCE_V2',
    taskId: 'DEV-03', conditionId: 'BEAT_EVIDENCE_WITHHELD',
    authority: 'HASH_BOUND_SYNTHETIC_BENCHMARK_EVIDENCE_ONLY_NO_PROJECT_MUTATION', stageDisposition: 'UNVERIFIABLE',
    visibleEvidenceIds: ['EV-DEV03-D1', 'EV-DEV03-T1'], missingEvidenceIds: ['EV-DEV03-B1'],
    failureDisposition: 'STOP_BEFORE_COMPILATION_OR_RENDER',
  });
}

export function assertDev03BeatAnalysisSufficientV2(analysis: BeatAnalysis): void {
  if (!Number.isFinite(analysis.bpm) || analysis.bpm <= 0
    || !Number.isFinite(analysis.bpmConfidence) || analysis.bpmConfidence < MINIMUM_BPM_CONFIDENCE
    || analysis.rawOnsets.length < MINIMUM_STRONG_PEAKS || analysis.beats.length < MINIMUM_STRONG_PEAKS) {
    throw new Dev03EvidenceErrorV2('DEV03_BEAT_EVIDENCE_INSUFFICIENT', 'DEV-03 requires confident onset-derived beat evidence');
  }
  const maxMagnitude = Math.max(0, ...analysis.energyPeaks.map(({ magnitude }) => magnitude));
  const strong = analysis.energyPeaks.filter(({ magnitude }) => magnitude >= maxMagnitude * STRONG_PEAK_RELATIVE_FLOOR);
  if (maxMagnitude <= 0 || strong.length < MINIMUM_STRONG_PEAKS) {
    throw new Dev03EvidenceErrorV2('DEV03_STRONG_PEAK_EVIDENCE_INSUFFICIENT', 'DEV-03 requires at least four measured strongest peaks');
  }
}

function buildReceipt(artifactSha256: string, implementationSha256: string, byteLength: number, channels: Float32Array[], analysis: BeatAnalysis): Readonly<Dev03MeasuredEvidenceReceiptV2> {
  assertDev03BeatAnalysisSufficientV2(analysis);
  const maxMagnitude = Math.max(...analysis.energyPeaks.map(({ magnitude }) => magnitude));
  const strongPeaks = analysis.energyPeaks
    .filter(({ magnitude }) => magnitude >= maxMagnitude * STRONG_PEAK_RELATIVE_FLOOR)
    .map(({ timeMs, magnitude }) => ({ timeMs, magnitude, projectFrame: millisecondsToProjectFrame(timeMs) }))
    .sort((left, right) => left.timeMs - right.timeMs);
  const beatFrames = analysis.beats.map(({ timeMs }) => millisecondsToProjectFrame(timeMs));
  if (beatFrames.some((frame, index) => frame < 0 || frame >= PROJECT_FRAMES || (index > 0 && frame <= beatFrames[index - 1]))) {
    throw new Dev03EvidenceErrorV2('DEV03_BEAT_EVIDENCE_INSUFFICIENT', 'DEV-03 measured beat frames are not a valid ordered project grid');
  }
  return deepFreezeV1({
    artifactType: 'MeasuredEvidenceReceiptV2', schemaVersion: 'EDITRON_OE_DEV03_MEASURED_EVIDENCE_V2',
    taskId: 'DEV-03', conditionId: 'BASELINE', authority: 'HASH_BOUND_SYNTHETIC_BENCHMARK_EVIDENCE_ONLY_NO_PROJECT_MUTATION',
    stageDisposition: 'READY_FOR_EVIDENCE_BINDING', projectBinding: { projectId: 'oe-dev-03', expectedProjectRevision: 'R11' },
    projectTimebase: { coordinateDomain: 'PROJECT_TICK', rate: { numerator: '30', denominator: '1' }, duration: { start: '0', endExclusive: '600' } },
    sourceBinding: { evidenceId: 'EV-DEV03-B1', assetId: 'dev03-beats', artifactSha256, byteLength, container: 'WAV', sampleFormat: 'PCM_S16LE' },
    analyzerBinding: { implementation: 'lib/editron/services/media/beat-detection-service.ts#analyzeBeatsFull', implementationSha256, options: DEV03_BEAT_ANALYSIS_OPTIONS_V2, optionsHash: hashCanonicalJsonV1(DEV03_BEAT_ANALYSIS_OPTIONS_V2) },
    decodedAudio: { sampleRate: SAMPLE_RATE, channelCount: channels.length, sampleCount: channels[0].length, durationMs: analysis.durationMs },
    analysis: {
      bpm: analysis.bpm, bpmConfidence: analysis.bpmConfidence, rawOnsetCount: analysis.rawOnsets.length,
      rawOnsetsHash: hashCanonicalJsonV1(analysis.rawOnsets), beatCount: analysis.beats.length, beatFrames,
      downbeatFrames: analysis.beats.filter(({ isDownbeat }) => isDownbeat).map(({ timeMs }) => millisecondsToProjectFrame(timeMs)),
      energyPeakCount: analysis.energyPeaks.length, energyPeaksHash: hashCanonicalJsonV1(analysis.energyPeaks),
      strongPeakPolicy: { policyId: 'RELATIVE_TO_MAX_MAGNITUDE_V1', relativeFloor: STRONG_PEAK_RELATIVE_FLOOR, minimumPeakCount: MINIMUM_STRONG_PEAKS, frameRounding: 'NEAREST_PROJECT_TICK' },
      strongPeaks, finalStrongPeakFrame: strongPeaks.at(-1)?.projectFrame ?? -1,
    },
    protectedAudioRange: { evidenceId: 'EV-DEV03-D1', coordinateDomain: 'PROJECT_TICK', range: [250, 350], proofClaim: 'PRESERVE_AUDIO_RANGE_BYTES_AND_TIMING' },
    limitations: ['SYNTHETIC_TONAL_RANGE_NOT_INTELLIGIBLE_DIALOGUE'],
  });
}

function parseIssuedPcmWav(bytes: Uint8Array): { sampleCount: number } {
  if (bytes.byteLength < 44) throw new Dev03EvidenceErrorV2('DEV03_AUDIO_CONTAINER_INVALID', 'DEV-03 WAV header is missing');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (offset: number, length: number) => String.fromCharCode(...bytes.subarray(offset, offset + length));
  const channels = view.getUint16(22, true); const sampleRate = view.getUint32(24, true); const bits = view.getUint16(34, true);
  const dataBytes = view.getUint32(40, true); const bytesPerSample = bits / 8;
  if (text(0, 4) !== 'RIFF' || text(8, 8) !== 'WAVEfmt ' || text(36, 4) !== 'data'
    || view.getUint16(20, true) !== 1 || channels !== 1 || sampleRate !== SAMPLE_RATE || bits !== 16
    || dataBytes !== bytes.byteLength - 44) {
    throw new Dev03EvidenceErrorV2('DEV03_AUDIO_CONTAINER_INVALID', 'DEV-03 WAV structure drifted from PCM S16LE mono');
  }
  return { sampleCount: dataBytes / (channels * bytesPerSample) };
}

function requireBytes(value: Uint8Array, code: Dev03EvidenceErrorCodeV2): void {
  if (!(value instanceof Uint8Array) || value.byteLength === 0) throw new Dev03EvidenceErrorV2(code, 'Required DEV-03 evidence bytes are missing');
}
function exactArrayBuffer(bytes: Uint8Array): ArrayBuffer { return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer; }
function millisecondsToProjectFrame(timeMs: number): number { return Math.round((timeMs / 1_000) * FPS); }
function sha256Bytes(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }
