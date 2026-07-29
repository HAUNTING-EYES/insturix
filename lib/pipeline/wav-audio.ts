export interface PcmWavFormat {
  audioFormat: 1;
  channels: number;
  sampleRate: number;
  byteRate: number;
  blockAlign: number;
  bitsPerSample: 16;
}

export interface ParsedPcmWav {
  format: PcmWavFormat;
  pcm: Buffer;
}

export interface SpeechWavNormalizationReceipt {
  version: 'editron-speech-wav-normalization-v1';
  sourceDurationMs: number;
  outputDurationMs: number;
  leadingTrimMs: number;
  trailingTrimMs: number;
  silenceThresholdDbfs: number;
  preservedPaddingMs: number;
  removedNonAudioBytes: number;
}

export type PcmWavSegment =
  | { kind: 'wav'; buffer: Buffer }
  | { kind: 'silence'; durationMs: number };

const PCM_FORMAT = 1;
const PCM_BITS_PER_SAMPLE = 16;
const RIFF_HEADER_BYTES = 12;
const CHUNK_HEADER_BYTES = 8;
const SILENCE_THRESHOLD_DBFS = -50;
const SILENCE_FRAME_MS = 10;
const PRESERVED_PADDING_MS = 40;

export function parsePcmWav(buffer: Buffer): ParsedPcmWav {
  if (
    buffer.length < RIFF_HEADER_BYTES
    || buffer.toString('ascii', 0, 4) !== 'RIFF'
    || buffer.toString('ascii', 8, 12) !== 'WAVE'
  ) {
    throw new Error('invalid-pcm-wav:missing-riff-wave-header');
  }

  let format: PcmWavFormat | undefined;
  const dataChunks: Buffer[] = [];
  let offset = RIFF_HEADER_BYTES;

  while (offset + CHUNK_HEADER_BYTES <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const start = offset + CHUNK_HEADER_BYTES;
    const end = start + size;
    if (end > buffer.length) throw new Error(`invalid-pcm-wav:truncated-${id.trim() || 'chunk'}`);

    if (id === 'fmt ') format = parseFormatChunk(buffer, start, size);
    if (id === 'data') dataChunks.push(buffer.subarray(start, end));
    offset = end + (size % 2);
  }

  if (!format) throw new Error('invalid-pcm-wav:missing-format-chunk');
  if (dataChunks.length === 0) throw new Error('invalid-pcm-wav:missing-data-chunk');
  const pcm = Buffer.concat(dataChunks);
  if (pcm.length === 0 || pcm.length % format.blockAlign !== 0) {
    throw new Error('invalid-pcm-wav:unaligned-or-empty-pcm');
  }
  return { format, pcm };
}

export function pcmWavDurationMs(buffer: Buffer): number {
  const parsed = parsePcmWav(buffer);
  return durationMs(parsed.pcm.length, parsed.format.byteRate);
}

export function mergePcmWavSegments(
  segments: PcmWavSegment[],
): { buffer: Buffer; removedNonAudioBytes: number } {
  const wavSegments = segments
    .filter((segment): segment is Extract<PcmWavSegment, { kind: 'wav' }> => segment.kind === 'wav')
    .map((segment) => ({
      buffer: segment.buffer,
      parsed: parsePcmWav(segment.buffer),
    }));
  const parsedWavs = wavSegments.map((segment) => segment.parsed);
  const reference = parsedWavs[0]?.format;
  if (!reference) throw new Error('invalid-pcm-wav:no-audio-segments');
  for (const parsed of parsedWavs.slice(1)) assertSameFormat(reference, parsed.format);

  let wavIndex = 0;
  const pcm = segments.map((segment) => {
    if (segment.kind === 'wav') return parsedWavs[wavIndex++].pcm;
    if (!Number.isFinite(segment.durationMs) || segment.durationMs < 0) {
      throw new Error(`invalid-pcm-wav:silence-duration-${String(segment.durationMs)}`);
    }
    const sampleFrames = Math.round((segment.durationMs / 1000) * reference.sampleRate);
    return Buffer.alloc(sampleFrames * reference.blockAlign);
  });
  return {
    buffer: buildPcmWav(reference, Buffer.concat(pcm)),
    removedNonAudioBytes: wavSegments.reduce(
      (total, segment) => total + nonAudioByteCount(segment.buffer, segment.parsed.pcm.length),
      0,
    ),
  };
}

export function normalizeSpeechPcmWav(
  buffer: Buffer,
  options: { trimBoundarySilence: boolean; previouslyRemovedNonAudioBytes?: number },
): { buffer: Buffer; durationMs: number; receipt: SpeechWavNormalizationReceipt } {
  const parsed = parsePcmWav(buffer);
  const sourceDurationMs = durationMs(parsed.pcm.length, parsed.format.byteRate);
  const nonAudioBytes = nonAudioByteCount(buffer, parsed.pcm.length)
    + Math.max(0, options.previouslyRemovedNonAudioBytes ?? 0);
  if (!options.trimBoundarySilence) {
    const normalized = buildPcmWav(parsed.format, parsed.pcm);
    return {
      buffer: normalized,
      durationMs: sourceDurationMs,
      receipt: normalizationReceipt(sourceDurationMs, sourceDurationMs, 0, 0, nonAudioBytes),
    };
  }

  const active = audibleBounds(parsed);
  const paddingBytes = alignedByteCount(PRESERVED_PADDING_MS, parsed.format);
  const start = alignDown(Math.max(0, active.start - paddingBytes), parsed.format.blockAlign);
  const end = alignUp(
    Math.min(parsed.pcm.length, active.end + paddingBytes),
    parsed.format.blockAlign,
    parsed.pcm.length,
  );
  const trimmedPcm = parsed.pcm.subarray(start, end);
  const outputDurationMs = durationMs(trimmedPcm.length, parsed.format.byteRate);
  const leadingTrimMs = durationMs(start, parsed.format.byteRate);
  const trailingTrimMs = durationMs(parsed.pcm.length - end, parsed.format.byteRate);
  return {
    buffer: buildPcmWav(parsed.format, trimmedPcm),
    durationMs: outputDurationMs,
    receipt: normalizationReceipt(
      sourceDurationMs,
      outputDurationMs,
      leadingTrimMs,
      trailingTrimMs,
      nonAudioBytes,
    ),
  };
}

function parseFormatChunk(buffer: Buffer, start: number, size: number): PcmWavFormat {
  if (size < 16) throw new Error('invalid-pcm-wav:short-format-chunk');
  const audioFormat = buffer.readUInt16LE(start);
  const channels = buffer.readUInt16LE(start + 2);
  const sampleRate = buffer.readUInt32LE(start + 4);
  const byteRate = buffer.readUInt32LE(start + 8);
  const blockAlign = buffer.readUInt16LE(start + 12);
  const bitsPerSample = buffer.readUInt16LE(start + 14);
  if (
    audioFormat !== PCM_FORMAT
    || bitsPerSample !== PCM_BITS_PER_SAMPLE
    || channels <= 0
    || sampleRate <= 0
    || blockAlign !== channels * 2
    || byteRate !== sampleRate * blockAlign
  ) {
    throw new Error(
      `unsupported-pcm-wav-format:${audioFormat}:${channels}:${sampleRate}:${bitsPerSample}`,
    );
  }
  return {
    audioFormat: PCM_FORMAT,
    channels,
    sampleRate,
    byteRate,
    blockAlign,
    bitsPerSample: PCM_BITS_PER_SAMPLE,
  };
}

function buildPcmWav(format: PcmWavFormat, pcm: Buffer): Buffer {
  if (pcm.length === 0 || pcm.length % format.blockAlign !== 0) {
    throw new Error('invalid-pcm-wav:cannot-build-unaligned-or-empty-pcm');
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(format.audioFormat, 20);
  header.writeUInt16LE(format.channels, 22);
  header.writeUInt32LE(format.sampleRate, 24);
  header.writeUInt32LE(format.byteRate, 28);
  header.writeUInt16LE(format.blockAlign, 32);
  header.writeUInt16LE(format.bitsPerSample, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function audibleBounds(parsed: ParsedPcmWav): { start: number; end: number } {
  const frameBytes = Math.max(
    parsed.format.blockAlign,
    Math.round((SILENCE_FRAME_MS / 1000) * parsed.format.sampleRate) * parsed.format.blockAlign,
  );
  const threshold = 32_767 * (10 ** (SILENCE_THRESHOLD_DBFS / 20));
  let first = -1;
  let last = -1;

  for (let start = 0; start < parsed.pcm.length; start += frameBytes) {
    const end = Math.min(parsed.pcm.length, start + frameBytes);
    let squared = 0;
    let samples = 0;
    for (let offset = start; offset + 2 <= end; offset += 2) {
      const sample = parsed.pcm.readInt16LE(offset);
      squared += sample * sample;
      samples += 1;
    }
    const rms = samples > 0 ? Math.sqrt(squared / samples) : 0;
    if (rms < threshold) continue;
    if (first < 0) first = start;
    last = end;
  }

  if (first < 0 || last <= first) throw new Error('generated-speech-has-no-audible-pcm');
  return { start: first, end: last };
}

function assertSameFormat(expected: PcmWavFormat, actual: PcmWavFormat): void {
  if (
    expected.channels !== actual.channels
    || expected.sampleRate !== actual.sampleRate
    || expected.byteRate !== actual.byteRate
    || expected.blockAlign !== actual.blockAlign
    || expected.bitsPerSample !== actual.bitsPerSample
  ) {
    throw new Error('invalid-pcm-wav:segment-format-mismatch');
  }
}

function alignedByteCount(milliseconds: number, format: PcmWavFormat): number {
  return Math.round((milliseconds / 1000) * format.sampleRate) * format.blockAlign;
}

function durationMs(bytes: number, byteRate: number): number {
  return Math.round((bytes / byteRate) * 1000);
}

function alignDown(value: number, alignment: number): number {
  return Math.floor(value / alignment) * alignment;
}

function alignUp(value: number, alignment: number, maximum: number): number {
  return Math.min(maximum, Math.ceil(value / alignment) * alignment);
}

function normalizationReceipt(
  sourceDurationMs: number,
  outputDurationMs: number,
  leadingTrimMs: number,
  trailingTrimMs: number,
  removedNonAudioBytes: number,
): SpeechWavNormalizationReceipt {
  return {
    version: 'editron-speech-wav-normalization-v1',
    sourceDurationMs,
    outputDurationMs,
    leadingTrimMs,
    trailingTrimMs,
    silenceThresholdDbfs: SILENCE_THRESHOLD_DBFS,
    preservedPaddingMs: PRESERVED_PADDING_MS,
    removedNonAudioBytes,
  };
}

function nonAudioByteCount(buffer: Buffer, pcmBytes: number): number {
  return Math.max(0, buffer.length - 44 - pcmBytes);
}
