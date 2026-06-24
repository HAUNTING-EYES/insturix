/**
 * Resolve the brand context block for a CalOS generation: the RICH accepted Brand Vault profile
 * (confidence-gated), falling back to the thin legacy brand, then to empty. Best-effort — a brand
 * resolve failure must never block generation. Shared by the post writer + the script writer so the
 * dead-wire fix (read the accepted profile, not the lossy projection) lives in one place.
 */
export async function resolveSystemBrief(ownerUserId: string, brandId: string): Promise<string> {
  try {
    const { resolveEffectiveBrandWithProfile } = await import("@/lib/shared/brand-effective-resolver");
    const { buildBrandContextBlock, buildRichBrandContextBlock } = await import(
      "@/lib/shared/brand-context-block"
    );
    // enabled:true forces the vault on regardless of the per-service rollout flag.
    const { brand, acceptedProfile } = await resolveEffectiveBrandWithProfile(ownerUserId, brandId, {
      service: "thinkforge",
      enabled: true,
    });
    return acceptedProfile
      ? buildRichBrandContextBlock(acceptedProfile, brand)
      : buildBrandContextBlock(brand);
  } catch (e) {
    console.warn("[CalOS] brand resolve failed:", e);
    return "";
  }
}
