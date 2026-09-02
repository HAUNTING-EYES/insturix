import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { connectSpine, getOrCreateProject, ProjectModel } from "@/lib/studio/persist/db";
import { computeProjectStatus, listNeedsYouProjects } from "@/lib/studio/persist/status";
import { authorizeBrandScope, BrandScopeAuthorizationError } from "@/lib/shared/brand-scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/studio/projects — create the persisted Project BEFORE work begins
 * (plan §7 Home): submitting the Home composer lands on a real project id,
 * never a mock or the del_live placeholder. Title defaults from the prompt.
 */

const CreateProjectSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  brandId: z.string().trim().min(1).max(120).optional(),
});

/**
 * GET /api/studio/projects?attention=needs_you — the Needs-you index (plan
 * §7): org's projects with open user decisions, derived from operation
 * records. Without the filter: recent projects with computed status.
 */
export async function GET(req: Request) {
  if (process.env.STUDIO_REAL_TURNS !== "1") {
    return NextResponse.json({ error: "studio_real_turns_disabled" }, { status: 503 });
  }
  const { userId, orgId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const wantsNeedsYou = new URL(req.url).searchParams.get("attention") === "needs_you";
  try {
    await connectSpine();
    if (wantsNeedsYou) {
      return NextResponse.json({ projects: await listNeedsYouProjects(orgId ?? null) });
    }
    const recent = (await ProjectModel.find({ organizationId: orgId ?? null }).sort({ updatedAt: -1 }).limit(20).lean()) as unknown as Array<{ _id: unknown; title?: string }>;
    const projects = [];
    for (const p of recent) {
      const projectId = String(p._id);
      projects.push({ projectId, title: p.title ?? "Project", status: await computeProjectStatus(projectId) });
    }
    return NextResponse.json({ projects });
  } catch (error) {
    console.error("[spine] projects list failed", error);
    return NextResponse.json({ error: "spine_unavailable" }, { status: 503 });
  }
}

export async function POST(req: Request) {
  if (process.env.STUDIO_REAL_TURNS !== "1") {
    return NextResponse.json({ error: "studio_real_turns_disabled" }, { status: 503 });
  }
  const { userId, orgId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = CreateProjectSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    /* §19: brand-scoped create — a brandId the caller has no accepted Brand
     * Vault record for is denied outright, never silently stamped. */
    let acceptedBrandRevision: string | null = null;
    if (parsed.data.brandId) {
      try {
        const scope = await authorizeBrandScope({ userId, orgId: orgId ?? null, brandId: parsed.data.brandId });
        acceptedBrandRevision = scope.recordId ?? scope.acceptedRecord?.id ?? null;
      } catch (error) {
        if (error instanceof BrandScopeAuthorizationError) {
          return NextResponse.json({ error: "brand_access_denied", brandId: parsed.data.brandId }, { status: 403 });
        }
        throw error;
      }
    }
    await connectSpine();
    const project = await getOrCreateProject({
      projectId: null,
      organizationId: orgId ?? null,
      brandId: parsed.data.brandId ?? null,
      title: parsed.data.title ?? "New project",
      acceptedBrandRevision,
    });
    return NextResponse.json({ projectId: project.projectId, title: project.title, phase: project.phase });
  } catch (error) {
    console.error("[spine] project create failed", error);
    return NextResponse.json({ error: "spine_unavailable" }, { status: 503 });
  }
}
