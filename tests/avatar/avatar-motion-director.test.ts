import { describe, expect, it } from 'vitest';
import { composeOmniHumanPrompt } from '../../lib/avatar/avatar-motion-director';
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

describe('composeOmniHumanPrompt', () => {
  it('directs the render even when the avatar has no performance pack (preset fallback)', () => {
    const prompt = composeOmniHumanPrompt(recipe());
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
    const prompt = composeOmniHumanPrompt(r);
    expect(prompt).not.toBe('in a modern studio office');
    expect(prompt.length).toBeGreaterThan('in a modern studio office'.length);
  });

  it('prefers the avatar’s own gesture/camera/tone over presets', () => {
    const prompt = composeOmniHumanPrompt(
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
    const prompt = composeOmniHumanPrompt(
      recipe({ audio: { mode: 'silent' }, creative: { prompt: 'standing in a lobby' } }),
    ).toLowerCase();
    expect(prompt).toContain('not speaking');
    expect(prompt).not.toContain('speaking directly to the camera');
  });

  it('treats a script as speech even if audio mode is unset', () => {
    const prompt = composeOmniHumanPrompt(
      recipe({ audio: { mode: 'silent' }, creative: { prompt: 'x', script: 'Hello there' } }),
    ).toLowerCase();
    expect(prompt).toContain('speaking directly to the camera');
  });

  it('folds product interaction into the actions for product shoots', () => {
    const prompt = composeOmniHumanPrompt(
      recipe({
        useCase: 'product_shoot',
        creative: { prompt: 'clean seamless backdrop', productInteraction: 'holds the bottle up and points to the label' },
      }),
    ).toLowerCase();
    expect(prompt).toContain('holds the bottle up and points to the label');
  });

  it('maps the expressiveness dial', () => {
    const animated = composeOmniHumanPrompt(recipe({ creative: { prompt: 'x', expressiveness: 'animated' } })).toLowerCase();
    const calm = composeOmniHumanPrompt(recipe({ creative: { prompt: 'x', expressiveness: 'calm' } })).toLowerCase();
    expect(animated).toContain('animated');
    expect(calm).toContain('restrained');
  });

  it('is deterministic — same recipe yields the same prompt', () => {
    const r = recipe({ creative: { prompt: 'in a warm-lit cafe', gestureStyle: 'relaxed hands' } });
    expect(composeOmniHumanPrompt(r)).toBe(composeOmniHumanPrompt(r));
  });

  it('covers every use case without throwing or emptying', () => {
    const cases: AvatarRenderRecipe['useCase'][] = [
      'speech_delivery', 'explainer_host', 'social_presenter', 'product_shoot', 'ad_actor', 'generic_clip',
    ];
    for (const useCase of cases) {
      const prompt = composeOmniHumanPrompt(recipe({ useCase, creative: { prompt: 'a scene' } }));
      expect(prompt.trim().length).toBeGreaterThan(40);
    }
  });
});
