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
  ['hype-reel', /\b(reel|short|promo|hype|teaser|trailer|highlight)\b/],
  ['saas-demo', /\b(saas|demo|product|explainer|feature|walkthrough|onboarding|app)\b/],
  ['tutorial', /\b(tutorial|how.?to|guide|lesson|course|educat|training)\b/],
  ['documentary', /\b(documentary|doc|story|interview|testimonial|case.?study|mini.?doc)\b/],
  ['ad', /\b(ad|advert|commercial|spot|campaign|brand film)\b/],
  ['vlog', /\b(vlog|blog|personal|daily|behind.the.scenes|bts|lifestyle)\b/],
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

export const INTENT_STYLE: Record<IntentGenre, IntentStyleDelta> = {
  'saas-demo': { styleName: 'clean-modern', motion: 'smooth', surface: 'flat', texture: 'grid' },
  'hype-reel': { styleName: 'kinetic-bold', motion: 'pop', weight: 'heavy', surface: 'glow', density: 'dense' },
  vlog: { styleName: 'friendly', motion: 'gentle', surface: 'frosted', texture: 'none' },
  tutorial: { styleName: 'technical', motion: 'snappy', surface: 'flat', texture: 'grid' },
  documentary: { styleName: 'editorial', motion: 'gentle', texture: 'grain', density: 'airy' },
  ad: { styleName: 'bold-premium', motion: 'snappy', surface: 'raised', density: 'dense' },
  generic: {},
};

/** Classify + return the genre's style delta — the resolver's intent classifier. */
export function intentStyleDelta(intent: string | undefined | null): { genre: IntentGenre; delta: IntentStyleDelta } {
  const genre = classifyIntent(intent);
  return { genre, delta: INTENT_STYLE[genre] };
}
