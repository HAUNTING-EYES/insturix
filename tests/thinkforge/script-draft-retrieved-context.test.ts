import { describe, expect, it, vi } from 'vitest';
import { ScriptDraftAgent } from '@/lib/thinkforge/agents/script-draft-agent';
import { ScriptAuthorAgent, type ScriptAuthorInput } from '@/lib/thinkforge/agents/script-author-agent';
import { StylistAgent } from '@/lib/thinkforge/agents/stylist-agent';
import { formatSystemBrief, type RetrievedContext } from '@/lib/thinkforge/context';
import { deriveBrandSignalProfile, type BrandSignal, type BrandSignalProfile } from '@/lib/shared/brand-signal-profile';
import type { UnifiedBrand } from '@/lib/shared/brand-registry';

async function* streamText(text: string): AsyncGenerator<string, void, unknown> {
  yield text;
}

function brand(): UnifiedBrand {
  return {
    brandId: 'brand_1',
    userId: 'user_1',
    name: 'ApprovalOps',
    voice: {
      voiceLock: 'warm, expert, plainspoken',
      nicheMap: 'agency founders',
      killList: ['game-changing'],
      hookArchetypes: ['contrarian opener'],
      structuralHabits: ['metric, lesson, soft CTA'],
    },
    visual: {
      industry: 'agency operations software',
      colors: ['#101820', '#ffcc00'],
      visualStyle: 'sharp proof-led dashboard',
      typography: 'Geometric sans',
    },
    learning: { banditProjectCount: 0 },
  };
}

function acceptedProfile(): BrandSignalProfile {
  const profile = deriveBrandSignalProfile(brand(), {
    generatedAt: '2026-06-24T00:00:00.000Z',
  });

  setSignal(profile.motion.motionEnergy, 0.83, 0.86);
  setSignal(profile.identity.proofStyle, 'metrics', 0.84);
  setSignal(profile.voice.humor, 0.2, 0.81);

  return profile;
}

function setSignal<T>(signal: BrandSignal<T>, value: T, confidence: number): void {
  signal.value = value;
  signal.confidence = confidence;
  signal.trustLevel = 'manual_user_entry';
  signal.authorityClass = 'brand_preference';
  delete signal.fallbackReason;
}

describe('ScriptDraftAgent retrieved context wiring', () => {
  it('passes structured retrieved context into the resolved author profile', async () => {
    process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-gemini-key';

    const agent = new ScriptDraftAgent();
    const captured: { authorInput?: ScriptAuthorInput } = {};
    const checkVoice = vi.spyOn(StylistAgent.prototype, 'checkVoice').mockResolvedValue({
      overallScore: 72,
      voiceSummary: 'The draft needs a targeted cleanup.',
      flags: [],
      patternInterrupts: [],
    });
    const rewriteFlagged = vi.spyOn(StylistAgent.prototype, 'rewriteFlagged').mockResolvedValue(null);

    (agent as any).contractAgent = {
      setAbortSignal: () => {},
      generateContract: async () => ({
        generation_mode: 'manual',
        narrator_voice: 'author',
        medium: 'post',
        tone: 'warm expert',
        forbidden: [],
        allowed_metaphors: [],
        style_notes: [],
        metaphor_reuse_limit: 1,
        mode_a_usage: 'opening only',
        mode_b_usage: 'default direct copywriting voice',
        mode_switch_rules: 'stay direct',
      }),
    };
    (agent as any).outlineAgent = {
      setAbortSignal: () => {},
      generateOutline: async () => ({
        title: 'Approval Cycles',
        sections: [
          {
            id: 'hook',
            title: 'Hook',
            goal: 'Use the proof point.',
            beat: 'Hook',
            level: 'act',
          },
        ],
      }),
    };
    (agent as any).authorAgent = {
      setAbortSignal: () => {},
      run: async (input: ScriptAuthorInput) => {
        captured.authorInput = input;
        return {
          stream: streamText("In today's fast-paced world, let's dive in and leverage a seamless workflow. Perhaps it seems this might work, and it could potentially improve things. In summary, this game-changing process could potentially help. Approval cycles drop by 37% when review owners are named upfront."),
        };
      },
    };

    const retrievedContext: RetrievedContext = {
      brandDNA: {
        voiceLock: 'warm, expert, plainspoken',
        nicheMap: 'agency founders',
        killList: ['game-changing'],
        hookArchetypes: ['contrarian opener'],
        structuralHabits: ['metric, lesson, soft CTA'],
        voiceFingerprint: {
          avgWordsPerSentence: 8,
          sentenceLengthVariance: 1.4,
          topBigrams: [['approval loop', 4]],
          punctuationProfile: { comma: 0.4 },
          passiveVoiceRatio: 0.05,
          questionFrequency: 0.08,
          sentenceRhythm: ['short', 'medium'],
          openingPattern: 'direct_claim',
          transitionStyle: 'implicit',
          closingPattern: 'cta',
          listStyle: 'none',
          extractedFromCount: 4,
        },
        voiceExemplars: [
          {
            id: 'learned_voice_1',
            text: 'Approval loops do not need another dashboard. They need one named owner and one next step.',
            signalProfile: { warmth: 0.72, ethos_load: 0.84 },
            contentType: 'linkedin',
            pinned: true,
            weight: 0.95,
          },
        ],
      },
      brandSignalProfile: acceptedProfile(),
      projectFacts: [
        {
          id: 'fact_1',
          title: 'Approval cycle benchmark',
          summary: 'Naming owners reduces approval time by 37%.',
          tags: ['approval'],
        },
      ],
      globalFacts: [],
      semanticFacts: [],
      interactionPatterns: [
        {
          type: 'style_corrected',
          summary: 'User prefers concrete metrics over broad claims.',
          count: 2,
        },
      ],
    };
    const systemBrief = formatSystemBrief(retrievedContext);

    const result = await agent.generateScript({
      context: {
        projectSummary: 'Audience: agency founders.',
        systemBrief,
      },
      project: {
        format: 'case_study',
        purpose: 'agency founders',
        tone: 'warm expert',
        brandId: 'brand_1',
      },
      brandId: 'brand_1',
      sessionId: 'session_1',
      retrievedContext,
      userPrompt: 'Write a case study about reducing approval time by 37%.',
    });

    const profile = captured.authorInput?.contentSignalProfile;
    expect(profile?.sources.brandContextPresent).toBe(true);
    expect(checkVoice).toHaveBeenCalledWith(expect.objectContaining({
      brandId: 'brand_1',
      sessionId: 'session_1',
    }));
    expect(rewriteFlagged).toHaveBeenCalledWith(expect.objectContaining({
      brandId: 'brand_1',
      sessionId: 'session_1',
    }));
    expect(profile?.sources.brandVaultProfilePresent).toBe(true);
    expect(profile?.sources.projectFactsUsed).toBe(1);
    expect(profile?.sources.interactionPatternsUsed).toBe(1);
    expect(profile?.profile.signals.enthusiasm).toBe(0.83);
    expect(profile?.profile.signals.pacing_velocity).toBe(0.83);
    expect(profile?.profile.signals.humor).toBe(0.2);
    expect(profile?.profile._inference_metadata?.enthusiasm).toMatchObject({
      source: 'brand_dna',
      confidence: 0.86,
    });
    expect(profile?.profile._inference_metadata?.enthusiasm.resolvedFrom).toContain('brand_vault:');
    expect(profile?.intent.forbiddenTerms).toContain('game-changing');
    expect(profile?.intent.proofPoints).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Approval cycle benchmark'),
        'Metric mentioned in brief: 37%',
      ]),
    );
    expect(result.signalTrace).toMatchObject({
      outputFormat: 'case_study',
      goal: 'clear communication',
      tone: 'warm expert',
      enforcedConstraints: {
        brandVoiceId: 'brand_1',
      },
      sourceSummary: {
        brandId: 'brand_1',
        sessionId: 'session_1',
        brandContextPresent: true,
        brandVaultProfilePresent: true,
        projectFactsUsed: 1,
        interactionPatternsUsed: 1,
      },
    });
    expect(result.signalTrace?.selectedIntent.forbiddenTerms).toContain('game-changing');
    expect(result.signalTrace?.selectedIntent.proofPoints).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Approval cycle benchmark'),
        'Metric mentioned in brief: 37%',
      ]),
    );
    expect(result.signalTrace?.provenanceSummary.some((entry) => entry.signal === 'warmth')).toBe(true);
    expect(result.signalTrace?.provenanceSummary).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          signal: 'enthusiasm',
          source: 'brand_dna',
          confidence: 0.86,
        }),
      ]),
    );
    expect(captured.authorInput?.context.systemBrief).toContain('<voice_fingerprint samples="4">');
    expect(captured.authorInput?.context.systemBrief).toContain('Characteristic phrases: "approval loop"');
    expect(captured.authorInput?.context.systemBrief).toContain('<voice_example index="1" type="linkedin">');

    const authorParts = new ScriptAuthorAgent().buildPromptParts(captured.authorInput!);
    expect(authorParts.systemInstruction).not.toContain('## Brand DNA');
    expect(authorParts.systemInstruction).not.toContain('<voice_fingerprint');
    expect(authorParts.prompt).toContain('"brandContext"');
    expect(authorParts.prompt).toContain('voice_fingerprint samples=\\"4\\"');
    expect(authorParts.prompt).toContain('voice_example index=\\"1\\" type=\\"linkedin\\"');
    expect(authorParts.prompt).toContain('"contentSignalProfile"');
    expect(authorParts.prompt).toContain('"enthusiasm": 0.83');
    expect(authorParts.prompt).toContain('brand_vault:');
    expect(JSON.stringify(result.signalTrace)).not.toContain('## Brand DNA');
  });
});
