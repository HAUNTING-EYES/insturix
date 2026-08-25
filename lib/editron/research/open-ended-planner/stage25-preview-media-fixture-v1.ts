import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { copyFile, lstat, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

import { getFFmpegPath } from '@/lib/editron/services/media/ffmpeg-runtime';

import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';

export const STAGE25_PREVIEW_MEDIA_FIXTURE_VERSION_V1 =
  'EDITRON_OE_STAGE25_PREVIEW_MEDIA_FIXTURE_V1_1' as const;

const ASSET_RECIPES = [
  { assetId: 'rhc01-product-a', hue: 0 },
  { assetId: 'rhc01-product-b', hue: 85 },
  { assetId: 'rhc01-product-c', hue: 170 },
] as const;
const FOLLOWING_ASSET_ID = 'rhc01-following-shot' as const;

export interface Stage25PreviewMediaFixtureReceiptV1 {
  version: typeof STAGE25_PREVIEW_MEDIA_FIXTURE_VERSION_V1;
  artifactType: 'Stage25PreviewMediaFixtureReceiptV1';
  authority: 'LOCAL_RESEARCH_FIXTURE_MATERIALIZER_ONLY';
  fixtureId: 'RHC-01-PREVIEW-MEDIA-V1';
  createdAt: string;
  ffmpegIdentity: string;
  ffprobeIdentity: string;
  videoContract: Readonly<{
    width: 540;
    height: 960;
    frameRate: '30/1';
    frameCount: 210;
    codec: 'h264';
    audioStreamCount: 0;
    colorIntent: 'SDR_BT709_LIMITED';
  }>;
  assets: readonly Readonly<{
    assetId: string;
    fileName: string;
    sha256: string;
    bytes: number;
  }>[];
  font: Readonly<{
    fontAssetId: 'rhc01-licensed-display';
    fileName: string;
    sha256: string;
    bytes: number;
    licenseId: 'OFL-1.1-NOTO-SANS';
  }>;
  stateEffects: readonly Readonly<{ kind: 'LOCAL_RESEARCH_FIXTURE_WRITE'; fileName: string }>[];
  receiptHash: string;
  hostPaths: Readonly<{
    assetPaths: Readonly<Record<string, string>>;
    fontPath: string;
  }>;
}

export async function materializeStage25PreviewMediaFixtureV1(input: {
  outputDir: string;
  createdAt: string;
}): Promise<Readonly<Stage25PreviewMediaFixtureReceiptV1>> {
  if (new Date(input.createdAt).toISOString() !== input.createdAt) fail('CREATED_AT_INVALID');
  const root = safeNewDirectory(input.outputDir);
  await mkdir(root);
  const ffmpeg = getFFmpegPath();
  const [ffmpegIdentity, ffprobeIdentity] = await Promise.all([
    toolIdentity(ffmpeg),
    toolIdentity('ffprobe'),
  ]);
  const assetPaths: Record<string, string> = {};
  for (const recipe of ASSET_RECIPES) {
    const output = path.join(root, `${recipe.assetId}.mp4`);
    await generateVideo(ffmpeg, output, recipe.hue);
    assetPaths[recipe.assetId] = output;
  }
  const followingPath = path.join(root, `${FOLLOWING_ASSET_ID}.mp4`);
  await copyFile(assetPaths['rhc01-product-c'], followingPath);
  assetPaths[FOLLOWING_ASSET_ID] = followingPath;

  const assets = await Promise.all(
    [...ASSET_RECIPES.map(({ assetId }) => assetId), FOLLOWING_ASSET_ID]
      .map(async (assetId) => {
        const filePath = assetPaths[assetId];
        const bytes = await readRegularFile(filePath);
        const probe = await probeVideo(filePath);
        assertVideoContract(probe);
        return {
          assetId,
          fileName: path.basename(filePath),
          sha256: sha256(bytes),
          bytes: bytes.length,
        };
      }),
  );
  const productC = assets.find(({ assetId }) => assetId === 'rhc01-product-c') ?? fail('PRODUCT_C_MISSING');
  const following = assets.find(({ assetId }) => assetId === FOLLOWING_ASSET_ID) ?? fail('FOLLOWING_MISSING');
  if (productC.sha256 !== following.sha256) fail('CONTINUATION_BYTES_DRIFT');

  const fontPath = path.resolve(
    'node_modules/next/dist/compiled/@vercel/og/noto-sans-v27-latin-regular.ttf',
  );
  const fontBytes = await readRegularFile(fontPath);
  const portable = {
    version: STAGE25_PREVIEW_MEDIA_FIXTURE_VERSION_V1,
    artifactType: 'Stage25PreviewMediaFixtureReceiptV1' as const,
    authority: 'LOCAL_RESEARCH_FIXTURE_MATERIALIZER_ONLY' as const,
    fixtureId: 'RHC-01-PREVIEW-MEDIA-V1' as const,
    createdAt: input.createdAt,
    ffmpegIdentity,
    ffprobeIdentity,
    videoContract: {
      width: 540 as const,
      height: 960 as const,
      frameRate: '30/1' as const,
      frameCount: 210 as const,
      codec: 'h264' as const,
      audioStreamCount: 0 as const,
      colorIntent: 'SDR_BT709_LIMITED' as const,
    },
    assets,
    font: {
      fontAssetId: 'rhc01-licensed-display' as const,
      fileName: path.basename(fontPath),
      sha256: sha256(fontBytes),
      bytes: fontBytes.length,
      licenseId: 'OFL-1.1-NOTO-SANS' as const,
    },
    stateEffects: [
      ...assets.map(({ fileName }) => ({ kind: 'LOCAL_RESEARCH_FIXTURE_WRITE' as const, fileName })),
    ],
  };
  return deepFreezeV1({
    ...portable,
    receiptHash: hashCanonicalJsonV1(portable),
    hostPaths: { assetPaths, fontPath },
  });
}

async function generateVideo(ffmpeg: string, output: string, hue: number): Promise<void> {
  await capture(ffmpeg, [
    '-v', 'error',
    '-f', 'lavfi',
    '-i', 'testsrc2=size=540x960:rate=30:duration=7',
    '-vf', `hue=h=${hue}:s=0.72,format=yuv420p`,
    '-frames:v', '210',
    '-an',
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '18',
    '-threads', '1',
    '-pix_fmt', 'yuv420p',
    '-color_primaries', 'bt709',
    '-color_trc', 'bt709',
    '-colorspace', 'bt709',
    '-color_range', 'tv',
    '-fflags', '+bitexact',
    '-flags:v', '+bitexact',
    '-map_metadata', '-1',
    '-movflags', '+faststart',
    output,
  ]);
}

async function probeVideo(filePath: string) {
  const value = JSON.parse((await capture('ffprobe', [
    '-v', 'error', '-count_frames', '-show_entries',
    'stream=codec_type,codec_name,width,height,avg_frame_rate,nb_read_frames,color_space,color_transfer,color_primaries,color_range',
    '-of', 'json', filePath,
  ])).toString('utf8')) as { streams?: Array<Record<string, unknown>> };
  const streams = value.streams ?? [];
  const video = streams.find(({ codec_type }) => codec_type === 'video') ?? {};
  return {
    codec: String(video.codec_name ?? ''),
    width: Number(video.width),
    height: Number(video.height),
    frameRate: String(video.avg_frame_rate ?? ''),
    frameCount: Number(video.nb_read_frames),
    audioStreamCount: streams.filter(({ codec_type }) => codec_type === 'audio').length,
    colorSpace: String(video.color_space ?? ''),
    colorTransfer: String(video.color_transfer ?? ''),
    colorPrimaries: String(video.color_primaries ?? ''),
    colorRange: String(video.color_range ?? ''),
  };
}

function assertVideoContract(value: Awaited<ReturnType<typeof probeVideo>>): void {
  if (value.codec !== 'h264' || value.width !== 540 || value.height !== 960
    || value.frameRate !== '30/1' || value.frameCount !== 210
    || value.audioStreamCount !== 0 || value.colorSpace !== 'bt709'
    || value.colorTransfer !== 'bt709' || value.colorPrimaries !== 'bt709'
    || value.colorRange !== 'tv') fail('VIDEO_CONTRACT_INVALID');
}

async function toolIdentity(command: string): Promise<string> {
  const output = (await capture(command, ['-version'])).toString('utf8').split(/\r?\n/, 1)[0]?.trim();
  if (!output) fail('TOOL_IDENTITY_MISSING');
  return output;
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
function sha256(value: Uint8Array): string { return createHash('sha256').update(value).digest('hex'); }
function fail(code: string): never { throw new Error(`STAGE25_PREVIEW_MEDIA_${code}`); }
