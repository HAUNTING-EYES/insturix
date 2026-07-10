import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertUsablePostWriterResult,
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
});
