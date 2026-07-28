import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/editron/db/mongodb";
import { getDefaultBrandVaultRefineryStore } from "@/lib/shared/brand-vault-refinery-api";

const EDITRON_BRANDS_COLLECTION = "brands";

export interface CalosBrandAccessSession {
  userId: string;
  orgId?: string | null;
  isOrgAdmin?: boolean;
}

export interface CalosBrandAccessLookups {
  ownsEditronBrand: (userId: string, brandId: string) => Promise<boolean>;
  canAccessVaultBrand: (session: CalosBrandAccessSession, brandId: string) => Promise<boolean>;
}

export type CalosBrandAccessDecision =
  | { allowed: true; source: "personal" | "editron" | "brand_vault" }
  | {
      allowed: false;
      status: 403 | 503;
      code: "brand_forbidden" | "brand_access_unavailable";
      error: string;
    };

const defaultLookups: CalosBrandAccessLookups = {
  async ownsEditronBrand(userId, brandId) {
    const db = await getDatabase();
    const brand = await db
      .collection(EDITRON_BRANDS_COLLECTION)
      .findOne({ brandId, userId }, { projection: { _id: 1 } });
    return Boolean(brand);
  },

  async canAccessVaultBrand(session, brandId) {
    const store = getDefaultBrandVaultRefineryStore();
    if (!store.listAcceptedBrands) {
      throw new Error("Brand Vault store cannot list accepted brands");
    }
    const brands = await store.listAcceptedBrands(
      session.orgId
        ? {
            orgId: session.orgId,
            userId: session.userId,
            isOrgAdmin: session.isOrgAdmin === true,
          }
        : { orgId: null, userId: session.userId },
    );
    return brands.some((brand) => brand.brandId === brandId);
  },
};

function isPersonalBrand(session: CalosBrandAccessSession, brandId: string): boolean {
  return brandId === "default" || brandId === `default_${session.userId}`;
}

export async function checkCalosBrandAccess(
  session: CalosBrandAccessSession,
  brandId: string,
  lookups: CalosBrandAccessLookups = defaultLookups,
): Promise<CalosBrandAccessDecision> {
  const normalizedBrandId = brandId.trim();
  if (isPersonalBrand(session, normalizedBrandId)) {
    return { allowed: true, source: "personal" };
  }

  const [editron, vault] = await Promise.allSettled([
    lookups.ownsEditronBrand(session.userId, normalizedBrandId),
    lookups.canAccessVaultBrand(session, normalizedBrandId),
  ]);

  if (editron.status === "fulfilled" && editron.value) {
    return { allowed: true, source: "editron" };
  }
  if (vault.status === "fulfilled" && vault.value) {
    return { allowed: true, source: "brand_vault" };
  }

  const failures = [editron, vault].filter(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (failures.length > 0) {
    console.error("[CalOS:brand-access] authorization lookup failed", {
      brandId: normalizedBrandId,
      userId: session.userId,
      orgId: session.orgId ?? null,
      failures: failures.map((failure) =>
        failure.reason instanceof Error ? failure.reason.message : String(failure.reason),
      ),
    });
    return {
      allowed: false,
      status: 503,
      code: "brand_access_unavailable",
      error: "Brand access could not be verified",
    };
  }

  return {
    allowed: false,
    status: 403,
    code: "brand_forbidden",
    error: "You do not have access to this brand",
  };
}

export async function requireCalosBrandAccess(
  session: CalosBrandAccessSession,
  brandId: string,
): Promise<NextResponse | null> {
  const decision = await checkCalosBrandAccess(session, brandId);
  if (decision.allowed) return null;
  return NextResponse.json(
    { success: false, code: decision.code, error: decision.error },
    { status: decision.status },
  );
}
