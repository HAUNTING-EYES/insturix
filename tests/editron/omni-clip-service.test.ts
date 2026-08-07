import { describe, expect, it, vi } from 'vitest';

import { generateOmniClip, type OmniClipDeps, type OmniClipRequest } from '@/lib/editron/motion-graphics/omni/omni-clip-service';

const MP4 = 'https://v3b.fal.media/files/x/clip.mp4';

function deps(over: Partial<OmniClipDeps> = {}): OmniClipDeps {
  return {
    subscribe: vi.fn(async () => ({ data: { video: { url: MP4 } }, requestId: 'req-1' })),
    upload: vi.fn(async (b: Uint8Array, name: string, mime: string) => `fal://${name}?${mime}`),
    ...over,
  };
}

const base: OmniClipRequest = { variant: 'text', word: 'CRASH', stat: '+38%' };

describe('generateOmniClip (Omni lane seam)', () => {
  it('text variant -> gemini text endpoint, prompt carries word/stat + locked style', async () => {
    const d = deps();
    const r = await generateOmniClip(base, d);
    expect(r.endpoint).toBe('fal-ai/gemini-omni-flash');
    expect(d.subscribe).toHaveBeenCalledWith('fal-ai/gemini-omni-flash', expect.objectContaining({
      input: expect.objectContaining({ aspect_ratio: '16:9', duration: 5 }),
    }));
    const prompt = (d.subscribe as ReturnType<typeof vi.fn>).mock.calls[0][1].input.prompt as string;
    expect(prompt).toContain('CRASH');
    expect(prompt).toContain('+38%');
    expect(prompt).toContain('[STYLE]');
    expect(r.videoUrl).toBe(MP4);
    expect(r.variant).toBe('text');
  });

  it('style variant -> reference endpoint with <IMAGE_REF_0> + uploaded anchor URL', async () => {
    const d = deps();
    const r = await generateOmniClip({ ...base, variant: 'style', anchorMedia: { bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/png' } }, d);
    expect(r.endpoint).toBe('google/gemini-omni-flash/reference-to-video');
    expect(d.upload).toHaveBeenCalled();
    const call = (d.subscribe as ReturnType<typeof vi.fn>).mock.calls[0][1].input;
    expect(call.image_urls).toEqual(['fal://ref.png?image/png']);
    expect(String(call.prompt)).toContain('<IMAGE_REF_0>');
    expect(String(call.prompt)).toContain('CRASH');
  });

  it('invideo variant keeps footage identical and adds the MG', async () => {
    const d = deps();
    const r = await generateOmniClip({ ...base, variant: 'invideo', word: 'MYTH', stat: '9/10', anchorMedia: { url: 'https://cdn/footage.png' } }, d);
    expect(r.endpoint).toBe('google/gemini-omni-flash/reference-to-video');
    expect(d.upload).not.toHaveBeenCalled(); // URL provided, no upload needed
    const prompt = (d.subscribe as ReturnType<typeof vi.fn>).mock.calls[0][1].input.prompt as string;
    expect(prompt).toContain('keep the scene, subject, framing and camera identical');
    expect(prompt).toContain('MYTH');
    expect(prompt).toContain('9/10');
  });

  it('style/invideo without anchorMedia throws', async () => {
    const d = deps();
    await expect(generateOmniClip({ ...base, variant: 'style' }, d)).rejects.toThrow('requires anchorMedia');
    await expect(generateOmniClip({ ...base, variant: 'invideo' }, d)).rejects.toThrow('requires anchorMedia');
    expect(d.subscribe).not.toHaveBeenCalled();
  });

  it('maps duration cleanly', async () => {
    const d = deps();
    const r = await generateOmniClip({ ...base, durationSec: 8, aspectRatio: '9:16' }, d);
    expect((d.subscribe as ReturnType<typeof vi.fn>).mock.calls[0][1].input.duration).toBe(8);
    expect((d.subscribe as ReturnType<typeof vi.fn>).mock.calls[0][1].input.aspect_ratio).toBe('9:16');
    expect(r.durationSec).toBe(8);
  });
});
