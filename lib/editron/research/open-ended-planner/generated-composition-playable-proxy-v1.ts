import { createHash } from 'node:crypto';
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';

import { renderMedia, type CancelSignal } from '@remotion/renderer';
import { ALL_FORMATS, EncodedPacketSink, FilePathSource, Input, type InputVideoTrack } from 'mediabunny';
import type { VideoConfig } from 'remotion/no-react';

export interface GeneratedCompositionPlayableProxyV1 {
  path: string;
  sha256: string;
  container: 'MP4';
  codec: 'H264';
  pixelFormat: 'YUV420P';
  color: { space: 'BT709'; transfer: 'BT709'; primaries: 'BT709'; range: 'LIMITED' };
  audio: 'ABSENT';
  width: number;
  height: number;
  frameRate: { numerator: string; denominator: string };
  durationInFrames: number;
}

export interface GeneratedCompositionPlayableProxyExpectedV1 {
  width: number;
  height: number;
  frameRate: { numerator: string; denominator: string };
  durationInFrames: number;
}

export interface GeneratedCompositionPlayableProxyObservationV1 {
  formatName: string;
  mimeType: string;
  trackCount: number;
  videoTrackCount: number;
  audioTrackCount: number;
  codec: string | null;
  internalCodecId: string | number | null;
  decoderCodec: string | null;
  codedWidth: number;
  codedHeight: number;
  rotation: number;
  timeResolution: number;
  firstTimestamp: number;
  duration: number;
  packetCount: number;
  scannedPacketCount: number;
  uniquePacketTimestampCount: number;
  averagePacketRate: number;
  constantFrameDurationTicks: number | null;
  color: { primaries?: string | null; transfer?: string | null; matrix?: string | null; fullRange?: boolean | null };
  highDynamicRange: boolean;
  alpha: boolean;
  chromaFormatIdc: number | null;
  bitDepthLumaMinus8: number | null;
  bitDepthChromaMinus8: number | null;
}

export async function renderGeneratedCompositionPlayableProxyV1(input: {
  serveUrl: string;
  composition: VideoConfig;
  output: string;
  cancelSignal: CancelSignal;
  expected: GeneratedCompositionPlayableProxyExpectedV1;
}): Promise<Readonly<GeneratedCompositionPlayableProxyV1>> {
  if (input.expected.width % 2 !== 0 || input.expected.height % 2 !== 0) {
    throw new Error('Generated composition playable proxy requires an even YUV420 raster');
  }
  await renderMedia({
    serveUrl: input.serveUrl,
    composition: input.composition,
    outputLocation: input.output,
    codec: 'h264',
    pixelFormat: 'yuv420p',
    colorSpace: 'bt709',
    muted: true,
    enforceAudioTrack: false,
    concurrency: 1,
    overwrite: true,
    cancelSignal: input.cancelSignal,
    logLevel: 'error',
  });
  return probeGeneratedCompositionPlayableProxyV1(input.output, input.expected);
}

export async function probeGeneratedCompositionPlayableProxyV1(
  filePath: string,
  expected: GeneratedCompositionPlayableProxyExpectedV1,
): Promise<Readonly<GeneratedCompositionPlayableProxyV1>> {
  const resolved = path.resolve(filePath);
  const stat = await fs.lstat(resolved);
  if (!stat.isFile() || stat.isSymbolicLink() || path.extname(resolved).toLowerCase() !== '.mp4') {
    throw new Error('Generated composition playable proxy is not a regular MP4 file');
  }
  const observation = await inspectGeneratedCompositionPlayableProxyV1(resolved);
  const metadata = parseGeneratedCompositionPlayableProxyObservationV1(observation, expected);
  return Object.freeze({ path: resolved, sha256: await sha256File(resolved), ...metadata });
}

export function parseGeneratedCompositionPlayableProxyObservationV1(
  observation: GeneratedCompositionPlayableProxyObservationV1,
  expected: GeneratedCompositionPlayableProxyExpectedV1,
): Omit<GeneratedCompositionPlayableProxyV1, 'path' | 'sha256'> {
  if (observation.formatName !== 'MP4' || !observation.mimeType.startsWith('video/mp4')) {
    throw new Error('Generated composition playable proxy container drift');
  }
  if (observation.trackCount !== 1 || observation.videoTrackCount !== 1 || observation.audioTrackCount !== 0) {
    throw new Error('Generated composition playable proxy must contain exactly one video stream and no audio');
  }
  if (observation.codec !== 'avc' || observation.internalCodecId !== 'avc1' || !observation.decoderCodec?.startsWith('avc1.')) {
    throw new Error('Generated composition playable proxy codec contract drift');
  }
  if (observation.codedWidth !== expected.width || observation.codedHeight !== expected.height || observation.rotation !== 0) {
    throw new Error('Generated composition playable proxy raster drift');
  }
  const expectedRate = reducedRate(expected.frameRate);
  const expectedTicksPerFrame = observation.timeResolution * Number(expectedRate.denominator) / Number(expectedRate.numerator);
  const expectedFramesPerSecond = Number(expectedRate.numerator) / Number(expectedRate.denominator);
  if (!Number.isSafeInteger(expectedTicksPerFrame)
    || observation.constantFrameDurationTicks !== expectedTicksPerFrame
    || Math.abs(observation.averagePacketRate - expectedFramesPerSecond) > 1e-9) {
    throw new Error('Generated composition playable proxy frame-rate drift');
  }
  if (observation.packetCount !== expected.durationInFrames
    || observation.scannedPacketCount !== expected.durationInFrames
    || observation.uniquePacketTimestampCount !== expected.durationInFrames) {
    throw new Error('Generated composition playable proxy frame-count drift');
  }
  const expectedSeconds = expected.durationInFrames * Number(expectedRate.denominator) / Number(expectedRate.numerator);
  if (!Number.isFinite(observation.duration) || Math.abs(observation.duration - expectedSeconds) > 0.5 / expectedFramesPerSecond
    || Math.abs(observation.firstTimestamp) > 0.5 / observation.timeResolution) {
    throw new Error('Generated composition playable proxy duration drift');
  }
  if (observation.color.matrix !== 'bt709' || observation.color.transfer !== 'bt709' || observation.color.primaries !== 'bt709'
    || observation.color.fullRange !== false || observation.highDynamicRange || observation.alpha) {
    throw new Error(`Generated composition playable proxy color contract drift: ${JSON.stringify({ color: observation.color, highDynamicRange: observation.highDynamicRange, alpha: observation.alpha })}`);
  }
  if (observation.chromaFormatIdc !== 1 || observation.bitDepthLumaMinus8 !== 0 || observation.bitDepthChromaMinus8 !== 0) {
    throw new Error('Generated composition playable proxy pixel-format drift');
  }
  return {
    container: 'MP4', codec: 'H264', pixelFormat: 'YUV420P',
    color: { space: 'BT709', transfer: 'BT709', primaries: 'BT709', range: 'LIMITED' }, audio: 'ABSENT',
    width: observation.codedWidth, height: observation.codedHeight, frameRate: expectedRate, durationInFrames: expected.durationInFrames,
  };
}

async function inspectGeneratedCompositionPlayableProxyV1(filePath: string): Promise<GeneratedCompositionPlayableProxyObservationV1> {
  const input = new Input({ formats: ALL_FORMATS, source: new FilePathSource(filePath) });
  try {
    const [format, mimeType, tracks, videoTracks, audioTracks] = await Promise.all([input.getFormat(), input.getMimeType(), input.getTracks(), input.getVideoTracks(), input.getAudioTracks()]);
    if (videoTracks.length !== 1) throw new Error('Generated composition playable proxy must contain exactly one video stream and no audio');
    const video = videoTracks[0];
    const [decoder, color, highDynamicRange, alpha, firstTimestamp, duration, stats, packetTiming] = await Promise.all([
      video.getDecoderConfig(), video.getColorSpace(), video.hasHighDynamicRange(), video.canBeTransparent(),
      video.getFirstTimestamp(), video.computeDuration(), video.computePacketStats(), inspectPacketTiming(video),
    ]);
    const pixelFormat = parseAvcPixelFormat(decoder?.description);
    return {
      formatName: format.name, mimeType, trackCount: tracks.length, videoTrackCount: videoTracks.length, audioTrackCount: audioTracks.length,
      codec: video.codec, internalCodecId: typeof video.internalCodecId === 'string' || typeof video.internalCodecId === 'number' ? video.internalCodecId : null,
      decoderCodec: decoder?.codec ?? null, codedWidth: video.codedWidth, codedHeight: video.codedHeight, rotation: video.rotation,
      timeResolution: video.timeResolution, firstTimestamp, duration, packetCount: stats.packetCount, averagePacketRate: stats.averagePacketRate,
      ...packetTiming, color, highDynamicRange, alpha, ...pixelFormat,
    };
  } finally { input.dispose(); }
}

async function inspectPacketTiming(track: InputVideoTrack): Promise<{ scannedPacketCount: number; uniquePacketTimestampCount: number; constantFrameDurationTicks: number | null }> {
  const sink = new EncodedPacketSink(track); const timestamps = new Set<number>(); let scannedPacketCount = 0; let constantFrameDurationTicks: number | null = null;
  for await (const packet of sink.packets(undefined, undefined, { metadataOnly: true })) {
    const timestampTicks = exactTicks(packet.timestamp, track.timeResolution); const durationTicks = exactTicks(packet.duration, track.timeResolution);
    if (timestampTicks === null || durationTicks === null || durationTicks <= 0) constantFrameDurationTicks = null;
    else if (scannedPacketCount === 0) constantFrameDurationTicks = durationTicks;
    else if (constantFrameDurationTicks !== durationTicks) constantFrameDurationTicks = null;
    if (timestampTicks !== null) timestamps.add(timestampTicks);
    scannedPacketCount += 1;
  }
  return { scannedPacketCount, uniquePacketTimestampCount: timestamps.size, constantFrameDurationTicks };
}

function exactTicks(seconds: number, timeResolution: number): number | null { const ticks = seconds * timeResolution; const rounded = Math.round(ticks); return Number.isSafeInteger(rounded) && Math.abs(ticks - rounded) < 1e-6 ? rounded : null; }

function parseAvcPixelFormat(description: AllowSharedBufferSource | undefined): { chromaFormatIdc: number | null; bitDepthLumaMinus8: number | null; bitDepthChromaMinus8: number | null } {
  try {
    if (!description) throw new Error('missing AVC configuration');
    const bytes = ArrayBuffer.isView(description)
      ? new Uint8Array(description.buffer, description.byteOffset, description.byteLength)
      : new Uint8Array(description);
    if (bytes.length < 8 || bytes[0] !== 1) throw new Error('invalid AVC configuration');
    const spsLength = (bytes[6] << 8) | bytes[7]; const sps = bytes.subarray(8, 8 + spsLength);
    if (sps.length !== spsLength || sps.length < 5) throw new Error('invalid AVC SPS');
    const rbsp = removeEmulationPrevention(sps.subarray(1)); const reader = new BitReader(rbsp);
    const profileIdc = reader.readBits(8); reader.readBits(8); reader.readBits(8); reader.readUnsignedExpGolomb();
    if (![44, 83, 86, 100, 110, 118, 122, 128, 134, 135, 138, 139, 244].includes(profileIdc)) {
      return { chromaFormatIdc: 1, bitDepthLumaMinus8: 0, bitDepthChromaMinus8: 0 };
    }
    const chromaFormatIdc = reader.readUnsignedExpGolomb(); if (chromaFormatIdc === 3) reader.readBits(1);
    return { chromaFormatIdc, bitDepthLumaMinus8: reader.readUnsignedExpGolomb(), bitDepthChromaMinus8: reader.readUnsignedExpGolomb() };
  } catch { return { chromaFormatIdc: null, bitDepthLumaMinus8: null, bitDepthChromaMinus8: null }; }
}

function removeEmulationPrevention(bytes: Uint8Array): Uint8Array { const output: number[] = []; for (let index = 0; index < bytes.length; index += 1) { if (index >= 2 && bytes[index] === 3 && bytes[index - 1] === 0 && bytes[index - 2] === 0) continue; output.push(bytes[index]); } return Uint8Array.from(output); }
class BitReader {
  private offset = 0;
  constructor(private readonly bytes: Uint8Array) {}
  readBits(count: number): number { let value = 0; for (let index = 0; index < count; index += 1) { if (this.offset >= this.bytes.length * 8) throw new Error('AVC SPS ended unexpectedly'); value = value * 2 + ((this.bytes[this.offset >> 3] >> (7 - (this.offset & 7))) & 1); this.offset += 1; } return value; }
  readUnsignedExpGolomb(): number { let leadingZeroes = 0; while (this.readBits(1) === 0) { leadingZeroes += 1; if (leadingZeroes > 30) throw new Error('AVC SPS Exp-Golomb value is too large'); } return (2 ** leadingZeroes - 1) + (leadingZeroes ? this.readBits(leadingZeroes) : 0); }
}

function reducedRate(value: { numerator: string; denominator: string }) {
  const numerator = positiveInteger(value.numerator, 'rate numerator');
  const denominator = positiveInteger(value.denominator, 'rate denominator');
  const divisor = gcd(numerator, denominator);
  return { numerator: String(numerator / divisor), denominator: String(denominator / divisor) };
}

function gcd(left: number, right: number): number { let a = left; let b = right; while (b) { [a, b] = [b, a % b]; } return a; }
function positiveInteger(value: string, label: string): number { const parsed = Number(value); if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`Generated composition playable proxy ${label} is invalid`); return parsed; }
async function sha256File(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  await new Promise<void>((resolve, reject) => { const stream = createReadStream(filePath); stream.on('data', (chunk) => hash.update(chunk)); stream.on('error', reject); stream.on('end', resolve); });
  return hash.digest('hex');
}
