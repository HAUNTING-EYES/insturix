import { describe, expect, it, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchReferenceVideoFile, type RunDownload } from '@/lib/editron/reference-video/fetch-reference-video';

/** Guards the worker fetch that feeds the deterministic cut detector. runDownload is injected so no
 *  network is touched; the local-passthrough and temp-cleanup paths use the real filesystem. */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const c of cleanups.splice(0)) await c().catch(() => {});
});

describe('fetchReferenceVideoFile — local passthrough', () => {
  it('returns the path as-is with a no-op cleanup when the file exists', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'reftest-'));
    cleanups.push(() => rm(dir, { recursive: true, force: true }));
    const path = join(dir, 'upload.mp4');
    await writeFile(path, Buffer.alloc(20_000));

    const fetched = await fetchReferenceVideoFile(path);
    expect(fetched).toMatchObject({ filePath: path, source: 'local' });
    await fetched.cleanup(); // no-op: file must still exist
    expect((await stat(path)).size).toBe(20_000);
  });

  it('throws when a local reference does not exist', async () => {
    await expect(fetchReferenceVideoFile('/no/such/file.mp4')).rejects.toThrow(/not found on disk/);
  });
});

describe('fetchReferenceVideoFile — URL download', () => {
  const writeDummy: RunDownload = async (_url, outPath) => {
    await writeFile(outPath, Buffer.alloc(50_000));
    return { code: 0, stderr: '' };
  };

  it('downloads to a temp file and cleanup removes it', async () => {
    const fetched = await fetchReferenceVideoFile('https://youtube.com/watch?v=abc', { runDownload: writeDummy });
    expect(fetched.source).toBe('download');
    expect((await stat(fetched.filePath)).size).toBe(50_000);
    await fetched.cleanup();
    await expect(stat(fetched.filePath)).rejects.toThrow(); // gone
  });

  it('fails loud on a non-zero yt-dlp exit and leaks no temp dir', async () => {
    const badRun: RunDownload = async () => ({ code: 1, stderr: 'video unavailable' });
    await expect(fetchReferenceVideoFile('https://youtube.com/watch?v=x', { runDownload: badRun })).rejects.toThrow(/yt-dlp failed/);
  });

  it('fails loud when the download is too small to be a video', async () => {
    const tinyRun: RunDownload = async (_url, outPath) => {
      await writeFile(outPath, Buffer.alloc(200)); // an error page, not a video
      return { code: 0, stderr: '' };
    };
    await expect(fetchReferenceVideoFile('https://youtube.com/watch?v=x', { runDownload: tinyRun })).rejects.toThrow(/no usable video/);
  });
});
