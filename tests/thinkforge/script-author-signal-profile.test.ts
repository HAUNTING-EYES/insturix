import { describe, expect, it } from 'vitest';
import { ScriptAuthorAgent, type ScriptAuthorInput } from '@/lib/thinkforge/agents/script-author-agent';
import { resolveContentSignalProfile } from '@/lib/thinkforge/signals';

describe('ScriptAuthorAgent content signal profile wiring', () => {
  it('injects the resolved content profile and uses it for platform output rules', () => {
    process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-gemini-key';
    const agent = new ScriptAuthorAgent();
    const contentSignalProfile = resolveContentSignalProfile({
      userPrompt: 'Write an Instagram text + image post for agency founders about a trending meme.',
      project: {
        format: 'post',
        platform: 'Instagram',
        purpose: 'agency founders',
        tone: 'witty expert',
      },
    });

    const input: ScriptAuthorInput = {
      context: {
        projectSummary: 'Platform: Instagram. Audience: agency founders.',
        systemBrief: '## Brand DNA\nVoice: witty expert\nNever mention: game-changing',
      },
      userPrompt: 'Write the post.',
      contentSignalProfile,
      contract: {
        generation_mode: 'manual',
        narrator_voice: 'author',
        medium: 'voiceover',
        tone: 'witty expert',
        forbidden: ['game-changing'],
        allowed_metaphors: [],
        style_notes: ['Use the meme as a business insight, not a random joke.'],
        metaphor_reuse_limit: 1,
        mode_a_usage: 'opening only',
        mode_b_usage: 'default direct copywriting voice',
        mode_switch_rules: 'stay direct after the hook',
      },
      outline: {
        title: 'Meme Timing',
        sections: [
          {
            id: 'hook',
            title: 'Hook',
            goal: 'Open with the meme-business tension.',
            beat: 'Hook',
            level: 'act',
          },
        ],
      },
    };

    const prompt = agent.buildPrompt(input);

    expect(prompt).toContain('<content_signal_profile>');
    expect(prompt).toContain('<signal_execution_rules>');
    expect(prompt).toContain('"output_format": "social_post"');
    expect(prompt).toContain('"platform": "Instagram"');
    expect(prompt).toContain('"assetIntent": "static_image"');
    expect(prompt).toContain('Write the ACTUAL publishable Instagram post');
    expect(prompt).not.toContain('Write the ACTUAL publishable LinkedIn post');
  });
});
