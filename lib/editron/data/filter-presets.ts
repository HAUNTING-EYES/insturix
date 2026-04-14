/**
 * Filter Preset Utilities (Server-Safe)
 *
 * Shared filter preset lookup functions that work in both server (API routes)
 * and client (React components) contexts. The actual preset definitions live
 * in components/editron/editor/.../media-filter-presets.ts — this file
 * duplicates only the data needed by server-side code (edit-direction-applier,
 * Director Agent, profile detection).
 *
 * If presets are added/modified in media-filter-presets.ts, update this file too.
 */

export interface FilterPresetEntry {
  id: string;
  name: string;
  filter: string;
}

/** Server-safe copy of filter presets (CSS filter strings only, no React/UI). */
const FILTER_PRESETS: FilterPresetEntry[] = [
  { id: 'none', name: 'None', filter: 'none' },
  { id: 'retro', name: 'Retro', filter: 'contrast(130%) sepia(45%) brightness(85%) saturate(160%) hue-rotate(5deg)' },
  { id: 'vintage', name: 'Vintage', filter: 'contrast(95%) brightness(95%) saturate(70%) sepia(15%)' },
  { id: 'wesAnderson', name: 'Wes Anderson', filter: 'contrast(135%) brightness(110%) saturate(190%) hue-rotate(345deg)' },
  { id: 'noir', name: 'Film Noir', filter: 'grayscale(100%) contrast(150%) brightness(90%)' },
  { id: 'polaroid', name: 'Polaroid', filter: 'sepia(15%) contrast(95%) brightness(105%) saturate(80%)' },
  { id: 'cinematic', name: 'Cinematic', filter: 'contrast(115%) brightness(95%) saturate(110%)' },
  { id: 'cool', name: 'Cool', filter: 'brightness(100%) sepia(20%) hue-rotate(180deg) saturate(90%)' },
  { id: 'warm', name: 'Warm', filter: 'brightness(105%) sepia(30%) saturate(130%) hue-rotate(350deg)' },
  { id: 'expired', name: 'Expired Film', filter: 'contrast(110%) brightness(100%) saturate(85%) sepia(20%) hue-rotate(5deg)' },
  { id: 'kodak', name: 'Kodak', filter: 'contrast(120%) brightness(105%) saturate(120%) sepia(10%) hue-rotate(355deg)' },
  { id: 'super8', name: 'Super 8', filter: 'contrast(125%) brightness(95%) saturate(70%) sepia(30%) hue-rotate(340deg)' },
  // Professional presets
  // OLD teal-orange used hue-rotate(160deg) which turns ALL colors including skin tones
  // blue/green. Real teal-orange in cinema preserves skin (orange range) and only
  // shifts shadows toward teal. CSS can't do split-toning, so we approximate with:
  // higher contrast + warm sepia + moderate saturation. Skin stays warm, shadows go cool.
  { id: 'teal-orange', name: 'Teal & Orange', filter: 'contrast(118%) brightness(98%) saturate(125%) sepia(15%) hue-rotate(350deg)' },
  // OLD blade-runner used hue-rotate(175deg) — same skin-destroying problem.
  // Replaced with a dark, desaturated, slightly warm look that preserves skin.
  { id: 'blade-runner', name: 'Blade Runner', filter: 'contrast(135%) brightness(85%) saturate(80%) sepia(15%) hue-rotate(345deg)' },
  { id: 'neon-nights', name: 'Neon Nights', filter: 'contrast(135%) brightness(90%) saturate(180%) hue-rotate(270deg)' },
  { id: 'muted-doc', name: 'Muted Documentary', filter: 'contrast(105%) brightness(100%) saturate(55%) sepia(8%) hue-rotate(355deg)' },
  { id: 'golden-hour-pro', name: 'Golden Hour Pro', filter: 'contrast(108%) brightness(108%) saturate(140%) sepia(18%) hue-rotate(348deg)' },
  { id: 'desaturated-drama', name: 'Desaturated Drama', filter: 'contrast(140%) brightness(92%) saturate(40%) sepia(5%)' },
  { id: 'film-portra', name: 'Film Stock Portra', filter: 'contrast(98%) brightness(105%) saturate(105%) sepia(12%) hue-rotate(352deg)' },
  { id: 'clean-corporate', name: 'Clean Corporate', filter: 'contrast(108%) brightness(102%) saturate(95%)' },
  { id: 'vivid', name: 'Vivid', filter: 'contrast(118%) brightness(105%) saturate(150%)' },
  { id: 'warm-neutral', name: 'Warm Neutral', filter: 'contrast(102%) brightness(103%) saturate(108%) sepia(8%) hue-rotate(355deg)' },
];

/** Get a filter preset by ID. Returns 'none' preset if not found. */
export function getFilterPresetById(presetId: string): FilterPresetEntry {
  return FILTER_PRESETS.find(p => p.id === presetId) || FILTER_PRESETS[0];
}

/** Semantic mapping from natural language color descriptions to preset IDs.
 *
 * NOTE: Stylistic presets that use large hue-rotate values (teal-orange, blade-runner,
 * neon-nights, cool, noir) are NOT mapped from generic mood words here. They must be
 * explicitly requested by the user or profile — otherwise a nostalgia ad gets
 * hue-rotate(160deg) which turns skin tones blue/green. Only map moods to presets
 * that preserve natural color balance. See `creative_production_knowledge.md` §6
 * (Color Grading Psychology): warm = nostalgia/comfort, cool = tension/tech, etc.
 */
const GRADE_SEMANTIC_MAP: Record<string, string> = {
  'cool sophisticated': 'cinematic',
  'warm cinematic': 'golden-hour-pro',
  'gritty realistic': 'muted-doc',
  'high energy': 'vivid',
  // 'luxury premium' previously mapped to 'teal-orange' which has hue-rotate(160deg).
  // Disaster on nostalgia content (see Phase A3.5.4). Use film-portra — a true luxury
  // grade with warm skin tones and no hue shift.
  'luxury premium': 'film-portra',
  // 'tech modern' previously mapped to 'blade-runner' (hue-rotate 175). Same problem
  // if any content describes itself as "modern tech" and accidentally gets skin shift.
  'tech modern': 'clean-corporate',
  'emotional human': 'film-portra',
  'professional clean': 'clean-corporate',
  'dark thriller': 'desaturated-drama',
  'nightlife neon': 'neon-nights',
  'warm natural': 'warm-neutral',
  'documentary authentic': 'muted-doc',
  'film noir': 'noir',
  'retro nostalgic': 'retro',
  'bold vibrant': 'vivid',
  'soft warm': 'warm',
  'cold clinical': 'clean-corporate',
};

/** Find the best matching filter preset for a natural language color description. */
export function resolveFilterFromDescription(description: string): string | undefined {
  const lower = description.toLowerCase();
  for (const [phrase, presetId] of Object.entries(GRADE_SEMANTIC_MAP)) {
    if (lower.includes(phrase)) return presetId;
  }
  if (lower.includes('nostalgi') || lower.includes('memory') || lower.includes('childhood')) return 'golden-hour-pro';
  if (lower.includes('cinematic')) return 'cinematic';
  if (lower.includes('warm') || lower.includes('golden')) return 'golden-hour-pro';
  // 'cool'/'cold' previously mapped to 'cool' preset which has hue-rotate(180deg) — full inverted color.
  // That's only appropriate for surreal/horror content. For generic "cool tone" use clean-corporate.
  if (lower.includes('cool') || lower.includes('cold')) return 'clean-corporate';
  if (lower.includes('dark') || lower.includes('noir')) return 'desaturated-drama';
  if (lower.includes('clean') || lower.includes('corporate')) return 'clean-corporate';
  if (lower.includes('vivid') || lower.includes('bold') || lower.includes('punchy')) return 'vivid';
  if (lower.includes('retro') || lower.includes('vintage')) return 'retro';
  if (lower.includes('neon') || lower.includes('cyber')) return 'neon-nights';
  return undefined;
}
