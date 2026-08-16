import { describe, expect, it } from 'vitest';
import {
  buildPostOutputFormat,
  inferRoleFromContext,
} from '@/lib/thinkforge/agents/prompt-utils';

describe('ThinkForge post prompt authority', () => {
  it('keeps LinkedIn as a delivery constraint instead of imposing a voice', () => {
    const prompt = buildPostOutputFormat('linkedin', {
      maximumCharacters: 3_000,
      ctaMode: 'none',
    });

    expect(prompt).toContain('Preserve the resolved brand voice');
    expect(prompt).not.toMatch(/professional-conversational|one-liners for punch/i);
  });

  it('never turns an overflowing X post into a thread implicitly', () => {
    const prompt = buildPostOutputFormat('twitter', {
      maximumCharacters: 280,
      ctaMode: 'none',
    });

    expect(prompt).toContain('Do not silently convert overflow into a thread');
    expect(prompt).not.toMatch(/thread format if content exceeds|punchy, direct/i);
  });

  it('leaves Instagram emoji behavior to explicit post controls', () => {
    const prompt = buildPostOutputFormat('instagram', { ctaMode: 'none' });

    expect(prompt).toContain('Emoji use comes only from the resolved post controls');
    expect(prompt).not.toMatch(/emoji sparingly|use 1-3 relevant emojis/i);
  });

  it('does not invent editorial controls for a generic surface', () => {
    const prompt = buildPostOutputFormat('generic');

    expect(prompt).toContain(
      'Do not infer a platform-specific tone, length target, hashtag quota, CTA, emoji style, or thread format.',
    );
    expect(prompt).toContain('No numeric publishing maximum is known for this surface');
  });

  it('does not require every post to drive a CTA', () => {
    const profile = inferRoleFromContext('', '', 'social_post');

    expect(profile.executionTest).toContain('serves the stated communication goal');
    expect(profile.executionTest).not.toMatch(/drives the action/i);
    expect(profile.sectionGuidance).toContain('platform as a delivery constraint');
  });
});
