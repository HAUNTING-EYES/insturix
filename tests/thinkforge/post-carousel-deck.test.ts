import { describe, expect, it } from 'vitest';
import {
  postCarouselDeckContractIssues,
  renderThinkForgePostCarouselDocument,
  ThinkForgePostCarouselDeckSchema,
} from '@/lib/thinkforge/schemas/post-carousel-deck';

const deck = ThinkForgePostCarouselDeckSchema.parse({
  version: 1,
  slides: [
    {
      role: 'hook',
      headline: 'The queue is not the workflow',
      body: 'Five inboxes create five versions of the truth.',
      sourceRefs: ['source_1'],
      imagePrompt: 'Five review lanes converging into one desk with headline safe space.',
    },
    {
      role: 'cta',
      headline: 'Name one final owner',
      sourceRefs: ['source_2'],
      imagePrompt: 'One clear approval lane with headline safe space.',
    },
  ],
});

describe('ThinkForge post carousel deck', () => {
  it('renders the typed deck as visible slide copy followed by the caption', () => {
    expect(renderThinkForgePostCarouselDocument(deck, 'Caption copy.')).toBe([
      '## Slide 1',
      '',
      '### The queue is not the workflow',
      '',
      'Five inboxes create five versions of the truth.',
      '',
      '## Slide 2',
      '',
      '### Name one final owner',
      '',
      '## Caption',
      '',
      'Caption copy.',
    ].join('\n'));
  });

  it('reports count, duplicate-copy, and unauthorized-source failures deterministically', () => {
    const issues = postCarouselDeckContractIssues({
      deck: {
        ...deck,
        slides: [
          deck.slides[0],
          { ...deck.slides[0], sourceRefs: ['source_unknown'] },
        ],
      },
      requestedSlideCount: 3,
      authorizedSourceRefs: new Set(['source_1']),
    });

    expect(issues).toEqual([
      'carousel_deck_count_mismatch:2/3',
      'carousel_slide_duplicate:2/1',
      'carousel_slide_invalid_source:2:source_unknown',
    ]);
  });

  it('rejects unsupported versions and empty source references', () => {
    expect(() => ThinkForgePostCarouselDeckSchema.parse({
      ...deck,
      version: 2,
    })).toThrow(/unsupported post carousel deck version/);
    expect(() => ThinkForgePostCarouselDeckSchema.parse({
      ...deck,
      slides: [{ ...deck.slides[0], sourceRefs: [] }, deck.slides[1]],
    })).toThrow();
  });
});
