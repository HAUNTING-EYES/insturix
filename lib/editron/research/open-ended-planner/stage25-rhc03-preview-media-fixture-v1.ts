import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, lstat, readFile, copyFile } from 'node:fs/promises';
import path from 'node:path';

import { getFFmpegPath } from '@/lib/editron/services/media/ffmpeg-runtime';

import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import { inspectSfntWeightClassV1 }
  from './stage25-rhc02-preview-media-fixture-v2';

type JsonRecord = Record<string, unknown>;

export const STAGE25_RHC03_PREVIEW_MEDIA_FIXTURE_VERSION_V1 =
  'EDITRON_OE_STAGE25_RHC03_PREVIEW_MEDIA_FIXTURE_V1' as const;

export const STAGE25_RHC03_ASSET_IDS_V1 = Object.freeze([
  'rhc03-action-left',
  'rhc03-action-right',
  'rhc03-authored-wide',
  'rhc03-production-audio',
] as const);

const SOURCE_PATH = 'public/product_demos/showcase/insturix-final-intro.mp4';
const SOURCE_SHA256 =
  'd95dd77fccaa5e6eb4f1c0e42b399b95a801937c49ef072160d10b2a4208e73f';
const FONT_PATH =
  'node_modules/next/dist/compiled/@vercel/og/noto-sans-v27-latin-regular.ttf';
const WIDTH = 1920;
const HEIGHT = 1080;
const PROJECT_FPS = 30;
const PROJECT_FRAMES = 900;
const ACTION_START_FRAME = 450;
const ACTION_END_EXCLUSIVE_FRAME = 600;
const SAMPLE_RATE = 48_000;
const CHANNELS = 2;

export async function materializeStage25Rhc03PreviewMediaFixtureV1(input: {
  outputDir: string;
  createdAt: string;
}) {
  assertIsoTimestamp(input.createdAt);
  const root = await createNewDirectory(input.outputDir);
  const sourcePath = path.resolve(SOURCE_PATH);
  const source = await regularArtifact(sourcePath);
  if (source.sha256 !== SOURCE_SHA256) fail('SOURCE_IDENTITY_DRIFT');

  const fontSourcePath = path.resolve(FONT_PATH);
  const fontSource = await regularArtifact(fontSourcePath);
  const fontMetadata = inspectSfntWeightClassV1(await readFile(fontSourcePath));
  if (fontMetadata.usWeightClass !== 400) fail('FONT_WEIGHT_NOT_REGULAR_400');

  const ffmpeg = getFFmpegPath();
  const ffprobe = 'ffprobe';
  const widePath = path.join(root, 'rhc03-authored-wide.mp4');
  const actionPath = path.join(root, 'rhc03-synchronized-action.mp4');
  const audioPath = path.join(root, 'rhc03-production-audio.wav');
  const fontPath = path.join(root, 'noto-sans-v27-latin-regular.ttf');

  await renderAuthoredWide(ffmpeg, sourcePath, widePath);
  await renderProductionAudio(ffmpeg, sourcePath, audioPath);
  await copyFile(fontSourcePath, fontPath);
  await renderSynchronizedAction(ffmpeg, widePath, actionPath);

  const [sourceProbe, wideProbe, actionProbe, audioProbe, productionPcm] =
    await Promise.all([
      probeAv(ffprobe, sourcePath),
      probeAv(ffprobe, widePath),
      probeAv(ffprobe, actionPath),
      probeAv(ffprobe, audioPath),
      decodeStereoPcm(ffmpeg, audioPath),
    ]);
  assertSourceProbe(sourceProbe);
  assertWideProbe(wideProbe);
  assertActionProbe(actionProbe);
  assertAudioProbe(audioProbe);
  const expectedPcmBytes = PROJECT_FRAMES * (SAMPLE_RATE / PROJECT_FPS)
    * CHANNELS * 2;
  if (productionPcm.length !== expectedPcmBytes) {
    fail(`PRODUCTION_AUDIO_SAMPLE_COUNT_DRIFT:${productionPcm.length}`);
  }

  const assetPaths = {
    'rhc03-action-left': actionPath,
    'rhc03-action-right': actionPath,
    'rhc03-authored-wide': widePath,
    'rhc03-production-audio': audioPath,
  } as const;
  const artifacts = await Promise.all([
    regularArtifact(actionPath),
    regularArtifact(widePath),
    regularArtifact(audioPath),
    regularArtifact(fontPath),
  ]);
  const actionArtifact = artifacts[0]!;
  const wideArtifact = artifacts[1]!;
  const audioArtifact = artifacts[2]!;
  const fontArtifact = artifacts[3]!;
  if (fontArtifact.sha256 !== fontSource.sha256) fail('FONT_COPY_DRIFT');

  const provenance = buildProvenance({
    sourceSha256: source.sha256,
    actionSha256: actionArtifact.sha256,
    wideSha256: wideArtifact.sha256,
    audioSha256: audioArtifact.sha256,
  });
  const rightsByAsset = new Map(provenance.map((entry) => [entry.assetId, entry]));
  const artifactsByAsset = {
    'rhc03-action-left': actionArtifact,
    'rhc03-action-right': actionArtifact,
    'rhc03-authored-wide': wideArtifact,
    'rhc03-production-audio': audioArtifact,
  } as const;
  const assets = STAGE25_RHC03_ASSET_IDS_V1.map((assetId) => ({
    assetId,
    mediaKind: assetId === 'rhc03-production-audio'
      ? 'AUDIO' as const
      : assetId === 'rhc03-authored-wide'
        ? 'VIDEO_WITH_PRODUCTION_AUDIO' as const
        : 'VIDEO' as const,
    fileName: path.basename(assetPaths[assetId]),
    sha256: artifactsByAsset[assetId].sha256,
    bytes: artifactsByAsset[assetId].bytes,
    rightsEvidenceSha256:
      rightsByAsset.get(assetId)?.receiptSha256 ?? fail('RIGHTS_RECEIPT_MISSING'),
  }));
  const portable = {
    version: STAGE25_RHC03_PREVIEW_MEDIA_FIXTURE_VERSION_V1,
    artifactType: 'Stage25Rhc03PreviewMediaFixtureReceiptV1' as const,
    authority: 'LOCAL_RESEARCH_AV_FIXTURE_MATERIALIZER_ONLY' as const,
    fixtureId: 'RHC-03-PREVIEW-MEDIA-V1' as const,
    createdAt: input.createdAt,
    source: {
      repositoryPath: SOURCE_PATH,
      sha256: source.sha256,
      bytes: source.bytes,
      sourceRate: '60/1' as const,
      sourceFrameRange: { startFrame: 300, endExclusiveFrame: 2100 },
      sourceAudioSampleRangeAt96k: {
        startSample: 480_000,
        endExclusiveSample: 3_360_000,
      },
    },
    ffmpegIdentity: await toolIdentity(ffmpeg),
    ffprobeIdentity: await toolIdentity(ffprobe),
    projectContract: {
      width: WIDTH,
      height: HEIGHT,
      frameRate: '30/1' as const,
      frameCount: PROJECT_FRAMES,
      targetRange: {
        startFrame: ACTION_START_FRAME,
        endExclusiveFrame: ACTION_END_EXCLUSIVE_FRAME,
      },
      actionClipFrameCount: ACTION_END_EXCLUSIVE_FRAME - ACTION_START_FRAME,
      sourceRateConversion: 'SELECT_EVERY_SECOND_60FPS_SOURCE_FRAME' as const,
    },
    synchronization: {
      sharedActionArtifactSha256: actionArtifact.sha256,
      leftAndRightUseIdenticalTemporalBytes: true as const,
      localToAuthoredWideFrame: {
        localStartFrame: 0,
        authoredWideStartFrame: ACTION_START_FRAME,
        localEndExclusiveFrame: ACTION_END_EXCLUSIVE_FRAME - ACTION_START_FRAME,
        authoredWideEndExclusiveFrame: ACTION_END_EXCLUSIVE_FRAME,
        conversion: 'AUTHORED_WIDE_FRAME_EQUALS_LOCAL_FRAME_PLUS_450' as const,
      },
      returnMarker: {
        projectFrame: ACTION_END_EXCLUSIVE_FRAME,
        authoredWideSourceFrame: ACTION_END_EXCLUSIVE_FRAME,
      },
    },
    productionAudio: {
      owner: 'NATIVE_TIMELINE_PRODUCTION_AUDIO' as const,
      codec: 'pcm_s16le' as const,
      sampleRate: SAMPLE_RATE,
      channels: CHANNELS,
      sampleCountPerChannel: productionPcm.length / (CHANNELS * 2),
      decodedPcmSha256: sha256(productionPcm),
      candidateMayMutateAudio: false as const,
    },
    assets,
    provenance,
    font: {
      fontAssetId: 'rhc03-licensed-label' as const,
      fileName: path.basename(fontPath),
      sha256: fontArtifact.sha256,
      bytes: fontArtifact.bytes,
      family: 'Noto Sans' as const,
      face: 'Regular' as const,
      weight: fontMetadata.usWeightClass,
      licenseId: 'OFL-1.1-NOTO-SANS' as const,
      metadataProof: fontMetadata,
    },
    externalCalls: {
      providerInferenceCalls: 0 as const,
      networkCalls: 0 as const,
      databaseCalls: 0 as const,
      canonicalProjectMutationWrites: 0 as const,
    },
    stateEffects: [widePath, actionPath, audioPath, fontPath].map(
      (filePath) => ({
        kind: 'LOCAL_RESEARCH_FIXTURE_WRITE' as const,
        fileName: path.basename(filePath),
      }),
    ),
  };
  return deepFreezeV1({
    ...portable,
    receiptSha256: hashCanonicalJsonV1(portable),
    hostPaths: { assetPaths, fontPath, productionAudioPath: audioPath },
  });
}

export type Stage25Rhc03PreviewMediaFixtureReceiptV1 = Awaited<
  ReturnType<typeof materializeStage25Rhc03PreviewMediaFixtureV1>
>;

export function assertStage25Rhc03PreviewMediaFixtureReceiptV1(
  receipt: Readonly<Stage25Rhc03PreviewMediaFixtureReceiptV1>,
): void {
  const { hostPaths: _hostPaths, receiptSha256, ...portable } = receipt;
  if (receipt.version !== STAGE25_RHC03_PREVIEW_MEDIA_FIXTURE_VERSION_V1
    || receipt.receiptSha256 !== hashCanonicalJsonV1(portable)
    || receipt.assets.map(({ assetId }) => assetId).join('|')
      !== STAGE25_RHC03_ASSET_IDS_V1.join('|')
    || receipt.synchronization.leftAndRightUseIdenticalTemporalBytes !== true
    || receipt.productionAudio.sampleCountPerChannel !== 1_440_000
    || receipt.font.weight !== 400
    || !/^[a-f0-9]{64}$/.test(receiptSha256)) {
    fail('RECEIPT_INVALID');
  }
}

async function renderAuthoredWide(
  ffmpeg: string,
  sourcePath: string,
  outputPath: string,
): Promise<void> {
  const filter = [
    '[0:v]trim=start_frame=300:end_frame=2100,',
    "select='not(mod(n\\,2))',setpts=N/(30*TB),",
    'scale=1920:1080:flags=lanczos,format=yuv420p[v];',
    '[0:a]atrim=start_sample=480000:end_sample=3360000,',
    'asetpts=N/SR/TB,aresample=48000:async=0:first_pts=0[a]',
  ].join('');
  await capture(ffmpeg, [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-i', sourcePath,
    '-filter_complex', filter, '-map', '[v]', '-map', '[a]',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '17', '-threads', '1',
    '-pix_fmt', 'yuv420p', '-r', '30', '-color_primaries', 'bt709',
    '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
    '-fflags', '+bitexact', '-flags:v', '+bitexact', '-map_metadata', '-1',
    '-movflags', '+faststart', '-n', outputPath,
  ]);
}

async function renderSynchronizedAction(
  ffmpeg: string,
  widePath: string,
  outputPath: string,
): Promise<void> {
  await capture(ffmpeg, [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-i', widePath,
    '-map', '0:v:0', '-vf',
    'trim=start_frame=450:end_frame=600,setpts=N/(30*TB),format=yuv420p',
    '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '17',
    '-threads', '1', '-pix_fmt', 'yuv420p', '-r', '30',
    '-color_primaries', 'bt709', '-color_trc', 'bt709',
    '-colorspace', 'bt709', '-color_range', 'tv', '-fflags', '+bitexact',
    '-flags:v', '+bitexact', '-map_metadata', '-1', '-movflags', '+faststart',
    '-n', outputPath,
  ]);
}

async function renderProductionAudio(
  ffmpeg: string,
  sourcePath: string,
  outputPath: string,
): Promise<void> {
  await capture(ffmpeg, [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-i', sourcePath,
    '-map', '0:a:0', '-af',
    'atrim=start_sample=480000:end_sample=3360000,asetpts=N/SR/TB,'
      + 'aresample=48000:async=0:first_pts=0,aformat=sample_fmts=s16:channel_layouts=stereo',
    '-vn', '-c:a', 'pcm_s16le', '-ar', '48000', '-ac', '2',
    '-map_metadata', '-1', '-n', outputPath,
  ]);
}

function buildProvenance(input: {
  sourceSha256: string;
  actionSha256: string;
  wideSha256: string;
  audioSha256: string;
}) {
  const transforms = {
    'rhc03-action-left':
      'SHARED_ACTION_CLIP_AUTHORED_WIDE_FRAMES_450_TO_599_LEFT_VIEW_BINDING',
    'rhc03-action-right':
      'SHARED_ACTION_CLIP_AUTHORED_WIDE_FRAMES_450_TO_599_RIGHT_VIEW_BINDING',
    'rhc03-authored-wide':
      'SOURCE_FRAMES_300_TO_2099_SELECT_EVEN_TO_30FPS_1920X1080',
    'rhc03-production-audio':
      'SOURCE_AUDIO_SAMPLES_480000_TO_3359999_RESAMPLED_48000_STEREO_PCM',
  } as const;
  const outputs = {
    'rhc03-action-left': input.actionSha256,
    'rhc03-action-right': input.actionSha256,
    'rhc03-authored-wide': input.wideSha256,
    'rhc03-production-audio': input.audioSha256,
  } as const;
  return STAGE25_RHC03_ASSET_IDS_V1.map((assetId) => {
    const material = {
      assetId,
      rightsStatus: 'INTERNAL_OWNED_FIXTURE' as const,
      repositorySourceSha256: input.sourceSha256,
      outputSha256: outputs[assetId],
      transform: transforms[assetId],
      useScope: 'STAGE25_RHC03_RESEARCH_CANDIDATE_ONLY' as const,
    };
    return { ...material, receiptSha256: hashCanonicalJsonV1(material) };
  });
}

async function probeAv(command: string, filePath: string) {
  const parsed = JSON.parse((await capture(command, [
    '-v', 'error', '-count_frames', '-show_entries',
    'format=duration:stream=codec_type,codec_name,pix_fmt,width,height,avg_frame_rate,'
      + 'nb_read_frames,sample_rate,channels',
    '-of', 'json', filePath,
  ])).toString('utf8')) as JsonRecord;
  const streams = records(parsed.streams);
  const video = streams.find(({ codec_type }) => codec_type === 'video');
  const audio = streams.find(({ codec_type }) => codec_type === 'audio');
  return {
    durationSeconds: Number(record(parsed.format).duration),
    video: video ? {
      codec: text(video.codec_name),
      pixelFormat: text(video.pix_fmt),
      width: integer(video.width),
      height: integer(video.height),
      rate: text(video.avg_frame_rate),
      frames: integer(video.nb_read_frames),
    } : null,
    audio: audio ? {
      codec: text(audio.codec_name),
      sampleRate: integer(audio.sample_rate),
      channels: integer(audio.channels),
    } : null,
    audioStreamCount: streams.filter(({ codec_type }) => codec_type === 'audio').length,
  };
}

function assertSourceProbe(value: Awaited<ReturnType<typeof probeAv>>): void {
  if (value.video?.codec !== 'h264' || value.video.width !== WIDTH
    || value.video.height !== HEIGHT || value.video.rate !== '60/1'
    || value.video.frames !== 3885 || value.audio?.codec !== 'aac'
    || value.audio.sampleRate !== 96_000 || value.audio.channels !== CHANNELS
    || Math.abs(value.durationSeconds - 64.75) > 0.001) {
    fail('SOURCE_MEDIA_CONTRACT_INVALID');
  }
}

function assertWideProbe(value: Awaited<ReturnType<typeof probeAv>>): void {
  if (value.video?.codec !== 'h264' || value.video.pixelFormat !== 'yuv420p'
    || value.video.width !== WIDTH || value.video.height !== HEIGHT
    || value.video.rate !== '30/1' || value.video.frames !== PROJECT_FRAMES
    || value.audio?.codec !== 'aac' || value.audio.sampleRate !== SAMPLE_RATE
    || value.audio.channels !== CHANNELS || value.audioStreamCount !== 1
    || Math.abs(value.durationSeconds - 30) > 0.05) {
    fail('AUTHORED_WIDE_CONTRACT_INVALID');
  }
}

function assertActionProbe(value: Awaited<ReturnType<typeof probeAv>>): void {
  if (value.video?.codec !== 'h264' || value.video.pixelFormat !== 'yuv420p'
    || value.video.width !== WIDTH || value.video.height !== HEIGHT
    || value.video.rate !== '30/1' || value.video.frames !== 150
    || value.audioStreamCount !== 0 || Math.abs(value.durationSeconds - 5) > 0.001) {
    fail('ACTION_CLIP_CONTRACT_INVALID');
  }
}

function assertAudioProbe(value: Awaited<ReturnType<typeof probeAv>>): void {
  if (value.video || value.audio?.codec !== 'pcm_s16le'
    || value.audio.sampleRate !== SAMPLE_RATE || value.audio.channels !== CHANNELS
    || value.audioStreamCount !== 1 || Math.abs(value.durationSeconds - 30) > 0.001) {
    fail('PRODUCTION_AUDIO_CONTRACT_INVALID');
  }
}

async function decodeStereoPcm(ffmpeg: string, filePath: string): Promise<Buffer> {
  const bytes = await capture(ffmpeg, [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-i', filePath,
    '-map', '0:a:0', '-vn', '-ac', String(CHANNELS), '-ar', String(SAMPLE_RATE),
    '-f', 's16le', 'pipe:1',
  ]);
  if (!bytes.length || bytes.length % (CHANNELS * 2) !== 0) {
    fail('PCM_DECODE_INVALID');
  }
  return bytes;
}

async function createNewDirectory(value: string): Promise<string> {
  const root = path.resolve(value);
  if (root === path.parse(root).root || root === path.resolve(process.cwd())) {
    fail('OUTPUT_DIRECTORY_UNSAFE');
  }
  await mkdir(path.dirname(root), { recursive: true });
  await mkdir(root);
  return root;
}

async function regularArtifact(filePath: string) {
  const stat = await lstat(filePath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0) {
    fail('ARTIFACT_INVALID');
  }
  return { sha256: sha256(await readFile(filePath)), bytes: stat.size };
}

async function toolIdentity(command: string): Promise<string> {
  const line = (await capture(command, ['-version']))
    .toString('utf8').split(/\r?\n/, 1)[0]?.trim();
  return line || fail('TOOL_IDENTITY_MISSING');
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
  await new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => code === 0
      ? resolve()
      : reject(new Error(
        `STAGE25_RHC03_MEDIA_PROCESS_FAILED:${path.basename(command)}:${code}:${stderr.slice(-2_000)}`,
      )));
  });
  return Buffer.concat(stdout);
}

function assertIsoTimestamp(value: string): void {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    fail('CREATED_AT_INVALID');
  }
}

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}
function record(value: unknown): JsonRecord { return isRecord(value) ? value : {}; }
function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function integer(value: unknown): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : 0;
}
function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}
function fail(code: string): never {
  throw new Error(`STAGE25_RHC03_PREVIEW_MEDIA_${code}`);
}
