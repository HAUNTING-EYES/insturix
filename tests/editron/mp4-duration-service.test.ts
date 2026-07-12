import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractMP4Duration } from '@/lib/editron/services/mp4-duration-service';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('mp4 duration service', () => {
  it('recovers duration when a tail range starts inside mdat before moov', async () => {
    const mp4 = concatBytes(
      makeBox('ftyp', bytes(8, 1)),
      makeBox('mdat', bytes(180_000, 7)),
      makeBox('moov', makeMvhdV0(1_000, 1_175_000)),
    );

    stubRangeFetch(mp4);

    await expect(extractMP4Duration('https://example.test/video.mp4')).resolves.toBe(1_175);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('parses fast-start MP4s with moov near the beginning', async () => {
    const mp4 = concatBytes(
      makeBox('ftyp', bytes(8, 1)),
      makeBox('moov', makeMvhdV0(600, 54_000)),
      makeBox('mdat', bytes(16_000, 3)),
    );

    stubRangeFetch(mp4);

    await expect(extractMP4Duration('https://example.test/fast-start.mp4')).resolves.toBe(90);
  });

  it('falls back to head parsing when a tail range has a truncated mvhd-like box', async () => {
    const mp4 = concatBytes(
      makeBox('ftyp', bytes(8, 1)),
      makeBox('moov', makeMvhdV0(1_000, 90_000)),
      makeBox('mdat', bytes(150_000, 3)),
      makeTruncatedMvhdCandidate(),
    );

    stubRangeFetch(mp4);

    await expect(extractMP4Duration('https://example.test/truncated-tail.mp4')).resolves.toBe(90);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('expands the head range for large fast-start moov boxes', async () => {
    const mp4 = concatBytes(
      makeBox('ftyp', bytes(8, 1)),
      makeBox('moov', concatBytes(
        makeBox('free', bytes(180_000, 0)),
        makeMvhdV0(1_000, 300_000),
      )),
      makeBox('mdat', bytes(2_200_000, 5)),
    );

    stubRangeFetch(mp4);

    await expect(extractMP4Duration('https://example.test/large-fast-start.mp4')).resolves.toBe(300);
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it('recovers duration from mehd for a FRAGMENTED mp4 (mvhd.duration is 0)', async () => {
    const mp4 = concatBytes(
      makeBox('ftyp', bytes(8, 1)),
      makeBox('moov', concatBytes(
        makeMvhdV0(1_000, 0),                          // fragmented: mvhd carries timeScale but duration 0
        makeBox('mvex', makeMehdV0(90_000)),           // real length lives in mehd → 90_000 / 1_000 = 90s
      )),
      makeBox('mdat', bytes(16_000, 3)),
    );

    stubRangeFetch(mp4);

    await expect(extractMP4Duration('https://example.test/fragmented.mp4')).resolves.toBe(90);
  });

  it('does not re-download 4x when the server ignores Range (200) and the body is unparseable', async () => {
    const junk = concatBytes(makeBox('ftyp', bytes(8, 1)), makeBox('mdat', bytes(2_000, 9)));
    stubFullFileFetch(junk);

    await expect(extractMP4Duration('https://example.test/no-range.mp4')).resolves.toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1); // wasFullFile short-circuits the remaining range attempts
  });

  it('refuses to buffer a huge body when the server ignores Range (OOM guard)', async () => {
    let arrayBufferRead = false;
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: (h: string) => (h.toLowerCase() === 'content-length' ? String(65 * 1024 * 1024) : null) },
      arrayBuffer: async () => { arrayBufferRead = true; return new ArrayBuffer(0); },
    })));

    await expect(extractMP4Duration('https://example.test/huge-no-range.mp4')).resolves.toBeNull();
    expect(arrayBufferRead).toBe(false); // guard bailed before buffering the 65MB body
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

function stubRangeFetch(file: Uint8Array) {
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
    const range = String((init?.headers as Record<string, string> | undefined)?.Range ?? '');
    const slice = readRange(file, range);
    const body = slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.byteLength) as ArrayBuffer;
    return new Response(body, { status: 206 });
  }));
}

function readRange(file: Uint8Array, range: string): Uint8Array {
  const tail = range.match(/^bytes=-(\d+)$/);
  if (tail) {
    const size = Number(tail[1]);
    return file.slice(Math.max(0, file.length - size));
  }

  const head = range.match(/^bytes=(\d+)-(\d+)$/);
  if (head) {
    const start = Number(head[1]);
    const end = Number(head[2]);
    return file.slice(start, Math.min(file.length, end + 1));
  }

  return file;
}

function makeMvhdV0(timeScale: number, durationUnits: number): Uint8Array {
  const payload = new Uint8Array(20);
  const view = new DataView(payload.buffer);
  view.setUint8(0, 0);
  view.setUint32(12, timeScale, false);
  view.setUint32(16, durationUnits, false);
  return makeBox('mvhd', payload);
}

function makeMehdV0(fragmentUnits: number): Uint8Array {
  const payload = new Uint8Array(8); // version(1) + flags(3) + fragment_duration(4)
  const view = new DataView(payload.buffer);
  view.setUint8(0, 0);
  view.setUint32(4, fragmentUnits, false);
  return makeBox('mehd', payload);
}

/** A server that IGNORES Range and always returns the whole file with status 200. */
function stubFullFileFetch(file: Uint8Array) {
  vi.stubGlobal('fetch', vi.fn(async () => {
    const body = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
    return new Response(body, { status: 200, headers: { 'content-length': String(file.length) } });
  }));
}

function makeTruncatedMvhdCandidate(): Uint8Array {
  const box = new Uint8Array(26);
  const view = new DataView(box.buffer);
  view.setUint32(0, 32, false);
  for (let i = 0; i < 4; i++) box[4 + i] = 'mvhd'.charCodeAt(i);
  view.setUint8(8, 0);
  return box;
}

function makeBox(type: string, payload: Uint8Array): Uint8Array {
  const box = new Uint8Array(8 + payload.length);
  const view = new DataView(box.buffer);
  view.setUint32(0, box.length, false);
  for (let i = 0; i < 4; i++) box[4 + i] = type.charCodeAt(i);
  box.set(payload, 8);
  return box;
}

function concatBytes(...chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function bytes(length: number, value: number): Uint8Array {
  return new Uint8Array(length).fill(value);
}