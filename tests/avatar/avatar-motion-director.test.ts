import { describe, expect, it } from 'vitest';
import { composeBodyMotionPrompt, composeTalkingHeadPrompt } from '../../lib/avatar/avatar-motion-director';
import type { AvatarRenderRecipe } from '../../lib/avatar/avatar-render-recipe';

type RecipeParts = {
  useCase?: AvatarRenderRecipe['useCase'];
  creative?: Partial<AvatarRenderRecipe['creative']>;
  audio?: Partial<AvatarRenderRecipe['audio']>;
};

function recipe(parts: RecipeParts = {}): AvatarRenderRecipe {
  return {
    useCase: parts.useCase ?? 'speech_delivery',
    creative: { prompt: 'in a modern studio office', ...(parts.creative ?? {}) },
    audio: { mode: 'tts_voiceover', ...(parts.audio ?? {}) },
  } as unknown as AvatarRenderRecipe;
}

describe('composeBodyMotionPrompt (lane B)', () => {
  it('commits to full-body wide framing and locomotion — not a talking-head closeup', () => {
    const prompt = composeBodyMotionPrompt(recipe({ creative: { prompt: 'walking through a modern studio' } }));
    const lower = prompt.toLowerCase();
    expect(lower).toContain('full-body');
    expect(lower).toContain('wide shot');
    expect(lower).toMatch(/walk|moves|locomotion|steps/);
    // scene prompt preserved
    expect(lower).toContain('walking through a modern studio');
  });

  it('drops the talking-head close-frame bias that made i2v render a face closeup (root cause)', () => {
    const lower = composeBodyMotionPrompt(recipe()).toLowerCase();
    expect(lower).not.toContain('speaking directly to the camera');
    expect(lower).not.toContain('medium shot');
    expect(lower).not.toContain('push-in');
  });
});

describe('composeTalkingHeadPrompt', () => {
  it('directs the render even when the avatar has no performance pack (preset fallback)', () => {
    const prompt = composeTalkingHeadPrompt(recipe());
    const lower = prompt.toLowerCase();
    // camera + gesture direction present — the whole point vs the old blank prompt
    expect(lower).toContain('push-in');
    expect(lower).toContain('gestures');
    expect(lower).toContain('speaking directly to the camera');
    // scene text is preserved at the end
    expect(lower).toContain('modern studio office');
  });

  it('never returns the bare scene prompt (regression guard for the root cause)', () => {
    const r = recipe({ creative: { prompt: 'in a modern studio office' } });
    const prompt = composeTalkingHeadPrompt(r);
    expect(prompt).not.toBe('in a modern studio office');
    expect(prompt.length).toBeGreaterThan('in a modern studio office'.length);
  });

  it('prefers the avatar’s own gesture/camera/tone over presets', () => {
    const prompt = composeTalkingHeadPrompt(
      recipe({
        creative: {
          prompt: 'presenting on stage',
          cameraPresence: 'slow orbital drift around the speaker',
          gestureStyle: 'sweeping theatrical hand gestures',
          personaTone: 'playful and magnetic',
        },
      }),
    ).toLowerCase();
    expect(prompt).toContain('slow orbital drift around the speaker');
    expect(prompt).toContain('sweeping theatrical hand gestures');
    expect(prompt).toContain('playful and magnetic');
  });

  it('marks a silent render as not speaking', () => {
    const prompt = composeTalkingHeadPrompt(
      recipe({ audio: { mode: 'silent' }, creative: { prompt: 'standing in a lobby' } }),
    ).toLowerCase();
    expect(prompt).toContain('not speaking');
    expect(prompt).not.toContain('speaking directly to the camera');
  });

  it('treats a script as speech even if audio mode is unset', () => {
    const prompt = composeTalkingHeadPrompt(
      recipe({ audio: { mode: 'silent' }, creative: { prompt: 'x', script: 'Hello there' } }),
    ).toLowerCase();
    expect(prompt).toContain('speaking directly to the camera');
  });

  it('folds product interaction into the actions for product shoots', () => {
    const prompt = composeTalkingHeadPrompt(
      recipe({
        useCase: 'product_shoot',
        creative: { prompt: 'clean seamless backdrop', productInteraction: 'holds the bottle up and points to the label' },
      }),
    ).toLowerCase();
    expect(prompt).toContain('holds the bottle up and points to the label');
  });

  it('maps the expressiveness dial', () => {
    const animated = composeTalkingHeadPrompt(recipe({ creative: { prompt: 'x', expressiveness: 'animated' } })).toLowerCase();
    const calm = composeTalkingHeadPrompt(recipe({ creative: { prompt: 'x', expressiveness: 'calm' } })).toLowerCase();
    expect(animated).toContain('animated');
    expect(calm).toContain('restrained');
  });

  it('is deterministic — same recipe yields the same prompt', () => {
    const r = recipe({ creative: { prompt: 'in a warm-lit cafe', gestureStyle: 'relaxed hands' } });
    expect(composeTalkingHeadPrompt(r)).toBe(composeTalkingHeadPrompt(r));
  });

  it('covers every use case without throwing or emptying', () => {
    const cases: AvatarRenderRecipe['useCase'][] = [
      'speech_delivery', 'explainer_host', 'social_presenter', 'product_shoot', 'ad_actor', 'generic_clip',
    ];
    for (const useCase of cases) {
      const prompt = composeTalkingHeadPrompt(recipe({ useCase, creative: { prompt: 'a scene' } }));
      expect(prompt.trim().length).toBeGreaterThan(40);
    }
  });
});
