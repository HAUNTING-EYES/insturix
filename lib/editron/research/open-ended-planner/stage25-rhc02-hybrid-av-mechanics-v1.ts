import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile } from 'node:fs/promises';
import { dirname, parse, resolve } from 'node:path';

import { getFFmpegPath } from '@/lib/editron/services/media/ffmpeg-runtime';

import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';

type JsonRecord = Record<string, unknown>;

const WIDTH = 1080;
const HEIGHT = 1920;
const FRAME_RATE = '30/1';
const FRAME_COUNT = 450;
const SAMPLE_RATE = 48_000;
const SAMPLES_PER_FRAME = SAMPLE_RATE / 30;

export const STAGE25_RHC02_HYBRID_AV_MECHANICS_VERSION_V1 =
  'EDITRON_OE_STAGE25_RHC02_HYBRID_AV_MECHANICS_V1' as const;

export interface Stage25Rhc02HybridAvMechanicsInputV1 {
  interviewPath: string;
  interviewSha256: string;
  nativeAudioBaselinePath: string;
  nativeAudioBaselinePcmSha256: string;
  generatedPlayableProxyPath: string;
  generatedPlayableProxySha256: string;
  outputDirectory: string;
  ffmpegPath?: string;
  ffprobePath?: string;
}

/**
 * Owns only the decoded RHC02 hybrid handoff proof. It does not choose form,
 * execute generated source, mutate a project, or promote candidate state.
 */
export async function executeStage25Rhc02HybridAvMechanicsV1(
  input: Readonly<Stage25Rhc02HybridAvMechanicsInputV1>,
) {
  assertSha(input.interviewSha256, 'INTERVIEW_SHA');
  assertSha(input.nativeAudioBaselinePcmSha256, 'AUDIO_BASELINE_PCM_SHA');
  assertSha(input.generatedPlayableProxySha256, 'GENERATED_PROXY_SHA');
  const [interview, baseline, generated] = await Promise.all([
    regularArtifact(input.interviewPath),
    regularArtifact(input.nativeAudioBaselinePath),
    regularArtifact(input.generatedPlayableProxyPath),
  ]);
  if (interview.sha256 !== input.interviewSha256) fail('INTERVIEW_ARTIFACT_DRIFT');
  if (generated.sha256 !== input.generatedPlayableProxySha256) {
    fail('GENERATED_PROXY_ARTIFACT_DRIFT');
  }

  const ffmpeg = input.ffmpegPath ?? getFFmpegPath();
  const ffprobe = input.ffprobePath ?? 'ffprobe';
  const root = await createNewOutputDirectory(input.outputDirectory);
  const masterPath = resolve(root, 'rhc02-hybrid-proof-master.mkv');
  const reviewPath = resolve(root, 'rhc02-hybrid-review.mp4');
  await renderLosslessMaster(ffmpeg, input, masterPath);
  await renderReviewProxy(ffmpeg, masterPath, reviewPath);

  const [interviewProbe, generatedProbe, masterProbe, reviewProbe] = await Promise.all([
    probeAv(ffprobe, input.interviewPath),
    probeAv(ffprobe, input.generatedPlayableProxyPath),
    probeAv(ffprobe, masterPath),
    probeAv(ffprobe, reviewPath),
  ]);
  assertVideoProbe(interviewProbe, 'h264', FRAME_COUNT, 1, 'INTERVIEW');
  assertVideoProbe(generatedProbe, 'h264', 90, 0, 'GENERATED');
  assertVideoProbe(masterProbe, 'ffv1', FRAME_COUNT, 1, 'MASTER');
  assertVideoProbe(reviewProbe, 'h264', FRAME_COUNT, 1, 'REVIEW');
  assertAudioProbe(masterProbe, 'pcm_s16le', 'MASTER');
  assertAudioProbe(reviewProbe, 'aac', 'REVIEW');

  const [baselinePcm, masterPcm] = await Promise.all([
    decodeMonoPcm(ffmpeg, input.nativeAudioBaselinePath),
    decodeMonoPcm(ffmpeg, masterPath),
  ]);
  const baselinePcmSha256 = sha256(baselinePcm);
  const masterPcmSha256 = sha256(masterPcm);
  if (baselinePcmSha256 !== input.nativeAudioBaselinePcmSha256
    || masterPcmSha256 !== baselinePcmSha256
    || masterPcm.length !== baselinePcm.length
    || baselinePcm.length !== FRAME_COUNT * SAMPLES_PER_FRAME * 2) {
    fail(`NATIVE_AUDIO_BASELINE_DRIFT:${JSON.stringify({
      expectedPcmSha256: input.nativeAudioBaselinePcmSha256,
      baselinePcmSha256,
      masterPcmSha256,
      expectedBytes: FRAME_COUNT * SAMPLES_PER_FRAME * 2,
      baselineBytes: baselinePcm.length,
      masterBytes: masterPcm.length,
    })}`);
  }

  const [pre, island, post] = await Promise.all([
    compareFrameRanges(ffmpeg, {
      expectedPath: input.interviewPath,
      expectedStartFrame: 0,
      actualPath: masterPath,
      actualStartFrame: 0,
      frameCount: 300,
      code: 'PRE_TARGET',
    }),
    compareFrameRanges(ffmpeg, {
      expectedPath: input.generatedPlayableProxyPath,
      expectedStartFrame: 0,
      actualPath: masterPath,
      actualStartFrame: 300,
      frameCount: 90,
      code: 'GENERATED_ISLAND',
    }),
    compareFrameRanges(ffmpeg, {
      expectedPath: input.interviewPath,
      expectedStartFrame: 390,
      actualPath: masterPath,
      actualStartFrame: 390,
      frameCount: 60,
      code: 'POST_TARGET',
    }),
  ]);
  const master = await regularArtifact(masterPath);
  const review = await regularArtifact(reviewPath);
  const portable = {
    version: STAGE25_RHC02_HYBRID_AV_MECHANICS_VERSION_V1,
    artifactType: 'Stage25Rhc02HybridAvMechanicsReceiptV1' as const,
    authority: 'RHC02_DECODED_HYBRID_HANDOFF_MEASUREMENT_ONLY' as const,
    sourceArtifacts: {
      interviewSha256: interview.sha256,
      nativeAudioBaselineFileSha256: baseline.sha256,
      generatedPlayableProxySha256: generated.sha256,
    },
    timebaseHandoff: {
      projectRate: FRAME_RATE,
      compositionRate: FRAME_RATE,
      sourceRate: FRAME_RATE,
      segments: [
        { kind: 'NATIVE_INTERVIEW' as const, projectRange: [0, 300] as const, sourceRange: [0, 300] as const },
        { kind: 'GENERATED_VISUAL' as const, projectRange: [300, 390] as const, localRange: [0, 90] as const },
        { kind: 'NATIVE_INTERVIEW' as const, projectRange: [390, 450] as const, sourceRange: [390, 450] as const },
      ],
      decodedFrameSequenceProof: {
        beforeTarget: pre,
        generatedIsland: island,
        afterTarget: post,
      },
      entry: {
        projectFrame: 300 as const,
        generatedLocalFrame: 0 as const,
        decodedFrameSha256: island.firstFrameSha256,
        disposition: 'EXACT_DECODED_FRAME_MATCH' as const,
      },
      exit: {
        projectFrame: 389 as const,
        generatedLocalFrame: 89 as const,
        decodedFrameSha256: island.lastFrameSha256,
        disposition: 'EXACT_DECODED_FRAME_MATCH' as const,
      },
      return: {
        projectFrame: 390 as const,
        interviewSourceFrame: 390 as const,
        decodedFrameSha256: post.firstFrameSha256,
        disposition: 'EXACT_DECODED_FRAME_MATCH' as const,
      },
      outsideTarget: 'ALL_360_DECODED_FRAMES_EXACTLY_MATCH_BOUND_INTERVIEW_SOURCE' as const,
    },
    audioHandoff: {
      owner: 'NATIVE_TIMELINE_DIALOGUE_PLUS_ROOM_TONE_BASELINE' as const,
      codecInProofMaster: 'pcm_s16le' as const,
      sampleRate: SAMPLE_RATE,
      channels: 1 as const,
      sampleCount: baselinePcm.length / 2,
      baselinePcmSha256,
      renderedMasterPcmSha256: masterPcmSha256,
      fullTimelineEquivalence: 'EXACT' as const,
      proofWindow: pcmWindowProof(baselinePcm, masterPcm, 270, 420),
      targetRange: pcmWindowProof(baselinePcm, masterPcm, 300, 390),
      generatedVisualAudioAuthority: 'NONE' as const,
    },
    outputs: {
      proofMaster: {
        fileName: 'rhc02-hybrid-proof-master.mkv' as const,
        sha256: master.sha256,
        bytes: master.bytes,
        video: masterProbe.video,
        audio: masterProbe.audio,
        purpose: 'LOSSLESS_VIDEO_AND_PCM_EQUIVALENCE_EVIDENCE' as const,
      },
      reviewProxy: {
        fileName: 'rhc02-hybrid-review.mp4' as const,
        sha256: review.sha256,
        bytes: review.bytes,
        video: reviewProbe.video,
        audio: reviewProbe.audio,
        purpose: 'STANDARD_H264_AAC_HUMAN_REVIEW_PLAYBACK' as const,
      },
    },
    proof: {
      timebase: 'PASS' as const,
      nativeAudioPcmEquivalence: 'PASS' as const,
      entryBoundary: 'PASS' as const,
      exitBoundary: 'PASS' as const,
      outsideTargetUnchanged: 'PASS' as const,
      playableAudioReviewProxy: 'PASS' as const,
      humanQuality: 'UNJUDGED' as const,
    },
    projectStateEffects: [] as const,
  };
  return deepFreezeV1({
    ...portable,
    receiptSha256: hashCanonicalJsonV1(portable),
    hostPaths: { masterPath, reviewPath },
  });
}

export type Stage25Rhc02HybridAvMechanicsReceiptV1 = Awaited<
  ReturnType<typeof executeStage25Rhc02HybridAvMechanicsV1>
>;

async function renderLosslessMaster(
  ffmpeg: string,
  input: Readonly<Stage25Rhc02HybridAvMechanicsInputV1>,
  outputPath: string,
): Promise<void> {
  const filter = [
    '[0:v]trim=start_frame=0:end_frame=300,setpts=PTS-STARTPTS[v0]',
    '[1:v]trim=start_frame=0:end_frame=90,setpts=PTS-STARTPTS[v1]',
    '[0:v]trim=start_frame=390:end_frame=450,setpts=PTS-STARTPTS[v2]',
    '[v0][v1][v2]concat=n=3:v=1:a=0,format=yuv420p[v]',
  ].join(';');
  await capture(ffmpeg, [
    '-nostdin', '-hide_banner', '-loglevel', 'error',
    '-i', input.interviewPath,
    '-i', input.generatedPlayableProxyPath,
    '-i', input.nativeAudioBaselinePath,
    '-filter_complex', filter,
    '-map', '[v]', '-map', '2:a:0', '-r', '30',
    '-c:v', 'ffv1', '-level', '3', '-g', '1', '-pix_fmt', 'yuv420p', '-threads', '1',
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
    '-color_range', 'tv', '-c:a', 'pcm_s16le', '-ar', String(SAMPLE_RATE), '-ac', '1',
    '-fflags', '+bitexact', '-flags:v', '+bitexact', '-map_metadata', '-1',
    '-n', outputPath,
  ]);
}

async function renderReviewProxy(
  ffmpeg: string,
  masterPath: string,
  outputPath: string,
): Promise<void> {
  await capture(ffmpeg, [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-i', masterPath,
    '-map', '0:v:0', '-map', '0:a:0', '-frames:v', String(FRAME_COUNT), '-r', '30',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p',
    '-threads', '1', '-color_primaries', 'bt709', '-color_trc', 'bt709',
    '-colorspace', 'bt709', '-color_range', 'tv', '-c:a', 'aac', '-b:a', '192k',
    '-ar', String(SAMPLE_RATE), '-ac', '1', '-map_metadata', '-1',
    '-movflags', '+faststart', '-n', outputPath,
  ]);
}

async function compareFrameRanges(ffmpeg: string, input: {
  expectedPath: string;
  expectedStartFrame: number;
  actualPath: string;
  actualStartFrame: number;
  frameCount: number;
  code: string;
}) {
  const [expected, actual] = await Promise.all([
    decodedFrameHashes(ffmpeg, input.expectedPath, input.expectedStartFrame, input.frameCount),
    decodedFrameHashes(ffmpeg, input.actualPath, input.actualStartFrame, input.frameCount),
  ]);
  const mismatch = expected.findIndex((value, index) => value !== actual[index]);
  if (expected.length !== input.frameCount || actual.length !== input.frameCount || mismatch >= 0) {
    fail(`${input.code}_DECODED_FRAME_DRIFT:${mismatch}`);
  }
  return {
    frameCount: input.frameCount,
    expectedStartFrame: input.expectedStartFrame,
    actualStartFrame: input.actualStartFrame,
    sequenceSha256: hashCanonicalJsonV1(expected),
    firstFrameSha256: expected[0]!,
    lastFrameSha256: expected[expected.length - 1]!,
    equivalence: 'EXACT' as const,
  };
}

async function decodedFrameHashes(
  ffmpeg: string,
  filePath: string,
  startFrame: number,
  frameCount: number,
): Promise<string[]> {
  const endFrame = startFrame + frameCount;
  const output = (await capture(ffmpeg, [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-i', filePath,
    '-map', '0:v:0', '-vf',
    `trim=start_frame=${startFrame}:end_frame=${endFrame},setpts=PTS-STARTPTS`,
    '-an', '-pix_fmt', 'yuv420p', '-f', 'framemd5', '-hash', 'sha256', 'pipe:1',
  ])).toString('utf8');
  return output.split(/\r?\n/).filter((line) => line.trim() && !line.startsWith('#'))
    .map((line) => line.split(',').at(-1)?.trim() ?? '')
    .map((value) => /^[a-f0-9]{64}$/.test(value) ? value : fail('FRAME_HASH_INVALID'));
}

function pcmWindowProof(
  baseline: Buffer,
  rendered: Buffer,
  startFrame: number,
  endExclusiveFrame: number,
) {
  const start = startFrame * SAMPLES_PER_FRAME * 2;
  const end = endExclusiveFrame * SAMPLES_PER_FRAME * 2;
  const baselineHash = sha256(baseline.subarray(start, end));
  const renderedHash = sha256(rendered.subarray(start, end));
  if (baselineHash !== renderedHash) fail('AUDIO_WINDOW_PCM_DRIFT');
  return {
    startFrame,
    endExclusiveFrame,
    sampleCount: (end - start) / 2,
    baselinePcmSha256: baselineHash,
    renderedPcmSha256: renderedHash,
    equivalence: 'EXACT' as const,
  };
}

async function probeAv(command: string, filePath: string) {
  const value = JSON.parse((await capture(command, [
    '-v', 'error', '-count_frames', '-show_entries',
    'format=duration:stream=codec_type,codec_name,pix_fmt,width,height,avg_frame_rate,nb_read_frames,sample_rate,channels',
    '-of', 'json', filePath,
  ])).toString('utf8')) as JsonRecord;
  const streams = records(value.streams);
  const video = streams.find(({ codec_type }) => codec_type === 'video') ?? {};
  const audio = streams.find(({ codec_type }) => codec_type === 'audio');
  return {
    durationSeconds: Number(record(value.format).duration),
    video: {
      codec: text(video.codec_name),
      pixelFormat: text(video.pix_fmt),
      width: integer(video.width),
      height: integer(video.height),
      averageFrameRate: text(video.avg_frame_rate),
      decodedFrameCount: integer(video.nb_read_frames),
    },
    audioStreamCount: streams.filter(({ codec_type }) => codec_type === 'audio').length,
    audio: audio ? {
      codec: text(audio.codec_name),
      sampleRate: integer(audio.sample_rate),
      channels: integer(audio.channels),
    } : null,
  };
}

function assertVideoProbe(
  value: Awaited<ReturnType<typeof probeAv>>,
  codec: string,
  frames: number,
  audioStreams: number,
  code: string,
): void {
  if (value.video.codec !== codec || value.video.pixelFormat !== 'yuv420p'
    || value.video.width !== WIDTH || value.video.height !== HEIGHT
    || value.video.averageFrameRate !== FRAME_RATE
    || value.video.decodedFrameCount !== frames
    || value.audioStreamCount !== audioStreams
    || Math.abs(value.durationSeconds - frames / 30) > 0.05) {
    fail(`${code}_VIDEO_CONTRACT_INVALID`);
  }
}

function assertAudioProbe(
  value: Awaited<ReturnType<typeof probeAv>>,
  codec: string,
  code: string,
): void {
  if (value.audio?.codec !== codec || value.audio.sampleRate !== SAMPLE_RATE
    || value.audio.channels !== 1) fail(`${code}_AUDIO_CONTRACT_INVALID`);
}

async function decodeMonoPcm(ffmpeg: string, filePath: string): Promise<Buffer> {
  const bytes = await capture(ffmpeg, [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-i', filePath,
    '-map', '0:a:0', '-vn', '-ac', '1', '-ar', String(SAMPLE_RATE),
    '-f', 's16le', 'pipe:1',
  ]);
  if (!bytes.length || bytes.length % 2 !== 0) fail('PCM_DECODE_INVALID');
  return bytes;
}

async function createNewOutputDirectory(value: string): Promise<string> {
  const root = resolve(value);
  if (root === parse(root).root || root === resolve(process.cwd())) {
    fail('OUTPUT_DIRECTORY_UNSAFE');
  }
  await mkdir(dirname(root), { recursive: true });
  await mkdir(root);
  return root;
}

async function regularArtifact(filePath: string) {
  const stat = await lstat(filePath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0) fail('ARTIFACT_INVALID');
  return { sha256: sha256(await readFile(filePath)), bytes: stat.size };
}

async function capture(command: string, args: string[]): Promise<Buffer> {
  const child = spawn(command, args, {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const stdout: Buffer[] = [];
  let stderr = '';
  child.stdout.on('data', (chunk) => stdout.push(Buffer.from(chunk)));
  child.stderr.on('data', (chunk) => { stderr += String(chunk); });
  await new Promise<void>((done, reject) => {
    child.once('error', reject);
    child.once('close', (code) => code === 0
      ? done()
      : reject(new Error(`STAGE25_RHC02_AV_PROCESS_FAILED:${command}:${code}:${stderr.slice(-2_000)}`)));
  });
  return Buffer.concat(stdout);
}

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}
function record(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}
function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function integer(value: unknown): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : 0;
}
function assertSha(value: string, code: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) fail(`${code}_INVALID`);
}
function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}
function fail(code: string): never {
  throw new Error(`STAGE25_RHC02_HYBRID_AV_${code}`);
}
