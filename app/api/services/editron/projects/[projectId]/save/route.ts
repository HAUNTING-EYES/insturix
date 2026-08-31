/**
 * POST /api/services/editron/projects/[projectId]/save
 * Manual save project
 */

import { NextRequest, NextResponse } from "next/server";
import {
  ProjectMutationConflictError,
  ProjectMutationWriteError,
  ProjectNotFoundOrForbiddenError,
  projectService,
} from "@/lib/editron/services/project-service";
import {
  createEditronUserOverrideLearningEvent,
  type EditronUserOverrideKind,
} from "@/lib/editron/services/editron-brand-learning-events";
import {
  isValidEditorTimelineMarkers,
  type EditorTimelineMarker,
} from "@/lib/editron/shared/project-save-payload";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";

export const runtime = "nodejs";

// Input validation schema
const SaveProjectSchema = z
  .object({
    expectedRevision: z
      .object({
        schemaVersion: z.literal(1),
        value: z.number().int().nonnegative(),
        compatibilityUpdatedAt: z.string().datetime(),
      })
      .strict(),
    overlays: z.array(z.any()),
    aspectRatio: z.string(),
    playerDimensions: z.object({
      width: z.number().positive(),
      height: z.number().positive(),
    }),
    fps: z.number().positive().optional(),
    durationInFrames: z.number().nonnegative().optional(),
    markers: z
      .custom<EditorTimelineMarker[]>(
        (value) => isValidEditorTimelineMarkers(value),
        { message: "Invalid editor timeline markers" },
      )
      .optional(),
  })
  .strict()
  .superRefine((state, context) => {
    if (
      isValidEditorTimelineMarkers(state.markers)
      && !isValidEditorTimelineMarkers(state.markers, state.durationInFrames)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["markers"],
        message: "Marker frame must be before durationInFrames",
      });
    }
  });

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }
    const { projectId } = await params;

    // Validate projectId format
    if (!projectId || projectId.trim() === "") {
      return NextResponse.json(
        { success: false, error: "Invalid project ID" },
        { status: 400 },
      );
    }

    const body = await request.json();

    // Validate input
    const validationResult = SaveProjectSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid project data",
          details: validationResult.error.issues,
        },
        { status: 400 },
      );
    }

    const { expectedRevision, ...state } = validationResult.data;

    // ─── Overlay diff: detect added/removed assets + overrides ─────
    // Load previous state BEFORE save so we can diff
    let previousOverlays: OverlayLike[] | null = null;
    try {
      const prev = await projectService.loadProject(userId, projectId);
      if (prev?.overlays) {
        // Safe upcast: Overlay[] → OverlayLike[] (OverlayLike is a subset of Overlay's shape)
        previousOverlays = prev.overlays as OverlayLike[];
      }
    } catch (diffLoadErr: unknown) {
      // Save MUST proceed even if diff loading fails, but make the failure visible.
      const msg =
        diffLoadErr instanceof Error
          ? diffLoadErr.message
          : String(diffLoadErr);
      console.warn(
        `[Save] Overlay diff pre-load failed: ${msg}. Save proceeds without graph diff.`,
      );
    }

    // Zod's z.any() overlays can't express the full EditorState type.
    // This is the one legitimate cast — the Zod schema validates structure,
    // but saveProjectWithReceipt expects the full EditorState interface.
    const receipt = await projectService.saveProjectWithReceipt(
      userId,
      projectId,
      state as Parameters<typeof projectService.saveProjectWithReceipt>[2],
      { expectedRevision, overlayAuthority: "client" },
    );

    // Await graph dispatch after save (non-blocking pattern — errors don't fail save)
    if (previousOverlays) {
      void dispatchOverlayDiff(
        userId,
        projectId,
        previousOverlays,
        state.overlays as OverlayLike[],
      ).catch((err: Error) =>
        console.warn(`[Save] Graph diff dispatch failed: ${err.message}`),
      );
    }

    return NextResponse.json({
      success: true,
      savedAt: receipt.committedAt,
      revision: receipt.revision,
    });
  } catch (error: unknown) {
    if (error instanceof ProjectMutationConflictError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: error.code,
            message: error.message,
            currentRevision: error.currentRevision,
          },
        },
        { status: 409 },
      );
    }
    if (error instanceof ProjectNotFoundOrForbiddenError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: 404 },
      );
    }
    if (error instanceof ProjectMutationWriteError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: 500 },
      );
    }
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("Error saving project:", errMsg);
    return NextResponse.json(
      { success: false, error: errMsg || "Failed to save project" },
      { status: 500 },
    );
  }
}

// ─── Overlay Diff + Override Detection ───────────────────────────
// Minimal overlay shape — covers the fields we actually access.
// Avoids `as any` casts (Rule 12N) while remaining compatible with
// the untyped Zod `z.array(z.any())` output from SaveProjectSchema.
interface OverlayLike {
  id: number | string;
  type: string;
  from?: number;
  durationInFrames?: number;
  row?: number;
  assetId?: string;
  transitionStyle?: string;
  filterPresetId?: string;
  metadata?: {
    assetId?: string;
    sceneIndex?: number;
    mood?: string;
    transitionType?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface DetectedEditronOverride {
  kind: EditronUserOverrideKind;
  label: string;
  beforeValue: unknown;
  afterValue: unknown;
  overlayId?: string | number;
}

async function dispatchOverlayDiff(
  userId: string,
  projectId: string,
  prevOverlays: OverlayLike[],
  newOverlays: OverlayLike[],
) {
  const qstashToken = process.env.QSTASH_TOKEN;
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const graphSyncUrl = `${baseUrl}/api/internal/workers/graph-sync`;

  const getAssetIds = (overlays: OverlayLike[]) =>
    new Set(
      overlays
        .filter(
          (o) =>
            (o.type === "video" || o.type === "image") && o.metadata?.assetId,
        )
        .map((o) => o.metadata!.assetId as string),
    );

  const prevAssets = getAssetIds(prevOverlays);
  const newAssets = getAssetIds(newOverlays);

  const dispatchGraphSync = async (
    action: string,
    data: Record<string, unknown>,
  ) => {
    await fetch(
      `${process.env.QSTASH_URL || "https://qstash.upstash.io"}/v2/publish/${graphSyncUrl}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${qstashToken}`,
          "Content-Type": "application/json",
          "Upstash-Retries": "2",
        },
        body: JSON.stringify({ action, data }),
      },
    );
  };

  if (qstashToken) {
    for (const assetId of newAssets) {
      if (!prevAssets.has(assetId)) {
        const overlay = newOverlays.find(
          (o) => o.metadata?.assetId === assetId,
        );
        try {
          await dispatchGraphSync("asset_used", {
            assetId,
            projectId,
            props: {
              sceneId: `${projectId}_user_add_${Date.now()}`,
              sceneIndex: overlay?.metadata?.sceneIndex ?? 0,
              trimStart: null,
              trimEnd: null,
              role: "hero",
              filterApplied: null,
              wasKept: true,
            },
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(`[Save] USED_IN dispatch failed for ${assetId}: ${msg}`);
        }
      }
    }

    for (const assetId of prevAssets) {
      if (!newAssets.has(assetId)) {
        const prevOverlay = prevOverlays.find(
          (o) => o.metadata?.assetId === assetId,
        );
        try {
          await dispatchGraphSync("asset_removed", {
            assetId,
            projectId,
            sceneIndex: prevOverlay?.metadata?.sceneIndex ?? null,
            removedAt: new Date().toISOString(),
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(
            `[Save] REMOVED_FROM dispatch failed for ${assetId}: ${msg}`,
          );
        }
      }
    }
  }

  const overrides: DetectedEditronOverride[] = [];

  const getTransitions = (overlays: OverlayLike[]) =>
    overlays
      .filter((o) => o.type === "transition")
      .map((o) => ({
        id: o.id,
        type: o.transitionStyle || o.metadata?.transitionType || null,
      }));

  const prevTrans = getTransitions(prevOverlays);
  const newTrans = getTransitions(newOverlays);

  for (const nt of newTrans) {
    const pt = prevTrans.find((p) => p.id === nt.id);
    if (pt && pt.type !== nt.type) {
      overrides.push({
        kind: "transition_style",
        label: `transition changed from ${pt.type} to ${nt.type}`,
        beforeValue: pt.type,
        afterValue: nt.type,
        overlayId: nt.id,
      });
    }
  }

  const getFilter = (overlays: OverlayLike[]) =>
    overlays
      .filter((o) => o.type === "video" && o.filterPresetId)
      .map((o) => ({
        id: o.id,
        type: o.filterPresetId!,
      }));
  const prevFilters = getFilter(prevOverlays);
  const newFilters = getFilter(newOverlays);
  if (
    prevFilters.length > 0 &&
    newFilters.length > 0 &&
    prevFilters[0].type !== newFilters[0].type
  ) {
    overrides.push({
      kind: "filter_preset",
      label: `filter changed from ${prevFilters[0].type} to ${newFilters[0].type}`,
      beforeValue: prevFilters[0].type,
      afterValue: newFilters[0].type,
      overlayId: newFilters[0].id,
    });
  }

  if (overrides.length === 0) return;

  const observedAt = new Date().toISOString();
  const overrideLabels = overrides.map((override) => override.label);
  let brandId: string | undefined;
  let groupId = userId;

  try {
    const { getDatabase } = await import("@/lib/editron/db/mongodb");
    const db = await getDatabase();
    const projDoc = await db
      .collection("projects")
      .findOne({ projectId }, { projection: { brandId: 1 } });
    if (
      typeof projDoc?.brandId === "string" &&
      projDoc.brandId.trim().length > 0
    ) {
      brandId = projDoc.brandId;
      groupId = brandId;
    }
  } catch {
    console.warn(
      `[Save] brandId lookup failed for project ${projectId}, falling back to userId`,
    );
  }

  try {
    const { addGraphitiEpisode } = await import(
      "@/lib/editron/services/graph-service"
    );
    await addGraphitiEpisode({
      type: "user_override",
      name: `override_${projectId}_${Date.now()}`,
      body: `User made ${overrides.length} editing overrides on project ${projectId}: ${overrideLabels.join(". ")}.`,
      sourceDescription: "user_override",
      groupId,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[Save] Override episode dispatch failed: ${msg}`);
  }

  try {
    const { emitBrandEvent } = await import("@/lib/shared/brand-events");
    const learningEvents = overrides.map((override) =>
      createEditronUserOverrideLearningEvent({
        userId,
        brandId,
        projectId,
        observedAt,
        kind: override.kind,
        beforeValue: override.beforeValue,
        afterValue: override.afterValue,
        overlayId: override.overlayId,
        note: override.label,
      }),
    );

    await emitBrandEvent({
      userId,
      brandId,
      projectId,
      service: "editron",
      type: "user_override",
      payload: {
        shadowEventType: "save_overlay_diff",
        overrideCount: overrides.length,
        overrides: overrides.map((override) => ({
          kind: override.kind,
          label: override.label,
          beforeValue: override.beforeValue,
          afterValue: override.afterValue,
          overlayId: override.overlayId,
        })),
        learningEvents,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[Save] Brand override event dispatch failed: ${msg}`);
  }
}
