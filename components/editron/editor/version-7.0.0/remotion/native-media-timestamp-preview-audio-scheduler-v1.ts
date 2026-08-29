import {
  nativeMediaTimestampPreviewAudioRoutePathV1,
  type NativeMediaTimestampPreviewAudioSamplePositionV1,
  type NativeMediaTimestampPreviewAudioWindowSegmentV1,
} from './native-media-timestamp-preview-audio-window-v1';
import {
  assertNativeMediaTimestampPreviewSessionWindowV1,
  type NativeMediaTimestampPreviewSessionWindowV1,
} from './native-media-timestamp-preview-session-window-v1';

const WAV_HEADER_BYTES = 44;
const PCM_BYTES_PER_SAMPLE = 4;
const MIN_PLAYBACK_RATE = 0.25;
const MAX_PLAYBACK_RATE = 2;
const MAX_GAIN = 4;

export type NativeMediaTimestampPreviewAudioScheduleEntryV1 = Readonly<{
  scheduleId: string;
  projectId: string;
  overlayId: string;
  leaseId: string;
  audioHandle: string;
  segmentIdentitySha256: string;
  routePath: string;
  contextStartTimeSeconds: number;
  bufferOffsetSeconds: number;
  contentDurationSeconds: number;
  audibleDurationSeconds: number;
  playbackRate: number;
  gain: number;
  sampleRate: number;
  channelCount: number;
  expectedSampleFrameCount: number;
  expectedWavByteLength: number;
  bufferOffsetSamplePosition: NativeMediaTimestampPreviewAudioSamplePositionV1;
  contentDurationSamplePosition: NativeMediaTimestampPreviewAudioSamplePositionV1;
  timelineDelaySamplePosition: NativeMediaTimestampPreviewAudioSamplePositionV1;
}>;

export type NativeMediaTimestampPreviewDecodedAudioSegmentV1 = Readonly<{
  segmentIdentitySha256: string;
  sampleRate: number;
  channelCount: number;
  sampleFrameCount: number;
  audioBuffer: AudioBuffer;
}>;

export type NativeMediaTimestampPreviewScheduledAudioV1 = Readonly<{
  stop(): void;
  setGain(gain: number, atContextTimeSeconds: number): void;
}>;

export type NativeMediaTimestampPreviewAudioRuntimeV1 = Readonly<{
  contextTimeSeconds(): number;
  resume(): Promise<void>;
  loadSegment(
    entry: NativeMediaTimestampPreviewAudioScheduleEntryV1,
  ): Promise<NativeMediaTimestampPreviewDecodedAudioSegmentV1>;
  schedule(
    entry: NativeMediaTimestampPreviewAudioScheduleEntryV1,
    decoded: NativeMediaTimestampPreviewDecodedAudioSegmentV1,
  ): NativeMediaTimestampPreviewScheduledAudioV1;
  close(): Promise<void>;
}>;

export function planNativeMediaTimestampPreviewAudioScheduleV1(input: Readonly<{
  sessionWindows: readonly NativeMediaTimestampPreviewSessionWindowV1[];
  currentProjectFrame: number;
  contextStartTimeSeconds: number;
  playbackRate: number;
  gainsByOverlayId?: Readonly<Record<string, number>>;
}>): readonly NativeMediaTimestampPreviewAudioScheduleEntryV1[] {
  const currentProjectFrame = nonNegativeSafeInteger(
    input.currentProjectFrame,
    'NATIVE_MEDIA_PREVIEW_AUDIO_CURRENT_FRAME_INVALID',
  );
  const contextStartTimeSeconds = finiteNonNegative(
    input.contextStartTimeSeconds,
    'NATIVE_MEDIA_PREVIEW_AUDIO_CONTEXT_TIME_INVALID',
  );
  const playbackRate = finiteInRange(
    input.playbackRate,
    MIN_PLAYBACK_RATE,
    MAX_PLAYBACK_RATE,
    'NATIVE_MEDIA_PREVIEW_AUDIO_PLAYBACK_RATE_INVALID',
  );
  if (!Array.isArray(input.sessionWindows) || input.sessionWindows.length > 128) {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_WINDOWS_INVALID');
  }
  const windows = input.sessionWindows.map(assertNativeMediaTimestampPreviewSessionWindowV1);
  assertOneProjectRevisionAndNoOverlap(windows);

  const entries: NativeMediaTimestampPreviewAudioScheduleEntryV1[] = [];
  for (const sessionWindow of windows) {
    const audioWindow = sessionWindow.audioWindow;
    if (!audioWindow || currentProjectFrame >= audioWindow.windowProjectEndExclusiveFrame) {
      continue;
    }
    const gain = gainFor(input.gainsByOverlayId, audioWindow.overlayId);
    const windowStart = fraction(audioWindow.canonicalWindowStartSamplePosition);
    const windowEnd = fraction(audioWindow.canonicalWindowEndExclusiveSamplePosition);
    const samplesPerProjectFrame = divideByInteger(
      subtract(windowEnd, windowStart),
      BigInt(audioWindow.windowDurationInFrames),
    );
    const frameOffset = BigInt(currentProjectFrame - audioWindow.windowProjectStartFrame);
    const currentPosition = add(windowStart, multiplyByInteger(samplesPerProjectFrame, frameOffset));

    for (const segment of audioWindow.segments) {
      if (segment.kind === 'SILENCE') continue;
      const entry = planPcmSegment({
        segment,
        projectId: audioWindow.projectId,
        overlayId: audioWindow.overlayId,
        leaseId: audioWindow.lease.leaseId,
        sampleRate: audioWindow.sampleRate,
        channelCount: audioWindow.channelCount,
        currentPosition,
        contextStartTimeSeconds,
        playbackRate,
        gain,
      });
      if (entry) entries.push(entry);
    }
  }
  entries.sort((left, right) => left.contextStartTimeSeconds - right.contextStartTimeSeconds
    || left.overlayId.localeCompare(right.overlayId)
    || left.scheduleId.localeCompare(right.scheduleId));
  const ids = new Set<string>();
  for (const entry of entries) {
    if (ids.has(entry.scheduleId)) {
      throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_SCHEDULE_DUPLICATE');
    }
    ids.add(entry.scheduleId);
  }
  return Object.freeze(entries);
}

export function createNativeMediaTimestampPreviewWebAudioRuntimeV1(
  options: Readonly<{
    fetchImplementation?: typeof fetch;
    audioContextFactory?: () => AudioContext;
  }> = {},
): NativeMediaTimestampPreviewAudioRuntimeV1 {
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const audioContextFactory = options.audioContextFactory ?? defaultAudioContext;
  let context: AudioContext | null = null;
  let closed = false;

  function audioContext(): AudioContext {
    if (closed) throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_RUNTIME_CLOSED');
    context ??= audioContextFactory();
    return context;
  }

  return Object.freeze({
    contextTimeSeconds() {
      return finiteNonNegative(
        audioContext().currentTime,
        'NATIVE_MEDIA_PREVIEW_AUDIO_CONTEXT_TIME_INVALID',
      );
    },
    async resume() {
      const active = audioContext();
      await active.resume();
      if (active.state !== 'running') {
        throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_CONTEXT_NOT_RUNNING');
      }
    },
    async loadSegment(entry) {
      const response = await fetchImplementation(entry.routePath, {
        method: 'GET',
        headers: { Accept: 'audio/wav' },
        cache: 'no-store',
        credentials: 'same-origin',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
      });
      assertAudioResponse(response, entry);
      const bytes = await readExactResponseBytes(response, entry.expectedWavByteLength);
      const decoded = decodeCanonicalS32LeWav(bytes, entry, audioContext());
      return Object.freeze({
        segmentIdentitySha256: entry.segmentIdentitySha256,
        sampleRate: entry.sampleRate,
        channelCount: entry.channelCount,
        sampleFrameCount: entry.expectedSampleFrameCount,
        audioBuffer: decoded,
      });
    },
    schedule(entry, decoded) {
      assertDecodedSegment(entry, decoded);
      const active = audioContext();
      const now = finiteNonNegative(
        active.currentTime,
        'NATIVE_MEDIA_PREVIEW_AUDIO_CONTEXT_TIME_INVALID',
      );
      if (entry.contextStartTimeSeconds < now) {
        throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_SCHEDULE_DEADLINE_MISSED');
      }
      const source = active.createBufferSource();
      const gainNode = active.createGain();
      source.buffer = decoded.audioBuffer;
      source.playbackRate.setValueAtTime(entry.playbackRate, entry.contextStartTimeSeconds);
      gainNode.gain.setValueAtTime(entry.gain, entry.contextStartTimeSeconds);
      source.connect(gainNode);
      gainNode.connect(active.destination);
      let stopped = false;
      let disconnected = false;
      const disconnect = () => {
        if (disconnected) return;
        disconnected = true;
        source.disconnect();
        gainNode.disconnect();
      };
      source.onended = disconnect;
      try {
        source.start(
          entry.contextStartTimeSeconds,
          entry.bufferOffsetSeconds,
          entry.contentDurationSeconds,
        );
      } catch (error) {
        disconnect();
        throw error;
      }
      return Object.freeze({
        stop() {
          if (stopped) return;
          stopped = true;
          try { source.stop(); } catch { /* The source may already have ended. */ }
          disconnect();
        },
        setGain(gain, atContextTimeSeconds) {
          const normalizedGain = finiteInRange(
            gain,
            0,
            MAX_GAIN,
            'NATIVE_MEDIA_PREVIEW_AUDIO_GAIN_INVALID',
          );
          const when = Math.max(
            finiteNonNegative(
              atContextTimeSeconds,
              'NATIVE_MEDIA_PREVIEW_AUDIO_CONTEXT_TIME_INVALID',
            ),
            active.currentTime,
          );
          gainNode.gain.setValueAtTime(normalizedGain, when);
        },
      });
    },
    async close() {
      if (closed) return;
      closed = true;
      const active = context;
      context = null;
      if (active && active.state !== 'closed') await active.close();
    },
  });
}

function planPcmSegment(input: Readonly<{
  segment: Extract<NativeMediaTimestampPreviewAudioWindowSegmentV1, { kind: 'PCM' }>;
  projectId: string;
  overlayId: string;
  leaseId: string;
  sampleRate: number;
  channelCount: number;
  currentPosition: FractionV1;
  contextStartTimeSeconds: number;
  playbackRate: number;
  gain: number;
}>): NativeMediaTimestampPreviewAudioScheduleEntryV1 | null {
  const timelineStart = fraction(input.segment.timelineStartSamplePosition);
  const timelineEnd = fraction(input.segment.timelineEndExclusiveSamplePosition);
  const clipStart = compare(input.currentPosition, timelineStart) > 0
    ? input.currentPosition
    : timelineStart;
  if (compare(clipStart, timelineEnd) >= 0) return null;
  const timelineDelay = subtract(clipStart, input.currentPosition);
  const contentDuration = subtract(timelineEnd, clipStart);
  const decodedStart = fraction(input.segment.decodedStartSamplePosition);
  const sourceStart = integerFraction(BigInt(input.segment.sourceStartSampleFrame));
  const bufferOffset = add(
    subtract(decodedStart, sourceStart),
    subtract(clipStart, timelineStart),
  );
  const expectedSampleFrameCount = safeBigIntToNumber(
    BigInt(input.segment.sourceEndExclusiveSampleFrame)
      - BigInt(input.segment.sourceStartSampleFrame),
    'NATIVE_MEDIA_PREVIEW_AUDIO_SAMPLE_COUNT_INVALID',
  );
  const expectedWavByteLength = safeBigIntToNumber(
    BigInt(WAV_HEADER_BYTES)
      + BigInt(expectedSampleFrameCount)
        * BigInt(input.channelCount)
        * BigInt(PCM_BYTES_PER_SAMPLE),
    'NATIVE_MEDIA_PREVIEW_AUDIO_WAV_BYTES_INVALID',
  );
  const bufferOffsetSeconds = fractionSeconds(bufferOffset, input.sampleRate);
  const contentDurationSeconds = fractionSeconds(contentDuration, input.sampleRate);
  const timelineDelaySeconds = fractionSeconds(timelineDelay, input.sampleRate);
  const bufferDurationSeconds = expectedSampleFrameCount / input.sampleRate;
  if (bufferOffsetSeconds + contentDurationSeconds > bufferDurationSeconds + Number.EPSILON * 8) {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_BUFFER_RANGE_INVALID');
  }
  const bufferOffsetSamplePosition = position(bufferOffset);
  const contentDurationSamplePosition = position(contentDuration);
  const timelineDelaySamplePosition = position(timelineDelay);
  const plannedContextStartTimeSeconds = finiteNonNegative(
    input.contextStartTimeSeconds + timelineDelaySeconds / input.playbackRate,
    'NATIVE_MEDIA_PREVIEW_AUDIO_CONTEXT_TIME_INVALID',
  );
  const audibleDurationSeconds = finiteNonNegative(
    contentDurationSeconds / input.playbackRate,
    'NATIVE_MEDIA_PREVIEW_AUDIO_TIME_INVALID',
  );
  return Object.freeze({
    scheduleId: [
      input.leaseId,
      input.segment.segmentIdentitySha256,
      timelineDelaySamplePosition.numerator,
      timelineDelaySamplePosition.denominator,
    ].join(':'),
    projectId: input.projectId,
    overlayId: input.overlayId,
    leaseId: input.leaseId,
    audioHandle: input.segment.audioHandle,
    segmentIdentitySha256: input.segment.segmentIdentitySha256,
    routePath: nativeMediaTimestampPreviewAudioRoutePathV1(
      input.projectId,
      input.segment.audioHandle,
    ),
    contextStartTimeSeconds: plannedContextStartTimeSeconds,
    bufferOffsetSeconds,
    contentDurationSeconds,
    audibleDurationSeconds,
    playbackRate: input.playbackRate,
    gain: input.gain,
    sampleRate: input.sampleRate,
    channelCount: input.channelCount,
    expectedSampleFrameCount,
    expectedWavByteLength,
    bufferOffsetSamplePosition,
    contentDurationSamplePosition,
    timelineDelaySamplePosition,
  });
}

function assertOneProjectRevisionAndNoOverlap(
  windows: readonly NativeMediaTimestampPreviewSessionWindowV1[],
): void {
  const first = windows[0]?.pictureWindow;
  const byOverlay = new Map<string, Array<Readonly<{ start: number; end: number }>>>();
  for (const sessionWindow of windows) {
    const picture = sessionWindow.pictureWindow;
    if (first && (picture.projectId !== first.projectId
      || picture.sequenceId !== first.sequenceId
      || picture.projectRevision.value !== first.projectRevision.value
      || picture.projectRevision.compatibilityUpdatedAt
        !== first.projectRevision.compatibilityUpdatedAt)) {
      throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_BATCH_SCOPE_MISMATCH');
    }
    const ranges = byOverlay.get(picture.overlayId) ?? [];
    const start = picture.overlayFromFrame + picture.windowLocalStartFrame;
    const end = start + picture.windowDurationInFrames;
    if (ranges.some((range) => start < range.end && end > range.start)) {
      throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_WINDOWS_OVERLAP');
    }
    ranges.push({ start, end });
    byOverlay.set(picture.overlayId, ranges);
  }
}

function assertAudioResponse(
  response: Response,
  entry: NativeMediaTimestampPreviewAudioScheduleEntryV1,
): void {
  if (!response.ok || response.status !== 200 || response.redirected
    || response.headers.get('x-editron-preview-status') !== 'CURRENT'
    || response.headers.get('x-editron-audio-segment') !== entry.segmentIdentitySha256
    || response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'audio/wav'
    || response.headers.get('content-length') !== String(entry.expectedWavByteLength)
    || !/^"sha256-[a-f0-9]{64}"$/.test(response.headers.get('etag') ?? '')) {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_RESPONSE_INVALID');
  }
}

async function readExactResponseBytes(response: Response, expected: number): Promise<Uint8Array> {
  if (!response.body) throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_RESPONSE_INVALID');
  const reader = response.body.getReader();
  const output = new Uint8Array(expected);
  let offset = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (offset + value.byteLength > expected) {
      await reader.cancel();
      throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_RESPONSE_BYTES_INVALID');
    }
    output.set(value, offset);
    offset += value.byteLength;
  }
  if (offset !== expected) throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_RESPONSE_BYTES_INVALID');
  return output;
}

function decodeCanonicalS32LeWav(
  bytes: Uint8Array,
  entry: NativeMediaTimestampPreviewAudioScheduleEntryV1,
  context: AudioContext,
): AudioBuffer {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (ascii(bytes, 0, 4) !== 'RIFF'
    || view.getUint32(4, true) !== bytes.byteLength - 8
    || ascii(bytes, 8, 4) !== 'WAVE'
    || ascii(bytes, 12, 4) !== 'fmt '
    || view.getUint32(16, true) !== 16
    || view.getUint16(20, true) !== 1
    || view.getUint16(22, true) !== entry.channelCount
    || view.getUint32(24, true) !== entry.sampleRate
    || view.getUint32(28, true)
      !== entry.sampleRate * entry.channelCount * PCM_BYTES_PER_SAMPLE
    || view.getUint16(32, true) !== entry.channelCount * PCM_BYTES_PER_SAMPLE
    || view.getUint16(34, true) !== PCM_BYTES_PER_SAMPLE * 8
    || ascii(bytes, 36, 4) !== 'data'
    || view.getUint32(40, true) !== bytes.byteLength - WAV_HEADER_BYTES) {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_WAV_INVALID');
  }
  const buffer = context.createBuffer(
    entry.channelCount,
    entry.expectedSampleFrameCount,
    entry.sampleRate,
  );
  for (let channel = 0; channel < entry.channelCount; channel += 1) {
    const output = buffer.getChannelData(channel);
    for (let frame = 0; frame < entry.expectedSampleFrameCount; frame += 1) {
      const byteOffset = WAV_HEADER_BYTES
        + (frame * entry.channelCount + channel) * PCM_BYTES_PER_SAMPLE;
      output[frame] = view.getInt32(byteOffset, true) / 2_147_483_648;
    }
  }
  if (buffer.length !== entry.expectedSampleFrameCount
    || buffer.sampleRate !== entry.sampleRate
    || buffer.numberOfChannels !== entry.channelCount) {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_DECODE_INVALID');
  }
  return buffer;
}

function assertDecodedSegment(
  entry: NativeMediaTimestampPreviewAudioScheduleEntryV1,
  decoded: NativeMediaTimestampPreviewDecodedAudioSegmentV1,
): void {
  if (decoded.segmentIdentitySha256 !== entry.segmentIdentitySha256
    || decoded.sampleRate !== entry.sampleRate
    || decoded.channelCount !== entry.channelCount
    || decoded.sampleFrameCount !== entry.expectedSampleFrameCount
    || decoded.audioBuffer.sampleRate !== entry.sampleRate
    || decoded.audioBuffer.numberOfChannels !== entry.channelCount
    || decoded.audioBuffer.length !== entry.expectedSampleFrameCount) {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_DECODE_INVALID');
  }
}

function defaultAudioContext(): AudioContext {
  if (typeof globalThis.AudioContext !== 'function') {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_CONTEXT_UNAVAILABLE');
  }
  return new globalThis.AudioContext({ latencyHint: 'interactive' });
}

type FractionV1 = Readonly<{ numerator: bigint; denominator: bigint }>;

function fraction(value: NativeMediaTimestampPreviewAudioSamplePositionV1): FractionV1 {
  return normalizeFraction(BigInt(value.numerator), BigInt(value.denominator));
}

function integerFraction(value: bigint): FractionV1 {
  return { numerator: value, denominator: BigInt(1) };
}

function normalizeFraction(numerator: bigint, denominator: bigint): FractionV1 {
  if (denominator <= BigInt(0)) throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_FRACTION_INVALID');
  const sign = denominator < BigInt(0) ? BigInt(-1) : BigInt(1);
  const divisor = gcd(abs(numerator), abs(denominator));
  return {
    numerator: numerator * sign / divisor,
    denominator: denominator * sign / divisor,
  };
}

function add(left: FractionV1, right: FractionV1): FractionV1 {
  return normalizeFraction(
    left.numerator * right.denominator + right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

function subtract(left: FractionV1, right: FractionV1): FractionV1 {
  return normalizeFraction(
    left.numerator * right.denominator - right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

function multiplyByInteger(value: FractionV1, multiplier: bigint): FractionV1 {
  return normalizeFraction(value.numerator * multiplier, value.denominator);
}

function divideByInteger(value: FractionV1, divisor: bigint): FractionV1 {
  if (divisor === BigInt(0)) throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_FRACTION_INVALID');
  return normalizeFraction(value.numerator, value.denominator * divisor);
}

function compare(left: FractionV1, right: FractionV1): number {
  const delta = left.numerator * right.denominator - right.numerator * left.denominator;
  return delta < BigInt(0) ? -1 : delta > BigInt(0) ? 1 : 0;
}

function position(value: FractionV1): NativeMediaTimestampPreviewAudioSamplePositionV1 {
  if (value.numerator < BigInt(0)) {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_POSITION_INVALID');
  }
  return Object.freeze({
    numerator: value.numerator.toString(),
    denominator: value.denominator.toString(),
    disposition: value.denominator === BigInt(1)
      ? 'INTEGER_SAMPLE_FRAME' as const
      : 'BETWEEN_SAMPLE_FRAMES' as const,
  });
}

function fractionSeconds(value: FractionV1, sampleRate: number): number {
  if (value.numerator < BigInt(0)) throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_TIME_INVALID');
  const seconds = Number(value.numerator) / Number(value.denominator) / sampleRate;
  return finiteNonNegative(seconds, 'NATIVE_MEDIA_PREVIEW_AUDIO_TIME_INVALID');
}

function gainFor(values: Readonly<Record<string, number>> | undefined, overlayId: string): number {
  return finiteInRange(
    values?.[overlayId] ?? 1,
    0,
    MAX_GAIN,
    'NATIVE_MEDIA_PREVIEW_AUDIO_GAIN_INVALID',
  );
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

function safeBigIntToNumber(value: bigint, code: string): number {
  if (value < BigInt(0) || value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(code);
  return Number(value);
}

function finiteInRange(value: unknown, minimum: number, maximum: number, code: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)
    || value < minimum || value > maximum) throw new Error(code);
  return value;
}

function finiteNonNegative(value: unknown, code: string): number {
  return finiteInRange(value, 0, Number.MAX_VALUE, code);
}

function nonNegativeSafeInteger(value: unknown, code: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error(code);
  return Number(value);
}

function gcd(left: bigint, right: bigint): bigint {
  let a = abs(left);
  let b = abs(right);
  while (b !== BigInt(0)) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a === BigInt(0) ? BigInt(1) : a;
}

function abs(value: bigint): bigint {
  return value < BigInt(0) ? -value : value;
}
