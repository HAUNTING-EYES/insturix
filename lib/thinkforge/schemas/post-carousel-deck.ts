import { z } from 'zod';

export const THINKFORGE_POST_CAROUSEL_DECK_VERSION = 1;

export const THINKFORGE_POST_CAROUSEL_SLIDE_ROLES = [
  'hook',
  'setup',
  'context',
  'problem',
  'insight',
  'proof',
  'process',
  'example',
  'transition',
  'summary',
  'cta',
] as const;

export const ThinkForgePostCarouselSlideSchema = z.object({
  role: z.enum(THINKFORGE_POST_CAROUSEL_SLIDE_ROLES),
  headline: z.string().trim().min(1),
  body: z.string().trim().optional(),
  sourceRefs: z.array(z.string().trim().min(1).max(120)).min(1),
  imagePrompt: z.string().trim().min(1).max(5_000),
});

export const ThinkForgePostCarouselDeckSchema = z.object({
  version: z.number().int().default(THINKFORGE_POST_CAROUSEL_DECK_VERSION),
  slides: z.array(ThinkForgePostCarouselSlideSchema),
}).superRefine((deck, ctx) => {
  if (deck.version !== THINKFORGE_POST_CAROUSEL_DECK_VERSION) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['version'],
      message: 'unsupported post carousel deck version',
    });
  }
});

export type ThinkForgePostCarouselSlide = z.infer<typeof ThinkForgePostCarouselSlideSchema>;
export type ThinkForgePostCarouselDeck = z.infer<typeof ThinkForgePostCarouselDeckSchema>;

function normalizedSlideCopy(slide: ThinkForgePostCarouselSlide): string {
  return `${slide.headline}\n${slide.body ?? ''}`
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase();
}

export function postCarouselDeckContractIssues(input: {
  deck: ThinkForgePostCarouselDeck | undefined;
  requestedSlideCount: number;
  authorizedSourceRefs: ReadonlySet<string>;
}): string[] {
  const { deck, requestedSlideCount, authorizedSourceRefs } = input;
  if (!deck) return ['carousel_deck_missing'];

  const issues: string[] = [];
  if (deck.slides.length !== requestedSlideCount) {
    issues.push(`carousel_deck_count_mismatch:${deck.slides.length}/${requestedSlideCount}`);
  }

  const seenCopy = new Map<string, number>();
  deck.slides.forEach((slide, index) => {
    const copy = normalizedSlideCopy(slide);
    const duplicateIndex = seenCopy.get(copy);
    if (duplicateIndex !== undefined) {
      issues.push(`carousel_slide_duplicate:${index + 1}/${duplicateIndex + 1}`);
    } else {
      seenCopy.set(copy, index);
    }

    for (const sourceRef of slide.sourceRefs) {
      if (!authorizedSourceRefs.has(sourceRef)) {
        issues.push(`carousel_slide_invalid_source:${index + 1}:${sourceRef}`);
      }
    }
  });

  return issues;
}

export function postCarouselDeckVisibleCopy(deck: ThinkForgePostCarouselDeck | undefined): string {
  if (!deck) return '';
  return deck.slides
    .map((slide) => [slide.headline, slide.body].filter(Boolean).join('\n'))
    .join('\n\n');
}

export function renderThinkForgePostCarouselDocument(
  deck: ThinkForgePostCarouselDeck,
  caption: string,
): string {
  const slides = deck.slides.map((slide, index) => [
    `## Slide ${index + 1}`,
    `### ${slide.headline}`,
    slide.body?.trim() || undefined,
  ].filter(Boolean).join('\n\n'));

  return [
    ...slides,
    caption.trim() ? `## Caption\n\n${caption.trim()}` : undefined,
  ].filter(Boolean).join('\n\n');
}
