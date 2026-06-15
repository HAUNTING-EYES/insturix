import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import * as db from "@/lib/thinkforge/services/db";
import { createProjectLink, findLinkBySessionId } from "@/lib/shared/project-links";
import {
  buildThinkToClickContext,
  findClickatronCreativeSpecInBlocks,
  toNonEmptyString,
} from "@/lib/thinkforge/clickatron-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { userId, orgId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    body = parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const sessionId = toNonEmptyString(body.sessionId);
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  try {
    const session = await db.getSession(sessionId, userId, orgId);
    if (!session) {
      return NextResponse.json({ error: "ThinkForge session not found" }, { status: 404 });
    }

    const projectMeta = session.projectMeta || {};
    const requestedScriptId = toNonEmptyString(body.scriptId);
    const requestedProjectId = toNonEmptyString(body.projectId);
    const script = await db.getScript(sessionId, requestedScriptId || null);
    let projectLink = await findLinkBySessionId(userId, sessionId);

    if (!projectLink) {
      projectLink = await createProjectLink(userId, {
        sessionId,
        sourceScriptId: requestedScriptId,
        brandId: toNonEmptyString(projectMeta.brandId),
        metadata: { createdBy: "think-to-click-context" },
      });
    }

    const context = buildThinkToClickContext({
      sessionId,
      scriptId: requestedScriptId,
      projectId: requestedProjectId,
      projectMeta,
      projectLink,
      creativeSpec: findClickatronCreativeSpecInBlocks(script?.blocks),
      signalTrace: script?.metadata?.signalTrace,
      title: toNonEmptyString(body.title),
      aspectRatio: toNonEmptyString(body.aspectRatio),
      scenesCount: typeof body.scenesCount === "number" ? body.scenesCount : undefined,
    });

    return NextResponse.json({ success: true, context });
  } catch (error: any) {
    console.error("[thinkforge/clickatron-context] Error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to resolve ThinkForge Clickatron context" },
      { status: 500 },
    );
  }
}
