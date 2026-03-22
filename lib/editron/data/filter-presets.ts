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
  { id: 'teal-orange', name: 'Teal & Orange', filter: 'contrast(120%) saturate(130%) hue-rotate(160deg) brightness(95%)' },
  { id: 'blade-runner', name: 'Blade Runner', filter: 'contrast(140%) brightness(88%) saturate(90%) sepia(10%) hue-rotate(175deg)' },
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

/** Semantic mapping from natural language color descriptions to preset IDs. */
const GRADE_SEMANTIC_MAP: Record<string, string> = {
  'cool sophisticated': 'cinematic',
  'warm cinematic': 'golden-hour-pro',
  'gritty realistic': 'muted-doc',
  'high energy': 'vivid',
  'luxury premium': 'teal-orange',
  'tech modern': 'blade-runner',
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
  'cold clinical': 'cool',
};

/** Find the best matching filter preset for a natural language color description. */
export function resolveFilterFromDescription(description: string): string | undefined {
  const lower = description.toLowerCase();
  for (const [phrase, presetId] of Object.entries(GRADE_SEMANTIC_MAP)) {
    if (lower.includes(phrase)) return presetId;
  }
  if (lower.includes('cinematic')) return 'cinematic';
  if (lower.includes('warm')) return 'golden-hour-pro';
  if (lower.includes('cool') || lower.includes('cold')) return 'cool';
  if (lower.includes('dark') || lower.includes('noir')) return 'desaturated-drama';
  if (lower.includes('clean') || lower.includes('corporate')) return 'clean-corporate';
  if (lower.includes('vivid') || lower.includes('bold') || lower.includes('punchy')) return 'vivid';
  if (lower.includes('retro') || lower.includes('vintage')) return 'retro';
  if (lower.includes('neon') || lower.includes('cyber')) return 'neon-nights';
  return undefined;
}
