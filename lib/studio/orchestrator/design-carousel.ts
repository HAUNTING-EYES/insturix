/**
 * §11 carousel planning (pure): turn free text into ordered slide specs for
 * the Clickatron carousel fan-out — or say the copy is missing. The system
 * NEVER invents slide copy: a carousel ask without per-slide beats asks the
 * user for them (honest clarification beats fabricated slides).
 */

import type { ClickatronCarouselSlideSpec } from "@/lib/thinkforge/schemas/clickatron-creative-contract";

export const CAROUSEL_MIN_SLIDES = 2;
export const CAROUSEL_MAX_SLIDES = 10;

export type CarouselPlan = { slides: ClickatronCarouselSlideSpec[] } | { need: "slide_copy" };

const SLIDE_LINE = /(?:^|\n)\s*(?:slide\s*)?#?\s*(\d{1,2})\s*[.:)\-—]\s*([^\n]+)/gi;

/** Carousel intent: the word carousel (or "N slides"/"N-slide") in the ask. */
export function carouselIntent(text: string): boolean {
  return /\bcarousel\b/i.test(text) || /\b\d{1,2}\s*-?\s*slides?\b/i.test(text);
}

export function planCarouselFromText(text: string): CarouselPlan {
  const slides: ClickatronCarouselSlideSpec[] = [];
  const seen = new Map<number, string>();
  for (const m of text.matchAll(SLIDE_LINE)) {
    const index = Number(m[1]);
    const body = m[2].trim();
    if (!Number.isInteger(index) || index < 1 || index > CAROUSEL_MAX_SLIDES || body.length < 3) continue;
    seen.set(index, body);
  }
  const ordered = [...seen.entries()].sort((a, b) => a[0] - b[0]).slice(0, CAROUSEL_MAX_SLIDES);
  for (const [index, body] of ordered) {
    const titleSplit = body.split(/\s+[—–-]\s+/);
    slides.push({
      id: `slide_${index}`,
      index: slides.length,
      title: titleSplit.length > 1 ? titleSplit[0].trim() : undefined,
      imagePrompt: body,
    });
  }
  if (slides.length >= CAROUSEL_MIN_SLIDES) return { slides };
  return { need: "slide_copy" };
}
