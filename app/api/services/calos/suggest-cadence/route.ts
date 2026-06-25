import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { resolveEffectiveBrand } from "@/lib/shared/brand-effective-resolver";
import { suggestCadence } from "@/lib/calos/cadence-suggest";

export const dynamic = "force-dynamic";

/**
 * GET /api/services/calos/suggest-cadence?brandId=...
 * Returns a brand-aware suggested weekly cadence { rules, rationale } for the user to confirm or
 * edit before a campaign is created. Read-only — suggests nothing is persisted here.
 */
export async function GET(req: NextRequest) {
  const { userId, orgId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const brandId = req.nextUrl.searchParams.get("brandId");
  if (!brandId) return NextResponse.json({ error: "brandId is required" }, { status: 400 });

  // Best-effort brand resolution; suggestCadence falls back to the default when brand is null.
  const brand = await resolveEffectiveBrand(userId, brandId, { service: "thinkforge", orgId: orgId ?? null }).catch(
    (e) => {
      // TODO(CALOS_LOUD): remove once stable.
      console.error("[CALOS_LOUD] suggest-cadence: brand resolve failed (default cadence fallback):", e);
      return null;
    },
  );
  return NextResponse.json(suggestCadence(brand));
}
