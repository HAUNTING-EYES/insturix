import { resolveEffectiveBrandWithProfile } from "@/lib/shared/brand-effective-resolver";

/**
 * Derive a brand's public "niche" from its Brand Vault — the same derivation the AI-planner uses
 * (voice.nicheMap → visual.industry → name). This is what trend discovery searches on, so it should
 * come from the vault, never from the user typing it. Best-effort: returns "" if the vault can't be
 * resolved or has nothing usable, and the caller decides what to do (ask for a manual niche only then).
 */
export async function resolveBrandNiche(scope: {
  ownerUserId: string;
  orgId?: string | null;
  brandId: string;
}): Promise<string> {
  try {
    const { brand } = await resolveEffectiveBrandWithProfile(scope.ownerUserId, scope.brandId, {
      service: "thinkforge",
      enabled: true,
      orgId: scope.orgId ?? null,
    });
    const niche = brand?.voice?.nicheMap || brand?.visual?.industry || brand?.name || "";
    return typeof niche === "string" ? niche.trim() : "";
  } catch {
    return "";
  }
}
