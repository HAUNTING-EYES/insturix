import { describe, expect, it } from 'vitest';
import {
  assessIdeaDiversity,
  deriveIdeaGenerationSeed,
  lexicalIdeaSimilarity,
} from '@/lib/thinkforge/ideas/idea-diversity';

const orthogonal = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
  [-1, 0, 0],
];

describe('ThinkForge idea diversity', () => {
  it('keeps the first generation reproducible and varies later attempts deterministically', () => {
    expect(deriveIdeaGenerationSeed(0, 0)).toBe(42);
    expect(deriveIdeaGenerationSeed(3, 0)).toBe(deriveIdeaGenerationSeed(3, 0));
    expect(deriveIdeaGenerationSeed(3, 0)).not.toBe(deriveIdeaGenerationSeed(3, 1));
    expect(deriveIdeaGenerationSeed(3, 0)).not.toBe(deriveIdeaGenerationSeed(4, 0));
  });

  it('detects semantic paraphrases even when lexical overlap is low', async () => {
    const ideas = [
      { title: 'Review Queue Gridlock', purpose: 'Show why client work waits for sign-off.' },
      { title: 'The Brief Quality Ledger' },
      { title: 'Monday Launch Confidence' },
      { title: 'The Content Reuse Map' },
    ];
    const rejected = [{
      title: 'Approval Bottleneck',
      purpose: 'Explain how sign-off delays block agency delivery.',
    }];
    expect(lexicalIdeaSimilarity(ideas[0].title, rejected[0].title)).toBe(0);

    const assessment = await assessIdeaDiversity({
      ideas,
      rejectedIdeas: rejected,
      variationIndex: 2,
      embeddingProvider: async () => [
        [1, 0, 0],
        ...orthogonal.slice(1),
        [0.999, 0.01, 0],
      ],
    });

    expect(assessment.degraded).toBe(false);
    expect(assessment.issues).toEqual([
      expect.stringContaining('Repeated a rejected idea angle'),
    ]);
  });

  it('does not collapse legitimately adjacent ideas', async () => {
    const assessment = await assessIdeaDiversity({
      ideas: [
        { title: 'Agency Margin Breakdown' },
        { title: 'Founder Approval Diary' },
        { title: 'Client Onboarding Checklist' },
        { title: 'Campaign Reuse Matrix' },
      ],
      rejectedIdeas: [{ title: 'Monthly Planning Ritual' }],
      variationIndex: 4,
      embeddingProvider: async () => [...orthogonal, [0, -1, 0]],
    });

    expect(assessment).toEqual({ issues: [], degraded: false });
  });

  it('falls back to multilingual lexical checks when embeddings are unavailable', async () => {
    const assessment = await assessIdeaDiversity({
      ideas: [
        { title: 'Plan mensual de contenido para agencias' },
        { title: 'Auditoria de aprobaciones' },
        { title: 'Mapa de reutilizacion' },
        { title: 'Diario del fundador' },
      ],
      rejectedIdeas: [{ title: 'Plan mensual de contenido para agencias' }],
      variationIndex: 5,
      embeddingProvider: async () => null,
    });

    expect(assessment.degraded).toBe(true);
    expect(assessment.issues[0]).toContain('Repeated a rejected idea angle');
  });

  it('treats malformed embedding batches as degraded rather than trusting them', async () => {
    const assessment = await assessIdeaDiversity({
      ideas: [{ title: 'One' }, { title: 'Two' }],
      rejectedIdeas: [{ title: 'Three' }],
      variationIndex: 1,
      embeddingProvider: async () => [[1, 0]],
    });

    expect(assessment.degraded).toBe(true);
  });
});
