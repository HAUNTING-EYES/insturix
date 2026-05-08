/**
 * Insturix Design System v1.0 — TypeScript Source of Truth
 *
 * This file is the canonical reference for all design tokens.
 * CSS variables in design-tokens.css are derived from these values.
 * Use this for inline styles (landing pages, dynamic components).
 * Use Tailwind classes for everything else.
 *
 * Design system locked: April 19, 2026
 */

// ─── Colors ─────────────────────────────────────────────────────

export const colors = {
  bg: {
    canvas: "#0B0B0A",
    raised: "#0F0F0E",
    deeper: "#131312",
    well: "#1B1A18",
  },
  border: {
    subtle: "#1C1B19",
    emphasis: "#282724",
  },
  text: {
    primary: "#ECE9E1",
    secondary: "#B5B2A8",
    muted: "#7A776E",
    dim: "#5F5E5A",
    faint: "#454340",
  },
  accent: {
    gold: "#D4A652",
  },
  status: {
    success: "#5EC97E",
    warning: "#D4A652",
    danger: "#D46A5C",
  },
  category: {
    purple: "#9088D4",
    pink: "#D088B4",
    cyan: "#5CB8CC",
  },
} as const;

// Flat map for quick access (matches the C object in landing pages)
export const C = {
  bg: colors.bg.canvas,
  raised: colors.bg.raised,
  deeper: colors.bg.deeper,
  well: colors.bg.well,
  border: colors.border.subtle,
  borderEmph: colors.border.emphasis,
  text: colors.text.primary,
  soft: colors.text.secondary,
  muted: colors.text.muted,
  dim: colors.text.dim,
  faint: colors.text.faint,
  gold: colors.accent.gold,
  green: colors.status.success,
  red: colors.status.danger,
  purple: colors.category.purple,
  pink: colors.category.pink,
  cyan: colors.category.cyan,
} as const;

// ─── Typography ─────────────────────────────────────────────────

export const fonts = {
  sans: "'Plus Jakarta Sans', -apple-system, system-ui, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, 'SF Mono', monospace",
} as const;

export const fontWeights = {
  regular: 400,
  medium: 500,
  hero: 800,
} as const;

// Only these sizes exist. No 12px, no 16px, no 20px.
export const fontSizes = [10, 11, 13, 14, 18, 24, 32, 44, 110] as const;

// ─── Spacing ────────────────────────────────────────────────────
// 4px rhythm. Only these values.

export const spacing = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 24,
  6: 32,
  7: 48,
  8: 64,
} as const;

// ─── Radius ─────────────────────────────────────────────────────

export const radius = {
  tag: 4,
  button: 7,
  card: 12,
} as const;

// ─── Motion ─────────────────────────────────────────────────────

export const motion = {
  micro: "0.25s",
  response: "0.35s",
  atmosphere: "0.5s",
  ease: "cubic-bezier(0.16, 1, 0.3, 1)",
} as const;

export const EASE = motion.ease;

// ─── Score buckets ──────────────────────────────────────────────

export function scoreColor(score: number): string {
  if (score >= 85) return colors.status.success;
  if (score >= 70) return colors.accent.gold;
  return colors.status.danger;
}
