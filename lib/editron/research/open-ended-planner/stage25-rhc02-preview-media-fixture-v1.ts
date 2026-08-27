import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { copyFile, lstat, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

import { getFFmpegPath } from '@/lib/editron/services/media/ffmpeg-runtime';

import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';

export const STAGE25_RHC02_PREVIEW_MEDIA_FIXTURE_VERSION_V1 =
  'EDITRON_OE_STAGE25_RHC02_PREVIEW_MEDIA_FIXTURE_V1' as const;

const ASSET_IDS = [
  'rhc02-interview',
  'rhc02-still-a',
  'rhc02-still-b',
  'rhc02-room-tone',
] as const;
const DIALOGUE_TEXT =
  'Insturix scans your brand, then writes, edits, and designs your content automatically, on brand.';
const SOURCE_PATHS = deepFreezeV1({
  interviewPortrait: 'public/team/NimitJain.jpeg',
  dialogueAudio: 'explainer-remotion/public/audio/vo-1.mp3',
  dialoguePlan: 'explainer-remotion/src/bricks/generated-plan.ts',
  stillA: 'explainer-remotion/public/product/hera-site-1.png',
  stillB: 'explainer-remotion/public/product/app-dashboard.png',
  font: 'node_modules/next/dist/compiled/@vercel/og/noto-sans-v27-latin-regular.ttf',
});

export async function materializeStage25Rhc02PreviewMediaFixtureV1(input: {
  outputDir: string;
  createdAt: string;
}) {
  const createdAt = new Date(input.createdAt);
  if (Number.isNaN(createdAt.getTime()) || createdAt.toISOString() !== input.createdAt) {
    fail('CREATED_AT_INVALID');
  }
  const root = safeNewDirectory(input.outputDir);
  await mkdir(path.dirname(root), { recursive: true });
  await mkdir(root);
  const sourcePaths = Object.fromEntries(Object.entries(SOURCE_PATHS).map(
    ([key, relative]) => [key, path.resolve(relative)],
  )) as Record<keyof typeof SOURCE_PATHS, string>;
  const sourceBytes = Object.fromEntries(await Promise.all(
    Object.entries(sourcePaths).map(async ([key, filePath]) => [key, await readRegularFile(filePath)]),
  )) as Record<keyof typeof SOURCE_PATHS, Buffer>;
  if (!sourceBytes.dialoguePlan.toString('utf8').includes(DIALOGUE_TEXT)) {
    fail('DIALOGUE_PLAN_BINDING_MISSING');
  }

  const ffmpeg = getFFmpegPath();
  const [ffmpegIdentity, ffprobeIdentity] = await Promise.all([
    toolIdentity(ffmpeg),
    toolIdentity('ffprobe'),
  ]);
  const interviewBackground = path.join(root, 'rhc02-interview-background.png');
  const interviewPath = path.join(root, 'rhc02-interview.mp4');
  const stillAPath = path.join(root, 'rhc02-still-a.png');
  const stillBPath = path.join(root, 'rhc02-still-b.png');
  const roomTonePath = path.join(root, 'rhc02-room-tone.wav');
  const audioBaselinePath = path.join(root, 'rhc02-audio-baseline.wav');
  const fontPath = path.join(root, 'noto-sans-v27-latin-regular.ttf');

  await Promise.all([
    createInterviewBackground(sourcePaths.interviewPortrait, interviewBackground),
    createChapterStill(sourcePaths.stillA, stillAPath, '#111827'),
    createChapterStill(sourcePaths.stillB, stillBPath, '#172033'),
    copyFile(sourcePaths.font, fontPath),
  ]);
  await Promise.all([
    generateInterview(ffmpeg, interviewBackground, sourcePaths.dialogueAudio, interviewPath),
    generateRoomTone(ffmpeg, roomTonePath),
  ]);
  await generateAudioBaseline(ffmpeg, interviewPath, roomTonePath, audioBaselinePath);

  const assetPaths = {
    'rhc02-interview': interviewPath,
    'rhc02-still-a': stillAPath,
    'rhc02-still-b': stillBPath,
    'rhc02-room-tone': roomTonePath,
  } as const;
  const [interviewProbe, roomToneProbe, stillAProbe, stillBProbe] = await Promise.all([
    probeAv(interviewPath),
    probeAv(roomTonePath),
    probeStill(stillAPath),
    probeStill(stillBPath),
  ]);
  assertInterview(interviewProbe);
  assertRoomTone(roomToneProbe);
  assertStill(stillAProbe);
  assertStill(stillBProbe);
  const [dialoguePcm, roomTonePcm, mixedPcm] = await Promise.all([
    decodePcm(ffmpeg, interviewPath),
    decodePcm(ffmpeg, roomTonePath),
    decodePcm(ffmpeg, audioBaselinePath),
  ]);

  const provenance = buildProvenance(sourceBytes);
  const assets = await Promise.all(ASSET_IDS.map(async (assetId) => {
    const bytes = await readRegularFile(assetPaths[assetId]);
    return {
      assetId,
      mediaKind: assetId === 'rhc02-interview'
        ? 'VIDEO_WITH_DIALOGUE_AUDIO' as const
        : assetId === 'rhc02-room-tone'
          ? 'AUDIO' as const
          : 'STILL_IMAGE' as const,
      fileName: path.basename(assetPaths[assetId]),
      sha256: sha256(bytes),
      bytes: bytes.length,
      rightsEvidenceSha256: provenance[assetId].receiptSha256,
    };
  }));
  const fontBytes = await readRegularFile(fontPath);
  const portable = {
    version: STAGE25_RHC02_PREVIEW_MEDIA_FIXTURE_VERSION_V1,
    artifactType: 'Stage25Rhc02PreviewMediaFixtureReceiptV1' as const,
    authority: 'LOCAL_RESEARCH_AV_FIXTURE_MATERIALIZER_ONLY' as const,
    fixtureId: 'RHC-02-PREVIEW-MEDIA-V1' as const,
    createdAt: input.createdAt,
    ffmpegIdentity,
    ffprobeIdentity,
    dialogue: {
      text: DIALOGUE_TEXT,
      sourceFileSha256: sha256(sourceBytes.dialogueAudio),
      planFileSha256: sha256(sourceBytes.dialoguePlan),
      projectStartFrame: 210,
      projectEndExclusiveFrame: 421,
      targetRangeFullyInsideDialogue: true as const,
    },
    roomTone: {
      recipe: 'FFMPEG_ANOISESRC_PINK_SEED_2502_AMPLITUDE_0.006' as const,
      projectRange: { startFrame: 0, endExclusiveFrame: 450 },
    },
    audioBaseline: {
      format: 'SIGNED_16_BIT_LITTLE_ENDIAN_MONO_48000HZ' as const,
      dialoguePcmSha256: sha256(dialoguePcm),
      roomTonePcmSha256: sha256(roomTonePcm),
      roomToneGain: 0.15,
      mixedPcmSha256: sha256(mixedPcm),
      sampleCount: mixedPcm.length / 2,
      proofWindow: { startFrame: 270, endExclusiveFrame: 420 },
      targetRange: { startFrame: 300, endExclusiveFrame: 390 },
    },
    avContract: {
      width: 1080,
      height: 1920,
      frameRate: '30/1' as const,
      frameCount: 450,
      durationSeconds: 15,
      dialogueAudio: { codec: 'aac', sampleRate: 48_000, channels: 1 },
      roomToneAudio: { codec: 'pcm_s16le', sampleRate: 48_000, channels: 1 },
      stills: { format: 'png', width: 540, height: 1920 },
    },
    assets,
    provenance: ASSET_IDS.map((assetId) => provenance[assetId]),
    font: {
      fontAssetId: 'rhc02-licensed-title' as const,
      fileName: path.basename(fontPath),
      sha256: sha256(fontBytes),
      bytes: fontBytes.length,
      family: 'Noto Sans' as const,
      face: 'Regular' as const,
      weight: 700 as const,
      licenseId: 'OFL-1.1-NOTO-SANS' as const,
    },
    stateEffects: [
      interviewBackground,
      ...Object.values(assetPaths),
      audioBaselinePath,
      fontPath,
    ].map(
      (filePath) => ({ kind: 'LOCAL_RESEARCH_FIXTURE_WRITE' as const, fileName: path.basename(filePath) }),
    ),
  };
  return deepFreezeV1({
    ...portable,
    receiptSha256: hashCanonicalJsonV1(portable),
    hostPaths: { assetPaths, fontPath, audioBaselinePath },
  });
}

export type Stage25Rhc02PreviewMediaFixtureReceiptV1 = Awaited<
  ReturnType<typeof materializeStage25Rhc02PreviewMediaFixtureV1>
>;

export function assertStage25Rhc02PreviewMediaFixtureReceiptV1(
  receipt: Stage25Rhc02PreviewMediaFixtureReceiptV1,
): void {
  const { hostPaths: _hostPaths, receiptSha256, ...portable } = receipt;
  if (receipt.version !== STAGE25_RHC02_PREVIEW_MEDIA_FIXTURE_VERSION_V1
    || receipt.receiptSha256 !== hashCanonicalJsonV1(portable)
    || receipt.assets.map(({ assetId }) => assetId).join('|') !== ASSET_IDS.join('|')
    || !/^[a-f0-9]{64}$/.test(receiptSha256)) {
    fail('RECEIPT_INVALID');
  }
}

async function createInterviewBackground(source: string, output: string): Promise<void> {
  const portrait = await sharp(source).resize(820, 820, { fit: 'cover' }).jpeg().toBuffer();
  await sharp({
    create: { width: 1080, height: 1920, channels: 3, background: '#111827' },
  }).composite([{ input: portrait, left: 130, top: 420 }]).png().toFile(output);
}

async function createChapterStill(source: string, output: string, background: string): Promise<void> {
  const backdrop = await sharp(source)
    .resize(540, 1920, { fit: 'cover' })
    .blur(24)
    .modulate({ brightness: 0.38, saturation: 0.65 })
    .png()
    .toBuffer();
  const card = await sharp(source).resize(500, 700, { fit: 'inside' }).png().toBuffer();
  const cardMetadata = await sharp(card).metadata();
  const cardWidth = cardMetadata.width ?? fail('STILL_CARD_WIDTH_MISSING');
  await sharp({
    create: { width: 540, height: 1920, channels: 3, background },
  }).composite([
    { input: backdrop, left: 0, top: 0 },
    { input: card, left: Math.floor((540 - cardWidth) / 2), top: 320 },
  ]).png().toFile(output);
}

async function generateInterview(
  ffmpeg: string,
  background: string,
  dialogue: string,
  output: string,
): Promise<void> {
  await capture(ffmpeg, [
    '-v', 'error', '-loop', '1', '-framerate', '30', '-i', background,
    '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono', '-i', dialogue,
    '-filter_complex',
    '[2:a]aresample=48000,adelay=7000[voice];[1:a][voice]amix=inputs=2:duration=first:dropout_transition=0,volume=2[a]',
    '-map', '0:v:0', '-map', '[a]', '-t', '15', '-frames:v', '450',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-threads', '1',
    '-pix_fmt', 'yuv420p', '-r', '30', '-color_primaries', 'bt709',
    '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '1',
    '-fflags', '+bitexact', '-flags:v', '+bitexact', '-map_metadata', '-1',
    '-movflags', '+faststart', output,
  ]);
}

async function generateRoomTone(ffmpeg: string, output: string): Promise<void> {
  await capture(ffmpeg, [
    '-v', 'error', '-f', 'lavfi', '-i',
    'anoisesrc=color=pink:amplitude=0.006:sample_rate=48000:duration=15:seed=2502',
    '-c:a', 'pcm_s16le', '-ar', '48000', '-ac', '1', '-map_metadata', '-1', output,
  ]);
}

async function generateAudioBaseline(
  ffmpeg: string,
  interview: string,
  roomTone: string,
  output: string,
): Promise<void> {
  await capture(ffmpeg, [
    '-v', 'error', '-i', interview, '-i', roomTone, '-filter_complex',
    '[0:a]aresample=48000,apad=whole_len=720000[dialogue];[1:a]volume=0.15[room];[dialogue][room]amix=inputs=2:duration=first:dropout_transition=0,volume=2,aresample=48000[a]',
    '-map', '[a]', '-c:a', 'pcm_s16le', '-ar', '48000', '-ac', '1',
    '-map_metadata', '-1', output,
  ]);
}

async function decodePcm(ffmpeg: string, source: string): Promise<Buffer> {
  return capture(ffmpeg, [
    '-v', 'error', '-i', source, '-map', '0:a:0', '-f', 's16le',
    '-c:a', 'pcm_s16le', '-ar', '48000', '-ac', '1', 'pipe:1',
  ]);
}

function buildProvenance(bytes: Record<keyof typeof SOURCE_PATHS, Buffer>) {
  const records = {
    'rhc02-interview': {
      sourceSha256: [sha256(bytes.interviewPortrait), sha256(bytes.dialogueAudio), sha256(bytes.dialoguePlan)],
      transform: 'PORTRAIT_BACKGROUND_PLUS_DELAYED_REPOSITORY_VOICEOVER',
    },
    'rhc02-still-a': { sourceSha256: [sha256(bytes.stillA)], transform: 'DARK_BLURRED_COVER_WITH_UPPER_CONTAINED_CARD_540X1920_PNG' },
    'rhc02-still-b': { sourceSha256: [sha256(bytes.stillB)], transform: 'DARK_BLURRED_COVER_WITH_UPPER_CONTAINED_CARD_540X1920_PNG' },
    'rhc02-room-tone': { sourceSha256: [], transform: 'DETERMINISTIC_PINK_NOISE_SEED_2502' },
  } as const;
  const receiptFor = (assetId: typeof ASSET_IDS[number]) => {
    const material = {
      assetId,
      rightsStatus: 'INTERNAL_OWNED_FIXTURE' as const,
      sourceSha256: records[assetId].sourceSha256,
      transform: records[assetId].transform,
    };
    return { ...material, receiptSha256: hashCanonicalJsonV1(material) };
  };
  return {
    'rhc02-interview': receiptFor('rhc02-interview'),
    'rhc02-still-a': receiptFor('rhc02-still-a'),
    'rhc02-still-b': receiptFor('rhc02-still-b'),
    'rhc02-room-tone': receiptFor('rhc02-room-tone'),
  };
}

async function probeAv(filePath: string) {
  const parsed = JSON.parse((await capture('ffprobe', [
    '-v', 'error', '-count_frames', '-show_entries',
    'format=duration:stream=codec_type,codec_name,width,height,avg_frame_rate,nb_read_frames,sample_rate,channels',
    '-of', 'json', filePath,
  ])).toString('utf8')) as { format?: { duration?: string }; streams?: Array<Record<string, unknown>> };
  const video = parsed.streams?.find(({ codec_type }) => codec_type === 'video');
  const audio = parsed.streams?.find(({ codec_type }) => codec_type === 'audio');
  return {
    duration: Number(parsed.format?.duration),
    video: video ? {
      codec: String(video.codec_name), width: Number(video.width), height: Number(video.height),
      rate: String(video.avg_frame_rate), frames: Number(video.nb_read_frames),
    } : null,
    audio: audio ? {
      codec: String(audio.codec_name), sampleRate: Number(audio.sample_rate), channels: Number(audio.channels),
    } : null,
  };
}

async function probeStill(filePath: string) {
  const metadata = await sharp(filePath).metadata();
  return { format: metadata.format, width: metadata.width, height: metadata.height };
}

function assertInterview(value: Awaited<ReturnType<typeof probeAv>>): void {
  if (value.video?.codec !== 'h264' || value.video.width !== 1080 || value.video.height !== 1920
    || value.video.rate !== '30/1' || value.video.frames !== 450 || value.audio?.codec !== 'aac'
    || value.audio.sampleRate !== 48_000 || value.audio.channels !== 1
    || Math.abs(value.duration - 15) > 0.01) fail('INTERVIEW_CONTRACT_INVALID');
}

function assertRoomTone(value: Awaited<ReturnType<typeof probeAv>>): void {
  if (value.video || value.audio?.codec !== 'pcm_s16le' || value.audio.sampleRate !== 48_000
    || value.audio.channels !== 1 || Math.abs(value.duration - 15) > 0.01) {
    fail('ROOM_TONE_CONTRACT_INVALID');
  }
}

function assertStill(value: Awaited<ReturnType<typeof probeStill>>): void {
  if (value.format !== 'png' || value.width !== 540 || value.height !== 1920) {
    fail('STILL_CONTRACT_INVALID');
  }
}

async function toolIdentity(command: string): Promise<string> {
  const line = (await capture(command, ['-version'])).toString('utf8').split(/\r?\n/, 1)[0]?.trim();
  return line || fail('TOOL_IDENTITY_MISSING');
}

async function readRegularFile(filePath: string): Promise<Buffer> {
  const stat = await lstat(filePath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0) fail('FILE_INVALID');
  return readFile(filePath);
}

async function capture(command: string, args: string[]): Promise<Buffer> {
  const child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const stdout: Buffer[] = [];
  let stderr = '';
  child.stdout.on('data', (chunk) => stdout.push(Buffer.from(chunk)));
  child.stderr.on('data', (chunk) => { stderr += String(chunk); });
  const [code] = await once(child, 'close') as [number];
  if (code !== 0) fail(`COMMAND_FAILED:${path.basename(command)}:${stderr.slice(-1_500)}`);
  return Buffer.concat(stdout);
}

function safeNewDirectory(value: string): string {
  const root = path.resolve(value);
  if (root === path.parse(root).root || root === path.resolve(process.cwd())) fail('OUTPUT_ROOT_UNSAFE');
  return root;
}

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function fail(code: string): never {
  throw new Error(`STAGE25_RHC02_PREVIEW_MEDIA_${code}`);
}
