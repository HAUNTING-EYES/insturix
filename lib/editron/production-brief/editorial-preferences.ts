export const EDITORIAL_FAMILIES = [
  'captions',
  'motionGraphics',
  'zoom',
  'transitions',
  'sfx',
  'music',
] as const;

export type EditorialFamily = (typeof EDITORIAL_FAMILIES)[number];
export type EditorialPreferenceMode = 'auto' | 'off' | 'prefer';

export interface EditorialFamilyPreference {
  /** Auto = evidence + brand decide; off = hard user veto; prefer = soft user direction. */
  mode: EditorialPreferenceMode;
  /** Desired occurrence rate, normalized 0..1. This never licenses a moment by itself. */
  frequency?: number;
  /** Desired expressive strength, normalized 0..1. Final form remains resolver-owned. */
  intensity?: number;
}

export interface EditorialPacingPreference {
  mode: 'auto' | 'prefer';
  /** Calm 0..1 fast bias. Cutting still requires content/audio/visual evidence. */
  intensity?: number;
}

export interface EditorialPreferences {
  families?: Partial<Record<EditorialFamily, EditorialFamilyPreference>>;
  pacing?: EditorialPacingPreference;
  /** Optional music direction such as mood, instrument, or an uploaded-track instruction. */
  musicPrompt?: string;
  /** Cross-family user direction that cannot be represented by the numeric controls. */
  notes?: string;
}

const TEXT_LIMIT = 500;

function clamp01(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.min(1, value));
}

function cleanText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return text ? text.slice(0, TEXT_LIMIT) : undefined;
}

/**
 * Boundary normalizer shared by browser and API routes. Unknown fields are discarded,
 * numeric values are clamped, and auto preferences are omitted because absence means auto.
 */
export function normalizeEditorialPreferences(value: unknown): EditorialPreferences | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const source = value as Record<string, unknown>;
  const rawFamilies = source.families && typeof source.families === 'object' && !Array.isArray(source.families)
    ? source.families as Record<string, unknown>
    : {};
  const families: EditorialPreferences['families'] = {};

  for (const family of EDITORIAL_FAMILIES) {
    const raw = rawFamilies[family];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const candidate = raw as Record<string, unknown>;
    const mode = candidate.mode;
    if (mode !== 'off' && mode !== 'prefer') continue;
    const frequency = clamp01(candidate.frequency);
    const intensity = clamp01(candidate.intensity);
    families[family] = {
      mode,
      ...(mode === 'prefer' && frequency !== undefined ? { frequency } : {}),
      ...(mode === 'prefer' && intensity !== undefined ? { intensity } : {}),
    };
  }

  const rawPacing = source.pacing && typeof source.pacing === 'object' && !Array.isArray(source.pacing)
    ? source.pacing as Record<string, unknown>
    : null;
  const pacingIntensity = rawPacing ? clamp01(rawPacing.intensity) : undefined;
  const pacing = rawPacing?.mode === 'prefer'
    ? { mode: 'prefer' as const, ...(pacingIntensity !== undefined ? { intensity: pacingIntensity } : {}) }
    : undefined;
  const musicPrompt = cleanText(source.musicPrompt);
  const notes = cleanText(source.notes);

  if (Object.keys(families).length === 0 && !pacing && !musicPrompt && !notes) return undefined;
  return {
    ...(Object.keys(families).length > 0 ? { families } : {}),
    ...(pacing ? { pacing } : {}),
    ...(musicPrompt ? { musicPrompt } : {}),
    ...(notes ? { notes } : {}),
  };
}
