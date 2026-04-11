/**
 * Cinema Prompt Engineering System
 *
 * Physical camera hardware language that significantly improves AI-generated
 * image and video quality. Models (especially Kling, Veo) respond strongly to
 * specific lens, camera body, focal length, and aperture descriptions.
 *
 * Extracted from Higgsfield CinemaStudio (MIT licensed) and enhanced with
 * model-specific research from fal.ai, Google Cloud, and community guides.
 *
 * Usage:
 *   import { buildCinemaPrompt, getCinemaSettingsForProfile } from './cinema-prompt-config';
 *   const enriched = buildCinemaPrompt(basePrompt, settings);
 */

// ─── Camera Bodies ──────────────────────────────────────────────
// UI label → prompt text injected as "shot on a {value}"

export const CINEMA_CAMERAS = {
  'modular-8k':       { label: 'Modular 8K Digital',           prompt: 'modular 8K digital cinema camera' },
  'full-frame-cine':  { label: 'Full-Frame Cine Digital',      prompt: 'full-frame digital cinema camera' },
  '70mm-film':        { label: 'Grand Format 70mm Film',       prompt: 'grand format 70mm film camera' },
  's35-digital':      { label: 'Studio Digital S35',           prompt: 'Super 35 studio digital camera' },
  '16mm-film':        { label: 'Classic 16mm Film',            prompt: 'classic 16mm film camera' },
  'large-format':     { label: 'Premium Large Format Digital', prompt: 'premium large-format digital cinema camera' },
} as const;

export type CameraKey = keyof typeof CINEMA_CAMERAS;

// ─── Lenses ─────────────────────────────────────────────────────
// Key → prompt text injected as "using a {value} at {focal}mm"

export const CINEMA_LENSES = {
  'tilt':             { label: 'Creative Tilt Lens',    prompt: 'creative tilt lens effect' },
  'compact-anamorphic': { label: 'Compact Anamorphic',  prompt: 'compact anamorphic lens' },
  'macro':            { label: 'Extreme Macro',         prompt: 'extreme macro lens' },
  '70s-prime':        { label: '70s Cinema Prime',      prompt: '1970s cinema prime lens' },
  'classic-anamorphic': { label: 'Classic Anamorphic',  prompt: 'classic anamorphic lens' },
  'modern-prime':     { label: 'Premium Modern Prime',  prompt: 'premium modern prime lens' },
  'warm-prime':       { label: 'Warm Cinema Prime',     prompt: 'warm-toned cinema prime lens' },
  'swirl-bokeh':      { label: 'Swirl Bokeh Portrait',  prompt: 'swirl bokeh portrait lens' },
  'vintage-prime':    { label: 'Vintage Prime',         prompt: 'vintage prime lens' },
  'halation':         { label: 'Halation Diffusion',    prompt: 'halation diffusion filter' },
  'clinical-sharp':   { label: 'Clinical Sharp Prime',  prompt: 'ultra-sharp clinical prime lens' },
} as const;

export type LensKey = keyof typeof CINEMA_LENSES;

// ─── Focal Lengths ──────────────────────────────────────────────
// mm → perspective description appended in parentheses

export const CINEMA_FOCAL_LENGTHS: Record<number, string> = {
  8:  'ultra-wide perspective',
  14: 'wide-angle perspective',
  24: 'wide-angle dynamic perspective',
  35: 'natural cinematic perspective',
  50: 'standard portrait perspective',
  85: 'classic portrait perspective',
};

// ─── Apertures ──────────────────────────────────────────────────
// f-stop → depth-of-field effect description

export const CINEMA_APERTURES: Record<string, string> = {
  'f/1.4': 'shallow depth of field, creamy bokeh',
  'f/2.8': 'moderate depth of field, smooth background separation',
  'f/4':   'balanced depth of field',
  'f/8':   'wide depth of field, sharp throughout',
  'f/11':  'deep focus clarity, sharp foreground to background',
};

// ─── Cinema Settings Interface ──────────────────────────────────

export interface CinemaSettings {
  camera: CameraKey;
  lens: LensKey;
  focalLength: number;
  aperture: string;
}

// ─── Prompt Builder ─────────────────────────────────────────────
/**
 * Build cinema hardware language to inject into video/image prompts.
 *
 * Returns a string like:
 *   "shot on a grand format 70mm film camera, using a classic anamorphic lens
 *    at 35mm (natural cinematic perspective), aperture f/1.4, shallow depth of
 *    field, creamy bokeh"
 *
 * This is NOT the full prompt — it's appended/injected into existing prompts.
 */
export function buildCinemaFragment(settings: CinemaSettings): string {
  const camera = CINEMA_CAMERAS[settings.camera]?.prompt || settings.camera;
  const lens = CINEMA_LENSES[settings.lens]?.prompt || settings.lens;
  const perspective = CINEMA_FOCAL_LENGTHS[settings.focalLength] || '';
  const depthEffect = CINEMA_APERTURES[settings.aperture] || '';

  const parts = [
    `shot on a ${camera}`,
    `using a ${lens} at ${settings.focalLength}mm${perspective ? ` (${perspective})` : ''}`,
    `aperture ${settings.aperture}`,
    depthEffect,
  ];

  return parts.filter(Boolean).join(', ');
}

/**
 * Full prompt builder for image generation (storyboard).
 * Appends cinema hardware + quality tags to a base prompt.
 */
export function buildCinemaPrompt(
  basePrompt: string,
  settings: CinemaSettings,
): string {
  const fragment = buildCinemaFragment(settings);
  return `${basePrompt}, ${fragment}, cinematic lighting, natural color science, high dynamic range`;
}

// ─── Profile → Cinema Mapping ───────────────────────────────────
// Maps edit profile categories to appropriate cinema hardware.
// Used when no explicit cinema settings are provided.
//
// Categories from edit-profiles.ts:
//   A = Cinematic, B = Industry, C = Social/Fast, D = Documentary,
//   E = Narrative, F = Tutorial, G = Default

export const PROFILE_CINEMA_DEFAULTS: Record<string, CinemaSettings> = {
  // A — Cinematic styles: premium cameras, expressive lenses
  'cinematic-blockbuster':  { camera: '70mm-film',       lens: 'classic-anamorphic', focalLength: 35, aperture: 'f/1.4' },
  'cinematic-indie':        { camera: '16mm-film',        lens: 'vintage-prime',      focalLength: 35, aperture: 'f/2.8' },
  'cinematic-noir':         { camera: 'full-frame-cine',  lens: '70s-prime',          focalLength: 50, aperture: 'f/1.4' },

  // B — Industry: clean, professional
  'corporate':              { camera: 'full-frame-cine',  lens: 'modern-prime',       focalLength: 50, aperture: 'f/4' },
  'product-ad':             { camera: 'modular-8k',       lens: 'clinical-sharp',     focalLength: 85, aperture: 'f/2.8' },
  'real-estate':            { camera: 'full-frame-cine',  lens: 'modern-prime',       focalLength: 24, aperture: 'f/8' },
  'food-beverage':          { camera: 'full-frame-cine',  lens: 'macro',              focalLength: 85, aperture: 'f/1.4' },

  // C — Social/Fast: dynamic, energetic
  'social-fast':            { camera: 's35-digital',      lens: 'compact-anamorphic', focalLength: 24, aperture: 'f/2.8' },
  'music-video':            { camera: 's35-digital',      lens: 'compact-anamorphic', focalLength: 24, aperture: 'f/1.4' },

  // D — Documentary: naturalistic
  'documentary':            { camera: '16mm-film',        lens: 'vintage-prime',      focalLength: 35, aperture: 'f/4' },
  'documentary-intimate':   { camera: '16mm-film',        lens: 'warm-prime',         focalLength: 50, aperture: 'f/2.8' },

  // E — Narrative: story-driven
  'narrative-drama':        { camera: 'full-frame-cine',  lens: 'warm-prime',         focalLength: 35, aperture: 'f/2.8' },
  'narrative-nostalgia':    { camera: '16mm-film',        lens: '70s-prime',          focalLength: 35, aperture: 'f/2.8' },

  // F — Tutorial: clean, sharp
  'tutorial':               { camera: 'full-frame-cine',  lens: 'clinical-sharp',     focalLength: 50, aperture: 'f/4' },

  // G — Default fallback
  'default':                { camera: 'full-frame-cine',  lens: 'modern-prime',       focalLength: 35, aperture: 'f/2.8' },
};

/**
 * Derive cinema settings from content mood and art style.
 * Used by video worker where profile ID isn't available yet.
 * Falls back to neutral cinematic defaults.
 */
export function getCinemaSettingsFromContent(
  mood?: string,
  artStyle?: string,
): CinemaSettings {
  const m = (mood || '').toLowerCase();
  const s = (artStyle || '').toLowerCase();

  // Nostalgic / retro — warm vintage look
  if (m.includes('nostalg') || m.includes('retro') || s.includes('vintage') || s.includes('retro')) {
    return PROFILE_CINEMA_DEFAULTS['narrative-nostalgia'];
  }
  // Dark / moody / thriller — noir setup
  if (m.includes('dark') || m.includes('mysterious') || m.includes('thriller') || s.includes('noir')) {
    return PROFILE_CINEMA_DEFAULTS['cinematic-noir'];
  }
  // Epic / dramatic / cinematic — big film look
  if (m.includes('epic') || m.includes('dramatic') || m.includes('intense') || s.includes('cinematic')) {
    return PROFILE_CINEMA_DEFAULTS['cinematic-blockbuster'];
  }
  // Warm / cozy / intimate — documentary feel
  if (m.includes('warm') || m.includes('cozy') || m.includes('intimate') || m.includes('calm')) {
    return PROFILE_CINEMA_DEFAULTS['documentary-intimate'];
  }
  // Energetic / fast / upbeat — social/music style
  if (m.includes('energetic') || m.includes('upbeat') || m.includes('exciting') || m.includes('playful')) {
    return PROFILE_CINEMA_DEFAULTS['social-fast'];
  }
  // Professional / corporate / clean
  if (m.includes('professional') || m.includes('corporate') || s.includes('clean') || s.includes('minimal')) {
    return PROFILE_CINEMA_DEFAULTS['corporate'];
  }
  // Food / product — macro detail
  if (s.includes('food') || s.includes('product') || s.includes('commercial')) {
    return PROFILE_CINEMA_DEFAULTS['product-ad'];
  }
  // Documentary / raw
  if (s.includes('documentary') || s.includes('raw') || s.includes('handheld')) {
    return PROFILE_CINEMA_DEFAULTS['documentary'];
  }

  // Default: clean cinematic
  return PROFILE_CINEMA_DEFAULTS['default'];
}

/**
 * Get cinema settings for an edit profile ID.
 * Falls back through: exact match → category prefix → 'default'.
 *
 * @param profileId - e.g., "A-01", "B-07", "G-01"
 * @param profileName - e.g., "Cinematic Blockbuster", "Product Showcase"
 */
export function getCinemaSettingsForProfile(
  profileId: string,
  profileName?: string,
): CinemaSettings {
  // Try exact match by profile name (lowercase, hyphenated)
  const normalizedName = (profileName || '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');

  for (const [key, settings] of Object.entries(PROFILE_CINEMA_DEFAULTS)) {
    if (normalizedName.includes(key) || key.includes(normalizedName)) {
      return settings;
    }
  }

  // Try category prefix
  const category = profileId.charAt(0).toUpperCase();
  const categoryMap: Record<string, string> = {
    'A': 'cinematic-blockbuster',
    'B': 'corporate',
    'C': 'social-fast',
    'D': 'documentary',
    'E': 'narrative-drama',
    'F': 'tutorial',
    'G': 'default',
  };

  const fallbackKey = categoryMap[category];
  if (fallbackKey && PROFILE_CINEMA_DEFAULTS[fallbackKey]) {
    return PROFILE_CINEMA_DEFAULTS[fallbackKey];
  }

  return PROFILE_CINEMA_DEFAULTS['default'];
}
