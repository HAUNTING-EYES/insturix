import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { frameKey, ingestSequence } from '@/lib/editron/motion-graphics/codegen/render/sequence-ingest';
import type { MgRenderResult } from '@/lib/editron/motion-graphics/codegen/render/frame-renderer';

function render(over: Partial<MgRenderResult> = {}): MgRenderResult {
  const files = over.files ?? ['00000.webp', '00001.webp', '00002.webp'];
  return {
    webpDir: '/tmp/ws/webp',
    files,
    workspaceDir: '/tmp/ws',
    width: 1280,
    height: 720,
    fps: 30,
    count: files.length,
    renderMs: 0,
    ...over,
  };
}

describe('frameKey - flat, URL-safe, ordered', () => {
  it('pads the index to 5 digits and uses no slashes (CDN worker serves /asset/:id as one segment)', () => {
    expect(frameKey('seqA', 0)).toBe('mgseq_seqA_00000');
    expect(frameKey('seqA', 42)).toBe('mgseq_seqA_00042');
    expect(frameKey('seqA', 12345)).toBe('mgseq_seqA_12345');
    expect(frameKey('seqA', 7)).not.toContain('/');
  });

  it('zero-padding keeps frame keys lexically ordered', () => {
    const keys = [0, 1, 2, 10, 100].map((i) => frameKey('s', i));
    expect([...keys].sort()).toEqual(keys);
  });
});

describe('ingestSequence - upload + manifest', () => {
  it('uploads each frame by its own key and returns an ordered, index-correct manifest', async () => {
    const seen: { key: string; contentType: string; readPath: string }[] = [];
    const manifest = await ingestSequence(render(), {
      sequenceId: 'seq1',
      readFile: async (p) => Buffer.from(p), // fake read: path in, bytes out
      uploadFrame: async (bytes, key, contentType) => {
        seen.push({ key, contentType, readPath: bytes.toString() });
        return `https://cdn.example/asset/${key}`; // url encodes the key (⇒ the index)
      },
    });

    // frameUrls[i] must correspond to frame i regardless of upload completion order
    expect(manifest.frameUrls).toEqual([
      'https://cdn.example/asset/mgseq_seq1_00000',
      'https://cdn.example/asset/mgseq_seq1_00001',
      'https://cdn.example/asset/mgseq_seq1_00002',
    ]);
    expect(manifest.count).toBe(3);
    expect(manifest.transparent).toBe(true);
    // dims/fps pass through from the render
    expect(manifest).toMatchObject({ sequenceId: 'seq1', fps: 30, width: 1280, height: 720 });
    // each frame read from webpDir/<file> and uploaded as image/webp
    expect(seen.every((s) => s.contentType === 'image/webp')).toBe(true);
    expect(seen.map((s) => s.readPath)).toContain(path.join('/tmp/ws/webp', '00000.webp')); // OS-agnostic
  });

  it('preserves order even when uploads finish out of order (concurrency)', async () => {
    const manifest = await ingestSequence(render({ files: ['a.webp', 'b.webp', 'c.webp', 'd.webp'] }), {
      sequenceId: 's',
      concurrency: 4,
      readFile: async () => Buffer.alloc(1),
      // later frames resolve FIRST — index mapping must still be correct
      uploadFrame: async (_b, key) => {
        const idx = Number(key.slice(-5));
        await new Promise((r) => setTimeout(r, (5 - idx) * 3));
        return key;
      },
    });
    expect(manifest.frameUrls).toEqual(['mgseq_s_00000', 'mgseq_s_00001', 'mgseq_s_00002', 'mgseq_s_00003']);
  });

  it('★ throws on a frame-count mismatch instead of shipping a truncated sequence (R18N)', async () => {
    // render claims 5 frames but only 3 files exist → the upload count won't match
    const bad = render({ files: ['00000.webp', '00001.webp', '00002.webp'], count: 5 });
    await expect(
      ingestSequence(bad, { sequenceId: 's', readFile: async () => Buffer.alloc(1), uploadFrame: async (_b, k) => k }),
    ).rejects.toThrow(/expected 5/);
  });
});
