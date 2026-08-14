import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

import { getFFmpegPath } from '../../services/media/ffmpeg-runtime';
import { hashCanonicalJsonV1 } from './contracts-v1';

const execFileAsync = promisify(execFile);

export const DEV02_TEMPORAL_FLASH_SCREEN_POLICY_V1 = Object.freeze({
  policyId: 'EDITRON_DEV02_TEMPORAL_FLASH_SCREEN_POLICY_V1',
  taskId: 'DEV-02',
  authority: 'RESEARCH_HEURISTIC_NOT_REGULATORY_CERTIFICATION',
  frameRate: { numerator: '30', denominator: '1' },
  durationInFrames: 180,
  ffmpegFilter: 'photosensitivity=frames=30:threshold=1:skip=1:bypass=1',
  heuristicThreshold: 1,
  contextReferences: [
    'https://ffmpeg.org/ffmpeg-filters.html#photosensitivity',
    'https://www.w3.org/WAI/WCAG21/Understanding/three-flashes-or-below-threshold.html',
    'https://www.itu.int/rec/R-REC-BT.1702/',
    'https://qc.ebu.io/items/0021B/versions/2-0/',
  ],
} as const);

export interface PhotosensitivityFrameObservationV1 {
  frame: number;
  pts: number;
  ptsTime: number;
  badness: number;
  fixedBadness: number;
  frameBadness: number;
  factor: number;
}

export interface PhotosensitivityRiskIntervalV1 {
  startFrame: number;
  endFrame: number;
  peakFrame: number;
  peakBadness: number;
}

export interface Dev02GeneratedCompositionTemporalSafetyReceiptV1 {
  artifactType: 'Dev02GeneratedCompositionTemporalSafetyReceiptV1';
  policyId: typeof DEV02_TEMPORAL_FLASH_SCREEN_POLICY_V1.policyId;
  authority: typeof DEV02_TEMPORAL_FLASH_SCREEN_POLICY_V1.authority;
  taskId: 'DEV-02';
  observedAt: string;
  input: {
    programHash: string;
    hostReceiptHash: string;
    proxyReceiptHash: string;
    playableProxySha256: string;
  };
  tool: {
    executableSha256: string;
    versionLine: string;
    versionOutputSha256: string;
    filtersOutputSha256: string;
  };
  execution: {
    argumentsHash: string;
    metadataStdoutSha256: string;
    filter: typeof DEV02_TEMPORAL_FLASH_SCREEN_POLICY_V1.ffmpegFilter;
  };
  coverage: {
    expectedFrames: number;
    observedFrames: number;
    firstFrame: number;
    lastFrame: number;
    disposition: 'PASS';
  };
  observations: readonly PhotosensitivityFrameObservationV1[];
  summary: {
    threshold: number;
    peakFrame: number;
    peakBadness: number;
    maximumFrameBadness: number;
    thresholdExceedanceFrames: number;
    riskIntervals: readonly PhotosensitivityRiskIntervalV1[];
  };
  heuristicDisposition: 'PASS' | 'FAIL';
  regulatoryDisposition: 'UNVERIFIABLE_REQUIRES_APPROVED_PSE_QC';
  stateEffects: readonly [];
  receiptHash: string;
}

export async function evaluateDev02GeneratedCompositionTemporalSafetyV1(input: {
  playableProxyPath: string;
  playableProxySha256: string;
  programHash: string;
  hostReceiptHash: string;
  proxyReceiptHash: string;
  observedAt: string;
}): Promise<Readonly<Dev02GeneratedCompositionTemporalSafetyReceiptV1>> {
  for (const [label, value] of Object.entries({
    playableProxySha256: input.playableProxySha256,
    programHash: input.programHash,
    hostReceiptHash: input.hostReceiptHash,
    proxyReceiptHash: input.proxyReceiptHash,
  })) assertSha256(value, label);
  assertIsoTimestamp(input.observedAt);

  const proxyPath = path.resolve(input.playableProxyPath);
  const proxyStat = await fs.lstat(proxyPath);
  if (!proxyStat.isFile() || proxyStat.isSymbolicLink() || path.extname(proxyPath).toLowerCase() !== '.mp4') {
    throw new Error('DEV02_TEMPORAL_SCREEN_PROXY_NOT_REGULAR_MP4');
  }
  if (await sha256File(proxyPath) !== input.playableProxySha256) {
    throw new Error('DEV02_TEMPORAL_SCREEN_PROXY_HASH_DRIFT');
  }

  const ffmpegPath = getFFmpegPath();
  const [executableSha256, version, filters] = await Promise.all([
    sha256File(ffmpegPath),
    runTool(ffmpegPath, ['-version']),
    runTool(ffmpegPath, ['-hide_banner', '-filters']),
  ]);
  if (!/(^|\s)photosensitivity(\s|$)/m.test(filters.stdout)) {
    throw new Error('DEV02_TEMPORAL_SCREEN_PHOTOSENSITIVITY_FILTER_UNAVAILABLE');
  }

  const args = [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-i', proxyPath, '-map', '0:v:0',
    '-vf', `${DEV02_TEMPORAL_FLASH_SCREEN_POLICY_V1.ffmpegFilter},metadata=mode=print:file=-`,
    '-an', '-f', 'null', process.platform === 'win32' ? 'NUL' : '/dev/null',
  ];
  const analysis = await runTool(ffmpegPath, args, 30_000);
  if (analysis.stderr.trim()) throw new Error('DEV02_TEMPORAL_SCREEN_UNEXPECTED_FFMPEG_STDERR');
  const observations = parseFfmpegPhotosensitivityMetadataV1(
    analysis.stdout,
    DEV02_TEMPORAL_FLASH_SCREEN_POLICY_V1.durationInFrames,
  );
  const summary = summarizeFfmpegPhotosensitivityObservationsV1(
    observations,
    DEV02_TEMPORAL_FLASH_SCREEN_POLICY_V1.heuristicThreshold,
  );
  const unsigned = {
    artifactType: 'Dev02GeneratedCompositionTemporalSafetyReceiptV1' as const,
    policyId: DEV02_TEMPORAL_FLASH_SCREEN_POLICY_V1.policyId,
    authority: DEV02_TEMPORAL_FLASH_SCREEN_POLICY_V1.authority,
    taskId: DEV02_TEMPORAL_FLASH_SCREEN_POLICY_V1.taskId,
    observedAt: input.observedAt,
    input: {
      programHash: input.programHash,
      hostReceiptHash: input.hostReceiptHash,
      proxyReceiptHash: input.proxyReceiptHash,
      playableProxySha256: input.playableProxySha256,
    },
    tool: {
      executableSha256,
      versionLine: version.stdout.split(/\r?\n/, 1)[0] ?? '',
      versionOutputSha256: sha256Text(version.stdout),
      filtersOutputSha256: sha256Text(filters.stdout),
    },
    execution: {
      argumentsHash: hashCanonicalJsonV1(args),
      metadataStdoutSha256: sha256Text(analysis.stdout),
      filter: DEV02_TEMPORAL_FLASH_SCREEN_POLICY_V1.ffmpegFilter,
    },
    coverage: {
      expectedFrames: DEV02_TEMPORAL_FLASH_SCREEN_POLICY_V1.durationInFrames,
      observedFrames: observations.length,
      firstFrame: observations[0].frame,
      lastFrame: observations.at(-1)?.frame ?? -1,
      disposition: 'PASS' as const,
    },
    observations,
    summary,
    heuristicDisposition: summary.thresholdExceedanceFrames === 0 ? 'PASS' as const : 'FAIL' as const,
    regulatoryDisposition: 'UNVERIFIABLE_REQUIRES_APPROVED_PSE_QC' as const,
    stateEffects: [] as const,
  };
  return Object.freeze({ ...unsigned, receiptHash: hashCanonicalJsonV1(unsigned) });
}

export function parseFfmpegPhotosensitivityMetadataV1(
  stdout: string,
  expectedFrames: number,
): readonly PhotosensitivityFrameObservationV1[] {
  if (!Number.isSafeInteger(expectedFrames) || expectedFrames <= 0) throw new Error('DEV02_TEMPORAL_SCREEN_EXPECTED_FRAME_COUNT_INVALID');
  const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length !== expectedFrames * 5) throw new Error('DEV02_TEMPORAL_SCREEN_METADATA_COVERAGE_DRIFT');
  const observations: PhotosensitivityFrameObservationV1[] = [];
  const metricNames = ['badness', 'fixed-badness', 'frame-badness', 'factor'] as const;
  for (let offset = 0; offset < lines.length; offset += 5) {
    const header = /^frame:(\d+)\s+pts:(-?\d+)\s+pts_time:([^\s]+)$/.exec(lines[offset]);
    if (!header) throw new Error('DEV02_TEMPORAL_SCREEN_FRAME_HEADER_INVALID');
    const frame = strictInteger(header[1], 'frame');
    if (frame !== observations.length) throw new Error('DEV02_TEMPORAL_SCREEN_FRAME_SEQUENCE_DRIFT');
    const metrics = metricNames.map((name, index) => metricValue(lines[offset + index + 1], name));
    const observation = {
      frame,
      pts: strictInteger(header[2], 'pts'),
      ptsTime: strictNumber(header[3], 'pts_time'),
      badness: metrics[0], fixedBadness: metrics[1], frameBadness: metrics[2], factor: metrics[3],
    };
    const expectedTime = frame * Number(DEV02_TEMPORAL_FLASH_SCREEN_POLICY_V1.frameRate.denominator)
      / Number(DEV02_TEMPORAL_FLASH_SCREEN_POLICY_V1.frameRate.numerator);
    if (Math.abs(observation.ptsTime - expectedTime) > 1e-5
      || (frame > 0 && observation.pts <= observations[frame - 1].pts)
      || observation.badness < 0 || observation.fixedBadness < 0 || observation.frameBadness < 0
      || observation.factor < 0 || observation.factor > 1) {
      throw new Error('DEV02_TEMPORAL_SCREEN_FRAME_METRIC_DRIFT');
    }
    observations.push(observation);
  }
  return Object.freeze(observations);
}

export function summarizeFfmpegPhotosensitivityObservationsV1(
  observations: readonly PhotosensitivityFrameObservationV1[],
  threshold: number,
) {
  if (!observations.length || !Number.isFinite(threshold) || threshold <= 0) throw new Error('DEV02_TEMPORAL_SCREEN_SUMMARY_INPUT_INVALID');
  let peak = observations[0]; let maximumFrameBadness = observations[0].frameBadness;
  for (const item of observations) {
    if (item.badness > peak.badness) peak = item;
    maximumFrameBadness = Math.max(maximumFrameBadness, item.frameBadness);
  }
  const exceeding = observations.filter(({ badness }) => badness >= threshold);
  const riskIntervals: PhotosensitivityRiskIntervalV1[] = [];
  for (const item of exceeding) {
    const current = riskIntervals.at(-1);
    if (!current || item.frame !== current.endFrame + 1) {
      riskIntervals.push({ startFrame: item.frame, endFrame: item.frame, peakFrame: item.frame, peakBadness: item.badness });
    } else {
      current.endFrame = item.frame;
      if (item.badness > current.peakBadness) { current.peakFrame = item.frame; current.peakBadness = item.badness; }
    }
  }
  return {
    threshold, peakFrame: peak.frame, peakBadness: peak.badness, maximumFrameBadness,
    thresholdExceedanceFrames: exceeding.length, riskIntervals,
  };
}

async function runTool(executable: string, args: readonly string[], timeout = 10_000): Promise<{ stdout: string; stderr: string }> {
  const result = await execFileAsync(executable, [...args], { encoding: 'utf8', timeout, maxBuffer: 4 * 1024 * 1024, windowsHide: true });
  return { stdout: result.stdout, stderr: result.stderr };
}
function metricValue(line: string, name: string): number {
  const match = new RegExp(`^lavfi\\.photosensitivity\\.${name}=([^\\s]+)$`).exec(line);
  if (!match) throw new Error(`DEV02_TEMPORAL_SCREEN_METRIC_MISSING:${name}`);
  return strictNumber(match[1], name);
}
function strictInteger(value: string, label: string): number { const parsed = Number(value); if (!Number.isSafeInteger(parsed)) throw new Error(`DEV02_TEMPORAL_SCREEN_INTEGER_INVALID:${label}`); return parsed; }
function strictNumber(value: string, label: string): number { const parsed = Number(value); if (!Number.isFinite(parsed)) throw new Error(`DEV02_TEMPORAL_SCREEN_NUMBER_INVALID:${label}`); return parsed; }
function assertSha256(value: string, label: string): void { if (!/^[a-f0-9]{64}$/.test(value)) throw new Error(`DEV02_TEMPORAL_SCREEN_HASH_INVALID:${label}`); }
function assertIsoTimestamp(value: string): void { const parsed = Date.parse(value); if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) throw new Error('DEV02_TEMPORAL_SCREEN_TIMESTAMP_INVALID'); }
function sha256Text(value: string): string { return createHash('sha256').update(value, 'utf8').digest('hex'); }
async function sha256File(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  await new Promise<void>((resolve, reject) => { const stream = createReadStream(filePath); stream.on('data', (chunk) => hash.update(chunk)); stream.on('error', reject); stream.on('end', resolve); });
  return hash.digest('hex');
}
