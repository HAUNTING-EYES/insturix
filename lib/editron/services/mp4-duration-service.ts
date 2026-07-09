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
 * moov -> mvhd: version, timeScale, duration -> seconds = duration/timeScale
 */

const MOOV = 0x6D6F6F76; // 'moov'
const MVHD = 0x6D766864; // 'mvhd'
const INITIAL_FETCH_SIZE = 128 * 1024; // 128KB - covers most moov atoms
const MAX_FETCH_SIZE = 2 * 1024 * 1024; // 2MB - give up beyond this

/**
 * Extract video duration from an MP4 file via HTTP Range request.
 * @param url - Presigned R2/GCS URL (must support Range headers)
 * @returns Duration in seconds, or null if parsing fails
 */
export async function extractMP4Duration(url: string): Promise<number | null> {
  try {
    // Try tail first (most MP4s have moov at the end)
    const tailDuration = await tryParseFromRange(url, 'tail', INITIAL_FETCH_SIZE);
    if (tailDuration !== null) return tailDuration;

    // Some encoders put moov at the start (fast-start/qt-faststart)
    const headDuration = await tryParseFromRange(url, 'head', INITIAL_FETCH_SIZE);
    if (headDuration !== null) return headDuration;

    // Large moov - try bigger fetch from tail
    const largeTail = await tryParseFromRange(url, 'tail', MAX_FETCH_SIZE);
    if (largeTail !== null) return largeTail;

    // Fast-start files can have a large moov box at the beginning. If mvhd sits
    // after a large child box, the small head read is not enough.
    const largeHead = await tryParseFromRange(url, 'head', MAX_FETCH_SIZE);
    if (largeHead !== null) return largeHead;

    console.warn('[MP4Duration] Could not find moov/mvhd in file');
    return null;
  } catch (err: any) {
    console.warn(`[MP4Duration] Failed: ${err.message}`);
    return null;
  }
}

async function tryParseFromRange(
  url: string,
  position: 'head' | 'tail',
  size: number,
): Promise<number | null> {
  const rangeHeader = position === 'tail'
    ? `bytes=-${size}`
    : `bytes=0-${size - 1}`;

  try {
    const response = await fetch(url, {
      headers: { Range: rangeHeader },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok && response.status !== 206) return null;

    const buffer = new Uint8Array(await response.arrayBuffer());
    return parseMoovDuration(buffer);
  } catch (err: any) {
    console.warn(`[MP4Duration] ${position} range (${size} bytes) failed: ${err.message}`);
    return null;
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
    const mvhdOffset = findAlignedBox(view, moovEnd, MVHD, moovOffset + moovBox.headerSize);
    if (mvhdOffset === -1) continue;

    const seconds = parseMvhdDuration(view, len, mvhdOffset);
    if (seconds !== null) return seconds;
  }

  // If a huge moov started before the fetched range, mvhd itself may still be
  // present. Parse plausible mvhd candidates directly instead of failing closed.
  for (const mvhdOffset of findBoxCandidates(view, len, MVHD)) {
    const seconds = parseMvhdDuration(view, len, mvhdOffset);
    if (seconds !== null) return seconds;
  }

  return null;
}

function parseMvhdDuration(view: DataView, len: number, mvhdOffset: number): number | null {
  const mvhdBox = readBox(view, mvhdOffset, len);
  if (!mvhdBox) return null;

  // Parse mvhd: [size:4/16][type:4][version:1][flags:3][...fields...]
  const headerStart = mvhdOffset + mvhdBox.headerSize;
  if (headerStart + 4 >= len) return null;

  const version = view.getUint8(headerStart);

  let timeScale: number;
  let duration: number;

  if (version === 0) {
    // v0: creation(4) + modification(4) + timeScale(4) + duration(4)
    if (headerStart + 20 > len) return null;
    timeScale = view.getUint32(headerStart + 4 + 8, false);
    duration = view.getUint32(headerStart + 4 + 12, false);
  } else {
    // v1: creation(8) + modification(8) + timeScale(4) + duration(8)
    if (headerStart + 32 > len) return null;
    timeScale = view.getUint32(headerStart + 4 + 16, false);
    const hi = view.getUint32(headerStart + 4 + 20, false);
    const lo = view.getUint32(headerStart + 4 + 24, false);
    duration = hi * 0x100000000 + lo;
  }

  if (timeScale <= 0 || duration <= 0) return null;

  const seconds = duration / timeScale;

  // Sanity: duration should be between 1s and 24h
  if (seconds < 1 || seconds > 86400) {
    console.warn(`[MP4Duration] Suspicious duration: ${seconds.toFixed(1)}s (timeScale=${timeScale}, duration=${duration})`);
    return null;
  }

  return Math.round(seconds * 10) / 10; // 1 decimal precision
}

function findBoxCandidates(view: DataView, limit: number, boxType: number): number[] {
  const offsets: number[] = [];
  for (let offset = 0; offset + 8 <= limit; offset++) {
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