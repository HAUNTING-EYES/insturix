import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const writerMocks = vi.hoisted(() => ({
  generateStructured: vi.fn(),
  repairAiFillerContent: vi.fn(),
}));

vi.mock('@/lib/thinkforge/services/gemini-writing-context-cache', () => ({
  generateStructuredWithWritingContextCache: writerMocks.generateStructured,
}));

vi.mock('@/lib/thinkforge/services/ai-filler-repair', () => ({
  repairAiFillerContent: writerMocks.repairAiFillerContent,
}));
import {
  assertUsablePostWriterResult,
  PostWriterAgent,
  type PostWriterInput,
  type PostWriterResult,
} from '@/lib/thinkforge/agents/post-writer-agent';

const baseInput: PostWriterInput = {
  context: {
    projectSummary: 'Platform: LinkedIn. Audience: agency founders. Topic: content approval bottlenecks.',
  },
  userPrompt: 'Write a LinkedIn post for agency founders about reducing approval loops and send it to Clickatron.',
};

function completeLinkedInPost(): string {
  return [
    'Your approval loop is not slow because the creative team lacks effort.',
    '',
    'It is slow because every asset has three half-owners, five comment threads, and no single person allowed to say final.',
    '',
    'The fix is not another status meeting. Pick one approval owner before production starts, route every note through that person, and make the final decision visible to the team.',
    '',
    'That one change gives editors fewer contradictions, gives account leads a cleaner client conversation, and gives the brand a real publish line instead of a pile of almost-approved drafts.',
    '',
    'Try this on your next campaign: assign the approval owner before the first draft leaves the editor.',
    '',
    '#CreativeOps #AgencyOps #ContentWorkflow',
  ].join('\n');
}

function makeResult(overrides: Partial<PostWriterResult> = {}): PostWriterResult {
  return {
    content: completeLinkedInPost(),
    contentAnalysis: {
      tone: 'direct',
      vibe: 'operational',
      theme: 'approval ownership',
      qualityScore: 91,
      violations: [],
    },
    clickatron: {
      singleImagePrompt: 'Create a LinkedIn post graphic showing one clear approval owner replacing scattered comment threads; include editable headline text only.',
    },
    metadata: {
      platform: 'linkedin',
      charCount: completeLinkedInPost().length,
    },
    ...overrides,
  };
}

describe('assertUsablePostWriterResult', () => {
  beforeEach(() => {
    vi.stubEnv('GEMINI_API_KEY', 'test-gemini-key');
    writerMocks.generateStructured.mockReset();
    writerMocks.repairAiFillerContent.mockReset();
    writerMocks.repairAiFillerContent.mockImplementation(async (content: string) => content);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('keeps the post writer source valid UTF-8 for Vercel webpack/SWC', () => {
    const source = readFileSync(resolve(process.cwd(), 'lib/thinkforge/agents/post-writer-agent.ts'));
    expect(() => new TextDecoder('utf-8', { fatal: true }).decode(source)).not.toThrow();
  });
  it('accepts a complete publishable social post with Clickatron visual instructions', () => {
    expect(() => assertUsablePostWriterResult(makeResult(), baseInput)).not.toThrow();
  });

  it('rejects weak fallback output with no CTA', () => {
    const noCta = [
      'Approval loops become expensive when every stakeholder leaves notes in a different lane and no single person owns the final decision.',
      '',
      'The result is slower review, nervous editors, and a final asset shaped by the loudest thread instead of the clearest campaign priority.',
      '',
      'Teams notice the cost only after publish windows pass, client confidence drops, and the same debate appears during the next launch cycle.',
      '',
      'A stronger operating rhythm begins with one accountable owner, a visible decision log, and fewer private revision channels across the campaign.',
      '',
      '#CreativeOps #AgencyOps',
    ].join('\n');

    expect(() => assertUsablePostWriterResult(makeResult({ content: noCta }), baseInput)).toThrow(
      /missing_action_cta/,
    );
  });

  it('rejects non-twitter posts without hashtags', () => {
    const noHashtags = completeLinkedInPost().replace('\n\n#CreativeOps #AgencyOps #ContentWorkflow', '');

    expect(() => assertUsablePostWriterResult(makeResult({ content: noHashtags }), baseInput)).toThrow(
      /missing_hashtags/,
    );
  });

  it('rejects outputs that cannot be handed to Clickatron', () => {
    expect(() => assertUsablePostWriterResult(makeResult({ clickatron: {} }), baseInput)).toThrow(
      /missing_clickatron_prompt/,
    );
  });

  it('allows concise x/twitter posts without hashtags when they have a CTA and visual prompt', () => {
    const twitterInput: PostWriterInput = {
      context: { projectSummary: 'Platform: X. Topic: approval loops.' },
      userPrompt: 'Write an X post about approval loops.',
    };

    expect(() =>
      assertUsablePostWriterResult(
        makeResult({
          content: 'Approval loops rarely need another meeting. Pick one final owner before the draft leaves the editor. Try it on the next campaign.',
          metadata: { platform: 'twitter', charCount: 123 },
        }),
        twitterInput,
      ),
    ).not.toThrow();
  });

  it('repairs filler before validation without adding a second structured generation', async () => {
    const fillerPost = completeLinkedInPost().replace('The fix is not another status meeting.', 'Leverage the next status meeting.');
    writerMocks.generateStructured.mockResolvedValue({
      result: makeResult({ content: fillerPost }),
      cacheStatus: 'hit',
      modelName: 'models/gemini-2.5-flash',
    });
    writerMocks.repairAiFillerContent.mockResolvedValue(completeLinkedInPost());

    const output = await new PostWriterAgent().runStructured(baseInput);

    expect(writerMocks.generateStructured).toHaveBeenCalledTimes(1);
    expect(output.result.content).toBe(completeLinkedInPost());
    expect(output.result.metadata.charCount).toBe(completeLinkedInPost().length);
    expect(output.metadata?.notes).toBe('writing_context_cache:hit');
  });

  it('performs one schema-constrained repair after a publishability contract failure', async () => {
    const noCta = completeLinkedInPost().replace(
      'Try this on your next campaign: assign the approval owner before the first draft leaves the editor.',
      'The team now has one accountable owner and one visible decision log.',
    );
    writerMocks.generateStructured
      .mockResolvedValueOnce({
        result: makeResult({ content: noCta }),
        cacheStatus: 'hit',
        modelName: 'models/gemini-2.5-flash',
      })
      .mockResolvedValueOnce({
        result: makeResult(),
        cacheStatus: 'created',
        modelName: 'models/gemini-2.5-flash',
      });

    const output = await new PostWriterAgent().runStructured(baseInput, { temperature: 0.45 });

    expect(writerMocks.generateStructured).toHaveBeenCalledTimes(2);
    expect(writerMocks.generateStructured.mock.calls[1]?.[0]).toMatchObject({
      temperature: 0.25,
      systemInstruction: expect.stringContaining('missing_action_cta'),
      prompt: expect.stringContaining('<post_contract_repair_input>'),
    });
    expect(writerMocks.generateStructured.mock.calls[1]?.[0].prompt).toContain('previousModelOutput');
    expect(output.result.content).toBe(completeLinkedInPost());
    expect(output.metadata?.notes).toBe('writing_context_cache:hit;post_contract_repair:applied');
  });
});
