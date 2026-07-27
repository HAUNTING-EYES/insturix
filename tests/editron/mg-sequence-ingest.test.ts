import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { describe, expect, it, vi } from 'vitest';

const remotionState = vi.hoisted(() => ({ frame: 0 }));

vi.mock('remotion', async () => {
  const actual = await vi.importActual<typeof import('remotion')>('remotion');
  return {
    ...actual,
    Img: (props: React.ImgHTMLAttributes<HTMLImageElement>) => React.createElement('img', props),
    prefetch: () => ({ free: vi.fn() }),
    useCurrentFrame: () => remotionState.frame,
  };
});

import { frameKey, ingestSequence } from '@/lib/editron/motion-graphics/codegen/render/sequence-ingest';
import {
  normalizeSequenceCdnBaseUrl,
  sequenceFrameIndex,
  sequenceFrameUrl,
  sequenceFrameUrls,
} from '@/lib/editron/motion-graphics/codegen/render/sequence-playback';
import type { MgRenderResult } from '@/lib/editron/motion-graphics/codegen/render/frame-renderer';
import { LayerContent } from '@/components/editron/editor/version-7.0.0/components/core/layer-content';
import { OverlayType, type MgSequenceOverlay } from '@/components/editron/editor/version-7.0.0/types';

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

describe('sequence playback addressing', () => {
  const sequence = { sequenceId: 'seqA', frameCount: 3, cdnBaseUrl: 'cdn.example.com/' };

  it('derives compact manifest URLs without persisting a frame URL array', () => {
    expect(sequenceFrameUrls(sequence)).toEqual([
      'https://cdn.example.com/asset/mgseq_seqA_00000',
      'https://cdn.example.com/asset/mgseq_seqA_00001',
      'https://cdn.example.com/asset/mgseq_seqA_00002',
    ]);
    expect(sequenceFrameUrl(sequence, 2)).toBe('https://cdn.example.com/asset/mgseq_seqA_00002');
  });

  it('clamps local playback to the first and final rendered frames', () => {
    expect(sequenceFrameIndex(-4, 3)).toBe(0);
    expect(sequenceFrameIndex(1.9, 3)).toBe(1);
    expect(sequenceFrameIndex(99, 3)).toBe(2);
  });

  it('fails loudly for malformed sequence descriptors', () => {
    expect(() => sequenceFrameIndex(0, 0)).toThrow(/positive integer/);
    expect(() => sequenceFrameUrl(sequence, 3)).toThrow(/exceeds frameCount/);
    expect(() => sequenceFrameUrl({ ...sequence, sequenceId: ' ' }, 0)).toThrow(/sequenceId/);
    expect(() => sequenceFrameUrl({ ...sequence, sequenceId: 'bad/id' }, 0)).toThrow(/URL-safe/);
    expect(() => sequenceFrameUrl({ ...sequence, frameCount: Number.NaN }, 0)).toThrow(/positive integer/);
    expect(() => normalizeSequenceCdnBaseUrl(' ')).toThrow(/CDN base URL/);
  });
});
describe('MG sequence layer playback', () => {
  it('dispatches a sequence overlay to the frame-accurate Remotion image layer', () => {
    remotionState.frame = 99;
    const overlay: MgSequenceOverlay = {
      id: 7,
      type: OverlayType.MG_SEQUENCE,
      assetId: 'asset_seqA',
      from: 0,
      durationInFrames: 120,
      row: 6,
      left: 0,
      top: 0,
      width: 1920,
      height: 1080,
      isDragging: false,
      rotation: 0,
      styles: { opacity: 1 },
      sequence: {
        sequenceId: 'seqA',
        frameCount: 3,
        fps: 30,
        width: 1920,
        height: 1080,
        transparent: true,
        frameFormat: 'webp',
        cdnBaseUrl: 'https://cdn.example.com',
      },
    };

    const html = renderToStaticMarkup(React.createElement(LayerContent, { overlay }));
    expect(html).toContain('src="https://cdn.example.com/asset/mgseq_seqA_00002"');
    expect(html).toContain('object-fit:contain');
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
