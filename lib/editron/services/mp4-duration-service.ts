/**
 * Server-Side MP4 Duration Extraction
 *
 * Reads the moov/mvhd atoms from an MP4 file via HTTP Range request
 * to extract the accurate video duration. No ffprobe, no heavy deps.
 *
 * Why: Browser's HTMLVideoElement.duration is unreliable for improperly
 * indexed MP4s. Reports 572s for a 1175s file. This caused cascade
 * deletion in the silence-removal-executor (project created with wrong
 * durationInFrames, executor tries to remove more than exists).
 *
 * MP4 box format: [4 bytes size][4 bytes type][size-8 bytes data]
 *   moov -> mvhd: version, timeScale, duration -> seconds = duration/timeScale
 *   moov -> mvex -> mehd: fragment_duration (FRAGMENTED mp4, where mvhd.duration is 0)
 *
 * The range strategy tries tail then head, small then large, so it works for
 * both moov-at-end (most files) and fast-start (moov-at-start) layouts.
 */

const MOOV = 0x6d6f6f76; // 'moov'
const MVHD = 0x6d766864; // 'mvhd'
const MEHD = 0x6d656864; // 'mehd' (movie extends header — fragmented-mp4 total duration)
const INITIAL_FETCH_SIZE = 128 * 1024; // 128KB - covers most moov atoms
const MAX_FETCH_SIZE = 2 * 1024 * 1024; // 2MB - give up beyond this
/** When a server IGNORES Range and returns 200 with the whole file, cap how much we buffer into
 *  memory just to find a small moov — a 500MB upload would otherwise OOM the function. */
const MAX_FULL_FILE_BYTES = 64 * 1024 * 1024; // 64MB

interface RangeAttempt {
  /** Parsed duration in seconds, or null if this slice had no parseable moov/mvhd/mehd. */
  seconds: number | null;
  /** The server ignored Range and returned the whole file (status 200) — further ranges are pointless. */
  wasFullFile: boolean;
}

/**
 * Extract video duration from an MP4 file via HTTP Range request.
 * @param url - Presigned R2/GCS URL (must support Range headers)
 * @returns Duration in seconds, or null if parsing fails
 */
export async function extractMP4Duration(url: string): Promise<number | null> {
  try {
    // tail first (most MP4s have moov at the end); then head (fast-start); then larger reads for a big moov.
    const attempts: Array<['head' | 'tail', number]> = [
      ['tail', INITIAL_FETCH_SIZE],
      ['head', INITIAL_FETCH_SIZE],
      ['tail', MAX_FETCH_SIZE],
      ['head', MAX_FETCH_SIZE],
    ];

    for (const [position, size] of attempts) {
      const attempt = await tryParseFromRange(url, position, size);
      if (attempt.seconds !== null) return attempt.seconds;
      // If Range was ignored we already have (or refused) the whole file — the remaining ranges would
      // just re-download the same bytes.
      if (attempt.wasFullFile) break;
    }

    console.warn('[MP4Duration] Could not find moov/mvhd/mehd in file');
    return null;
  } catch (err: any) {
    console.warn(`[MP4Duration] Failed: ${err.message}`);
    return null;
  }
}

export interface VideoDurationResolution {
  seconds: number;
  source: 'container' | 'transcript' | 'reported';
  /** True when the pick differs from the reported value by more than the tolerance — the caller should overwrite. */
  corrected: boolean;
}

/**
 * Pick the AUTHORITATIVE duration for one video from three candidate signals. The file CONTAINER is the truth
 * (the real length of the bytes); the transcript's last-word end is only a fallback (it marks end-of-SPEECH,
 * not end-of-video — it underestimates trailing footage and is absent for silent clips); the reported/browser
 * value is the last resort (unreliable). `corrected` means the pick materially differs from `reportedSec`.
 *
 * This is the one place that decides which duration wins, so it is pure + unit-tested. The container never
 * loses to the transcript — that was the bug (a correct length dragged down to when the talking stopped).
 */
export function resolveVideoDurationSec(input: {
  containerSec: number | null;
  transcriptEndSec: number | null;
  reportedSec: number;
  toleranceSec?: number;
}): VideoDurationResolution {
  const tol = input.toleranceSec ?? 5;
  // The container value has already passed the MP4 box-structure checks below.
  // Very short b-roll and flash clips are valid media, so do not reinterpret a
  // trustworthy sub-second container duration as missing metadata.
  const validContainer = typeof input.containerSec === 'number'
    && Number.isFinite(input.containerSec) && input.containerSec > 0;
  const validTranscript = typeof input.transcriptEndSec === 'number' && Number.isFinite(input.transcriptEndSec) && input.transcriptEndSec > 10;

  let seconds: number;
  let source: VideoDurationResolution['source'];
  if (validContainer) {
    seconds = input.containerSec as number;
    source = 'container';
  } else if (validTranscript) {
    seconds = input.transcriptEndSec as number;
    source = 'transcript';
  } else {
    seconds = input.reportedSec;
    source = 'reported';
  }

  const corrected = source !== 'reported' && Number.isFinite(input.reportedSec) && Math.abs(seconds - input.reportedSec) > tol;
  return { seconds, source, corrected };
}

async function tryParseFromRange(
  url: string,
  position: 'head' | 'tail',
  size: number,
): Promise<RangeAttempt> {
  const rangeHeader = position === 'tail'
    ? `bytes=-${size}`
    : `bytes=0-${size - 1}`;

  try {
    const response = await fetch(url, {
      headers: { Range: rangeHeader },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok && response.status !== 206) return { seconds: null, wasFullFile: false };

    // 206 = the server honored Range (we got just the slice). 200 = it ignored Range and sent the whole file.
    const wasFullFile = response.status === 200;
    if (wasFullFile) {
      const contentLength = Number(response.headers.get('content-length') ?? '0');
      if (contentLength > MAX_FULL_FILE_BYTES) {
        console.warn(`[MP4Duration] Server ignored Range; body is ${contentLength} bytes (> ${MAX_FULL_FILE_BYTES}) — refusing to buffer it`);
        return { seconds: null, wasFullFile: true };
      }
    }

    const buffer = new Uint8Array(await response.arrayBuffer());
    return { seconds: parseMoovDuration(buffer), wasFullFile };
  } catch (err: any) {
    console.warn(`[MP4Duration] ${position} range (${size} bytes) failed: ${err.message}`);
    return { seconds: null, wasFullFile: false };
  }
}

function parseMoovDuration(data: Uint8Array): number | null {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const len = data.length;

  // Range reads can start in the middle of a preceding box (usually mdat), so
  // top-level boxes in the returned slice are not guaranteed to be aligned at 0.
  for (const moovOffset of findBoxCandidates(view, len, MOOV)) {
    const moovBox = readBox(view, moovOffset, len);
    if (!moovBox) continue;

    const moovEnd = Math.min(moovOffset + moovBox.size, len);
    const childStart = moovOffset + moovBox.headerSize;
    const mvhdOffset = findAlignedBox(view, moovEnd, MVHD, childStart);
    if (mvhdOffset === -1) continue;

    const mvhd = readMvhd(view, len, mvhdOffset);
    if (!mvhd) continue;

    // Normal MP4: mvhd carries the whole-movie duration.
    const seconds = secondsFromUnits(mvhd.durationUnits, mvhd.timeScale, 'structured-container');
    if (seconds !== null) return seconds;

    // Fragmented MP4 (mvhd.duration === 0): the real length is in mehd (moov > mvex > mehd),
    // expressed in the movie timeScale we just read. Scan the moov region for a mehd candidate.
    if (mvhd.timeScale > 0) {
      for (const mehdOffset of findBoxCandidates(view, moovEnd, MEHD, childStart)) {
        const fragSeconds = parseMehdDuration(view, len, mehdOffset, mvhd.timeScale);
        if (fragSeconds !== null) return fragSeconds;
      }
    }
  }

  // If a huge moov started before the fetched range, mvhd itself may still be
  // present. Parse plausible mvhd candidates directly instead of failing closed.
  for (const mvhdOffset of findBoxCandidates(view, len, MVHD)) {
    const mvhd = readMvhd(view, len, mvhdOffset);
    if (!mvhd) continue;
    const seconds = secondsFromUnits(mvhd.durationUnits, mvhd.timeScale);
    if (seconds !== null) return seconds;
  }

  return null;
}

/** Read timeScale + raw duration units from an mvhd box (no seconds conversion). */
function readMvhd(view: DataView, len: number, mvhdOffset: number): { timeScale: number; durationUnits: number } | null {
  const mvhdBox = readBox(view, mvhdOffset, len);
  if (!mvhdBox) return null;

  // mvhd: [size][type][version:1][flags:3][...fields...]
  const headerStart = mvhdOffset + mvhdBox.headerSize;
  if (headerStart + 4 >= len) return null;

  const version = view.getUint8(headerStart);

  if (version === 0) {
    // v0: creation(4) + modification(4) + timeScale(4) + duration(4)
    if (headerStart + 20 > len) return null;
    return {
      timeScale: view.getUint32(headerStart + 4 + 8, false),
      durationUnits: view.getUint32(headerStart + 4 + 12, false),
    };
  }

  // v1: creation(8) + modification(8) + timeScale(4) + duration(8)
  if (headerStart + 32 > len) return null;
  const hi = view.getUint32(headerStart + 4 + 20, false);
  const lo = view.getUint32(headerStart + 4 + 24, false);
  return {
    timeScale: view.getUint32(headerStart + 4 + 16, false),
    durationUnits: hi * 0x100000000 + lo,
  };
}

/** mehd: [size][type][version:1][flags:3][fragment_duration: 4 (v0) or 8 (v1)] in the movie timeScale. */
function parseMehdDuration(view: DataView, len: number, mehdOffset: number, timeScale: number): number | null {
  const mehdBox = readBox(view, mehdOffset, len);
  if (!mehdBox) return null;

  const headerStart = mehdOffset + mehdBox.headerSize;
  if (headerStart + 4 >= len) return null;

  const version = view.getUint8(headerStart);
  let fragmentUnits: number;

  if (version === 0) {
    if (headerStart + 8 > len) return null;
    fragmentUnits = view.getUint32(headerStart + 4, false);
  } else {
    if (headerStart + 12 > len) return null;
    const hi = view.getUint32(headerStart + 4, false);
    const lo = view.getUint32(headerStart + 8, false);
    fragmentUnits = hi * 0x100000000 + lo;
  }

  return secondsFromUnits(fragmentUnits, timeScale, 'structured-container');
}

/**
 * Convert timeScale-relative units to seconds.
 *
 * A duration reached through a validated moov/mvhd or mehd hierarchy may be
 * sub-second. The loose mvhd rescue scan has weaker structural evidence, so it
 * keeps the historical one-second floor to reject byte-pattern false matches.
 */
function secondsFromUnits(
  units: number,
  timeScale: number,
  evidence: 'structured-container' | 'loose-candidate' = 'loose-candidate',
): number | null {
  if (timeScale <= 0 || units <= 0) return null;

  const seconds = units / timeScale;

  const belowEvidenceFloor = evidence === 'loose-candidate' && seconds < 1;
  if (!Number.isFinite(seconds) || seconds <= 0 || belowEvidenceFloor || seconds > 86400) {
    console.warn(`[MP4Duration] Suspicious duration: ${seconds.toFixed(1)}s (timeScale=${timeScale}, units=${units})`);
    return null;
  }

  return Math.round(seconds * 10) / 10; // 1 decimal precision
}

function findBoxCandidates(view: DataView, limit: number, boxType: number, start = 0): number[] {
  const offsets: number[] = [];
  for (let offset = Math.max(0, start); offset + 8 <= limit; offset++) {
    if (view.getUint32(offset + 4, false) !== boxType) continue;
    if (!readBox(view, offset, limit)) continue;
    offsets.push(offset);
  }
  return offsets;
}

function findAlignedBox(view: DataView, limit: number, boxType: number, startOffset = 0): number {
  let offset = startOffset;
  while (offset + 8 <= limit) {
    const type = view.getUint32(offset + 4, false);
    const box = readBox(view, offset, limit);
    if (!box) break;

    if (type === boxType) return offset;

    offset += box.size;
  }
  return -1;
}

function readBox(view: DataView, offset: number, limit: number): { size: number; headerSize: number } | null {
  if (offset + 8 > limit) return null;

  const size32 = view.getUint32(offset, false);
  if (size32 === 0) {
    return { size: limit - offset, headerSize: 8 };
  }
  if (size32 === 1) {
    if (offset + 16 > limit) return null;
    const hi = view.getUint32(offset + 8, false);
    const lo = view.getUint32(offset + 12, false);
    const size = hi * 0x100000000 + lo;
    if (!Number.isSafeInteger(size) || size < 16) return null;
    return { size, headerSize: 16 };
  }
  if (size32 < 8) return null;

  return { size: size32, headerSize: 8 };
}
