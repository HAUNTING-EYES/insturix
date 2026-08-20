import { z } from "zod";

/**
 * A logo is never generated from text. It is either omitted, or the exact
 * accepted Brand Vault asset is composited after image generation from a
 * user-reviewed layout instruction.
 */
export const CLICKATRON_LOGO_OVERLAY_VERSION = 1;
export const CLICKATRON_LOGO_OVERLAY_TREATMENTS = ["none", "approved_logo"] as const;
export const CLICKATRON_LOGO_OVERLAY_PLACEMENTS = [
  "top_left",
  "top_right",
  "bottom_left",
  "bottom_right",
] as const;
export const CLICKATRON_LOGO_OVERLAY_SCALES = ["small", "medium", "large"] as const;

export type ClickatronLogoOverlayTreatment = typeof CLICKATRON_LOGO_OVERLAY_TREATMENTS[number];
export type ClickatronLogoOverlayPlacement = typeof CLICKATRON_LOGO_OVERLAY_PLACEMENTS[number];
export type ClickatronLogoOverlayScale = typeof CLICKATRON_LOGO_OVERLAY_SCALES[number];

export interface ClickatronLogoOverlayUserChoice {
  logoTreatment?: ClickatronLogoOverlayTreatment;
  logoPlacement?: ClickatronLogoOverlayPlacement;
  logoScale?: ClickatronLogoOverlayScale;
}

export const ClickatronApprovedLogoOverlaySchema = z.object({
  version: z.number().int().default(CLICKATRON_LOGO_OVERLAY_VERSION).refine(
    (value) => value === CLICKATRON_LOGO_OVERLAY_VERSION,
    { message: `Unsupported Clickatron logo overlay version. Expected ${CLICKATRON_LOGO_OVERLAY_VERSION}.` },
  ),
  treatment: z.literal("approved_logo"),
  placement: z.enum(CLICKATRON_LOGO_OVERLAY_PLACEMENTS),
  scale: z.enum(CLICKATRON_LOGO_OVERLAY_SCALES),
  authority: z.literal("user_review"),
});

export type ClickatronApprovedLogoOverlay = z.infer<typeof ClickatronApprovedLogoOverlaySchema>;

export type ClickatronLogoOverlayResolution =
  | { status: "none" }
  | { status: "ready"; overlay: ClickatronApprovedLogoOverlay }
  | { status: "invalid"; message: string };

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

/**
 * Resolves a user-review decision into the immutable worker contract. There is
 * deliberately no default corner, scale, or inferred brand-guideline fallback.
 */
export function resolveClickatronLogoOverlay(
  input: ClickatronLogoOverlayUserChoice | Record<string, unknown> | null | undefined,
): ClickatronLogoOverlayResolution {
  const choice = record(input) || {};
  const treatment = nonEmptyString(choice.logoTreatment);
  if (!treatment || treatment === "none") return { status: "none" };
  if (treatment !== "approved_logo") {
    return { status: "invalid", message: "Choose either no logo or the approved Brand Vault logo." };
  }

  const placement = nonEmptyString(choice.logoPlacement);
  if (!placement || !CLICKATRON_LOGO_OVERLAY_PLACEMENTS.includes(placement as ClickatronLogoOverlayPlacement)) {
    return { status: "invalid", message: "Choose where the approved Brand Vault logo should appear." };
  }

  const scale = nonEmptyString(choice.logoScale);
  if (!scale || !CLICKATRON_LOGO_OVERLAY_SCALES.includes(scale as ClickatronLogoOverlayScale)) {
    return { status: "invalid", message: "Choose the approved Brand Vault logo size." };
  }

  return {
    status: "ready",
    overlay: ClickatronApprovedLogoOverlaySchema.parse({
      treatment,
      placement,
      scale,
      authority: "user_review",
    }),
  };
}

/** Reads only the persisted handoff overlay contract. Free-form prompt text is never layout authority. */
export function readClickatronLogoOverlayFromMetadata(metadata: unknown): ClickatronLogoOverlayResolution {
  const root = record(metadata);
  const handoff = record(root?.clickatronHandoff);
  const overlay = record(handoff?.logoOverlay);
  if (!overlay) return { status: "none" };

  const parsed = ClickatronApprovedLogoOverlaySchema.safeParse(overlay);
  return parsed.success
    ? { status: "ready", overlay: parsed.data }
    : { status: "invalid", message: "The approved Brand Vault logo handoff is malformed." };
}

export function describeClickatronLogoOverlayForGeneration(overlay: ClickatronApprovedLogoOverlay): string {
  return [
    "Brand mark handling: the exact accepted Brand Vault logo is composited after raster generation.",
    `Leave the ${overlay.placement.replace("_", " ")} ${overlay.scale} safe area clear.`,
    "Do not render, redraw, spell, or approximate any logo or brand mark in the raster image.",
  ].join(" ");
}
