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
 * moov → mvhd: version, timeScale, duration → seconds = duration/timeScale
 */

const MOOV = 0x6D6F6F76; // 'moov'
const MVHD = 0x6D766864; // 'mvhd'
const INITIAL_FETCH_SIZE = 128 * 1024; // 128KB — covers most moov atoms
const MAX_FETCH_SIZE = 2 * 1024 * 1024; // 2MB — give up beyond this

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

    // Large moov — try bigger fetch from tail
    const largeTail = await tryParseFromRange(url, 'tail', MAX_FETCH_SIZE);
    if (largeTail !== null) return largeTail;

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

  const response = await fetch(url, {
    headers: { Range: rangeHeader },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok && response.status !== 206) return null;

  const buffer = new Uint8Array(await response.arrayBuffer());
  return parseMoovDuration(buffer);
}

function parseMoovDuration(data: Uint8Array): number | null {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const len = data.length;

  // Scan for moov box
  const moovOffset = findBox(view, len, MOOV);
  if (moovOffset === -1) return null;

  // Read moov box size to bound the search for mvhd
  const moovSize = view.getUint32(moovOffset, false);
  const moovEnd = Math.min(moovOffset + moovSize, len);

  // Scan for mvhd inside moov
  const mvhdOffset = findBox(view, moovEnd, MVHD, moovOffset + 8);
  if (mvhdOffset === -1) return null;

  // Parse mvhd: [size:4][type:4][version:1][flags:3][...fields...]
  const headerStart = mvhdOffset + 8; // skip size + type
  if (headerStart + 4 >= len) return null;

  const version = view.getUint8(headerStart);

  let timeScale: number;
  let duration: number;

  if (version === 0) {
    // v0: creation(4) + modification(4) + timeScale(4) + duration(4)
    if (headerStart + 4 + 12 >= len) return null;
    timeScale = view.getUint32(headerStart + 4 + 8, false);
    duration = view.getUint32(headerStart + 4 + 12, false);
  } else {
    // v1: creation(8) + modification(8) + timeScale(4) + duration(8)
    if (headerStart + 4 + 24 >= len) return null;
    timeScale = view.getUint32(headerStart + 4 + 16, false);
    // Read 64-bit duration (use upper 32 bits only if needed)
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

function findBox(view: DataView, limit: number, boxType: number, startOffset = 0): number {
  let offset = startOffset;
  while (offset + 8 <= limit) {
    const size = view.getUint32(offset, false);
    const type = view.getUint32(offset + 4, false);

    if (type === boxType) return offset;

    // size=0 means "box extends to end of file" — skip
    // size=1 means "extended size" in next 8 bytes
    if (size === 0) break;
    if (size === 1) {
      if (offset + 16 > limit) break;
      offset += 16; // skip extended size header, continue scanning
      continue;
    }
    if (size < 8) break; // invalid box

    offset += size;
  }
  return -1;
}
