/**
 * POST /api/services/editron/projects/[projectId]/autosave
 * Autosave project (background save)
 */

import { NextRequest, NextResponse } from "next/server";
import {
  ProjectMutationConflictError,
  ProjectMutationWriteError,
  ProjectNotFoundOrForbiddenError,
  projectService,
} from "@/lib/editron/services/project-service";
import {
  isValidEditorTimelineMarkers,
  type EditorTimelineMarker,
} from "@/lib/editron/shared/project-save-payload";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";

export const runtime = "nodejs";

const AutosaveProjectSchema = z
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

    const validation = AutosaveProjectSchema.safeParse(await request.json());
    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid autosave data",
          details: validation.error.issues,
        },
        { status: 400 },
      );
    }
    const { expectedRevision, ...state } = validation.data;

    const receipt = await projectService.autosaveProject(
      userId,
      projectId,
      state as Parameters<typeof projectService.autosaveProject>[2],
      { expectedRevision },
    );

    return NextResponse.json({
      success: true,
      autosavedAt: receipt.committedAt,
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
    const message =
      error instanceof Error ? error.message : "Failed to autosave project";
    console.error("Error autosaving project:", error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
