import { describe, it, expect } from 'vitest';
import {
  compileFillPrompt,
  getModelFillProfile,
  MODEL_FILL_PROFILES,
} from '@/lib/clickatron/fill-prompt-compiler';
import { getAvailableModels } from '@/lib/config/clickatron-models';

describe('fill-prompt-compiler — dialect routing', () => {
  it('mask model + mask → inpaint dialect, uses the mask, no warning', () => {
    const out = compileFillPrompt('fal-ai/flux-pro/v1/fill', { instruction: 'add a hat', hasMask: true });
    expect(out.dialect).toBe('inpaint');
    expect(out.useMask).toBe(true);
    expect(out.warnings).toHaveLength(0);
    expect(out.prompt).toContain('add a hat');
  });

  it('imperative editor (nano-banana-pro/edit) → instruction dialect', () => {
    const out = compileFillPrompt('fal-ai/nano-banana-pro/edit', { instruction: 'make the jacket red', hasMask: false });
    expect(out.dialect).toBe('instruction');
    expect(out.prompt).toContain('Edit: make the jacket red');
  });

  it('describe-result editor (seedream v5 lite edit) → scene dialect', () => {
    const out = compileFillPrompt('fal-ai/bytedance/seedream/v5/lite/edit', { instruction: 'sunset background', hasMask: false });
    expect(out.dialect).toBe('scene');
    expect(out.prompt).toContain('Desired result: sunset background');
  });
});

describe('fill-prompt-compiler — the safety property (never silently drop a mask)', () => {
  it('mask + model that CANNOT inpaint → useMask=false + loud warning + region reframing', () => {
    const out = compileFillPrompt('fal-ai/nano-banana-pro/edit', { instruction: 'remove the logo', hasMask: true });
    expect(out.useMask).toBe(false); // <-- the whole point: caller must NOT send mask_url
    expect(out.warnings.length).toBeGreaterThan(0);
    expect(out.warnings[0]).toMatch(/does not accept a mask/i);
    expect(out.prompt).toMatch(/only the selected region/i); // still tells the model it's localized
  });

  it('scene editor + mask → useMask=false, region hint in scene dialect', () => {
    const out = compileFillPrompt('fal-ai/bytedance/seedream/v4.5/edit', { instruction: 'change sky', hasMask: true });
    expect(out.useMask).toBe(false);
    expect(out.warnings.length).toBeGreaterThan(0);
    expect(out.prompt).toMatch(/only to the selected region/i);
  });

  it('mask model that DOES inpaint → no warning, mask honored', () => {
    const out = compileFillPrompt('fal-ai/flux/dev/inpainting', { instruction: 'fill', hasMask: true });
    expect(out.useMask).toBe(true);
    expect(out.warnings).toHaveLength(0);
  });
});

describe('fill-prompt-compiler — defaults, determinism, drift guard', () => {
  it('unknown model → safe default (no mask, instruction dialect)', () => {
    const p = getModelFillProfile('fal-ai/some-brand-new-model');
    expect(p.acceptsMask).toBe(false);
    expect(p.dialect).toBe('instruction');
  });

  it('a mask intent on an unknown model still refuses to claim useMask', () => {
    const out = compileFillPrompt(null, { instruction: 'x', hasMask: true });
    expect(out.useMask).toBe(false);
  });

  it('empty instruction is handled without producing an empty prompt', () => {
    const out = compileFillPrompt('fal-ai/flux-pro/v1/fill', { instruction: '   ', hasMask: true });
    expect(out.prompt.length).toBeGreaterThan(20);
  });

  it('is deterministic (same input → identical output)', () => {
    const intent = { instruction: 'add a hat', hasMask: true };
    expect(compileFillPrompt('fal-ai/flux-pro/v1/fill', intent)).toEqual(compileFillPrompt('fal-ai/flux-pro/v1/fill', intent));
  });

  it('DRIFT GUARD: the generative-fill list offers ONLY mask-capable inpaint models', () => {
    // Decision A: fill = masked edit. Every model the UI offers for fill must accept a mask
    // and speak the inpaint dialect — otherwise the mask is silently dropped (the fill bug).
    const fillModels = getAvailableModels('generativeFill');
    expect(fillModels.length).toBeGreaterThan(0);
    for (const model of fillModels) {
      const profile = getModelFillProfile(model.id);
      expect(profile.acceptsMask, `${model.id} offered for fill but cannot accept a mask`).toBe(true);
      expect(profile.dialect, `${model.id} offered for fill but is not inpaint dialect`).toBe('inpaint');
    }
  });

  it('every model in the fill profile map has a valid dialect', () => {
    for (const [id, profile] of Object.entries(MODEL_FILL_PROFILES)) {
      expect(['inpaint', 'instruction', 'scene'], `${id} dialect`).toContain(profile.dialect);
      // Only inpaint-dialect models may accept a mask; the other two families never do.
      if (profile.acceptsMask) expect(profile.dialect, `${id} accepts mask so must be inpaint`).toBe('inpaint');
    }
  });
});
