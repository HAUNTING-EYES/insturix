import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

import { resolveThinkForgeProductionBrief } from '@/lib/thinkforge/brief/resolve-production-brief';
import { createThinkForgeWriterContract } from '@/lib/thinkforge/schemas/document-contract';
import { TREND_SPEC_VERSION, type TrendSpec } from '@/lib/thinkforge/schemas/trend-spec';
import type { ProjectMeta } from '@/lib/thinkforge/state/types';
import {
  buildAnalyzedSelectedTrend,
  buildFailedTrendAnalysis,
  buildQueuedTrendAnalysis,
  buildSelectedTrend,
} from '@/lib/thinkforge/trends/selected-trend';

function trendSpec(overrides: Partial<TrendSpec> = {}): TrendSpec {
  return {
    trendId: 'trend_pov_drop_reveal',
    version: TREND_SPEC_VERSION,
    alignmentFrame: 'beat-space',
    beatGrid: {
      bpm: 128,
      beatsMs: [0, 469, 938, 1406, 1875, 2344, 2813, 3281],
      dropsMs: [3281],
      totalMs: 7500,
      sections: [
        { id: 's_hook', role: 'hook', start: 0, end: 3281, beats: [0, 1, 2, 3, 4, 5, 6] },
        { id: 's_reveal', role: 'payoff', start: 3281, end: 7500, beats: [7] },
      ],
    },
    invariants: [
      {
        layer: 'decisionStream',
        feature: 'cut_on_drop',
        support: 0.9,
        anchor: { beat: 7, sectionId: 's_reveal' },
      },
    ],
    variables: [
      {
        layer: 'blocking',
        feature: 'subject',
        freedomRange: ['creator', 'product', 'screen'],
      },
    ],
    copyFormula: {
      slots: [
        { id: 'hook', role: 'hook', template: 'POV: you just found {thing}', maxChars: 40 },
        { id: 'cta', role: 'cta', template: '{action} - link in bio', maxChars: 30 },
      ],
      hashtags: ['#fyp', '#{brand}'],
    },
    performanceScript: 'Beat 0-6: build anticipation. Beat 7: reveal and react.',
    ...overrides,
  };
}

function selectedTrend() {
  return buildSelectedTrend({
    sessionId: 'session_1',
    target: 'script',
    candidate: {
      candidateId: 'trend_pov_drop_reveal',
      candidateVersion: 1,
      title: 'POV drop reveal',
      platform: 'instagram',
      evidence: [{
        evidenceId: 'evidence_1',
        evidenceVersion: 1,
        kind: 'user_submitted_reference',
        provider: 'user',
        platform: 'instagram',
        title: 'Reference reel',
        provenance: {
          purpose: 'public_trend_discovery',
          queryFingerprint: 'query_1',
        },
      }],
      evidenceCompleteness: 1,
      freshness: 'fresh',
      trendSpecEligible: false,
      nextAction: 'add_reference_video',
    },
  }, new Date('2026-07-12T00:00:00.000Z'));
}
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

  it('keeps a confirmed 7-minute YouTube request above stale and inferred metadata', () => {
    const authoringRequest = {
      version: 1 as const,
      contentContract: createThinkForgeWriterContract('video_script'),
      platformSurface: { id: 'youtube' as const },
      targetDurationSec: 420,
    };

    const brief = resolveThinkForgeProductionBrief({
      userPrompt: 'Use the selected brief even if this sentence mentions a short LinkedIn post.',
      project: {
        platform: 'linkedin',
        format: 'social post',
        durationSec: 60,
        preferences: { targetDurationSec: 60 },
      },
      authoringRequest,
      requested: {
        platform: 'tiktok',
        targetDurationSec: 30,
      },
      documentType: 'post',
      contentPath: 'post',
    });

    expect(brief.output.platform).toBe('youtube');
    expect(brief.output.targetDurationSec).toBe(420);
    expect(brief.resolution.confirmed).toEqual(
      expect.arrayContaining(['platform', 'targetDurationSec']),
    );
  });

  it('preserves an explicit general-video destination as a confirmed neutral platform', () => {
    const brief = resolveThinkForgeProductionBrief({
      userPrompt: 'Create the selected general video.',
      authoringRequest: {
        version: 1,
        contentContract: createThinkForgeWriterContract('video_script'),
        platformSurface: { id: 'generic' },
        publishingSurface: 'generic_video',
        targetDurationSec: 15,
      },
    });

    expect(brief.output.platform).toBe('unspecified');
    expect(brief.output.targetDurationSec).toBe(15);
    expect(brief.resolution.confirmed).toEqual(
      expect.arrayContaining(['platform', 'targetDurationSec']),
    );
  });

  it('rejects competing typed requests and keeps chat wiring on the same authority', () => {
    const scriptRequest = {
      version: 1 as const,
      contentContract: createThinkForgeWriterContract('video_script'),
      platformSurface: { id: 'youtube' as const },
      targetDurationSec: 420,
    };
    const postRequest = {
      version: 1 as const,
      contentContract: createThinkForgeWriterContract('social_post'),
      platformSurface: { id: 'linkedin' as const },
      postControls: {
        version: 1 as const,
        cta: { preference: 'editorial' as const },
        hashtags: { preference: 'editorial' as const },
        emoji: { preference: 'editorial' as const },
      },
    };

    expect(() => resolveThinkForgeProductionBrief({
      userPrompt: 'Draft the confirmed deliverable.',
      project: { authoringRequest: postRequest },
      authoringRequest: scriptRequest,
    })).toThrow(/conflicting authoring requests/i);

    const chatService = readFileSync(
      'lib/thinkforge/services/chat-service.ts',
      'utf8',
    );
    expect(chatService).toMatch(
      /buildThinkForgeAuthoringContextSnapshot\(\{[\s\S]{0,300}authoringRequest: authoritativeAuthoringRequest/,
    );
    expect(chatService).toMatch(
      /resolveContentSignalProfile\(\{[\s\S]{0,300}authoringRequest: authoritativeAuthoringRequest/,
    );
    expect(chatService).toMatch(
      /resolveThinkForgeProductionBrief\(\{[\s\S]{0,300}authoringRequest: authoritativeAuthoringRequest/,
    );
    expect(chatService).toMatch(
      /const baseInput = \{[\s\S]{0,600}authoringRequest: authoritativeAuthoringRequest/,
    );
    expect(chatService).toContain('ThinkForge generation requires a confirmed authoring request');
    expect(chatService).not.toContain('requested: promptUnderstanding?.requested');
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

  it('does not treat a legacy brandBrief as a Brand Vault attachment', () => {
    const brief = resolveThinkForgeProductionBrief({
      userPrompt: 'Create a product story',
      project: { brandBrief: 'Old scan: premium, founder-led, exclusive.' },
      contentPath: 'script',
    });

    expect(brief.brand).toBeNull();
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

  it('consumes a TrendSpec into the shared brief without treating platform defaults as extensions', () => {
    const brief = resolveThinkForgeProductionBrief({
      userPrompt: 'Turn this trend into a brand reel',
      project: {
        platform: 'linkedin',
      },
      trendSpec: trendSpec(),
    });

    expect(brief.output.platform).toBe('linkedin');
    expect(brief.output.targetDurationSec).toBe(7.5);
    expect(brief.resolution.inferred).toContain('targetDurationSec');
    expect(brief.trend).toMatchObject({
      trendId: 'trend_pov_drop_reveal',
      naturalDurationSec: 7.5,
      selectedDurationSec: 7.5,
      durationBoundariesSec: [3.281, 7.5],
      performanceScript: 'Beat 0-6: build anticipation. Beat 7: reveal and react.',
      hashtags: ['#fyp', '#{brand}'],
    });
    expect(brief.trend?.copyFields.map((field) => field.id)).toEqual(['hook', 'cta']);
    expect(brief.trend?.constraints[0]).toMatchObject({
      layer: 'decisionStream',
      feature: 'cut_on_drop',
      anchor: { beat: 7, sectionId: 's_reveal' },
    });
    expect(brief.trend?.choices[0]).toMatchObject({
      layer: 'blocking',
      feature: 'subject',
      freedomRange: ['creator', 'product', 'screen'],
    });
    expect(brief.trend?.warnings).toBeUndefined();
  });

  it('rejects a trend that cannot fit an explicitly shorter output', () => {
    expect(() => resolveThinkForgeProductionBrief({
      userPrompt: 'Make the trend edit four seconds long',
      project: {
        preferences: {
          targetDurationSec: 4,
          trendSpec: trendSpec(),
        },
      },
    })).toThrowError(expect.objectContaining({
      code: 'TREND_DURATION_INCOMPATIBLE',
    }));
  });

  it('preserves an explicit long-form runtime and embeds the shorter trend as a motif', () => {
    const brief = resolveThinkForgeProductionBrief({
      userPrompt: 'Make a seven-minute documentary using this trend.',
      authoringRequest: {
        version: 1,
        contentContract: createThinkForgeWriterContract('video_script'),
        platformSurface: { id: 'youtube' },
        targetDurationSec: 420,
      },
      trendSpec: trendSpec(),
    });

    expect(brief.output.targetDurationSec).toBe(420);
    expect(brief.resolution.confirmed).toContain('targetDurationSec');
    expect(brief.trend).toMatchObject({
      naturalDurationSec: 7.5,
      selectedDurationSec: 7.5,
      applicationMode: 'embedded_motif',
      warnings: ['explicit_duration_preserved_trend_used_as_motif'],
    });
  });

  it('uses the completed selected trend ahead of a stale legacy preference', () => {
    const selected = buildAnalyzedSelectedTrend(selectedTrend(), {
      analysisVersion: 1,
      status: 'completed',
      analyzedAt: '2026-07-12T00:01:00.000Z',
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      source: {
        referenceId: 'asset_reference_1',
        sourceKind: 'asset',
        sourceLabel: 'Reference reel',
        sourceFingerprint: 'sha256:reference_1',
      },
      trendSpec: trendSpec(),
    });

    const brief = resolveThinkForgeProductionBrief({
      userPrompt: 'Adapt this format to our launch',
      project: {
        selectedTrend: selected,
        preferences: {
          trendSpec: trendSpec({ trendId: 'stale_legacy_trend', beatGrid: { ...trendSpec().beatGrid, totalMs: 30_000 } }),
        },
      },
    });

    expect(brief.trend?.trendId).toBe('trend_pov_drop_reveal');
    expect(brief.output.targetDurationSec).toBe(7.5);
  });

  it.each([
    ['queued', (selected: ReturnType<typeof selectedTrend>) => buildQueuedTrendAnalysis(selected, {
      jobId: 'job_1',
      sourceKind: 'asset',
      now: new Date('2026-07-12T00:01:00.000Z'),
    })],
    ['failed', (selected: ReturnType<typeof selectedTrend>) => buildFailedTrendAnalysis(selected, {
      jobId: 'job_1',
      sourceKind: 'asset',
      failureCode: 'analysis_generation_failed',
      now: new Date('2026-07-12T00:01:00.000Z'),
    })],
  ])('does not activate a %s selected trend', (_status, withAnalysis) => {
    const brief = resolveThinkForgeProductionBrief({
      userPrompt: 'Adapt this format to our launch',
      project: { selectedTrend: withAnalysis(selectedTrend()) },
    });

    expect(brief.trend).toBeUndefined();
    expect(brief.output.targetDurationSec).toBeNull();
  });
});
