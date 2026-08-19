import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import * as db from "@/lib/thinkforge/services/db";
import { createProjectLink, findLinkBySessionId } from "@/lib/shared/project-links";
import {
  buildThinkToClickContext,
  findClickatronCreativeSpecInBlocks,
  normalizeRequestedCarouselSlideCount,
  toNonEmptyString,
  type ThinkToClickVisibleContentChoices,
} from "@/lib/thinkforge/clickatron-context";
import {
  PersistedWriterOutputError,
  requireCurrentPersistedWriterOutput,
} from "@/lib/thinkforge/persistence/writer-output-reader";
import {
  buildThinkToClickHandoffState,
  type ThinkToClickUserVisualChoices,
} from "@/lib/thinkforge/clickatron-handoff-state";
import {
  CLICKATRON_CREATIVE_KINDS,
  CLICKATRON_PLATFORMS,
  CLICKATRON_TEXT_DENSITIES,
  CLICKATRON_VISUAL_MODES,
} from "@/lib/thinkforge/schemas/clickatron-creative-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readOptionalEnum<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
): T | undefined {
  const parsed = toNonEmptyString(value);
  if (!parsed) return undefined;
  if (!allowed.includes(parsed as T)) {
    throw new Error(`${field} must be one of: ${allowed.join(", ")}`);
  }
  return parsed as T;
}

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
  const scriptId = toNonEmptyString(body.scriptId);
  if (!scriptId) {
    return NextResponse.json({ error: "scriptId is required" }, { status: 400 });
  }
  const operation = body.operation === undefined ? "preview" : toNonEmptyString(body.operation);
  if (operation !== "preview" && operation !== "commit") {
    return NextResponse.json({ error: "operation must be preview or commit" }, { status: 400 });
  }

  const rawVisualChoices =
    body.userVisualChoices && typeof body.userVisualChoices === "object" && !Array.isArray(body.userVisualChoices)
      ? body.userVisualChoices as Record<string, unknown>
      : body;
  let userVisualChoices: ThinkToClickVisibleContentChoices;
  try {
    userVisualChoices = {
      kind: readOptionalEnum(rawVisualChoices.kind, "kind", CLICKATRON_CREATIVE_KINDS),
      platform: readOptionalEnum(rawVisualChoices.platform, "platform", CLICKATRON_PLATFORMS),
      aspectRatio: toNonEmptyString(rawVisualChoices.aspectRatio) || toNonEmptyString(body.aspectRatio),
      visualMode: readOptionalEnum(rawVisualChoices.visualMode, "visualMode", CLICKATRON_VISUAL_MODES),
      textDensity: readOptionalEnum(rawVisualChoices.textDensity, "textDensity", CLICKATRON_TEXT_DENSITIES),
      vibe: toNonEmptyString(rawVisualChoices.vibe),
      imageStyle: toNonEmptyString(rawVisualChoices.imageStyle),
      notes: toNonEmptyString(rawVisualChoices.notes),
      slideCount: normalizeRequestedCarouselSlideCount(rawVisualChoices.slideCount),
    };
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid visual choices" },
      { status: 400 },
    );
  }

  try {
    const session = await db.getSession(sessionId, userId, orgId);
    if (!session) {
      return NextResponse.json({ error: "ThinkForge session not found" }, { status: 404 });
    }

    const canonicalSessionId = String(session._id);
    const projectMeta = session.projectMeta || {};
    const requestedProjectId = toNonEmptyString(body.projectId);
    const script = await db.getScript(canonicalSessionId, scriptId);
    if (!script) {
      return NextResponse.json({ error: "ThinkForge document not found" }, { status: 404 });
    }
    let writerOutput: Record<string, unknown> | undefined;
    try {
      writerOutput = requireCurrentPersistedWriterOutput({
        metadata: script.metadata,
        documentContent: script.content,
        documentVersion: script.version,
      });
    } catch (error) {
      if (error instanceof PersistedWriterOutputError) {
        return NextResponse.json(
          { error: error.message, code: error.code },
          { status: error.code === "writer-output-payload-invalid" ? 422 : 409 },
        );
      }
      throw error;
    }
    let projectLink = await findLinkBySessionId(userId, canonicalSessionId);

    const handoffVisualChoices: ThinkToClickUserVisualChoices = {
      ...userVisualChoices,
      approvedVisualPlan:
        rawVisualChoices.approvedVisualPlan === true
        || rawVisualChoices.approvedVisualPlan === "true",
    };

    const resolveHandoff = (resolvedProjectLink: typeof projectLink) => {
      const context = buildThinkToClickContext({
        sessionId: canonicalSessionId,
        scriptId,
        projectId: requestedProjectId,
        projectMeta,
        contentContract: script.contentContract,
        projectLink: resolvedProjectLink,
        creativeSpec: findClickatronCreativeSpecInBlocks(script?.blocks),
        blocks: script?.blocks,
        userVisualChoices,
        signalTrace: script?.metadata?.signalTrace,
        writerOutput,
        authoringContextSnapshot: script?.metadata?.authoringContextSnapshot,
        title: toNonEmptyString(body.title),
        aspectRatio: toNonEmptyString(body.aspectRatio),
        scenesCount: typeof body.scenesCount === "number" ? body.scenesCount : undefined,
      });
      return {
        context,
        handoffState: buildThinkToClickHandoffState({
          context,
          blocks: script.blocks,
          userVisualChoices: handoffVisualChoices,
        }),
      };
    };

    let resolvedHandoff = resolveHandoff(projectLink);
    if (!projectLink && operation === "commit" && resolvedHandoff.handoffState.canSendToClickatron) {
      projectLink = await createProjectLink(userId, {
        sessionId: canonicalSessionId,
        sourceScriptId: scriptId,
        brandId: toNonEmptyString(projectMeta.brandId),
        metadata: { createdBy: "think-to-click-context" },
      });
      resolvedHandoff = resolveHandoff(projectLink);
    }

    return NextResponse.json({ success: true, operation, ...resolvedHandoff });
  } catch (error: any) {
    console.error("[thinkforge/clickatron-context] Error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to resolve ThinkForge Clickatron context" },
      { status: 500 },
    );
  }
}
