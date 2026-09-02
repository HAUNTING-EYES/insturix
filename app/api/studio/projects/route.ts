import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { connectSpine, getOrCreateProject } from "@/lib/studio/persist/db";

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
    await connectSpine();
    const project = await getOrCreateProject({
      projectId: null,
      organizationId: orgId ?? null,
      brandId: parsed.data.brandId ?? null,
      title: parsed.data.title ?? "New project",
    });
    return NextResponse.json({ projectId: project.projectId, title: project.title, phase: project.phase });
  } catch (error) {
    console.error("[spine] project create failed", error);
    return NextResponse.json({ error: "spine_unavailable" }, { status: 503 });
  }
}
