import { describe, expect, it } from 'vitest';

import { resolveThinkForgeProductionBrief } from '@/lib/thinkforge/brief/resolve-production-brief';
import type { ProjectMeta } from '@/lib/thinkforge/state/types';

describe('resolveThinkForgeProductionBrief', () => {
  it('maps explicit ThinkForge session fields into the shared ProductionBrief', () => {
    const project: ProjectMeta = {
      platform: 'linkedin',
      brandId: 'brand_123',
      purpose: 'Launch the founder POV video',
      format: 'video script',
      preferences: {
        aspectRatio: '9:16',
        targetDurationSec: '45',
        count: '2',
        voiceLanguages: 'en, hi',
        captionLanguages: ['en', 'es'],
        deliverables: ['ai-video', 'shoot-kit'],
      },
    };

    const brief = resolveThinkForgeProductionBrief({
      userPrompt: 'Make a founder launch video',
      project,
      documentType: 'custom',
      contentPath: 'script',
    });

    expect(brief.entryPoint).toBe('thinkforge');
    expect(brief.brand).toEqual({ brandId: 'brand_123' });
    expect(brief.output).toMatchObject({
      platform: 'linkedin',
      aspectRatio: '9:16',
      targetDurationSec: 45,
      count: 2,
      intent: 'Launch the founder POV video',
      voiceLanguages: ['en', 'hi'],
      captionLanguages: ['en', 'es'],
      deliverables: ['ai-video', 'shoot-kit'],
    });
    expect(brief.resolution.confirmed).toEqual(
      expect.arrayContaining([
        'platform',
        'aspectRatio',
        'targetDurationSec',
        'count',
        'voiceLanguages',
        'captionLanguages',
        'deliverables',
      ]),
    );
  });

  it('does not parse platform or duration out of prompt text', () => {
    const brief = resolveThinkForgeProductionBrief({
      userPrompt: 'Make an instagram reel for 30 seconds',
      project: null,
      documentType: 'custom',
      contentPath: 'script',
    });

    expect(brief.output.intent).toBe('Make an instagram reel for 30 seconds');
    expect(brief.output.platform).toBe('unspecified');
    expect(brief.output.targetDurationSec).toBeNull();
    expect(brief.resolution.confirmed).toContain('intent');
    expect(brief.resolution.confirmed).not.toContain('platform');
    expect(brief.resolution.confirmed).not.toContain('targetDurationSec');
  });

  it('uses Brand Vault/session defaults as overridable inferred knobs', () => {
    const project: ProjectMeta = {
      brandId: 'brand_abc',
      tone: 'warm but direct',
      preferences: {
        preferredPlatform: 'youtube-shorts',
        preferredAspectRatio: '1:1',
        defaultDurationSec: 20,
      },
    };

    const brief = resolveThinkForgeProductionBrief({
      userPrompt: 'Create a brand story',
      project,
      contentPath: 'script',
    });

    expect(brief.brand).toEqual({ brandId: 'brand_abc' });
    expect(brief.output.platform).toBe('youtube-shorts');
    expect(brief.output.aspectRatio).toBe('1:1');
    expect(brief.output.targetDurationSec).toBe(20);
    expect(brief.output.style).toEqual({ tone: 'warm but direct' });
    expect(brief.resolution.inferred).toEqual(expect.arrayContaining(['platform', 'aspectRatio', 'targetDurationSec', 'style']));
  });
});
