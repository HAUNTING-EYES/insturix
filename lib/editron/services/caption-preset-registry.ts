/**
 * Caption Preset Registry — single source of truth for caption styles.
 *
 * ONE ROW = ONE STYLE. Adding a new Insta/TikTok style = adding a row here, NOT writing code.
 *
 * This consolidates three previously-divergent stores (to be wired in a follow-up step):
 *   - lib/editron/services/media/caption-service.ts        STYLE_MAP (9 named styles)
 *   - components/.../version-7.0.0/templates/caption-templates.ts   (11 templates)
 *   - lib/editron/services/caption-form.ts                 AtomicCaptionStyle enum + signal cascade
 *
 * Each row carries the full picker "columns":
 *   - autoSelect : the signal window this style fits (the selector scores all rows)
 *   - display    : grouping / reveal mode (CaptionDisplayConfig)
 *   - styles     : base CaptionStyles (every word)
 *   - textCase / stroke / reveal / roles : the atoms the existing CaptionStyles lacks
 *                  (declared here so rows are complete; the RENDERER reads them in a later phase)
 *
 * Grounded in caption research (2026-06):
 *   - Hormozi: bold UPPERCASE white, active word highlighted saturated yellow #FFD93D (green alt #39FF14),
 *     word-by-word, ~3 words, fast pop. Font Montserrat/League-Spartan.
 *   - MrBeast: Komika/heavy display font, UPPERCASE, white + thick black STROKE, bright per-word colour, bounce.
 *   - Karaoke: inactive words dimmed, a rotating accent colour fills the active word (eye-tracking).
 *   - Minimal: lower/sentence case white, no box, drop shadow.
 *   - Accessibility/timing: 160-180 WPM (<=200 for 18-24), CPS comfortable <=20, <=2 lines, 2-7s on screen.
 *     (Sources: blitzcutai.com/blog/best-caption-fonts-tiktok, submagic.co MrBeast guide, karadeo.com Hormozi
 *      guide, waywithwords.net + opus.pro caption best-practice guides.)
 *
 * NOTE: `styles` are ported verbatim from caption-service.ts STYLE_MAP so the eventual wiring is
 * behavior-preserving for the existing 9 styles. New atoms are additive metadata.
 */

import type {
  CaptionStyles,
  CaptionDisplayConfig,
} from '@/components/editron/editor/version-7.0.0/types';

// ─── New styling atoms (declared here; rendered in a later phase) ────────────────

/** Letter casing applied to caption text. 'as-is' keeps the transcript's own casing. */
export type CaptionTextCase = 'upper' | 'sentence' | 'lower' | 'as-is';

/** Text outline (renders as CSS -webkit-text-stroke). The MrBeast look. */
export interface CaptionStroke {
  widthPx: number;
  color: string;
}

/** Per-word entry animation (distinct from the active-word `highlight.animation`). */
export type CaptionReveal = 'none' | 'fade' | 'slide-up' | 'pop' | 'typewriter';

/** Emphasis roles — MUST match CaptionWord.emphasis.type in the shared types. */
export type CaptionEmphasisRole = 'keyword' | 'statistic' | 'cta' | 'entity';

/** How a word of a given emphasis role is styled (the "coloured bold per word" capability). */
export interface CaptionRoleStyle {
  color?: string;
  fontWeight?: number;
  scale?: number;
}

/**
 * Signal window a preset fits. Each tuple is an inclusive [min, max] range; an omitted
 * dimension is unconstrained. The selector scores every preset against the live signals.
 */
export interface CaptionAutoSelect {
  /** 0 (casual) .. 1 (formal) */
  formality?: [number, number];
  /** 0 (calm) .. 1 (high energy) */
  energy?: [number, number];
  /** words per minute */
  speakingRate?: [number, number];
}

/** One caption style. Fill these columns to add a new style — no code change required. */
export interface CaptionPreset {
  id: string;
  name: string;
  description: string;
  /** Signal conditions for auto-selection. Omit for a manual-only style. */
  autoSelect?: CaptionAutoSelect;
  /** Word grouping + display/reveal mode. */
  display: CaptionDisplayConfig;
  /** Base look applied to every word. */
  styles: CaptionStyles;
  // ── New atoms (additive; wired into the renderer in a later phase) ──
  textCase?: CaptionTextCase;
  stroke?: CaptionStroke;
  reveal?: CaptionReveal;
  /** Per-emphasis-role overrides (keyword/cta/statistic/entity). */
  roles?: Partial<Record<CaptionEmphasisRole, CaptionRoleStyle>>;
}

// ─── The registry (one row per style) ───────────────────────────────────────────

export const CAPTION_PRESETS: Record<string, CaptionPreset> = {
  hormozi: {
    id: 'hormozi',
    name: 'Hormozi',
    description: 'Bold uppercase white; active word pops in saturated yellow. ~3 words, fast punch.',
    autoSelect: { energy: [0.72, 1], speakingRate: [160, 400] },
    display: { mode: 'hormozi', wordsPerGroup: 3, maxWordsPerLine: 2, showPreviousWords: false, fadeOutPreviousWords: false, useSpringScale: true, springDamping: 8, springMass: 0.3 },
    styles: {
      fontFamily: 'font-league-spartan',
      fontSize: '56px',
      fontWeight: 900,
      color: '#ffffff',
      textAlign: 'center',
      lineHeight: 1.1,
      textShadow: '3px 3px 6px rgba(0,0,0,0.9), -2px -2px 4px rgba(0,0,0,0.7), 0 0 20px rgba(0,0,0,0.5)',
      backgroundColor: 'transparent',
      highlight: { color: '#FFD93D', backgroundColor: 'transparent', scale: 1.2, fontWeight: 900, effect: 'pop', animation: 'bounce' },
    },
    textCase: 'upper',
    reveal: 'pop',
    roles: { keyword: { color: '#FFD93D' }, cta: { color: '#FFD93D' }, statistic: { color: '#39FF14' } },
  },

  mrbeast: {
    id: 'mrbeast',
    name: 'MrBeast',
    description: 'Heavy display font, uppercase, white with a thick black stroke; bright per-word colour, bounce.',
    display: { mode: 'word-by-word', wordsPerGroup: 1, maxWordsPerLine: 1, showPreviousWords: false, fadeOutPreviousWords: false, useSpringScale: true, springDamping: 9, springMass: 0.4 },
    styles: {
      fontFamily: 'font-bungee-inline',
      fontSize: '52px',
      fontWeight: 800,
      color: '#ffffff',
      textAlign: 'center',
      lineHeight: 1.2,
      textShadow: '0 0 15px rgba(255,0,0,0.3)',
      backgroundColor: 'transparent',
      highlight: { color: '#FF3333', backgroundColor: 'rgba(255,255,0,0.9)', scale: 1.25, fontWeight: 900, effect: 'box', animation: 'bounce' },
    },
    textCase: 'upper',
    stroke: { widthPx: 2, color: '#000000' },
    reveal: 'pop',
    roles: { keyword: { color: '#FFE600' }, cta: { color: '#FF3333' } },
  },

  karaoke: {
    id: 'karaoke',
    name: 'Karaoke',
    description: 'Inactive words dimmed; a rotating accent colour fills the active word (eye-tracking).',
    display: { mode: 'karaoke', wordsPerGroup: 6, maxWordsPerLine: 8, showPreviousWords: true, fadeOutPreviousWords: true },
    styles: {
      fontFamily: 'font-sans',
      fontSize: '36px',
      fontWeight: 600,
      color: 'rgba(255,255,255,0.5)',
      textAlign: 'center',
      lineHeight: 1.4,
      highlight: { color: '#ffffff', backgroundColor: 'transparent', scale: 1.05, effect: 'underline', animation: 'none' },
    },
    textCase: 'as-is',
    reveal: 'none',
    roles: { keyword: { color: '#FFD93D' } },
  },

  tiktok: {
    id: 'tiktok',
    name: 'TikTok',
    description: 'High-contrast bold white, yellow active-word pop. Casual, mid energy.',
    autoSelect: { formality: [0, 0.5], energy: [0.45, 0.75] },
    display: { mode: 'phrase', wordsPerGroup: 3, maxWordsPerLine: 4, showPreviousWords: false, fadeOutPreviousWords: false },
    styles: {
      fontFamily: 'font-league-spartan',
      fontSize: '48px',
      fontWeight: 800,
      color: '#ffffff',
      textAlign: 'center',
      lineHeight: 1.2,
      textShadow: '2px 2px 4px rgba(0,0,0,0.8), -1px -1px 2px rgba(0,0,0,0.5)',
      backgroundColor: 'transparent',
      highlight: { color: '#FFD700', backgroundColor: 'transparent', scale: 1.15, fontWeight: 900, effect: 'pop', animation: 'bounce' },
    },
    textCase: 'as-is',
    reveal: 'pop',
    roles: { keyword: { color: '#FFD700' }, cta: { color: '#FFD700' } },
  },

  bold: {
    id: 'bold',
    name: 'Bold',
    description: 'Outlined display font, uppercase, glow on the active word. Casual high energy.',
    autoSelect: { formality: [0, 0.42], energy: [0.45, 1] },
    display: { mode: 'phrase', wordsPerGroup: 3, maxWordsPerLine: 4, showPreviousWords: false, fadeOutPreviousWords: false },
    styles: {
      fontFamily: 'font-bungee-inline',
      fontSize: '42px',
      fontWeight: 700,
      color: '#ffffff',
      textAlign: 'center',
      lineHeight: 1.3,
      textShadow: '3px 3px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000',
      highlight: { color: '#FF6B6B', backgroundColor: 'transparent', scale: 1.1, effect: 'glow', animation: 'pulse' },
    },
    textCase: 'upper',
    reveal: 'pop',
    roles: { keyword: { color: '#FF6B6B' } },
  },

  minimal: {
    id: 'minimal',
    name: 'Minimal',
    description: 'Clean white sans on a subtle dark pill. The safe default.',
    autoSelect: { formality: [0.55, 1] },
    display: { mode: 'phrase', wordsPerGroup: 4, maxWordsPerLine: 6, showPreviousWords: false, fadeOutPreviousWords: false },
    styles: {
      fontFamily: 'font-sans',
      fontSize: '32px',
      fontWeight: 500,
      color: '#ffffff',
      textAlign: 'center',
      lineHeight: 1.4,
      backgroundColor: 'rgba(0,0,0,0.6)',
      padding: '8px 16px',
      borderRadius: '8px',
      highlight: { color: '#ffffff', backgroundColor: 'rgba(59, 130, 246, 0.8)', scale: 1, effect: 'box', animation: 'none' },
    },
    textCase: 'as-is',
    reveal: 'fade',
  },

  subtitle: {
    id: 'subtitle',
    name: 'Subtitle',
    description: 'Broadcast-style sentence-case panel; low motion, up to 2 lines. Formal/slow speech.',
    autoSelect: { formality: [0.72, 1], speakingRate: [0, 145] },
    display: { mode: 'subtitle', wordsPerGroup: 10, maxWordsPerLine: 12, showPreviousWords: true, fadeOutPreviousWords: false },
    styles: {
      fontFamily: 'font-sans',
      fontSize: '28px',
      fontWeight: 400,
      color: '#ffffff',
      textAlign: 'center',
      lineHeight: 1.5,
      backgroundColor: 'rgba(0,0,0,0.75)',
      padding: '4px 12px',
      borderRadius: '4px',
      highlight: { color: '#ffffff', backgroundColor: 'transparent', scale: 1, effect: 'none', animation: 'none' },
    },
    textCase: 'sentence',
    reveal: 'none',
  },

  'ali-abdaal': {
    id: 'ali-abdaal',
    name: 'Ali Abdaal',
    description: 'Clean, modern, low-key sentence case; gentle underline, no distracting motion.',
    display: { mode: 'karaoke', wordsPerGroup: 6, maxWordsPerLine: 8, showPreviousWords: true, fadeOutPreviousWords: true },
    styles: {
      fontFamily: 'font-sans',
      fontSize: '34px',
      fontWeight: 400,
      color: '#f0f0f0',
      textAlign: 'center',
      lineHeight: 1.5,
      textShadow: '1px 1px 3px rgba(0,0,0,0.4)',
      backgroundColor: 'transparent',
      highlight: { color: '#ffffff', backgroundColor: 'transparent', scale: 1.02, fontWeight: 500, effect: 'underline', animation: 'none' },
    },
    textCase: 'sentence',
    reveal: 'fade',
  },

  corporate: {
    id: 'corporate',
    name: 'Corporate',
    description: 'Formal bottom bar with a solid background; clean and brand-safe.',
    display: { mode: 'subtitle', wordsPerGroup: 10, maxWordsPerLine: 12, showPreviousWords: true, fadeOutPreviousWords: false },
    styles: {
      fontFamily: 'font-sans',
      fontSize: '30px',
      fontWeight: 500,
      color: '#ffffff',
      textAlign: 'center',
      lineHeight: 1.4,
      backgroundColor: 'rgba(0,0,0,0.8)',
      padding: '10px 24px',
      borderRadius: '0px',
      highlight: { color: '#4A90D9', backgroundColor: 'transparent', scale: 1, fontWeight: 600, effect: 'none', animation: 'none' },
    },
    textCase: 'sentence',
    reveal: 'none',
  },
};

/** The style returned when nothing else matches. */
export const FALLBACK_CAPTION_PRESET_ID = 'minimal';

// ─── Signal-driven selection ────────────────────────────────────────────────────

export interface CaptionSignalInputs {
  formality: number;
  energy: number;
  speakingRate: number;
}

/**
 * Centrality score for one signal against an inclusive window.
 * Returns null when the dimension is unconstrained, -1 when the signal is OUTSIDE the
 * window (disqualifying), or 0.5..1 by how central the signal sits inside the window.
 */
function windowCentrality(value: number, window?: [number, number]): number | null {
  if (!window) return null;
  const [lo, hi] = window;
  if (!Number.isFinite(value) || value < lo || value > hi) return -1;
  const mid = (lo + hi) / 2;
  const half = Math.max(1e-6, (hi - lo) / 2);
  return 1 - (Math.abs(value - mid) / half) * 0.5; // 1 at center, 0.5 at the edges
}

/**
 * Score a preset's autoSelect window against the signals.
 * A preset with no autoSelect is manual-only (base 0). Any out-of-window dimension
 * disqualifies the preset (-1). Otherwise the score is the average centrality of the
 * constrained dimensions, so the tightest, best-fitting window wins.
 */
export function scoreCaptionPreset(preset: CaptionPreset, signals: CaptionSignalInputs): number {
  const auto = preset.autoSelect;
  if (!auto) return 0;
  let total = 0;
  let constrained = 0;
  for (const [dim, window] of [
    ['formality', auto.formality],
    ['energy', auto.energy],
    ['speakingRate', auto.speakingRate],
  ] as const) {
    const c = windowCentrality(signals[dim], window);
    if (c === null) continue;
    if (c < 0) return -1; // outside any constrained window → disqualified
    total += c;
    constrained += 1;
  }
  return constrained === 0 ? 0 : total / constrained;
}

/**
 * Pick a caption preset. An explicit `requestedId` (user/profile choice) always wins when it
 * exists; otherwise the best-scoring autoSelect window is chosen, falling back to `minimal`.
 */
export function selectCaptionPreset(
  signals: CaptionSignalInputs,
  requestedId?: string | null,
): CaptionPreset {
  if (requestedId && CAPTION_PRESETS[requestedId]) {
    return CAPTION_PRESETS[requestedId];
  }
  let best: CaptionPreset | null = null;
  let bestScore = 0; // a matching window must beat the manual-only baseline (0)
  for (const preset of Object.values(CAPTION_PRESETS)) {
    const score = scoreCaptionPreset(preset, signals);
    if (score > bestScore) {
      bestScore = score;
      best = preset;
    }
  }
  return best ?? CAPTION_PRESETS[FALLBACK_CAPTION_PRESET_ID];
}

/** All preset ids/names — for building the picker UI list. */
export function listCaptionPresets(): Array<{ id: string; name: string; description: string }> {
  return Object.values(CAPTION_PRESETS).map(({ id, name, description }) => ({ id, name, description }));
}
