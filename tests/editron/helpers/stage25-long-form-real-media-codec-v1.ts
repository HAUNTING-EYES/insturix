import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat } from 'node:fs/promises';
import path from 'node:path';

import { getFFmpegPath } from '@/lib/editron/services/media/ffmpeg-runtime';
import type { Stage25LongFormRealMediaArtifactV1 }
  from '@/lib/editron/research/open-ended-planner/stage25-long-form-real-media-trial-v1';

const WIDTH = 160;
const HEIGHT = 90;
const RATE = '30000/1001';
const DURATION_SECONDS = 16_200;

export async function materializeStage25LongFormSourceV1(outputPath: string) {
  const ffmpegPath = getFFmpegPath();
  const started = performance.now();
  await run(ffmpegPath, [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-fflags', '+bitexact',
    '-f', 'lavfi', '-i', `color=c=0x111827:size=${WIDTH}x${HEIGHT}:rate=${RATE}:duration=${DURATION_SECONDS}`,
    '-f', 'lavfi', '-i', `sine=frequency=440:sample_rate=48000:duration=${DURATION_SECONDS}`,
    '-vf', "drawbox=x='mod(t*25,120)':y='20+10*sin(t)':w=40:h=40:color=0xf59e0b:t=fill",
    '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'libx264', '-preset', 'ultrafast',
    '-crf', '38', '-g', '300', '-keyint_min', '300', '-sc_threshold', '0',
    '-pix_fmt', 'yuv420p', '-color_primaries', 'bt709', '-color_trc', 'bt709',
    '-colorspace', 'bt709', '-color_range', 'tv', '-c:a', 'aac', '-b:a', '24k',
    '-ar', '48000', '-ac', '2', '-flags:v', '+bitexact', '-flags:a', '+bitexact',
    '-map_metadata', '-1', '-movflags', '+faststart', outputPath,
  ], 10 * 60_000);
  const [sourceArtifact, rawProbe, ffmpegIdentity, ffprobeIdentity] = await Promise.all([
    artifact(outputPath), probe(outputPath, false), identity(ffmpegPath), identity('ffprobe'),
  ]);
  return {
    sourcePath: outputPath,
    artifact: sourceArtifact,
    rawProbe,
    ffmpegIdentity,
    ffprobeIdentity,
    materializeMs: Math.max(1, Math.round(performance.now() - started)),
  };
}

export async function hydrateStage25LongFormWindowV1(input: Readonly<{
  sourcePath: string;
  outputDirectory: string;
  windowId: string;
  startPts: string;
  endExclusivePts: string;
}>) {
  const ffmpegPath = getFFmpegPath();
  const startSeconds = seconds(input.startPts);
  const durationSeconds = seconds((BigInt(input.endExclusivePts) - BigInt(input.startPts)).toString());
  const base = input.windowId.toLowerCase();
  const videoPath = path.join(input.outputDirectory, `${base}-window.mp4`);
  const stillPath = path.join(input.outputDirectory, `${base}-still.png`);
  const audioPath = path.join(input.outputDirectory, `${base}-audio.wav`);
  await run(ffmpegPath, [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-ss', startSeconds,
    '-i', input.sourcePath, '-t', durationSeconds, '-map', '0:v:0', '-map', '0:a:0',
    '-frames:v', '60', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28',
    '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '48k', '-ar', '48000', '-ac', '2',
    '-map_metadata', '-1', '-movflags', '+faststart', videoPath,
  ], 120_000);
  await run(ffmpegPath, [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-ss', startSeconds,
    '-i', input.sourcePath, '-frames:v', '1', '-vf', `scale=${WIDTH}:${HEIGHT}`,
    '-map_metadata', '-1', stillPath,
  ], 120_000);
  await run(ffmpegPath, [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-ss', startSeconds,
    '-i', input.sourcePath, '-t', durationSeconds, '-map', '0:a:0',
    '-c:a', 'pcm_s16le', '-ar', '48000', '-ac', '2', '-map_metadata', '-1', audioPath,
  ], 120_000);
  const [video, still, audio, videoProbe, audioProbe] = await Promise.all([
    artifact(videoPath), artifact(stillPath), artifact(audioPath),
    probe(videoPath, true), probe(audioPath, false),
  ]);
  const videoStream = stream(videoProbe, 'video');
  const audioStream = stream(videoProbe, 'audio');
  const wavStream = stream(audioProbe, 'audio');
  return {
    video: {
      ...video,
      frameCount: Number(videoStream.nb_read_frames),
      width: Number(videoStream.width),
      height: Number(videoStream.height),
      videoCodec: String(videoStream.codec_name),
      audioCodec: String(audioStream.codec_name),
    },
    still,
    audio: {
      ...audio,
      sampleRate: Number(wavStream.sample_rate),
      channelCount: Number(wavStream.channels),
      sampleCount: Number(wavStream.duration_ts),
    },
  };
}

async function probe(filePath: string, countFrames: boolean) {
  const args = ['-v', 'error'];
  if (countFrames) args.push('-count_frames');
  args.push('-show_streams', '-show_format', '-of', 'json', filePath);
  return JSON.parse((await run('ffprobe', args, 120_000)).toString('utf8')) as {
    streams?: Array<Record<string, unknown>>; format?: Record<string, unknown>;
  };
}
function stream(probeValue: { streams?: Array<Record<string, unknown>> }, kind: string) {
  return probeValue.streams?.find(({ codec_type }) => codec_type === kind) ?? fail(`STREAM_${kind}`);
}
async function artifact(filePath: string): Promise<Stage25LongFormRealMediaArtifactV1> {
  const stats = await lstat(filePath);
  if (!stats.isFile() || stats.isSymbolicLink() || stats.size < 1) fail('ARTIFACT_INVALID');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk as Buffer);
  return { fileName: path.basename(filePath), sha256: hash.digest('hex'), byteLength: stats.size };
}
async function identity(command: string): Promise<string> {
  const first = (await run(command, ['-version'], 30_000)).toString('utf8').split(/\r?\n/, 1)[0]?.trim();
  return first || fail('TOOL_IDENTITY_MISSING');
}
function seconds(ticks: string): string {
  return (Number(BigInt(ticks)) / 30_000).toFixed(9);
}
async function run(command: string, args: string[], timeoutMs: number): Promise<Buffer> {
  const child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const stdout: Buffer[] = []; let stderr = '';
  child.stdout.on('data', (chunk) => stdout.push(Buffer.from(chunk)));
  child.stderr.on('data', (chunk) => { stderr += String(chunk); });
  const timer = setTimeout(() => child.kill(), timeoutMs);
  const code = await new Promise<number | null>((resolve, reject) => {
    child.once('error', reject); child.once('close', resolve);
  }).finally(() => clearTimeout(timer));
  if (code !== 0) fail(`COMMAND_FAILED:${path.basename(command)}:${stderr.slice(-1_500)}`);
  return Buffer.concat(stdout);
}
function fail(code: string): never { throw new Error(`STAGE25_LONG_FORM_CODEC_${code}`); }
