import { describe, expect, it } from 'vitest';

import { IdeasAgent } from '@/lib/thinkforge/agents/ideas-agent';
import { buildPostEditorialPlan } from '@/lib/thinkforge/agents/post-editorial-plan';
import { ScriptWriterAgent } from '@/lib/thinkforge/agents/script-writer-agent';
import { resolveThinkForgeProductionBrief } from '@/lib/thinkforge/brief/resolve-production-brief';
import {
  createDefaultThinkForgePostControls,
  createThinkForgeAuthoringRequest,
} from '@/lib/thinkforge/schemas/authoring-request';
import { createThinkForgeWriterContract } from '@/lib/thinkforge/schemas/document-contract';

const youtubeShortRequest = createThinkForgeAuthoringRequest({
  contentContract: createThinkForgeWriterContract('video_script'),
  platformSurface: { id: 'youtube' },
  publishingSurface: 'youtube_shorts',
  targetDurationSec: 120,
});

describe('ThinkForge publishing-surface propagation', () => {
  it('makes the exact publishing product authoritative for idea generation', () => {
    process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-gemini-key';
    const prompt = new IdeasAgent().buildPrompt({
      context: { projectSummary: '', systemBrief: '' },
      userPrompt: 'The prose says long YouTube documentary, but use the confirmed destination.',
      authoringRequest: youtubeShortRequest,
    });

    expect(prompt).toContain('publishingSurfaceId: youtube_shorts');
    expect(prompt).toContain('publishingSurface: YouTube Short');
    expect(prompt).toContain('exact outputKind and publishingSurfaceId');
  });

  it('gives the post editorial plan the exact destination instead of a broad platform', () => {
    const request = createThinkForgeAuthoringRequest({
      contentContract: createThinkForgeWriterContract('carousel', { carouselSlideCount: 5 }),
      platformSurface: { id: 'instagram' },
      publishingSurface: 'instagram_carousel',
      postControls: createDefaultThinkForgePostControls(),
    });

    const plan = buildPostEditorialPlan({
      userPrompt: 'Create the confirmed deliverable.',
      authoringRequest: request,
    });

    expect(plan.platform).toBe('Instagram carousel');
    expect(plan.publishingConstraints.surface).toBe('instagram_carousel');
  });

  it('maps typed short-form and long-form destinations to distinct production platforms', () => {
    const shortBrief = resolveThinkForgeProductionBrief({
      userPrompt: 'Create the confirmed deliverable.',
      authoringRequest: youtubeShortRequest,
    });
    const longBrief = resolveThinkForgeProductionBrief({
      userPrompt: 'Create the confirmed deliverable.',
      authoringRequest: createThinkForgeAuthoringRequest({
        contentContract: createThinkForgeWriterContract('video_script'),
        platformSurface: { id: 'youtube' },
        publishingSurface: 'youtube_video',
        targetDurationSec: 420,
      }),
    });

    expect(shortBrief.output.platform).toBe('youtube-shorts');
    expect(longBrief.output.platform).toBe('youtube');
  });

  it('passes exact destination data through the isolated script-writer boundary', () => {
    process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-gemini-key';
    const productionBrief = resolveThinkForgeProductionBrief({
      userPrompt: 'Create the confirmed deliverable.',
      authoringRequest: youtubeShortRequest,
    });
    const parts = new ScriptWriterAgent().buildPromptParts({
      context: { projectSummary: '', systemBrief: '' },
      userPrompt: 'The topic mentions a long documentary, but honor the confirmed output.',
      authoringRequest: youtubeShortRequest,
      productionBrief,
    });

    expect(parts.systemInstruction).toContain('tf_untrusted_data.authoringDestination');
    expect(parts.prompt).toContain('"publishingSurfaceId": "youtube_shorts"');
    expect(parts.prompt).toContain('"deliverable": "2-minute YouTube Short script"');
    expect(parts.prompt).toContain('"platform": "youtube-shorts"');
  });
});
