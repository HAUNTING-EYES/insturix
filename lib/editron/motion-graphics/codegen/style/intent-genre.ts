/**
 * MG Codegen — STYLE RESOLVER, classifier 3: INTENT / GENRE → style lean.
 *
 * Font = the brand's identity; footage = this video's look; INTENT = why the video exists. Intent is the
 * strongest "why", so it has first say on the style NAME and may push weight (a hype-reel reads kinetic-bold
 * even on a neutral font; a documentary reads editorial even on a bold one). Same classify→map shape: map the
 * upstream format/intent string → a small genre taxonomy → a style delta. Decoupled — the seam passes whatever
 * format string it has (production-brief format, platform hint, editorial intent); unknown → 'generic' (no-op).
 */

import type { FontStylePriors } from './font-family';

export type IntentGenre =
  | 'saas-demo' // product/explainer → clean, precise, data-viz
  | 'hype-reel' // reel/short/promo → kinetic, heavy, punchy
  | 'vlog' // personal → friendly, gentle, soft
  | 'tutorial' // howto/guide → technical, snappy, structured
  | 'documentary' // story/interview → editorial, gentle, cinematic
  | 'ad' // commercial/spot → bold, premium, snappy
  | 'generic'; // unknown → no lean

// Upstream format/intent strings → genre. Substring match, lowercased.
const INTENT_KEYWORDS: Array<[IntentGenre, RegExp]> = [
  // R4: order matters — the more SPECIFIC / aesthetic genres are matched before the generic saas-demo, whose
  // "product/demo" keywords are common filler ("documentary-style product demo" should be documentary, not saas).
  ['hype-reel', /\b(reel|reels|short|shorts|tiktok|promo|hype|teaser|trailer|highlight)\b/], // short-form platforms lean kinetic
  ['tutorial', /\b(tutorial|how.?to|guide|lesson|course|educat|training)\b/],
  ['documentary', /\b(documentary|doc|story|interview|testimonial|case.?study|mini.?doc)\b/],
  ['vlog', /\b(vlog|blog|personal|daily|behind.the.scenes|bts|lifestyle)\b/],
  ['ad', /\b(ad|advert|commercial|spot|campaign|brand film)\b/],
  ['saas-demo', /\b(saas|demo|product|explainer|feature|walkthrough|onboarding|app)\b/], // LAST — generic catch-all
];

export function classifyIntent(intent: string | undefined | null): IntentGenre {
  if (!intent) return 'generic';
  const s = intent.toLowerCase();
  for (const [genre, re] of INTENT_KEYWORDS) if (re.test(s)) return genre;
  return 'generic';
}

/** Intent's style lean — a PARTIAL delta over the font base, plus an optional style NAME the genre implies. It
 *  may push `weight` (footage does not) because purpose overrides identity here. Empty for 'generic'. */
export type IntentStyleDelta = Partial<Pick<FontStylePriors, 'surface' | 'texture' | 'motion' | 'density' | 'weight'>> & { styleName?: string };

// R6: every non-generic genre sets `weight` too — so when intent overrides the style (e.g. a serious explainer
// on a brand whose HEADER font is a condensed display face), the display font's `heavy` weight doesn't leak
// through. The genre's own weight wins; only 'generic' inherits the font's weight.
export const INTENT_STYLE: Record<IntentGenre, IntentStyleDelta> = {
  'saas-demo': { styleName: 'clean-modern', motion: 'smooth', weight: 'medium', surface: 'flat', texture: 'grid' },
  'hype-reel': { styleName: 'kinetic-bold', motion: 'pop', weight: 'heavy', surface: 'glow', density: 'dense' },
  vlog: { styleName: 'friendly', motion: 'gentle', weight: 'regular', surface: 'frosted', texture: 'none' },
  tutorial: { styleName: 'technical', motion: 'snappy', weight: 'medium', surface: 'flat', texture: 'grid' },
  documentary: { styleName: 'editorial', motion: 'gentle', weight: 'regular', texture: 'grain', density: 'airy' },
  ad: { styleName: 'bold-premium', motion: 'snappy', weight: 'medium', surface: 'raised', density: 'dense' },
  generic: {},
};

/** Classify + return the genre's style delta — the resolver's intent classifier. */
export function intentStyleDelta(intent: string | undefined | null): { genre: IntentGenre; delta: IntentStyleDelta } {
  const genre = classifyIntent(intent);
  return { genre, delta: INTENT_STYLE[genre] };
}
