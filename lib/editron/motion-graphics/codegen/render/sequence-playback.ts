const FRAME_INDEX_PAD = 5;

export type SequencePlaybackAddress = {
  sequenceId: string;
  frameCount: number;
  cdnBaseUrl: string;
};

function assertFrameCount(frameCount: number): void {
  if (!Number.isInteger(frameCount) || frameCount <= 0) {
    throw new Error(`MG sequence frameCount must be a positive integer, received ${frameCount}`);
  }
}

export function sequenceFrameKey(sequenceId: string, index: number): string {
  const id = sequenceId.trim();
  if (!id) throw new Error('MG sequence playback requires a sequenceId');
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new Error(`MG sequenceId must be URL-safe, received ${sequenceId}`);
  }
  if (!Number.isInteger(index) || index < 0) {
    throw new Error(`MG sequence frame index must be a non-negative integer, received ${index}`);
  }
  return `mgseq_${id}_${String(index).padStart(FRAME_INDEX_PAD, '0')}`;
}

export function sequenceFrameIndex(localFrame: number, frameCount: number): number {
  assertFrameCount(frameCount);
  const finiteFrame = Number.isFinite(localFrame) ? Math.floor(localFrame) : 0;
  return Math.min(Math.max(finiteFrame, 0), frameCount - 1);
}

export function normalizeSequenceCdnBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) throw new Error('MG sequence playback requires a CDN base URL');
  const absolute = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(absolute);
  } catch {
    throw new Error(`MG sequence CDN base URL is invalid: ${value}`);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`MG sequence CDN protocol is unsupported: ${parsed.protocol}`);
  }
  return absolute;
}

export function sequenceFrameUrl(input: SequencePlaybackAddress, index: number): string {
  assertFrameCount(input.frameCount);
  if (index >= input.frameCount) {
    throw new Error(`MG sequence frame index ${index} exceeds frameCount ${input.frameCount}`);
  }
  const baseUrl = normalizeSequenceCdnBaseUrl(input.cdnBaseUrl);
  return `${baseUrl}/asset/${sequenceFrameKey(input.sequenceId, index)}`;
}

export function sequenceFrameUrls(input: SequencePlaybackAddress): string[] {
  assertFrameCount(input.frameCount);
  return Array.from({ length: input.frameCount }, (_, index) => sequenceFrameUrl(input, index));
}
