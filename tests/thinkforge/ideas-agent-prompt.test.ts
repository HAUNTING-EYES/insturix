import { describe, expect, it, vi } from 'vitest';
import { IdeasAgent } from '@/lib/thinkforge/agents/ideas-agent';
import { formatSystemBrief, type RetrievedContext } from '@/lib/thinkforge/context';

describe('IdeasAgent prompt contract', () => {
  it('preserves calendar, public trend, and platform-ready deliverable guidance', () => {
    process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-gemini-key';
    const agent = new IdeasAgent();

    const prompt = agent.buildPrompt({
      context: {
        projectSummary: 'NimbusOps content planning for agency operators.',
        systemBrief: 'Brand voice: calm, operational, dry humor.',
      },
      userPrompt:
        'Generate ideas for a 6-week content calendar repurposing the public trend that every app has an AI copilot button.',
    });

    expect(prompt).toContain('content calendar');
    expect(prompt).toContain('preserve that planning context');
    expect(prompt).toContain('public trend');
    expect(prompt).toContain('freshness or expiry window');
    expect(prompt).toContain('platform-ready deliverable');
    expect(prompt).toContain('LinkedIn carousel');
  });

  it('treats internal context headings as non-public writing material', () => {
    process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-gemini-key';
    const agent = new IdeasAgent();

    const prompt = agent.buildPrompt({
      context: {
        projectSummary: 'Insturix brand content.',
        systemBrief: [
          '## Relevant Saved Facts',
          '- The audience is agency founders who plan content ahead of client deadlines.',
        ].join('\n'),
      },
      userPrompt: 'Create Instagram post ideas that create FOMO for my brand ICP.',
    });

    expect(prompt).toContain('INTERNAL labels');
    expect(prompt).toContain('Never use "Global Knowledge Vault"');
    expect(prompt).toContain('Do not invent new acronyms');
    expect(prompt).toContain("preserve the user's request with neutral category language");
  });

  it('adds deterministic regeneration identity and rejected concepts to the prompt', () => {
    process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-gemini-key';
    const agent = new IdeasAgent();

    const prompt = agent.buildPrompt({
      context: { projectSummary: '', systemBrief: '' },
      userPrompt: 'Create LinkedIn post ideas about content operations.',
      generationIdentity: {
        variationIndex: 2,
        rejectedIdeas: [{
          title: 'The Month-Ahead Content Team',
          purpose: 'Show how agencies plan content before client deadlines.',
          style: 'behind-the-scenes workflow',
        }],
      },
    });

    expect(prompt).toContain('deterministic variation 2');
    expect(prompt).toContain('<rejected_ideas_json>');
    expect(prompt).toContain('The Month-Ahead Content Team');
    expect(prompt).toContain('do not repeat or lightly paraphrase');
  });

  it('repairs a regenerated set that overlaps rejected ideas', async () => {
    process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-gemini-key';
    const agent = new IdeasAgent();
    const makeIdea = (id: string, idea: string) => ({
      id,
      idea,
      purpose: `Purpose for ${idea}`,
      style: 'operator lesson',
      format: 'LinkedIn post',
      platform: 'LinkedIn',
      tone: 'blue' as const,
    });
    const runStructured = vi.fn()
      .mockResolvedValueOnce({
        result: {
          ideas: [
            makeIdea('idea_1', 'Building the Month-Ahead Content Team'),
            makeIdea('idea_2', 'The Approval Bottleneck Audit'),
            makeIdea('idea_3', 'What Monday Chaos Costs'),
            makeIdea('idea_4', 'A Better Agency Content Handoff'),
          ],
        },
        metadata: {},
      })
      .mockResolvedValueOnce({
        result: {
          ideas: [
            makeIdea('idea_1', 'The Content Debt Balance Sheet'),
            makeIdea('idea_2', 'Why Approvals Stall at Handoff'),
            makeIdea('idea_3', 'Monday Chaos in Four Screenshots'),
            makeIdea('idea_4', 'The Agency Planning Confidence Gap'),
          ],
        },
        metadata: {},
      });
    (agent as unknown as { runStructured: typeof runStructured }).runStructured = runStructured;

    const ideas = await agent.generateIdeas(
      'Create LinkedIn post ideas about content operations.',
      {
        variationIndex: 1,
        rejectedIdeas: [{ title: 'The Month-Ahead Content Team' }],
      },
    );

    expect(runStructured).toHaveBeenCalledTimes(2);
    expect(ideas[0].idea).toBe('The Content Debt Balance Sheet');
  });

  it('fails loudly when the bounded repair still repeats a rejected idea', async () => {
    process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-gemini-key';
    const agent = new IdeasAgent();
    const repeatedSet = {
      result: {
        ideas: [
          { id: 'idea_1', idea: 'महीने भर की कंटेंट टीम', purpose: 'A', style: 'A', format: 'LinkedIn post', platform: 'LinkedIn', tone: 'blue' as const },
          { id: 'idea_2', idea: 'Approval Queue Audit', purpose: 'B', style: 'B', format: 'LinkedIn post', platform: 'LinkedIn', tone: 'red' as const },
          { id: 'idea_3', idea: 'Monday Content Debt', purpose: 'C', style: 'C', format: 'LinkedIn post', platform: 'LinkedIn', tone: 'black' as const },
          { id: 'idea_4', idea: 'Agency Handoff Map', purpose: 'D', style: 'D', format: 'LinkedIn post', platform: 'LinkedIn', tone: 'green' as const },
        ],
      },
      metadata: {},
    };
    const runStructured = vi.fn()
      .mockResolvedValueOnce(repeatedSet)
      .mockResolvedValueOnce(repeatedSet);
    (agent as unknown as { runStructured: typeof runStructured }).runStructured = runStructured;

    await expect(agent.generateIdeas(
      'हिंदी में कंटेंट ऑपरेशंस पर लिंक्डइन पोस्ट बनाएं।',
      { variationIndex: 3, rejectedIdeas: [{ title: 'महीने भर की कंटेंट टीम' }] },
    )).rejects.toThrow('Ideas failed grounding quality gate');
    expect(runStructured).toHaveBeenCalledTimes(2);
  });

  it('repairs ideas that leak internal labels and invented acronyms', async () => {
    process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-gemini-key';
    const agent = new IdeasAgent();
    const runStructured = vi.fn()
      .mockResolvedValueOnce({
        result: {
          ideas: [
            {
              id: 'idea_1',
              idea: 'Inside the Global Knowledge Vault: GKV Wins',
              purpose: 'Creates FOMO through exclusive access to a hidden internal vault.',
              style: 'secret weapon teardown',
              format: 'Instagram post',
              platform: 'Instagram',
              tone: 'red',
            },
            {
              id: 'idea_2',
              idea: 'The GKV Advantage',
              purpose: 'Frames the brand as an elite inner circle.',
              style: 'exclusive access reveal',
              format: 'Instagram post',
              platform: 'Instagram',
              tone: 'yellow',
            },
            {
              id: 'idea_3',
              idea: 'Top Performers Know the Vault',
              purpose: 'Uses a generic secret weapon promise.',
              style: 'client win montage',
              format: 'Instagram post',
              platform: 'Instagram',
              tone: 'blue',
            },
            {
              id: 'idea_4',
              idea: 'Future-Proof With GKV',
              purpose: 'Makes up a sub-brand acronym for urgency.',
              style: 'founder lesson',
              format: 'Instagram post',
              platform: 'Instagram',
              tone: 'green',
            },
          ],
        },
        metadata: {},
      })
      .mockResolvedValueOnce({
        result: {
          ideas: [
            {
              id: 'idea_1',
              idea: 'Insturix Shows the Cost of Late Content',
              purpose: 'Turns FOMO into a concrete before/after about agencies missing client deadlines.',
              style: 'sharp operator lesson',
              format: 'Instagram post',
              platform: 'Instagram',
              tone: 'red',
            },
            {
              id: 'idea_2',
              idea: 'The Month-Ahead Content Team',
              purpose: 'Shows why prepared agencies feel calmer and win more approvals.',
              style: 'behind-the-scenes workflow',
              format: 'Instagram post',
              platform: 'Instagram',
              tone: 'blue',
            },
            {
              id: 'idea_3',
              idea: 'What Agencies Miss Before Monday',
              purpose: 'Makes the ICP feel the pain of starting content from scratch every week.',
              style: 'checklist contrast',
              format: 'Instagram post',
              platform: 'Instagram',
              tone: 'black',
            },
            {
              id: 'idea_4',
              idea: 'From Idea to Scheduled Output',
              purpose: 'Connects Insturix to the practical win of planning content ahead of pressure.',
              style: 'process snapshot',
              format: 'Instagram post',
              platform: 'Instagram',
              tone: 'green',
            },
          ],
        },
        metadata: {},
      });
    (agent as unknown as { runStructured: typeof runStructured }).runStructured = runStructured;

    const ideas = await agent.generateIdeas(
      'Create Instagram post ideas that create FOMO for my brand ICP.',
      {
        brandName: 'Insturix',
        systemBrief: 'Brand context: Insturix helps agencies plan content ahead of client deadlines.',
      },
    );

    expect(runStructured).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(ideas)).not.toMatch(/Global Knowledge Vault|Knowledge Vault|GKV/);
    expect(ideas.map((idea) => idea.idea)).toEqual([
      'Insturix Shows the Cost of Late Content',
      'The Month-Ahead Content Team',
      'What Agencies Miss Before Monday',
      'From Idea to Scheduled Output',
    ]);
  });

  it('formats saved facts without the old vault label', () => {
    const ctx: RetrievedContext = {
      brandDNA: {} as RetrievedContext['brandDNA'],
      projectFacts: [],
      globalFacts: [
        {
          id: 'fact_1',
          title: 'Audience',
          summary: 'Agency founders who need content planned before client deadlines.',
          tags: ['audience', 'agency'],
          source: 'memory',
        },
      ],
      semanticFacts: [],
      interactionPatterns: [],
    };

    const brief = formatSystemBrief(ctx);

    expect(brief).toContain('## Relevant Saved Facts');
    expect(brief).not.toContain('Global Knowledge Vault');
  });
});
