/**
 * Audio-first timing primitives for the avatar speaking lane (lane B).
 *
 * The law (founder, 2026-07-09): word budgets are advisory drafts only. The BINDING
 * step is to synthesize the voice, MEASURE its real duration, and fit the shot to
 * that — never place a shot from an estimate. This mirrors the explainer harness's
 * voice-fit: measure the WAV from its bytes (no ffprobe — ffmpeg is not in the
 * serverless runtime), then fit.
 *
 * Because Kling LipSync caps input video at 10s and we cannot split/stitch video
 * server-side, the avatar shot IS the unit: one speaking shot ≤10s. A line whose
 * measured VO overruns is sped up by at most 4% (atempo last resort) or flagged to
 * rewrite. Longer speech becomes multiple shots, stitched downstream in Editron.
 */

export const RELIP_MAX_SHOT_SEC = 10; // Kling LipSync input-video hard cap ← fal
const ATEMPO_MAX = 0.04; // ±4% speed change is the last resort before rewriting
const HARD_REWRITE_OVERSHOOT = 0.08; // >8% over budget = definitely rewrite, don't nudge

export interface FitDecision {
  /** ok = VO fits as-is; atempo = speed up ≤4% to fit; rewrite = line too long, shorten it. */
  action: 'ok' | 'atempo' | 'rewrite';
  /** The duration the shot will be locked to (seconds). */
  finalSec: number;
  measuredSec: number;
  /** Fraction over budget (0 or negative when it fits). */
  overshootPct: number;
  /** For action 'atempo': the playback-rate factor (>1 = faster). */
  atempoFactor?: number;
  /** For action 'rewrite': how bad. hard = >8% over. */
  severity?: 'soft' | 'hard';
}

/**
 * Fit a measured VO line to a shot budget (default = the relip cap). Audio-first:
 * the shot is generated to the VO, so this only bites when the line overruns.
 */
export function fitLineToShotBudget(measuredSec: number, budgetSec: number = RELIP_MAX_SHOT_SEC): FitDecision {
  const overshootPct = (measuredSec - budgetSec) / budgetSec;

  if (measuredSec <= budgetSec) {
    return { action: 'ok', finalSec: round2(measuredSec), measuredSec: round2(measuredSec), overshootPct: round4(Math.min(0, overshootPct)) };
  }
  if (overshootPct <= ATEMPO_MAX) {
    // Speed up just enough to land inside the budget (atempo factor = measured / budget).
    return {
      action: 'atempo',
      finalSec: budgetSec,
      measuredSec: round2(measuredSec),
      overshootPct: round4(overshootPct),
      atempoFactor: round4(measuredSec / budgetSec),
    };
  }
  return {
    action: 'rewrite',
    finalSec: budgetSec,
    measuredSec: round2(measuredSec),
    overshootPct: round4(overshootPct),
    severity: overshootPct > HARD_REWRITE_OVERSHOOT ? 'hard' : 'soft',
  };
}

/**
 * Measure a WAV's duration from its bytes. Parses the RIFF header (sample rate,
 * channels, bit depth, data size) rather than assuming a fixed format — Chatterbox
 * output rate is not guaranteed. Returns null if the buffer is not a parseable WAV.
 */
interface WavFormat {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  /** Byte offset where PCM data begins. */
  dataOffset: number;
  dataSize: number;
}

function parseWavFormat(buffer: Buffer): WavFormat | null {
  if (buffer.length < 44) return null;
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') return null;

  let offset = 12;
  let sampleRate = 0;
  let channels = 0;
  let bitsPerSample = 0;
  let dataOffset = 0;
  let dataSize = 0;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    if (chunkId === 'fmt ' && offset + 24 <= buffer.length) {
      channels = buffer.readUInt16LE(offset + 10);
      sampleRate = buffer.readUInt32LE(offset + 12);
      bitsPerSample = buffer.readUInt16LE(offset + 22);
    } else if (chunkId === 'data') {
      // Streaming WAVs sometimes write 0 / 0xFFFFFFFF — fall back to the real remaining bytes.
      const remaining = buffer.length - (offset + 8);
      dataOffset = offset + 8;
      dataSize = chunkSize > 0 && chunkSize <= remaining ? chunkSize : remaining;
      break;
    }
    offset += 8 + chunkSize + (chunkSize % 2); // chunks are word-aligned
  }

  if (sampleRate <= 0 || channels <= 0 || bitsPerSample <= 0 || dataSize <= 0) return null;
  return { sampleRate, channels, bitsPerSample, dataOffset, dataSize };
}

export function measureWavDurationSec(buffer: Buffer): number | null {
  const fmt = parseWavFormat(buffer);
  if (!fmt) return null;
  const bytesPerSec = fmt.sampleRate * fmt.channels * (fmt.bitsPerSample / 8);
  if (bytesPerSec <= 0) return null;
  return round2(fmt.dataSize / bytesPerSec);
}

/**
 * Pad a WAV with trailing silence to an exact target duration (pure Node — no
 * ffmpeg). Used to align the cloned-voice audio to Seedance's whole-second output
 * so Kling LipSync stays in sync. Never trims (callers pick a target >= measured).
 */
export function padWavToSec(buffer: Buffer, targetSec: number): Buffer {
  const fmt = parseWavFormat(buffer);
  if (!fmt) throw new Error('padWavToSec: input is not a parseable WAV.');
  const blockAlign = fmt.channels * (fmt.bitsPerSample / 8);
  const bytesPerSec = fmt.sampleRate * blockAlign;
  const existing = buffer.subarray(fmt.dataOffset, fmt.dataOffset + fmt.dataSize);

  let targetBytes = Math.round(bytesPerSec * targetSec);
  targetBytes -= targetBytes % blockAlign; // align to a whole sample frame
  if (targetBytes <= existing.length) {
    return canonicalWav(existing, fmt); // already at/over target — re-emit clean, don't trim speech
  }
  const silence = Buffer.alloc(targetBytes - existing.length); // zero-filled PCM = silence
  return canonicalWav(Buffer.concat([existing, silence]), fmt);
}

function canonicalWav(data: Buffer, fmt: WavFormat): Buffer {
  const blockAlign = fmt.channels * (fmt.bitsPerSample / 8);
  const bytesPerSec = fmt.sampleRate * blockAlign;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(fmt.channels, 22);
  header.writeUInt32LE(fmt.sampleRate, 24);
  header.writeUInt32LE(bytesPerSec, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(fmt.bitsPerSample, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

/** Fetch a synthesized-audio URL and measure its real duration (WAV). */
export async function measureAudioDurationSec(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<number> {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`Failed to fetch audio for measurement (HTTP ${response.status}) from ${url}.`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const seconds = measureWavDurationSec(buffer);
  if (seconds === null) {
    throw new Error('Could not measure audio duration — the file is not a parseable WAV. Do not estimate; fix the synth output.');
  }
  return seconds;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
