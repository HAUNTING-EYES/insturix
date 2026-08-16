import { describe, expect, it } from 'vitest';
import {
  assertUsablePostWriterResult,
  PostWriterResultSchema,
  type PostWriterInput,
  type PostWriterResult,
} from '@/lib/thinkforge/agents/post-writer-agent';
import { buildPostEditorialPlan } from '@/lib/thinkforge/agents/post-editorial-plan';
import {
  buildThinkForgeSourceLedger,
  findSourceLedgerIssuesForSidecar,
} from '@/lib/thinkforge/provenance/source-ledger';
import { createThinkForgeAuthoringRequest } from '@/lib/thinkforge/schemas/authoring-request';
import { createThinkForgeWriterContract } from '@/lib/thinkforge/schemas/document-contract';
import {
  canonicalizeLanguageTag,
  countUnicodeWords,
  segmentUnicodeSentences,
} from '@/lib/thinkforge/text/unicode-text';
import type { RetrievedContext, SemanticFact } from '@/lib/thinkforge/context';

function postInput(userPrompt: string): PostWriterInput {
  return {
    context: { projectSummary: '' },
    userPrompt,
    authoringRequest: createThinkForgeAuthoringRequest({
      contentContract: createThinkForgeWriterContract('social_post'),
      platformSurface: { id: 'linkedin' },
      postControls: {
        version: 1,
        cta: { preference: 'none' },
        hashtags: { preference: 'none' },
        emoji: { preference: 'none' },
      },
    }),
    sourceLedger: buildThinkForgeSourceLedger({ userPrompt }),
  };
}

function postResult(
  content: string,
  claimSupport?: PostWriterResult['contentAnalysis']['claimSupport'],
): PostWriterResult {
  return {
    content,
    hashtags: [],
    contentAnalysis: {
      tone: 'direct',
      vibe: 'grounded',
      theme: 'source-backed statement',
      qualityScore: 90,
      violations: [],
      ...(claimSupport ? { claimSupport } : {}),
    },
    clickatron: {
      singleImagePrompt: 'A documentary editorial scene with concrete working materials and generous negative space on the left, with no readable text.',
    },
    metadata: {
      platform: 'linkedin',
      charCount: content.length,
    },
  };
}

function retrievedContext(projectFacts: SemanticFact[]): RetrievedContext {
  return {
    brandDNA: {} as RetrievedContext['brandDNA'],
    projectFacts,
    globalFacts: [],
    semanticFacts: projectFacts,
    interactionPatterns: [],
  };
}

describe('Unicode text boundaries', () => {
  it('canonicalizes real BCP-47 tags and rejects malformed tags', () => {
    expect(canonicalizeLanguageTag('pt_BR')).toBe('pt-BR');
    expect(canonicalizeLanguageTag('ZH-hant-tw')).toBe('zh-Hant-TW');
    expect(() => canonicalizeLanguageTag('not_a_locale')).toThrow(/invalid BCP-47/);
  });

  it('segments no-space copy and non-ASCII sentence terminators', () => {
    expect(countUnicodeWords('品牌帮助团队更快地工作')).toBeGreaterThan(1);
    expect(segmentUnicodeSentences('第一句。第二句！هل تعمل الخطة؟')).toEqual([
      '第一句。',
      '第二句！',
      'هل تعمل الخطة؟',
    ]);
  });
});

describe('source-ledger truth contract', () => {
  it.each([
    'Revenue grew 12%.',
    'The cohort contains 20 seats.',
    'The fee is ₹500.',
    'कार्यक्रम में २० सीटें हैं।',
    '売上は12％増加しました。',
    'Revenue grew in May.',
  ])('requires a source reference for Unicode factual evidence: %s', (narration) => {
    const ledger = buildThinkForgeSourceLedger({ userPrompt: '' });
    expect(findSourceLedgerIssuesForSidecar({ scenes: [{ narration }] }, ledger))
      .toContain('missing_source_ref:scene_1');
  });

  it('does not treat prefixes of names and ordinary words as month evidence', () => {
    const ledger = buildThinkForgeSourceLedger({ userPrompt: '' });
    expect(findSourceLedgerIssuesForSidecar({
      scenes: [{ narration: 'Maybe Jane leads Marketing.' }],
    }, ledger)).toEqual([]);
  });

  it('detects a no-space factual restatement of the user brief', () => {
    const narration = '收入持续增长。';
    const ledger = buildThinkForgeSourceLedger({ userPrompt: narration });
    expect(findSourceLedgerIssuesForSidecar({ scenes: [{ narration }] }, ledger))
      .toContain('missing_source_ref:scene_1');
  });

  it('preserves long brief evidence and ranks a relevant fact beyond position twelve', () => {
    const longBrief = `${'A'.repeat(1_500)} NEEDLE_AT_END`;
    const facts: SemanticFact[] = Array.from({ length: 15 }, (_, index) => ({
      id: `fact-${index + 1}`,
      title: index === 14 ? 'Needleproof result' : `Unrelated item ${index + 1}`,
      summary: index === 14
        ? 'Needleproof reduced the verified review queue by 18 percent.'
        : `Background material ${index + 1}.`,
      tags: [],
    }));
    const ledger = buildThinkForgeSourceLedger({
      userPrompt: `${longBrief} Write about Needleproof.`,
      retrievedContext: retrievedContext(facts),
      maxFactEntries: 3,
    });

    expect(ledger.entries.find((entry) => entry.referenceId === 'brief_user')?.summary)
      .toContain('NEEDLE_AT_END');
    expect(ledger.entries.some((entry) => entry.summary.includes('verified review queue')))
      .toBe(true);
  });
});

describe('post factual-support contract', () => {
  it('blocks an unsupported numeric guarantee even outside source-only mode', () => {
    const input = postInput('Write a measured LinkedIn post about sustainable operations.');
    const editorialPlan = buildPostEditorialPlan({
      userPrompt: input.userPrompt,
      authoringRequest: input.authoringRequest,
      retrievedFactCount: 2,
    });

    expect(() => assertUsablePostWriterResult(
      postResult('Our program guarantees a 50% revenue increase.'),
      input,
      editorialPlan,
    )).toThrow(/claim_support_missing:1/);
  });

  it('blocks an unsupported no-space claim in source-only mode', () => {
    const input = postInput('请写一篇关于团队协作的领英帖子。');
    expect(() => assertUsablePostWriterResult(
      postResult('该项目保证收入增长50％。'),
      input,
    )).toThrow(/claim_support_missing:1/);
  });

  it('accepts an exact cited no-space claim', () => {
    const content = '这项计划为20个团队提供服务。';
    const input = postInput(content);
    expect(() => assertUsablePostWriterResult(postResult(content, [{
      sentence: content,
      sourceRef: 'brief_user',
      sourceExcerpt: content,
      relationship: 'verbatim',
    }]), input)).not.toThrow();
  });

  it('does not require claim support for an Arabic question', () => {
    const content = 'هل تعمل الخطة؟';
    const input = postInput(content);
    expect(() => assertUsablePostWriterResult(postResult(content), input)).not.toThrow();
  });

  it('does not impose an arbitrary 24-sentence evidence ceiling', () => {
    const parsed = PostWriterResultSchema.safeParse(postResult(
      'A source-backed evidence post.',
      Array.from({ length: 25 }, (_, index) => ({
        sentence: `Source-backed sentence ${index + 1}.`,
        sourceRef: 'brief_user',
        relationship: 'verbatim' as const,
      })),
    ));
    expect(parsed.success).toBe(true);
  });
});
