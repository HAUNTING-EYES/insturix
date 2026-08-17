import { createHash } from 'node:crypto';

import type { NativeAudioEvidence } from '@/lib/editron/services/native-audio-evidence';
import { cutTimelineRange } from '@/lib/editron/services/timeline-range-cut';

import { hashCanonicalJsonV1 } from './contracts-v1';

const FPS = 30;
const SAMPLE_RATE = 48_000;
const DURATION_IN_FRAMES = 480;
const CUT_RANGE = { startFrame: 151, endFrame: 196 } as const;
const SPEECH_SOURCE_RANGES = [[60, 151], [196, 330]] as const;

type AudioStemV2 = 'BGM' | 'DIALOGUE';
type OverlayRecord = Record<string, unknown>;

export interface Dev01NativeProxyFixtureV2 {
  schemaVersion: 'EDITRON_OE_DEV01_NATIVE_PROXY_FIXTURE_V2';
  authority: 'RESEARCH_ONLY_NO_PROJECT_AUTHORITY';
  supersedes: {
    fixture: 'DEV01_V2_1A_MIXED_AUDIO_PROXY';
    reasons: readonly ['PRODUCT_REVEAL_FRAME_MISMATCH', 'DIALOGUE_AND_BGM_NOT_SEPARABLE'];
  };
  project: {
    projectId: 'oe-dev-01';
    projectRevision: 'R7';
    fps: 30;
    durationInFrames: 480;
    overlays: OverlayRecord[];
  };
  assets: {
    hostVideoAssetId: 'dev01-host-truth-v2';
    dialogueAssetId: 'dev01-dialogue-truth-v2';
    bgmAssetId: 'dev01-bgm-truth-v2';
  };
  evidence: {
    transcript: {
      evidenceId: 'EV-DEV01-T1';
      phraseRange: readonly [120, 151];
      deadAirRange: readonly [151, 196];
      speechSourceRanges: readonly [readonly [60, 151], readonly [196, 330]];
    };
    visual: {
      evidenceId: 'EV-DEV01-V1';
      sourceFrame: 205;
      normalizedBox: readonly [0.62, 0.24, 0.25, 0.52];
      normalizedFocalPoint: readonly [0.745, 0.5];
    };
    audio: {
      evidenceId: 'EV-DEV01-A1';
      dialogueAssetId: 'dev01-dialogue-truth-v2';
      bgmAssetId: 'dev01-bgm-truth-v2';
    };
  };
  expected: {
    cutRange: typeof CUT_RANGE;
    newDurationInFrames: 435;
    revealOutputFrame: 160;
    revealRightChildLocalFrame: 9;
    outputSpeechRanges: readonly [readonly [60, 151], readonly [151, 285]];
    scaleBounds: readonly [1, 1.12];
  };
  operatorContractAmendments: {
    cutSection: {
      outputFields: readonly ['receipt', 'timelineCoordinateTransform', 'splitChildren'];
      requiredFields: readonly ['receipt', 'timelineCoordinateTransform', 'splitChildren'];
    };
    applyAudioDucking: {
      storedState: 'overlay.styles.duckingConfig';
      rendererEffect: 'frame-time gain derived from bound speech evidence';
    };
  };
}

export interface Dev01TruthCutResultV2 {
  framesCut: number;
  newDurationInFrames: number;
  overlays: OverlayRecord[];
  timelineCoordinateTransform: {
    beforeRevision: 'R7';
    removedRange: typeof CUT_RANGE;
    mapRule: 'BEFORE_UNCHANGED_AFTER_SHIFT_LEFT_45_REMOVED_UNMAPPABLE';
  };
  splitChildren: Array<{
    beforeOverlayId: number;
    leftOverlayId: number;
    rightOverlayId: number;
    rightSourceStartFrame: number;
    rightTimelineStartFrame: number;
  }>;
}

export function getCanonicalDev01NativeProxyFixtureV2(): Dev01NativeProxyFixtureV2 {
  return structuredClone({
    schemaVersion: 'EDITRON_OE_DEV01_NATIVE_PROXY_FIXTURE_V2',
    authority: 'RESEARCH_ONLY_NO_PROJECT_AUTHORITY',
    supersedes: {
      fixture: 'DEV01_V2_1A_MIXED_AUDIO_PROXY',
      reasons: ['PRODUCT_REVEAL_FRAME_MISMATCH', 'DIALOGUE_AND_BGM_NOT_SEPARABLE'],
    },
    project: {
      projectId: 'oe-dev-01',
      projectRevision: 'R7',
      fps: FPS,
      durationInFrames: DURATION_IN_FRAMES,
      overlays: [
        { id: 101, type: 'video', assetId: 'dev01-host-truth-v2', row: 0, from: 0, durationInFrames: DURATION_IN_FRAMES, sourceStartFrame: 0, videoStartTime: 0 },
        {
          id: 102,
          type: 'sound',
          assetId: 'dev01-dialogue-truth-v2',
          row: 4,
          from: 0,
          durationInFrames: DURATION_IN_FRAMES,
          startFromSound: 0,
          metadata: {
            role: 'dialogue',
            nativeAudioEvidence: buildDev01DialogueSpeechEvidence(),
          },
        },
        { id: 103, type: 'sound', assetId: 'dev01-bgm-truth-v2', row: 5, from: 0, durationInFrames: DURATION_IN_FRAMES, startFromSound: 0, metadata: { role: 'background-music' } },
      ],
    },
    assets: {
      hostVideoAssetId: 'dev01-host-truth-v2',
      dialogueAssetId: 'dev01-dialogue-truth-v2',
      bgmAssetId: 'dev01-bgm-truth-v2',
    },
    evidence: {
      transcript: {
        evidenceId: 'EV-DEV01-T1',
        phraseRange: [120, 151],
        deadAirRange: [151, 196],
        speechSourceRanges: SPEECH_SOURCE_RANGES,
      },
      visual: {
        evidenceId: 'EV-DEV01-V1',
        sourceFrame: 205,
        normalizedBox: [0.62, 0.24, 0.25, 0.52],
        normalizedFocalPoint: [0.745, 0.5],
      },
      audio: {
        evidenceId: 'EV-DEV01-A1',
        dialogueAssetId: 'dev01-dialogue-truth-v2',
        bgmAssetId: 'dev01-bgm-truth-v2',
      },
    },
    expected: {
      cutRange: CUT_RANGE,
      newDurationInFrames: 435,
      revealOutputFrame: 160,
      revealRightChildLocalFrame: 9,
      outputSpeechRanges: [[60, 151], [151, 285]],
      scaleBounds: [1, 1.12],
    },
    operatorContractAmendments: {
      cutSection: {
        outputFields: ['receipt', 'timelineCoordinateTransform', 'splitChildren'],
        requiredFields: ['receipt', 'timelineCoordinateTransform', 'splitChildren'],
      },
      applyAudioDucking: {
        storedState: 'overlay.styles.duckingConfig',
        rendererEffect: 'frame-time gain derived from bound speech evidence',
      },
    },
  });
}

export function hashCanonicalDev01NativeProxyFixtureV2(): string {
  return hashCanonicalJsonV1(getCanonicalDev01NativeProxyFixtureV2());
}

export function executeDev01TruthCutV2(): Dev01TruthCutResultV2 {
  const fixture = getCanonicalDev01NativeProxyFixtureV2();
  const cut = cutTimelineRange({
    overlays: fixture.project.overlays,
    ...CUT_RANGE,
    fps: fixture.project.fps,
    durationInFrames: fixture.project.durationInFrames,
  });
  const hostRight = requireOverlay(cut.overlays, 'dev01-host-truth-v2', 'sourceStartFrame', 196);
  const dialogueRight = requireOverlay(cut.overlays, 'dev01-dialogue-truth-v2', 'startFromSound', 196);
  return {
    framesCut: cut.framesCut,
    newDurationInFrames: cut.newDurationInFrames,
    overlays: cut.overlays,
    timelineCoordinateTransform: {
      beforeRevision: 'R7',
      removedRange: CUT_RANGE,
      mapRule: 'BEFORE_UNCHANGED_AFTER_SHIFT_LEFT_45_REMOVED_UNMAPPABLE',
    },
    splitChildren: [
      splitChild(101, hostRight),
      splitChild(102, dialogueRight),
    ],
  };
}

export function mapDev01SourceTimelineFrameV2(frame: number): number | null {
  if (!Number.isInteger(frame) || frame < 0 || frame >= DURATION_IN_FRAMES) {
    throw new RangeError(`Invalid DEV-01 source timeline frame: ${frame}`);
  }
  if (frame < CUT_RANGE.startFrame) return frame;
  if (frame >= CUT_RANGE.endFrame) return frame - (CUT_RANGE.endFrame - CUT_RANGE.startFrame);
  return null;
}

export function mapDev01SourceTimelineRangeV2(
  range: readonly [number, number],
): readonly [number, number] {
  const [startFrame, endFrame] = range;
  if (!Number.isInteger(startFrame) || !Number.isInteger(endFrame)
    || startFrame < 0 || endFrame <= startFrame || endFrame > DURATION_IN_FRAMES) {
    throw new RangeError(`Invalid DEV-01 source timeline range: ${startFrame}-${endFrame}`);
  }
  if (endFrame <= CUT_RANGE.startFrame) return [startFrame, endFrame];
  if (startFrame >= CUT_RANGE.endFrame) {
    const shift = CUT_RANGE.endFrame - CUT_RANGE.startFrame;
    return [startFrame - shift, endFrame - shift];
  }
  throw new RangeError(`DEV01_SOURCE_RANGE_INTERSECTS_REMOVED_TIME:${startFrame}-${endFrame}`);
}

export function renderDev01TruthfulFrameV2(frame: number, width: number, height: number): Buffer {
  if (!Number.isInteger(frame) || frame < 0 || frame >= DURATION_IN_FRAMES) throw new RangeError('frame is outside DEV-01 source');
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) throw new RangeError('dimensions must be positive integers');
  const rgb = Buffer.alloc(width * height * 3);
  fillRgb(rgb, 18, 24, 38);
  drawRect(rgb, width, height, 0.16, 0.39, 0.20, 0.46, [38, 110, 178]);
  if (frame >= 205) drawRect(rgb, width, height, 0.62, 0.24, 0.25, 0.52, [247, 187, 52]);
  return rgb;
}

export function synthesizeDev01StemPcm16V2(stem: AudioStemV2): Buffer {
  const sampleCount = Math.round((DURATION_IN_FRAMES / FPS) * SAMPLE_RATE);
  const pcm = Buffer.alloc(sampleCount * 2);
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const time = sample / SAMPLE_RATE;
    const frame = time * FPS;
    const speaking = (frame >= 60 && frame < 151) || (frame >= 196 && frame < 330);
    const value = stem === 'BGM'
      ? 0.12 * Math.sin(2 * Math.PI * 220 * time) + 0.05 * Math.sin(2 * Math.PI * 330 * time)
      : speaking
        ? 0.14 * Math.sin(2 * Math.PI * (105 + 12 * Math.sin(2 * Math.PI * 3 * time)) * time)
        : 0;
    pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, value)) * 32_767), sample * 2);
  }
  return pcm;
}

export function sha256Dev01FixtureBytesV2(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function buildDev01DialogueSpeechEvidence(): NativeAudioEvidence {
  return {
    evidenceId: 'EV-DEV01-T1',
    sourceAssetId: 'dev01-dialogue-truth-v2',
    sourceVersion: 'DEV01_NATIVE_PROXY_FIXTURE_V2',
    hasNativeAudio: true,
    hasSpeech: true,
    source: 'transcription',
    wordCount: 2,
    speechCoverage: 225 / DURATION_IN_FRAMES,
    speechRegions: SPEECH_SOURCE_RANGES.map(([sourceStartFrame, sourceEndFrame]) => ({
      sourceStartFrame,
      sourceEndFrame,
      startMs: (sourceStartFrame / FPS) * 1000,
      endMs: (sourceEndFrame / FPS) * 1000,
    })),
    regionCount: SPEECH_SOURCE_RANGES.length,
  };
}

function requireOverlay(overlays: OverlayRecord[], assetId: string, coordinate: string, expected: number): OverlayRecord {
  const overlay = overlays.find((candidate) => candidate.assetId === assetId && candidate[coordinate] === expected);
  if (!overlay) throw new Error(`DEV01_TRUTH_FIXTURE_MAPPING_MISSING:${assetId}:${coordinate}:${expected}`);
  return overlay;
}

function splitChild(beforeOverlayId: number, right: OverlayRecord): Dev01TruthCutResultV2['splitChildren'][number] {
  const rightOverlayId = Number(right.id);
  const rightSourceStartFrame = Number(right.sourceStartFrame ?? right.startFromSound);
  const rightTimelineStartFrame = Number(right.from);
  if (![rightOverlayId, rightSourceStartFrame, rightTimelineStartFrame].every(Number.isInteger)) {
    throw new Error(`DEV01_TRUTH_FIXTURE_INVALID_SPLIT:${beforeOverlayId}`);
  }
  return { beforeOverlayId, leftOverlayId: beforeOverlayId, rightOverlayId, rightSourceStartFrame, rightTimelineStartFrame };
}

function fillRgb(buffer: Buffer, red: number, green: number, blue: number): void {
  for (let offset = 0; offset < buffer.length; offset += 3) {
    buffer[offset] = red; buffer[offset + 1] = green; buffer[offset + 2] = blue;
  }
}

function drawRect(buffer: Buffer, width: number, height: number, x: number, y: number, w: number, h: number, color: readonly [number, number, number]): void {
  const left = Math.max(0, Math.floor(x * width));
  const right = Math.min(width, Math.ceil((x + w) * width));
  const top = Math.max(0, Math.floor(y * height));
  const bottom = Math.min(height, Math.ceil((y + h) * height));
  for (let row = top; row < bottom; row += 1) {
    for (let column = left; column < right; column += 1) {
      const offset = (row * width + column) * 3;
      buffer[offset] = color[0]; buffer[offset + 1] = color[1]; buffer[offset + 2] = color[2];
    }
  }
}
