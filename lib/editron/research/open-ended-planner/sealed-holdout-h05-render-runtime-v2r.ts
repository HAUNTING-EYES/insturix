import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, parse, resolve } from 'node:path';

import { getFFmpegPath } from '@/lib/editron/services/media/ffmpeg-runtime';

export interface HoldoutH05SubjectFrameV2R {
  frame: number;
  left: number; right: number; top: number; bottom: number; pixels: number;
  normalizedBox: Readonly<{
    x: number; y: number; width: number; height: number; units: 'normalized';
  }>;
}

export interface HoldoutH05VisualProofV2R {
  decodedFrameCount: number;
  minSubjectPixels: number;
  minSubjectMarginPx: number;
  minLogoPixels: number;
  maxLogoTopMarginErrorPx: number;
  maxLogoRightMarginErrorPx: number;
}

export async function scanHoldoutH05SourceTrackV2R(input: {
  filePath: string; width: number; height: number; expectedFrames: number;
  ffmpegPath?: string;
}): Promise<Readonly<{ decodedFrameCount: number; frames: readonly Readonly<HoldoutH05SubjectFrameV2R>[] }>> {
  const frames: HoldoutH05SubjectFrameV2R[] = [];
  await scanRgbFrames({ ...input, onFrame: (rgb, frame) => {
    const bounds = measureFrame(rgb, input.width, input.height, false).subject;
    if (!bounds || bounds.pixels < 1_000) fail(`SEALED_H05_SOURCE_SUBJECT_MISSING:${frame}`);
    frames.push({
      frame, ...bounds,
      normalizedBox: {
        x: round(bounds.left / input.width), y: round(bounds.top / input.height),
        width: round((bounds.right - bounds.left + 1) / input.width),
        height: round((bounds.bottom - bounds.top + 1) / input.height),
        units: 'normalized',
      },
    });
  } });
  return Object.freeze({ decodedFrameCount: frames.length, frames: Object.freeze(frames) });
}

export async function renderHoldoutH05TrackedReframeV2R(input: {
  sourcePath: string;
  xTrack: readonly Readonly<{ frame: number; value: number }>[];
  logo: Readonly<{ left: number; top: number; width: number; height: number }>;
  outputDirectory: string;
  ffmpegPath?: string;
}): Promise<Readonly<{ outputPath: string; artifactSha256: string; bytes: number }>> {
  assertTrack(input.xTrack);
  const targetWidth = 360; const targetHeight = 640; const sourceWidth = 640;
  const scaledWidth = Math.round(sourceWidth * targetHeight / 360);
  const logo = Object.fromEntries(
    Object.entries(input.logo).map(([key, value]) => [key, Math.round(value)]),
  ) as { left: number; top: number; width: number; height: number };
  if (Object.values(logo).some((value) => !Number.isSafeInteger(value) || value < 0)
    || logo.width < 1 || logo.height < 1 || logo.left + logo.width > targetWidth
    || logo.top + logo.height > targetHeight) fail('SEALED_H05_LOGO_PROXY_GEOMETRY_INVALID');
  const root = resolve(input.outputDirectory);
  if (root === parse(root).root || root === resolve(process.cwd())) fail('SEALED_H05_OUTPUT_ROOT_UNSAFE');
  await mkdir(dirname(root), { recursive: true });
  await mkdir(root);
  const outputPath = resolve(root, 'sealed-holdout-h05-tracked-reframe-proxy.mp4');
  const percent = piecewiseExpression(input.xTrack);
  const cropX = `(${scaledWidth - targetWidth})*(${percent})/100`;
  const filter = [
    `scale=${scaledWidth}:${targetHeight}:flags=lanczos`,
    `crop=${targetWidth}:${targetHeight}:x='${cropX}':y=0:exact=1`,
    `drawbox=x=${logo.left}:y=${logo.top}:w=${logo.width}:h=${logo.height}:color=yellow:t=fill`,
  ].join(',');
  await capture(input.ffmpegPath ?? getFFmpegPath(), [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-i', input.sourcePath,
    '-vf', filter, '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18',
    '-pix_fmt', 'yuv420p', '-r', '30', '-frames:v', '450', '-map_metadata', '-1',
    '-movflags', '+faststart', '-n', outputPath,
  ]);
  const bytes = await readFile(outputPath);
  return Object.freeze({
    outputPath, artifactSha256: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
    bytes: bytes.length,
  });
}

export async function scanHoldoutH05RenderedProofV2R(input: {
  filePath: string; expectedFrames: number;
  expectedLogoTopMarginPx: number; expectedLogoRightMarginPx: number;
  ffmpegPath?: string;
}): Promise<Readonly<HoldoutH05VisualProofV2R>> {
  const width = 360; const height = 640;
  let decodedFrameCount = 0; let minSubjectPixels = Number.POSITIVE_INFINITY;
  let minSubjectMarginPx = Number.POSITIVE_INFINITY; let minLogoPixels = Number.POSITIVE_INFINITY;
  let maxLogoTopMarginErrorPx = 0; let maxLogoRightMarginErrorPx = 0;
  await scanRgbFrames({
    filePath: input.filePath, width, height, expectedFrames: input.expectedFrames,
    ffmpegPath: input.ffmpegPath,
    onFrame: (rgb, frame) => {
      const measured = measureFrame(rgb, width, height, true);
      if (!measured.subject || !measured.logo) fail(`SEALED_H05_RENDERED_OBJECT_MISSING:${frame}`);
      const subject = measured.subject; const logo = measured.logo;
      minSubjectPixels = Math.min(minSubjectPixels, subject.pixels);
      minSubjectMarginPx = Math.min(minSubjectMarginPx,
        subject.left, width - 1 - subject.right, subject.top, height - 1 - subject.bottom);
      minLogoPixels = Math.min(minLogoPixels, logo.pixels);
      maxLogoTopMarginErrorPx = Math.max(maxLogoTopMarginErrorPx,
        Math.abs(logo.top - input.expectedLogoTopMarginPx));
      maxLogoRightMarginErrorPx = Math.max(maxLogoRightMarginErrorPx,
        Math.abs((width - 1 - logo.right) - input.expectedLogoRightMarginPx));
      decodedFrameCount += 1;
    },
  });
  if (minSubjectPixels < 20_000 || minSubjectMarginPx < 1 || minLogoPixels < 80
    || maxLogoTopMarginErrorPx > 3 || maxLogoRightMarginErrorPx > 3) {
    fail(`SEALED_H05_RENDERED_GEOMETRY_FAILED:${minSubjectPixels}:${minSubjectMarginPx}:${minLogoPixels}:${maxLogoTopMarginErrorPx}:${maxLogoRightMarginErrorPx}`);
  }
  return Object.freeze({ decodedFrameCount, minSubjectPixels, minSubjectMarginPx,
    minLogoPixels, maxLogoTopMarginErrorPx, maxLogoRightMarginErrorPx });
}

async function scanRgbFrames(input: {
  filePath: string; width: number; height: number; expectedFrames: number;
  ffmpegPath?: string; onFrame(rgb: Buffer, frame: number): void;
}): Promise<void> {
  if (![input.width, input.height, input.expectedFrames].every(Number.isSafeInteger)
    || input.width < 16 || input.height < 16 || input.expectedFrames < 1) {
    fail('SEALED_H05_SCAN_CONTRACT_INVALID');
  }
  const child = spawn(input.ffmpegPath ?? getFFmpegPath(), [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-i', input.filePath,
    '-an', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1',
  ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = ''; child.stderr.on('data', (chunk) => { stderr += String(chunk); });
  let spawnError: Error | null = null;
  child.once('error', (error) => { spawnError = error; });
  const completion = new Promise<number | null>((resolvePromise) => {
    child.once('close', (code) => resolvePromise(code));
  });
  const frameBytes = input.width * input.height * 3;
  let pending = Buffer.alloc(0); let frame = 0;
  try {
    for await (const chunk of child.stdout) {
      const bytes = pending.length ? Buffer.concat([pending, Buffer.from(chunk)]) : Buffer.from(chunk);
      let offset = 0;
      while (bytes.length - offset >= frameBytes) {
        if (frame >= input.expectedFrames) fail('SEALED_H05_SCAN_FRAME_OVERFLOW');
        input.onFrame(bytes.subarray(offset, offset + frameBytes), frame++);
        offset += frameBytes;
      }
      pending = bytes.subarray(offset);
    }
  } catch (error) {
    child.stdout.destroy();
    child.kill('SIGKILL');
    await completion;
    throw error;
  }
  const exitCode = await completion;
  if (spawnError) throw spawnError;
  if (exitCode !== 0) {
    fail(`SEALED_H05_SCAN_PROCESS_FAILED:${exitCode}:${stderr.slice(-2000)}`);
  }
  if (pending.length || frame !== input.expectedFrames) {
    fail(`SEALED_H05_SCAN_FRAME_COUNT_INVALID:${frame}:${pending.length}`);
  }
}

function measureFrame(rgb: Buffer, width: number, height: number, includeLogo: boolean) {
  let subject: MutableBounds | null = null; let logo: MutableBounds | null = null;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const offset = (y * width + x) * 3;
    const red = rgb[offset]; const green = rgb[offset + 1]; const blue = rgb[offset + 2];
    const body = blue > 135 && green > 80 && red < 145 && blue > green * 1.12 && green > red * 1.2;
    const skin = red > 155 && green > 105 && green < 220 && blue > 70 && blue < 190
      && red > green * 1.06 && green > blue * 1.01;
    if (body || skin) subject = addPixel(subject, x, y);
    if (includeLogo && red > 170 && green > 170 && blue < 100 && Math.abs(red - green) < 55) {
      logo = addPixel(logo, x, y);
    }
  }
  return { subject, logo };
}

interface MutableBounds { left: number; right: number; top: number; bottom: number; pixels: number }
function addPixel(value: MutableBounds | null, x: number, y: number): MutableBounds {
  if (!value) return { left: x, right: x, top: y, bottom: y, pixels: 1 };
  value.left = Math.min(value.left, x); value.right = Math.max(value.right, x);
  value.top = Math.min(value.top, y); value.bottom = Math.max(value.bottom, y);
  value.pixels += 1; return value;
}
function assertTrack(points: readonly Readonly<{ frame: number; value: number }>[]): void {
  if (points.length < 2 || points[0]?.frame !== 0 || points.at(-1)?.frame !== 449
    || points.some((point, index) => !Number.isSafeInteger(point.frame)
      || !Number.isFinite(point.value) || point.value < 0 || point.value > 100
      || (index > 0 && point.frame <= points[index - 1].frame))) fail('SEALED_H05_TRACK_INVALID');
}
function piecewiseExpression(points: readonly Readonly<{ frame: number; value: number }>[]): string {
  let expression = decimal(points.at(-1)!.value);
  for (let index = points.length - 2; index >= 0; index -= 1) {
    const start = points[index]; const end = points[index + 1];
    const value = `${decimal(start.value)}+(${decimal(end.value - start.value)})*(n-${start.frame})/${end.frame - start.frame}`;
    expression = `if(lte(n\\,${end.frame})\\,${value}\\,${expression})`;
  }
  return expression;
}
async function capture(command: string, args: string[]): Promise<Buffer> {
  const child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const stdout: Buffer[] = []; let stderr = '';
  child.stdout.on('data', (chunk) => stdout.push(Buffer.from(chunk)));
  child.stderr.on('data', (chunk) => { stderr += String(chunk); });
  await new Promise<void>((resolvePromise, reject) => {
    child.once('error', reject); child.once('close', (code) => code === 0 ? resolvePromise()
      : reject(new Error(`SEALED_H05_PROCESS_FAILED:${command}:${code}:${stderr.slice(-2000)}`)));
  });
  return Buffer.concat(stdout);
}
function decimal(value: number): string { return Number(value.toFixed(8)).toString(); }
function round(value: number): number { return Number(value.toFixed(8)); }
function fail(code: string): never { throw new Error(code); }
