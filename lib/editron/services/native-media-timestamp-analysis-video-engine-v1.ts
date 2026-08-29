import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  assertNativeMediaTimestampAnalysisRequestV1,
  createNativeMediaTimestampAnalysisEngineOutputV1,
  type NativeMediaTimestampAnalysisEngineObservationV1,
  type NativeMediaTimestampAnalysisEnginePortV1,
} from './native-media-timestamp-analysis-contract-v1';
import { getFFmpegPath } from './media/ffmpeg-runtime';

export const NATIVE_MEDIA_TIMESTAMP_LEGACY_VIDEO_ANALYSIS_ENGINE_VERSION_V1 =
  'EDITRON_NATIVE_TIMESTAMP_LEGACY_VIDEO_1FPS_640_SQUARE_V1' as const;

const TEMP_PREFIX = 'editron-native-analysis-v1-';
const MAX_TIMEOUT_MS = 10 * 60 * 1_000;
const MAX_DIAGNOSTIC_BYTES = 1024 * 1024;

type LegacyVideoAnalysisResultV1 = Readonly<{
  sceneChanges: number[];
  deadVisualRanges: Array<[number, number]>;
  gestures: string[];
  onScreenText: string[];
  summary: string;
  theme: string;
}>;

export function createNativeMediaTimestampLegacyVideoAnalysisEngineV1(
  options: Readonly<{
    ffmpegPath?: string;
    timeoutMs?: number;
    analyzeVideo?: (input: Readonly<{ filePath: string; prompt: string }>) => Promise<LegacyVideoAnalysisResultV1>;
  }> = {},
): NativeMediaTimestampAnalysisEnginePortV1 {
  const ffmpegPath = options.ffmpegPath ?? getFFmpegPath();
  const timeoutMs = options.timeoutMs ?? MAX_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) {
    throw new Error('NATIVE_MEDIA_TIMESTAMP_ANALYSIS_ENGINE_POLICY_INVALID');
  }
  const analyzeVideo = options.analyzeVideo ?? (async (input) => {
    const { sendVideoToGemini } = await import('./media/analysis-service');
    return sendVideoToGemini(input);
  });
  return {
    async analyze(value) {
      const request = assertNativeMediaTimestampAnalysisRequestV1(value);
      const directory = await mkdtemp(path.join(tmpdir(), TEMP_PREFIX));
      try {
        for (const frame of request.frames) {
          const fileName = `frame-${String(frame.sampleIndex).padStart(6, '0')}.png`;
          await writeFile(path.join(directory, fileName), Buffer.from(frame.pngBase64, 'base64'), {
            flag: 'wx',
          });
        }
        const sampledVideoPath = path.join(directory, 'sampled.mp4');
        await executeFfmpeg(ffmpegPath, [
          '-hide_banner', '-loglevel', 'error', '-nostdin',
          '-framerate', '1', '-start_number', '0',
          '-i', path.join(directory, 'frame-%06d.png'),
          '-an', '-sn', '-dn',
          '-vf', 'scale=640:640:force_original_aspect_ratio=decrease,pad=640:640:(ow-iw)/2:(oh-ih)/2:black,format=yuv420p',
          '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
          '-r', '1', '-movflags', '+faststart', '-y', sampledVideoPath,
        ], timeoutMs);
        let result: LegacyVideoAnalysisResultV1;
        try {
          result = await analyzeVideo({ filePath: sampledVideoPath, prompt: '' });
        } catch {
          throw new Error('NATIVE_MEDIA_TIMESTAMP_ANALYSIS_ENGINE_FAILED');
        }
        const observations = normalizeLegacyResult(result, request.frames.length);
        return createNativeMediaTimestampAnalysisEngineOutputV1({
          engineVersion: NATIVE_MEDIA_TIMESTAMP_LEGACY_VIDEO_ANALYSIS_ENGINE_VERSION_V1,
          analysisRequestSha256: request.analysisRequestSha256,
          frameCount: request.frames.length,
          observations,
        });
      } finally {
        await removeOwnedTemporaryDirectory(directory);
      }
    },
  };
}

function normalizeLegacyResult(
  value: LegacyVideoAnalysisResultV1,
  frameCount: number,
): readonly NativeMediaTimestampAnalysisEngineObservationV1[] {
  if (!value || typeof value !== 'object'
    || !Array.isArray(value.sceneChanges) || !Array.isArray(value.deadVisualRanges)
    || !Array.isArray(value.gestures) || !Array.isArray(value.onScreenText)) {
    throw new Error('NATIVE_MEDIA_TIMESTAMP_ANALYSIS_ENGINE_RESULT_INVALID');
  }
  const observations: NativeMediaTimestampAnalysisEngineObservationV1[] = [];
  for (const candidate of value.sceneChanges) {
    observations.push({
      kind: 'POINT', sampleIndex: sampleIndex(candidate, frameCount),
      signal: 'SCENE_CHANGE', detail: 'Legacy video analyzer scene-change observation',
    });
  }
  for (const candidate of value.deadVisualRanges) {
    if (!Array.isArray(candidate) || candidate.length !== 2) {
      throw new Error('NATIVE_MEDIA_TIMESTAMP_ANALYSIS_ENGINE_RESULT_INVALID');
    }
    const startSampleIndex = sampleIndex(candidate[0], frameCount);
    const endExclusiveSampleIndex = sampleBoundary(candidate[1], frameCount);
    if (startSampleIndex >= endExclusiveSampleIndex) {
      throw new Error('NATIVE_MEDIA_TIMESTAMP_ANALYSIS_ENGINE_RESULT_INVALID');
    }
    observations.push({
      kind: 'RANGE', startSampleIndex, endExclusiveSampleIndex,
      signal: 'DEAD_VISUAL_RANGE', detail: 'Legacy video analyzer dead-visual observation',
    });
  }
  for (const detail of boundedTextArray(value.gestures)) {
    observations.push({ kind: 'GLOBAL', signal: 'GESTURE_UNLOCATED', detail });
  }
  for (const detail of boundedTextArray(value.onScreenText)) {
    observations.push({ kind: 'GLOBAL', signal: 'ON_SCREEN_TEXT_UNLOCATED', detail });
  }
  observations.push({ kind: 'GLOBAL', signal: 'SUMMARY', detail: boundedText(value.summary) });
  observations.push({ kind: 'GLOBAL', signal: 'THEME', detail: boundedText(value.theme) });
  return observations;
}

async function executeFfmpeg(
  executable: string,
  args: readonly string[],
  timeoutMs: number,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, [...args], {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let diagnosticBytes = 0;
    let settled = false;
    let terminalError: Error | null = null;
    const finish = (error: Error | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error); else resolve();
    };
    const timer = setTimeout(() => {
      terminalError = new Error('NATIVE_MEDIA_TIMESTAMP_ANALYSIS_ENGINE_TIMEOUT');
      child.kill();
    }, timeoutMs);
    child.stderr.on('data', (chunk: Buffer) => {
      diagnosticBytes += chunk.byteLength;
      if (diagnosticBytes > MAX_DIAGNOSTIC_BYTES) {
        terminalError ??= new Error('NATIVE_MEDIA_TIMESTAMP_ANALYSIS_ENGINE_DIAGNOSTIC_LIMIT');
        child.kill();
      }
    });
    child.once('error', () => finish(new Error('NATIVE_MEDIA_TIMESTAMP_ANALYSIS_ENGINE_UNAVAILABLE')));
    child.once('close', (code) => finish(
      terminalError ?? (code === 0 ? null : new Error('NATIVE_MEDIA_TIMESTAMP_ANALYSIS_ENGINE_ENCODE_FAILED')),
    ));
  });
}

function sampleIndex(value: unknown, frameCount: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) >= frameCount) {
    throw new Error('NATIVE_MEDIA_TIMESTAMP_ANALYSIS_ENGINE_RESULT_INVALID');
  }
  return Number(value);
}
function sampleBoundary(value: unknown, frameCount: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > frameCount) {
    throw new Error('NATIVE_MEDIA_TIMESTAMP_ANALYSIS_ENGINE_RESULT_INVALID');
  }
  return Number(value);
}
function boundedTextArray(value: unknown[]): string[] { return value.map(boundedText); }
function boundedText(value: unknown): string {
  if (typeof value !== 'string') throw new Error('NATIVE_MEDIA_TIMESTAMP_ANALYSIS_ENGINE_RESULT_INVALID');
  const normalized = value.trim();
  if (!normalized || normalized.length > 2048 || /[\u0000-\u001F\u007F]/.test(normalized)) {
    throw new Error('NATIVE_MEDIA_TIMESTAMP_ANALYSIS_ENGINE_RESULT_INVALID');
  }
  return normalized;
}
async function removeOwnedTemporaryDirectory(directory: string): Promise<void> {
  const root = `${path.resolve(tmpdir())}${path.sep}`;
  const resolved = path.resolve(directory);
  if (!resolved.startsWith(root) || !path.basename(resolved).startsWith(TEMP_PREFIX)) {
    throw new Error('NATIVE_MEDIA_TIMESTAMP_ANALYSIS_TEMP_DIRECTORY_INVALID');
  }
  await rm(resolved, { force: true, recursive: true });
}
