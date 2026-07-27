/**
 * MG Codegen — STYLE RESOLVER, classifier 1: FONT FAMILY → treatment priors.
 *
 * A brand's typeface is the single strongest style signal (a mono font IS technical; a slab IS commanding; a
 * Didone serif IS editorial-luxury). The old Tier-A engine already proved this (brand-composition-rules.ts:
 * font-category → spatial/animation/material, Doyle & Bottomley 2006 + Disney principles) — but it keyed off a
 * brittle ~50-name lookup with only 6 coarse buckets. This DEEPENS it to the ~9 canonical type families that
 * cover 80-90% of real brand fonts, classifies ANY font (comprehensive name map + heuristic fallback), and maps
 * each family to treatment priors IN THE NEW ATOM VOCABULARY (surface/texture/weight/motion) so the resolver
 * (Phase 2) wires straight into the codegen prompt + kit. Harvest the knowledge, not the dying engine's code.
 *
 * This is the general resolver PATTERN: classify a raw input into a small canonical taxonomy, then map the
 * taxonomy to treatment. Footage-character and intent-genre classifiers (later) follow the same shape.
 */

/** The ~9 canonical type families (Vox-ATypI-derived) that cover the vast majority of real brand fonts. */
export type FontFamily =
  | 'geometric-sans' // Futura/Poppins/Montserrat — architectural, premium, precise
  | 'grotesque-sans' // Helvetica/Inter/Arial — neutral, modern, Swiss
  | 'humanist-sans' // Open Sans/Lato/Gill — warm, friendly, readable
  | 'oldstyle-serif' // Garamond/Georgia/Times — editorial, traditional, authoritative
  | 'modern-serif' // Playfair/Bodoni/Didot — high-contrast, luxury, fashion
  | 'slab-serif' // Rockwell/Roboto Slab — bold, industrial, commanding
  | 'monospace' // JetBrains/Courier — technical, precise, systematic
  | 'script' // Pacifico/Dancing Script — personal, artisanal, expressive
  | 'display'; // Anton/Bebas/Oswald — impact, condensed, kinetic

/** Treatment priors a family suggests — expressed in the codegen atom vocabulary (Phase 2 renders these as a
 *  <style_direction> prior + maps to kit knobs). These are PRIORS the model/resolver may override, not locks. */
export interface FontStylePriors {
  family: FontFamily;
  personality: string; // human-readable label (for the prompt + logs)
  motion: 'gentle' | 'smooth' | 'snappy' | 'sharp' | 'elastic' | 'pop'; // easing character (harvested taxonomy)
  density: 'airy' | 'standard' | 'dense'; // spacing lean
  corner: 'sharp' | 'medium' | 'round'; // corner-radius lean
  weight: 'light' | 'regular' | 'medium' | 'heavy'; // sans headline weight lean (FitHeadline weight)
  surface: 'flat' | 'frosted' | 'raised' | 'glow'; // Plate surface lean (my atom vocab)
  texture: 'none' | 'grain' | 'scanline' | 'grid' | 'dots'; // Texture affinity (my atom vocab)
  alignment: 'left' | 'center';
}

// Comprehensive name → family map (grouped). Covers the most-used Google Fonts + common system/brand faces —
// the 80-90%. Unknown fonts fall through to the heuristic classifier below. Names are matched lowercased and
// also by first token, so "Poppins", "poppins", and "Poppins SemiBold" all resolve.
const FAMILY_FONTS: Record<FontFamily, string[]> = {
  'geometric-sans': [
    'futura', 'poppins', 'montserrat', 'century gothic', 'josefin sans', 'quicksand', 'comfortaa', 'questrial',
    'jost', 'spartan', 'league spartan', 'sofia', 'gilroy', 'circular', 'avenir', 'proxima nova', 'raleway',
    'dm sans', 'urbanist', 'outfit', 'sora', 'space grotesk', 'lexend', 'red hat display', 'gothic a1', 'kanit',
  ],
  'grotesque-sans': [
    'helvetica', 'helvetica neue', 'arial', 'inter', 'roboto', 'neue haas', 'aktiv grotesk', 'akzidenz', 'univers',
    'franklin gothic', 'work sans', 'ibm plex sans', 'system-ui', '-apple-system', 'sf pro', 'sf pro display',
    'segoe ui', 'noto sans', 'libre franklin', 'archivo', 'manrope', 'plus jakarta sans', 'be vietnam pro', 'hanken grotesk',
  ],
  'humanist-sans': [
    'open sans', 'lato', 'source sans', 'source sans pro', 'source sans 3', 'gill sans', 'verdana', 'tahoma',
    'trebuchet ms', 'calibri', 'myriad', 'fira sans', 'cabin', 'karla', 'mulish', 'hind', 'muli', 'pt sans',
    'nunito', 'nunito sans', 'rubik',
  ],
  'oldstyle-serif': [
    'garamond', 'eb garamond', 'georgia', 'times', 'times new roman', 'minion', 'sabon', 'caslon', 'palatino',
    'book antiqua', 'goudy', 'crimson', 'crimson text', 'crimson pro', 'lora', 'pt serif', 'noto serif',
    'merriweather', 'source serif', 'source serif pro', 'spectral', 'cardo', 'gentium', 'libre baskerville', 'bitter',
  ],
  'modern-serif': [
    'playfair display', 'playfair', 'bodoni', 'didot', 'abril fatface', 'cormorant', 'cormorant garamond',
    'dm serif display', 'dm serif text', 'marcellus', 'prata', 'italiana', 'bodoni moda',
  ],
  'slab-serif': [
    'rockwell', 'roboto slab', 'arvo', 'zilla slab', 'slabo', 'slabo 27px', 'museo slab', 'josefin slab', 'aleo',
    'crete round', 'alfa slab one', 'patua one',
  ],
  monospace: [
    'jetbrains mono', 'courier', 'courier new', 'fira code', 'fira mono', 'source code pro', 'ibm plex mono',
    'monaco', 'consolas', 'roboto mono', 'space mono', 'inconsolata', 'ubuntu mono', 'menlo', 'dm mono', 'overpass mono',
  ],
  script: [
    'pacifico', 'dancing script', 'great vibes', 'sacramento', 'satisfy', 'lobster', 'caveat', 'kalam',
    'shadows into light', 'indie flower', 'permanent marker', 'brush script', 'cookie', 'allura', 'parisienne', 'yellowtail',
  ],
  display: [
    'anton', 'bebas neue', 'bebas', 'oswald', 'archivo black', 'teko', 'fjalla one', 'staatliches', 'passion one',
    'righteous', 'bungee', 'monoton', 'titan one', 'bungee inline', 'druk', 'league gothic', 'chakra petch',
  ],
};

// Reverse lookup (font name → family), built once.
const NAME_TO_FAMILY = new Map<string, FontFamily>();
for (const family of Object.keys(FAMILY_FONTS) as FontFamily[]) {
  for (const name of FAMILY_FONTS[family]) NAME_TO_FAMILY.set(name, family);
}

/** Heuristic fallback for a font not in the map — classify from telltale tokens in the name. */
function classifyByHeuristic(lower: string): FontFamily {
  if (/\b(mono|code|courier|consol)/.test(lower)) return 'monospace';
  if (/\b(slab)/.test(lower)) return 'slab-serif';
  if (/(display|condensed|compressed|black|heavy|gothic|impact|headline)/.test(lower)) return 'display';
  if (/(script|hand|brush|cursive|marker|signature|pen)/.test(lower)) return 'script';
  if (/(didone|didot|bodoni|fashion)/.test(lower)) return 'modern-serif';
  if (/serif/.test(lower) && !/sans/.test(lower)) return 'oldstyle-serif';
  if (/(geometric|futura|circular|geom)/.test(lower)) return 'geometric-sans';
  return 'grotesque-sans'; // safe neutral-modern default (covers most unknown sans)
}

/** Classify a font (a family name, a CSS font-family stack, or a single face) into one of the 9 families. */
export function classifyFontFamily(font: string | undefined | null): FontFamily {
  if (!font) return 'grotesque-sans';
  // Take the first family in a CSS stack ("Poppins, sans-serif" → "poppins"), strip quotes.
  const first = font.split(',')[0].replace(/["']/g, '').trim().toLowerCase();
  if (!first || first === 'sans-serif') return 'grotesque-sans';
  if (first === 'serif') return 'oldstyle-serif';
  if (first === 'monospace') return 'monospace';
  if (NAME_TO_FAMILY.has(first)) return NAME_TO_FAMILY.get(first)!;
  // try progressively shorter prefixes (e.g. "poppins semibold" → "poppins")
  const tokens = first.split(/\s+/);
  for (let n = tokens.length; n >= 1; n -= 1) {
    const key = tokens.slice(0, n).join(' ');
    if (NAME_TO_FAMILY.has(key)) return NAME_TO_FAMILY.get(key)!;
  }
  return classifyByHeuristic(first);
}

/**
 * The family → treatment matrix — DEEPENED from the old font-category rules and re-expressed in the atom
 * vocabulary. Each entry is a coherent set of priors: a serif is gentle+editorial, a slab is sharp+commanding,
 * a mono is snappy+technical+grid, a display face is punchy+kinetic. The resolver (Phase 2) blends these with
 * footage + intent priors; the model may override within brand lock.
 */
export const FONT_FAMILY_STYLE: Record<FontFamily, Omit<FontStylePriors, 'family'>> = {
  'geometric-sans': { personality: 'premium / architectural / precise', motion: 'smooth', density: 'airy', corner: 'sharp', weight: 'medium', surface: 'flat', texture: 'none', alignment: 'center' },
  'grotesque-sans': { personality: 'neutral / modern / Swiss', motion: 'smooth', density: 'standard', corner: 'medium', weight: 'medium', surface: 'flat', texture: 'grid', alignment: 'left' },
  'humanist-sans': { personality: 'warm / friendly / approachable', motion: 'smooth', density: 'standard', corner: 'round', weight: 'regular', surface: 'frosted', texture: 'none', alignment: 'left' },
  'oldstyle-serif': { personality: 'editorial / traditional / authoritative', motion: 'gentle', density: 'airy', corner: 'sharp', weight: 'regular', surface: 'flat', texture: 'none', alignment: 'center' },
  'modern-serif': { personality: 'luxury / fashion / high-contrast', motion: 'gentle', density: 'airy', corner: 'sharp', weight: 'light', surface: 'frosted', texture: 'grain', alignment: 'center' },
  'slab-serif': { personality: 'bold / industrial / commanding', motion: 'sharp', density: 'dense', corner: 'medium', weight: 'heavy', surface: 'raised', texture: 'none', alignment: 'left' },
  monospace: { personality: 'technical / precise / systematic', motion: 'snappy', density: 'dense', corner: 'sharp', weight: 'medium', surface: 'flat', texture: 'grid', alignment: 'left' },
  script: { personality: 'personal / artisanal / expressive', motion: 'gentle', density: 'airy', corner: 'round', weight: 'regular', surface: 'frosted', texture: 'none', alignment: 'center' },
  display: { personality: 'impact / condensed / kinetic', motion: 'pop', density: 'dense', corner: 'medium', weight: 'heavy', surface: 'glow', texture: 'none', alignment: 'left' },
};

/** Classify a brand font and return its full treatment priors — the resolver's font classifier. */
export function fontStylePriors(font: string | undefined | null): FontStylePriors {
  const family = classifyFontFamily(font);
  return { family, ...FONT_FAMILY_STYLE[family] };
}
