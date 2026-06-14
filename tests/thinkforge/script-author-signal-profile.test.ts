import { describe, expect, it } from 'vitest';
import { ScriptAuthorAgent, type ScriptAuthorInput } from '@/lib/thinkforge/agents/script-author-agent';
import { appendClickatronCreativeSidecarInstruction } from '@/lib/thinkforge/utils/clickatron-creative-sidecar';
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
    expect(prompt).toContain('Specificity must be grounded');
    expect(prompt).toContain('Do not invent product ingredients');
    expect(prompt).toContain('Grounded means exact');
    expect(prompt).toContain('never infer packaging mechanics, scent, texture');
    expect(prompt).toContain('Source ledger test');
    expect(prompt).toContain('Only use measurable claims that appear in source context');
    expect(prompt).toContain('keep product facts literal');
    expect(prompt).toContain('Write the ACTUAL publishable Instagram post');
    expect(prompt).not.toContain('Write the ACTUAL publishable LinkedIn post');
  });

  it('uses resolved platform before sidecar instruction platform names', () => {
    process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-gemini-key';
    const agent = new ScriptAuthorAgent();
    const contentSignalProfile = resolveContentSignalProfile({
      userPrompt: 'Write an Instagram caption and Clickatron-ready text + image post.',
      project: {
        format: 'post',
        platform: 'Instagram',
        purpose: 'product launch',
        tone: 'warm expert',
      },
    });

    const input: ScriptAuthorInput = {
      context: {
        projectSummary: 'Platform: Instagram. Audience: skincare buyers.',
        systemBrief: 'Brand DNA: warm expert.',
      },
      userPrompt: 'Write an Instagram caption and Clickatron-ready text + image post.',
      contentSignalProfile,
      contract: {
        generation_mode: 'manual',
        narrator_voice: 'author',
        medium: 'visual_manual',
        tone: 'warm expert',
        forbidden: [],
        allowed_metaphors: [],
        style_notes: ['Use exact supplied claims only.'],
        metaphor_reuse_limit: 1,
        mode_a_usage: 'opening only',
        mode_b_usage: 'default direct copywriting voice',
        mode_switch_rules: 'stay direct after the hook',
      },
      outline: {
        title: 'Instagram Caption',
        sections: [
          {
            id: 'hook',
            title: 'Hook',
            goal: 'Open with the product moment.',
            beat: 'Hook',
            level: 'act',
          },
        ],
      },
    };

    const sidecarInput = appendClickatronCreativeSidecarInstruction(input, contentSignalProfile) as ScriptAuthorInput;
    const prompt = agent.buildPrompt(sidecarInput);

    expect(sidecarInput.userPrompt).toContain('linkedin');
    expect(prompt).toContain('Write the ACTUAL publishable Instagram post');
    expect(prompt).not.toContain('Write the ACTUAL publishable LinkedIn post');
  });

  it('keeps social posts away from eval-blocked filler phrases', () => {
    process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-gemini-key';
    const agent = new ScriptAuthorAgent();

    const input: ScriptAuthorInput = {
      context: {
        projectSummary: 'Insturix - AI-powered video editing platform for creators and agencies.',
        systemBrief:
          'Brand: Insturix. Voice: Professional but approachable, grounded in real workflow pain. Target: Agency owners and creative directors managing 5-15 person teams.',
      },
      userPrompt: 'Write a LinkedIn post about how AI is changing video production workflows for small agencies.',
      documentType: 'post',
    };

    const prompt = agent.buildPrompt(input);

    expect(prompt).toContain('Never use filler phrases');
    expect(prompt).toContain('in today\'s fast-paced world');
    expect(prompt).toContain('work its magic');
    expect(prompt).toContain('take it to the next level');
    expect(prompt).toContain('fundamentally shift');
    expect(prompt).toContain('interplay');
    expect(prompt).toContain('Zero corporate/AI buzzwords');
  });

  it('requires shoot guidance for talking-head setup constraints', () => {
    process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-gemini-key';
    const agent = new ScriptAuthorAgent();

    const input: ScriptAuthorInput = {
      context: {
        projectSummary:
          'StudioPilot helps small film and content teams turn scripts into shootable founder videos with clear production notes.',
        systemBrief:
          'Brand DNA: practical, production-literate, calm. User setup: one camera, desk mic, small office, window key light from camera-left, no crew.',
      },
      userPrompt:
        'Write a 45-second talking-head script. Include concise camera, light, framing, and emotion guidance for the one-camera office setup.',
      documentType: 'video_script',
    };

    const prompt = agent.buildPrompt(input);

    expect(prompt).toContain('## Shoot Guidance');
    expect(prompt).toContain('**Camera:**');
    expect(prompt).toContain('**Lighting:**');
    expect(prompt).toContain('**Framing:**');
    expect(prompt).toContain('**Blocking:**');
    expect(prompt).toContain('**Emotion:**');
    expect(prompt).toContain('Do not invent extra crew or equipment');
  });
});
