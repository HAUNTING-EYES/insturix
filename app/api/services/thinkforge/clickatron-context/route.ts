import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import * as db from "@/lib/thinkforge/services/db";
import { createProjectLink, findLinkBySessionId } from "@/lib/shared/project-links";
import {
  buildThinkToClickContext,
  findClickatronCreativeSpecInBlocks,
  toNonEmptyString,
  type ThinkToClickVisibleContentChoices,
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

    const rawVisualChoices =
      body.userVisualChoices && typeof body.userVisualChoices === "object" && !Array.isArray(body.userVisualChoices)
        ? body.userVisualChoices as Record<string, unknown>
        : body;
    const userVisualChoices: ThinkToClickVisibleContentChoices = {
      kind: toNonEmptyString(rawVisualChoices.kind) as ThinkToClickVisibleContentChoices["kind"],
      platform: toNonEmptyString(rawVisualChoices.platform) as ThinkToClickVisibleContentChoices["platform"],
      aspectRatio: toNonEmptyString(rawVisualChoices.aspectRatio) || toNonEmptyString(body.aspectRatio),
      visualMode: toNonEmptyString(rawVisualChoices.visualMode) as ThinkToClickVisibleContentChoices["visualMode"],
      textDensity: toNonEmptyString(rawVisualChoices.textDensity) as ThinkToClickVisibleContentChoices["textDensity"],
      vibe: toNonEmptyString(rawVisualChoices.vibe),
      imageStyle: toNonEmptyString(rawVisualChoices.imageStyle),
      notes: toNonEmptyString(rawVisualChoices.notes),
    };

    const context = buildThinkToClickContext({
      sessionId,
      scriptId: requestedScriptId,
      projectId: requestedProjectId,
      projectMeta,
      projectLink,
      creativeSpec: findClickatronCreativeSpecInBlocks(script?.blocks),
      blocks: script?.blocks,
      userVisualChoices,
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
