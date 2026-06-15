import { describe, expect, it } from 'vitest';
import { ScriptDraftAgent } from '@/lib/thinkforge/agents/script-draft-agent';
import type { ScriptAuthorInput } from '@/lib/thinkforge/agents/script-author-agent';
import type { RetrievedContext } from '@/lib/thinkforge/context';

async function* streamText(text: string): AsyncGenerator<string, void, unknown> {
  yield text;
}

describe('ScriptDraftAgent retrieved context wiring', () => {
  it('passes structured retrieved context into the resolved author profile', async () => {
    process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-gemini-key';

    const agent = new ScriptDraftAgent();
    const captured: { authorInput?: ScriptAuthorInput } = {};

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
          stream: streamText('Approval cycles drop by 37% when review owners are named upfront. Reply with the bottleneck you want fixed first?'),
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
      },
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

    const result = await agent.generateScript({
      context: {
        projectSummary: 'Audience: agency founders.',
        systemBrief: '## Brand DNA\nVoice: warm, expert, plainspoken',
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
    expect(profile?.sources.projectFactsUsed).toBe(1);
    expect(profile?.sources.interactionPatternsUsed).toBe(1);
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
    expect(JSON.stringify(result.signalTrace)).not.toContain('## Brand DNA');
  });
});
