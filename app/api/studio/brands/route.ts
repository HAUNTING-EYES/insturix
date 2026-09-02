import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import CalosConnectedAccount from "@/schemas/calos-connected-account";
import { listAuthorizedBrandScopes } from "@/lib/shared/brand-scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/studio/brands — the Brands place (plan §7): accepted Brand Vault
 * profiles this caller can see, with their connected-account assignments.
 * Read-side only: the vault owns brand truth, CalOS owns assignments; this
 * route aggregates, it never mutates either. Connection HEALTH is not
 * duplicated here — it is platform-scoped and lives in the needs-you queue
 * where it is actionable.
 */

export async function GET() {
  if (process.env.STUDIO_REAL_TURNS !== "1") {
    return NextResponse.json({ error: "studio_real_turns_disabled" }, { status: 503 });
  }
  const { userId, orgId, has } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const isAdmin = Boolean(orgId && has?.({ role: "org:admin" }));
    const [scopes, accounts] = await Promise.all([
      listAuthorizedBrandScopes({ userId, orgId: orgId ?? null, isOrgAdmin: isAdmin }).catch(() => []),
      loadAssignments(userId, orgId ?? null),
    ]);

    const byBrand = new Map<string, Array<{ platform: string; displayName: string | null }>>();
    for (const a of accounts) {
      const list = byBrand.get(a.brandId) ?? [];
      list.push({ platform: a.platform, displayName: a.displayName });
      byBrand.set(a.brandId, list);
    }

    return NextResponse.json({
      brands: scopes.map((s) => ({
        brandId: s.brandId,
        name: s.brandName,
        acceptedAt: s.acceptedAt ?? null,
        updatedAt: s.updatedAt,
        connections: byBrand.get(s.brandId) ?? [],
      })),
    });
  } catch (error) {
    console.error("[studio] brands read failed", error);
    return NextResponse.json({ error: "brands_unavailable" }, { status: 503 });
  }
}

async function loadAssignments(userId: string, orgId: string | null) {
  await connectToDatabase();
  const accounts = (await CalosConnectedAccount.find({ $or: [{ orgId }, { ownerUserId: userId }] })
    .limit(50)
    .lean()) as unknown as Array<{ brandId?: string; platform?: string; displayName?: string | null }>;
  return accounts.flatMap((a) =>
    a.brandId && a.platform ? [{ brandId: a.brandId, platform: a.platform, displayName: a.displayName ?? null }] : [],
  );
}
