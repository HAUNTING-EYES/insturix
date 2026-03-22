/**
 * Media Filter Presets
 *
 * This file defines preset CSS filters that can be applied to video and image overlays.
 * Each preset represents a specific visual style that can be selected from the UI.
 * The filter strings are valid CSS filter values to be directly applied to the media element.
 */

export interface MediaFilterPreset {
  id: string;
  name: string;
  description: string;
  filter: string;
  /** Category for UI grouping */
  category?: 'cinematic' | 'vintage' | 'creative' | 'corporate' | 'mood' | 'dramatic';
}

export const MEDIA_FILTER_PRESETS: MediaFilterPreset[] = [
  {
    id: "none",
    name: "None",
    description: "No filter applied",
    filter: "none",
  },
  {
    id: "retro",
    name: "Retro",
    description: "Intense vintage effect with strong grain and warm saturation",
    filter:
      "contrast(130%) sepia(45%) brightness(85%) saturate(160%) hue-rotate(5deg)",
  },
  {
    id: "vintage",
    name: "Vintage",
    description: "Aged film look with faded colors and warm tint",
    filter: "contrast(95%) brightness(95%) saturate(70%) sepia(15%)",
  },
  {
    id: "wesAnderson",
    name: "Wes Anderson",
    description:
      "Bold symmetrical aesthetics with highly saturated pastel tones",
    filter: "contrast(135%) brightness(110%) saturate(190%) hue-rotate(345deg)",
  },
  {
    id: "noir",
    name: "Film Noir",
    description: "High contrast black and white",
    filter: "grayscale(100%) contrast(150%) brightness(90%)",
  },
  {
    id: "polaroid",
    name: "Polaroid",
    description: "Nostalgic instant photo look with white border",
    filter: "sepia(15%) contrast(95%) brightness(105%) saturate(80%)",
  },
  {
    id: "cinematic",
    name: "Cinematic",
    description: "Professional film look with enhanced contrast",
    filter: "contrast(115%) brightness(95%) saturate(110%)",
  },
  {
    id: "cool",
    name: "Cool",
    description: "Blue toned filter for a calming effect",
    filter: "brightness(100%) sepia(20%) hue-rotate(180deg) saturate(90%)",
  },
  {
    id: "warm",
    name: "Warm",
    description: "Golden hour effect with warm tones",
    filter: "brightness(105%) sepia(30%) saturate(130%) hue-rotate(350deg)",
  },
  {
    id: "expired",
    name: "Expired Film",
    description: "Dreamy vintage effect with subtle color shifts",
    filter:
      "contrast(110%) brightness(100%) saturate(85%) sepia(20%) hue-rotate(5deg)",
  },
  {
    id: "kodak",
    name: "Kodak",
    description: "Classic film stock with rich colors and golden highlights",
    filter:
      "contrast(120%) brightness(105%) saturate(120%) sepia(10%) hue-rotate(355deg)",
  },
  {
    id: "super8",
    name: "Super 8",
    description: "Grainy retro film effect with warm nostalgic tone",
    filter:
      "contrast(125%) brightness(95%) saturate(70%) sepia(30%) hue-rotate(340deg)",
    category: 'vintage',
  },
  // ─── Professional Presets (Phase 6A) ───────────────────────────
  {
    id: "teal-orange",
    name: "Teal & Orange",
    description: "The most common cinematic color grade — warm skin tones against cool backgrounds",
    filter: "contrast(120%) saturate(130%) hue-rotate(160deg) brightness(95%)",
    category: 'cinematic',
  },
  {
    id: "blade-runner",
    name: "Blade Runner",
    description: "Heavy cyan shadows with deep contrast — futuristic noir aesthetic",
    filter: "contrast(140%) brightness(88%) saturate(90%) sepia(10%) hue-rotate(175deg)",
    category: 'cinematic',
  },
  {
    id: "neon-nights",
    name: "Neon Nights",
    description: "High saturation with deep blacks — nightlife, gaming, tech content",
    filter: "contrast(135%) brightness(90%) saturate(180%) hue-rotate(270deg)",
    category: 'creative',
  },
  {
    id: "muted-doc",
    name: "Muted Documentary",
    description: "Low saturation with warm cast — observational, authentic, real",
    filter: "contrast(105%) brightness(100%) saturate(55%) sepia(8%) hue-rotate(355deg)",
    category: 'cinematic',
  },
  {
    id: "golden-hour-pro",
    name: "Golden Hour Pro",
    description: "Rich golden warmth with soft contrast — lifestyle, food, travel",
    filter: "contrast(108%) brightness(108%) saturate(140%) sepia(18%) hue-rotate(348deg)",
    category: 'mood',
  },
  {
    id: "desaturated-drama",
    name: "Desaturated Drama",
    description: "Stripped color with high contrast — tension, thriller, noir stories",
    filter: "contrast(140%) brightness(92%) saturate(40%) sepia(5%)",
    category: 'dramatic',
  },
  {
    id: "film-portra",
    name: "Film Stock Portra",
    description: "Warm skin tones with lifted shadows — portrait, human, emotional",
    filter: "contrast(98%) brightness(105%) saturate(105%) sepia(12%) hue-rotate(352deg)",
    category: 'cinematic',
  },
  {
    id: "clean-corporate",
    name: "Clean Corporate",
    description: "Neutral with slightly boosted clarity — professional, trustworthy, clean",
    filter: "contrast(108%) brightness(102%) saturate(95%)",
    category: 'corporate',
  },
  {
    id: "vivid",
    name: "Vivid",
    description: "Punchy, high-energy colors — social media, short-form, attention-grabbing",
    filter: "contrast(118%) brightness(105%) saturate(150%)",
    category: 'creative',
  },
  {
    id: "warm-neutral",
    name: "Warm Neutral",
    description: "Subtle warmth without distortion — wellness, food, human stories",
    filter: "contrast(102%) brightness(103%) saturate(108%) sepia(8%) hue-rotate(355deg)",
    category: 'mood',
  },
];

/**
 * Helper function to parse a CSS filter string and extract individual filter values
 *
 * @param filterString - CSS filter string to parse
 * @returns Object with individual filter values
 */
export const parseFilterString = (
  filterString: string = "none"
): Record<string, string> => {
  if (filterString === "none") {
    return {};
  }

  const filterObject: Record<string, string> = {};

  // Extract individual filter functions using regex
  const filterMatches = filterString.match(/([a-z-]+)\(([^)]+)\)/g) || [];

  filterMatches.forEach((match) => {
    const [, filterName, value] = match.match(/([a-z-]+)\(([^)]+)\)/) || [];
    if (filterName && value) {
      filterObject[filterName] = value;
    }
  });

  return filterObject;
};

/**
 * Helper function to get a preset by its ID
 *
 * @param presetId - ID of the preset to retrieve
 * @returns The preset object or the "none" preset if not found
 */
/**
 * Semantic mapping from natural language color descriptions to preset IDs.
 * Used by the LLM scene parser and Director Agent to map script instructions
 * like "cool sophisticated palette" to the correct filter preset.
 */
export const GRADE_SEMANTIC_MAP: Record<string, string> = {
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

/**
 * Find the best matching filter preset for a natural language color description.
 * Falls back to the first matching keyword if no exact phrase match.
 */
export function resolveFilterFromDescription(description: string): string | undefined {
  const lower = description.toLowerCase();
  // Exact phrase match first
  for (const [phrase, presetId] of Object.entries(GRADE_SEMANTIC_MAP)) {
    if (lower.includes(phrase)) return presetId;
  }
  // Single keyword fallback
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

export const getPresetById = (presetId: string): MediaFilterPreset => {
  return (
    MEDIA_FILTER_PRESETS.find((preset) => preset.id === presetId) ||
    MEDIA_FILTER_PRESETS[0]
  ); // Default to "none" preset
};
