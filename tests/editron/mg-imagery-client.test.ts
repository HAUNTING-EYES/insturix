/**
 * MG imagery client tests (design-then-code Phase 4a). Deterministic with an injected fake generator; the live
 * Gemini shape was verified out-of-band (a real gemini-3.1-flash-image call returned inline on-brand JPEG bytes).
 * The load-bearing guarantees here: the prompt HARD-forbids text/numbers, no fact value can leak into the image
 * model, aspect derives from the canvas, and every degenerate model response fails LOUD (never a blank backdrop).
 */
import { describe, expect, it, vi } from 'vitest';

import { INSTURIX } from '@/lib/editron/motion-graphics/codegen/kit/brand';
import {
  buildBackdropPrompt,
  generateStillBackdrop,
  generateMotionBackdrop,
  DEFAULT_MG_IMAGE_MODEL,
  type MgImageGenerate,
} from '@/lib/editron/motion-graphics/codegen/design/imagery-client';
import type { MgDesignImagery } from '@/lib/editron/motion-graphics/codegen/design/design-plan';

const imagery = (over: Partial<MgDesignImagery> = {}): MgDesignImagery => ({
  scenePrompt: 'abstract golden light streaks zooming forward through a dark void, sense of speed',
  mode: 'still',
  paletteDirection: 'warm gold on deep charcoal',
  ...over,
});

// Unpadded base64 (no '='), so length maps cleanly to decoded bytes. BIG (~3000 bytes) clears the 1KB size
// guard; TINY (3 bytes) trips it. The client checks size + mime only, not image structure.
const BIG_IMG = 'A'.repeat(4000); // 4000 base64 chars → ~3000 bytes
const TINY_IMG = 'AAAA';          // 3 bytes
const fakeImage = (mimeType = 'image/png', data = BIG_IMG): MgImageGenerate => vi.fn(async () => ({ mimeType, data }));

describe('MG imagery — prompt grounding (no text can reach the image model)', () => {
  it('the prompt HARD-forbids any text/numbers/logos and carries the brand palette', () => {
    const p = buildBackdropPrompt(imagery(), INSTURIX);
    expect(p).toMatch(/NO text/i);
    expect(p).toMatch(/numbers/i);
    expect(p).toMatch(/logos/i);
    expect(p).toContain(INSTURIX.colors.accent);
    expect(p).toContain('golden light streaks'); // the scene survives
  });

  it('★ never leaks a fact value: a scenePrompt is imagery-only (the designer strips values) — the client adds no data', () => {
    // The client only ever sees imagery.scenePrompt/paletteDirection — there is no data channel into it at all.
    const p = buildBackdropPrompt(imagery({ scenePrompt: 'a workbench with three tools arranged left to right' }), INSTURIX);
    expect(p).not.toMatch(/\b\d{2,}\b/); // no multi-digit numbers introduced by the client
    expect(p).toContain('workbench');
  });
});

describe('MG imagery — generateStillBackdrop', () => {
  it('calls the model with the built prompt + canvas aspect, returns decoded bytes', async () => {
    const generate = fakeImage();
    const b = await generateStillBackdrop(imagery(), { brand: INSTURIX, canvas: { width: 1920, height: 1080 }, generate });
    expect(generate).toHaveBeenCalledTimes(1);
    const arg = (generate as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg.model).toBe(DEFAULT_MG_IMAGE_MODEL);
    expect(arg.aspectRatio).toBe('16:9'); // 1920x1080
    expect(arg.prompt).toMatch(/NO text/i);
    expect(Buffer.isBuffer(b.bytes)).toBe(true);
    expect(b.mimeType).toBe('image/png');
    expect(b.width).toBe(1920);
  });

  it('derives the nearest supported aspect for portrait + square canvases', async () => {
    const port = (generate: MgImageGenerate) => generateStillBackdrop(imagery(), { brand: INSTURIX, canvas: { width: 1080, height: 1920 }, generate });
    const g1 = fakeImage(); await port(g1);
    expect((g1 as ReturnType<typeof vi.fn>).mock.calls[0][0].aspectRatio).toBe('9:16');
    const g2 = fakeImage(); await generateStillBackdrop(imagery(), { brand: INSTURIX, canvas: { width: 1000, height: 1000 }, generate: g2 });
    expect((g2 as ReturnType<typeof vi.fn>).mock.calls[0][0].aspectRatio).toBe('1:1');
  });

  it('FAILS LOUD (never a blank backdrop): no image, wrong mime, tiny bytes, and motion-mode all throw', async () => {
    await expect(generateStillBackdrop(imagery(), { brand: INSTURIX, canvas: { width: 1920, height: 1080 }, generate: vi.fn(async () => ({ mimeType: 'image/png', data: '' })) }))
      .rejects.toThrow(/no image|suspiciously small/);
    await expect(generateStillBackdrop(imagery(), { brand: INSTURIX, canvas: { width: 1920, height: 1080 }, generate: vi.fn(async () => ({ mimeType: 'text/plain', data: BIG_IMG })) }))
      .rejects.toThrow(/unexpected mime/);
    await expect(generateStillBackdrop(imagery(), { brand: INSTURIX, canvas: { width: 1920, height: 1080 }, generate: fakeImage("image/png", TINY_IMG) }))
      .rejects.toThrow(/suspiciously small/);
    await expect(generateStillBackdrop(imagery({ mode: 'motion' }), { brand: INSTURIX, canvas: { width: 1920, height: 1080 }, generate: fakeImage() }))
      .rejects.toThrow(/expected 'still'/);
  });

  it('motion backdrop is honestly not-yet-implemented (fail loud, not faked)', async () => {
    await expect(generateMotionBackdrop()).rejects.toThrow(/not implemented.*Phase 4b/);
  });
});
