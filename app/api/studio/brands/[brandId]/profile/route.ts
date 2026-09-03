import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import Socialize, { normalizeSocializeLinks, type SocializeLink } from "@/schemas/Socialize";
import { listAuthorizedBrandScopes } from "@/lib/shared/brand-scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET/PUT /api/studio/brands/[brandId]/profile — §17 Phase 9: the brand's
 * OWNED public profile. Authorization is the Brand Vault scope (the same
 * authority every studio route uses) — NOT the profile's creator. The
 * profile keeps its unique username, so the existing public page
 * (/profile/<username>) serves it unchanged. User-owned (legacy) profiles
 * are never readable or writable here.
 */

const USERNAME_RE = /^[a-z0-9][a-z0-9-]{2,29}$/;
const ACCENTS = new Set(["gold", "cyan", "rose", "green", "purple", "coral"]);

async function authorize(userId: string, orgId: string | null, brandId: string): Promise<boolean> {
  const scopes = await listAuthorizedBrandScopes({ userId, orgId });
  return scopes.some((s) => s.brandId === brandId);
}

export async function GET(_req: Request, { params }: { params: Promise<{ brandId: string }> }) {
  if (process.env.STUDIO_REAL_TURNS !== "1") {
    return NextResponse.json({ error: "studio_real_turns_disabled" }, { status: 503 });
  }
  const { userId, orgId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { brandId } = await params;

  try {
    if (!(await authorize(userId, orgId ?? null, brandId))) {
      return NextResponse.json({ error: "brand_access_denied" }, { status: 403 });
    }
    const doc = (await Socialize.findOne({ brandId }).lean()) as unknown as { username: string; bio: string; status: string; accentColor: string; links: SocializeLink[] } | null;
    if (!doc) return NextResponse.json({ profile: null });
    const { username, bio, status, accentColor, links } = doc as { username: string; bio: string; status: string; accentColor: string; links: SocializeLink[] };
    return NextResponse.json({ profile: { username, bio, status, accentColor, links } });
  } catch (error) {
    console.error("[studio/brands/:id/profile] read failed", error);
    return NextResponse.json({ error: "profile_unavailable" }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ brandId: string }> }) {
  if (process.env.STUDIO_REAL_TURNS !== "1") {
    return NextResponse.json({ error: "studio_real_turns_disabled" }, { status: 503 });
  }
  const { userId, orgId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { brandId } = await params;

  const body = (await req.json().catch(() => null)) as
    | { username?: string; bio?: string; status?: string; accentColor?: string; links?: SocializeLink[] }
    | null;
  if (!body) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  try {
    if (!(await authorize(userId, orgId ?? null, brandId))) {
      return NextResponse.json({ error: "brand_access_denied" }, { status: 403 });
    }
    const existing = (await Socialize.findOne({ brandId })) as unknown as { _id: unknown; username?: string; bio?: string; status?: string; accentColor?: string; links?: SocializeLink[] } | null;

    /* username: validated, and never stolen from another profile */
    let username = existing?.username;
    if (body.username !== undefined) {
      const requested = String(body.username).trim().toLowerCase();
      if (!USERNAME_RE.test(requested)) {
        return NextResponse.json({ error: "invalid_username" }, { status: 400 });
      }
      const clash = await Socialize.findOne({ username: requested, ...(existing ? { _id: { $ne: existing._id } } : {}) }).lean();
      if (clash) return NextResponse.json({ error: "username_taken" }, { status: 409 });
      username = requested;
    }
    if (!username) {
      return NextResponse.json({ error: "username_required" }, { status: 400 });
    }

    const bio = body.bio !== undefined ? String(body.bio).slice(0, 256) : (existing?.bio ?? "");
    const status = body.status !== undefined ? String(body.status).slice(0, 50) : (existing?.status ?? "");
    const accentColor = body.accentColor !== undefined && ACCENTS.has(String(body.accentColor)) ? String(body.accentColor) : (existing?.accentColor ?? "gold");
    const links = body.links !== undefined ? normalizeSocializeLinks(Array.isArray(body.links) ? body.links.slice(0, 50) : []) : (existing?.links ?? []);

    const doc = (await Socialize.findOneAndUpdate(
      { brandId },
      { $set: { username, bio, status, accentColor, links, ...(existing ? {} : { clerkUserId: userId }) } },
      { upsert: true, new: true },
    ).lean()) as unknown as { username?: string; bio?: string; status?: string; accentColor?: string; links?: SocializeLink[] } | null;

    return NextResponse.json({ profile: { username: doc?.username, bio: doc?.bio, status: doc?.status, accentColor: doc?.accentColor, links: doc?.links } });
  } catch (error) {
    console.error("[studio/brands/:id/profile] write failed", error);
    return NextResponse.json({ error: "profile_write_failed" }, { status: 500 });
  }
}
