/**
 * Intent-gated brand reference images for Clickatron image generation (#4 — wire the asset island).
 *
 * The Brand Vault scan populates `assets.productImages` on the accepted profile, but no generator
 * consumed them — they were an island. This module feeds the brand's OWN product imagery into the
 * image model as reference (`image_urls`) so a product mockup is visually faithful to the real brand.
 *
 * Rule 29 (adversarial): brand product images are injected ONLY when the structured creative spec
 * asks for a product mockup (`userIntent.visualMode === 'product_mockup'`). We never guess from the
 * free-text prompt and never inject for any other visual mode — a product shot forced into an
 * unrelated quote card is a damage-8 false positive, so the gate is the explicit intent, full stop.
 */

import { resolveEffectiveBrandWithProfile } from '@/lib/shared/brand-effective-resolver';
import { isBrandSignalActionable, type BrandSignalProfile } from '@/lib/shared/brand-signal-profile';

/** The one visual mode that unambiguously wants the brand's product imagery. */
const VISUAL_MODE_PRODUCT_MOCKUP = 'product_mockup';
/** Cap so reference images steer, not swamp, the model. */
const MAX_BRAND_REFERENCE_IMAGES = 3;

type Maybe = Record<string, unknown> | null | undefined;

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/**
 * Read the STRUCTURED creative intent from generation metadata. Returns 'product' only for an explicit
 * product-mockup spec; 'none' for everything else (including missing/free-text prompts). Navigates the
 * handoff shape (`metadata.clickatron.creativeSpec.userIntent.visualMode`) plus the flatter fallbacks a
 * direct session may carry. Never inspects the free-text prompt (Rule 29).
 */
export function clickatronBrandImageIntentFromMetadata(metadata: Maybe): 'product' | 'none' {
  const root = record(metadata);
  if (!root) return 'none';
  const spec =
    record(record(root.clickatron)?.creativeSpec) ??
    record(root.creativeSpec) ??
    root;
  const userIntent = record(spec.userIntent) ?? spec;
  return userIntent.visualMode === VISUAL_MODE_PRODUCT_MOCKUP ? 'product' : 'none';
}

/**
 * Actionable product-image URLs from an accepted profile, http(s)-validated and capped. Pure.
 * Returns [] when the signal is missing or below the actionable confidence floor (0.55).
 */
export function brandProductReferenceImages(
  profile: BrandSignalProfile | null | undefined,
  max = MAX_BRAND_REFERENCE_IMAGES,
): string[] {
  const signal = profile?.assets?.productImages;
  if (!signal || !isBrandSignalActionable(signal)) return [];
  const urls = Array.isArray(signal.value) ? signal.value : [];
  return urls
    .filter((u): u is string => typeof u === 'string' && /^https?:\/\/\S+/i.test(u.trim()))
    .map((u) => u.trim())
    .slice(0, Math.max(0, max));
}

export interface ResolveClickatronBrandReferenceImagesInput {
  userId: string;
  brandId: string | undefined;
  metadata: Maybe;
  orgId?: string | null;
  max?: number;
  /** Test seam: override the accepted-profile read (defaults to the shared effective-brand resolver). */
  resolveProfile?: (
    userId: string,
    brandId: string,
    orgId?: string | null,
  ) => Promise<BrandSignalProfile | null>;
}

/**
 * Intent-gated brand reference images for a Clickatron generation. Returns [] unless the creative spec
 * asks for a product mockup AND the brand has actionable product imagery. The intent check runs BEFORE
 * any DB read, so non-product generations pay nothing. Fail-soft: any resolution error → [].
 */
export async function resolveClickatronBrandReferenceImages(
  input: ResolveClickatronBrandReferenceImagesInput,
): Promise<string[]> {
  const brandId = input.brandId?.trim();
  if (!brandId) return [];
  if (clickatronBrandImageIntentFromMetadata(input.metadata) !== 'product') return [];

  try {
    const profile = input.resolveProfile
      ? await input.resolveProfile(input.userId, brandId, input.orgId)
      : (
          await resolveEffectiveBrandWithProfile(input.userId, brandId, {
            service: 'clickatron',
            ...(input.orgId !== undefined ? { orgId: input.orgId } : {}),
          })
        ).acceptedProfile;
    return brandProductReferenceImages(profile, input.max);
  } catch (err) {
    console.error('[Clickatron] brand reference image resolution failed (non-fatal)', err);
    return [];
  }
}
