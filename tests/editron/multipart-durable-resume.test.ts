import { afterEach, describe, expect, it, vi } from 'vitest';

import { MultipartUploader } from '@/lib/editron/client/multipart-uploader';
import { resolveMultipartPlan, R2_MAX_PARTS } from '@/lib/editron/services/r2-upload-limits';

const MiB = 1024 * 1024;
const GiB = 1024 * MiB;
const TARGET = 700 * GiB;
const plan = resolveMultipartPlan(TARGET);

interface ServerPart { PartNumber: number; ETag: string; }
interface ServerRecord {
  assetId: string; uploadId: string; r2Key: string;
  totalSize: number; partSize: number; totalParts: number;
  completedParts: ServerPart[]; status: string;
}

interface FakeServer {
  fetch: typeof fetch;
  records: Map<string, ServerRecord>;
  events: Record<'init' | 'status' | 'partUrl' | 'put' | 'record' | 'complete', string[]>;
  /** Clear the mid-upload block so a resumed session can upload the remaining parts. */
  allowThrough: () => void;
}

/**
 * In-memory R2 "server" the MultipartUploader talks to. No real network, no real
 * object storage -- a 700 GB upload is exercised logically while each "part" slice
 * returns a 1 KiB buffer. This is how we test 700 GB without loading any systems.
 */
function createFakeServer(opts: { blockAfterPart?: number } = {}): FakeServer {
  const records = new Map<string, ServerRecord>();
  const events: FakeServer['events'] = {
    init: [], status: [], partUrl: [], put: [], record: [], complete: [],
  };
  let blockActive = true;

  const json = (data: Record<string, unknown>, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: status >= 300 ? 'Error' : 'OK',
    json: async () => data,
    headers: { get: () => null },
  } as unknown as Response);

  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};

    if (url.includes('/multipart/init')) {
      events.init.push(body.assetId);
      const rec: ServerRecord = {
        assetId: body.assetId,
        uploadId: `up-${body.assetId}`,
        r2Key: `r2-${body.assetId}`,
        totalSize: body.totalSize,
        partSize: body.partSize,
        totalParts: body.totalParts,
        completedParts: [],
        status: 'in-progress',
      };
      records.set(body.assetId, rec);
      return json({ uploadId: rec.uploadId, r2Key: rec.r2Key, assetId: rec.assetId });
    }

    if (url.includes('/multipart/status')) {
      const assetId = new URL(url, 'http://test').searchParams.get('assetId')!;
      events.status.push(assetId);
      const rec = records.get(assetId);
      return rec
        ? json({
            success: true, assetId, status: rec.status,
            uploadId: rec.uploadId, r2Key: rec.r2Key,
            totalParts: rec.totalParts, partSize: rec.partSize, totalSize: rec.totalSize,
            completedParts: rec.completedParts,
          })
        : json({ success: true, assetId, status: 'none' });
    }

    if (url.includes('/multipart/part-url')) {
      events.partUrl.push(`${body.assetId}:${body.partNumber}`);
      return json({ url: `https://fake.r2/${body.assetId}/${body.partNumber}` });
    }

    if (url.startsWith('https://fake.r2/')) {
      const match = url.match(/https:\/\/fake\.r2\/([^/]+)\/(\d+)/);
      const assetId = match![1];
      const partNumber = Number(match![2]);
      events.put.push(`${assetId}:${partNumber}`);
      if (opts.blockAfterPart != null && blockActive && partNumber > opts.blockAfterPart) {
        // Simulate a page-close / dead network mid-upload: this part never settles.
        return new Promise<Response>(() => {}) as unknown as Promise<Response>;
      }
      return jsonHTML({ ok: true, status: 200, etag: `etag-${partNumber}` });
    }

    if (url.includes('/multipart/part')) {
      const rec = records.get(body.assetId);
      const idx = rec!.completedParts.findIndex(p => p.PartNumber === body.partNumber);
      if (idx >= 0) rec!.completedParts[idx] = { PartNumber: body.partNumber, ETag: body.etag };
      else rec!.completedParts.push({ PartNumber: body.partNumber, ETag: body.etag });
      events.record.push(`${body.assetId}:${body.partNumber}`);
      return json({ success: true });
    }

    if (url.includes('/multipart/complete')) {
      const rec = records.get(body.assetId);
      events.complete.push(body.assetId);
      if (body.abort) { rec!.status = 'aborted'; return json({ success: true }); }
      rec!.status = rec!.completedParts.length === rec!.totalParts ? 'completed' : 'incomplete';
      return json({ success: true, url: `https://cdn/${body.assetId}` });
    }

    throw new Error(`Unexpected fetch: ${method} ${url}`);
  }) as typeof fetch;

  return { fetch: fetchImpl, records, events, allowThrough: () => { blockActive = false; } };
}

function jsonHTML(input: { ok: boolean; status: number; etag?: string }): Response {
  return {
    ok: input.ok,
    status: input.status,
    statusText: input.ok ? 'OK' : 'Error',
    json: async () => ({}),
    headers: { get: (name: string) => (String(name).toLowerCase() === 'etag' ? (input.etag ?? null) : null) },
  } as unknown as Response;
}

function makeSyntheticFile(logicalBytes: number, partSize: number): { file: File; sliceRequests: number[] } {
  const sliceRequests: number[] = [];
  const file = {
    name: 'hollywood.mkv',
    type: 'video/x-matroska',
    size: logicalBytes,
    slice(start: number, _end: number): Blob {
      const partNumber = Math.floor(start / partSize) + 1;
      sliceRequests.push(partNumber);
      // 1 KiB per "part" -- 700 GB of logical data exercises the real part count
      // and resume logic with no real disk/network/object-storage load.
      return new Blob([new Uint8Array(1024)]) as Blob;
    },
  } as unknown as File;
  return { file, sliceRequests };
}

function waitForState(cond: () => boolean, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      if (cond()) return resolve();
      if (Date.now() - started > timeoutMs) return reject(new Error('timed out waiting for uploader state'));
      setTimeout(tick, 5);
    };
    tick();
  });
}

function waitForServerParts(server: FakeServer, assetId: string, minParts: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      const count = server.records.get(assetId)?.completedParts.length ?? 0;
      if (count >= minParts) return resolve();
      if (Date.now() - started > timeoutMs) return reject(new Error(`timed out waiting for ${minParts} server parts (have ${count})`));
      setTimeout(tick, 10);
    };
    tick();
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('MultipartUploader -- 700 GB durable resume (no real data)', () => {
  it('the plan fits R2: 700 GB in <= 10,000 parts, deterministic across calls', () => {
    expect(plan.totalParts).toBeLessThanOrEqual(R2_MAX_PARTS);
    expect(plan.partSize).toBeGreaterThanOrEqual(5 * MiB);
    expect(resolveMultipartPlan(TARGET)).toEqual(plan);
  });

  it('THE ABSOLUTE PROOF: interrupt at ~37%, refresh, resume only the missing parts', async () => {
    const blockAfter = Math.floor(plan.totalParts * 0.37);
    const server = createFakeServer({ blockAfterPart: blockAfter });
    vi.stubGlobal('fetch', server.fetch);
    const { file, sliceRequests } = makeSyntheticFile(TARGET, plan.partSize);

    // Session 1 -- page-close mid-upload: parts past 37% never settle, so the
    // uploader stalls with ~blockAfter parts durably recorded server-side.
    const first = new MultipartUploader({ file, assetId: 'film-a', maxConcurrency: 4 });
    await first.start();
    await waitForServerParts(server, 'film-a', blockAfter - 4, 60_000);
    const session1Parts = new Set(server.records.get('film-a')!.completedParts.map(p => p.PartNumber));
    expect(session1Parts.size).toBeGreaterThan(500);

    // Session 1 is done mid-upload; clear the fake network block so the resumed
    // session can push the remaining parts through.
    server.allowThrough();

    // "Refresh" -- a brand-new uploader for the same asset, same file. It must NOT
    // re-upload any part already recorded in session 1.
    const sliceCountBefore = sliceRequests.length;
    const second = new MultipartUploader({ file, assetId: 'film-a', maxConcurrency: 8 });
    await second.start();
    await waitForState(() => second.getState() === 'completed' || second.getState() === 'error', 60_000);
    expect(second.getState()).toBe('completed');

    const serverParts = server.records.get('film-a')!.completedParts;
    expect(serverParts.map(p => p.PartNumber)).toEqual(
      Array.from({ length: plan.totalParts }, (_, i) => i + 1),
    );
    expect(serverParts.every(p => p.ETag === `etag-${p.PartNumber}`)).toBe(true);

    // Durable-resume proof: session 2 never re-requested a part from session 1.
    const reUploaded = sliceRequests.slice(sliceCountBefore).filter(pn => session1Parts.has(pn));
    expect(reUploaded).toEqual([]);
    // One completed assembly total (session 2's finalize); session 1 never completed.
    expect(server.events.complete.length).toBe(1);
    // Second session was a resume — it did NOT re-init or re-upload session-1 parts.
    expect(server.events.init.length).toBe(1);
  }, 120_000);

  it('records every completed part ETag server-side (durability across reload)', async () => {
    const server = createFakeServer();
    vi.stubGlobal('fetch', server.fetch);
    const { file } = makeSyntheticFile(TARGET, plan.partSize);
    const up = new MultipartUploader({ file, assetId: 'film-b', maxConcurrency: 8 });
    await up.start();
    await waitForState(() => up.getState() === 'completed', 60_000);
    expect(up.getState()).toBe('completed');
    expect(server.records.get('film-b')!.completedParts.length).toBe(plan.totalParts);
    // The status endpoint returns the same list the client used -- a fresh session
    // could resume purely from it.
    expect(server.events.status.length).toBeGreaterThan(0);
  }, 120_000);
});


