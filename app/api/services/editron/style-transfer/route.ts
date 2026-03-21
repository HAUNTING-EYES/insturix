/**
 * POST /api/services/editron/style-transfer
 *   Extract Edit DNA style profile from a reference video.
 *
 * PUT /api/services/editron/style-transfer
 *   Apply a previously extracted Edit DNA style profile to a project.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  extractEditDNA,
  applyEditDNA,
  loadProfile,
  listProfiles,
} from "@/lib/editron/services/style-transfer-service";

export const runtime = "nodejs";
export const maxDuration = 120; // video analysis can be slow

/* ------------------------------------------------------------------ */
/*  POST — Extract Edit DNA from a reference video                     */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const body = await request.json();
    const { videoOverlayId, videoUrl, sourceName, projectId } = body as {
      videoOverlayId?: string;
      videoUrl?: string;
      sourceName?: string;
      projectId?: string;
    };

    if (!videoOverlayId && !videoUrl) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Either videoOverlayId (with projectId) or videoUrl is required",
        },
        { status: 400 },
      );
    }

    if (videoOverlayId && !projectId) {
      return NextResponse.json(
        { success: false, error: "projectId is required when using videoOverlayId" },
        { status: 400 },
      );
    }

    const dna = await extractEditDNA({
      videoOverlayId,
      videoUrl,
      sourceName,
      userId,
      projectId,
    });

    return NextResponse.json({
      success: true,
      profile: dna,
    });
  } catch (error: any) {
    console.error("[style-transfer/POST] Error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Internal server error" },
      { status: 500 },
    );
  }
}

/* ------------------------------------------------------------------ */
/*  PUT — Apply Edit DNA to a project                                  */
/* ------------------------------------------------------------------ */

export async function PUT(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const body = await request.json();
    const { profileId, projectId } = body as {
      profileId: string;
      projectId: string;
    };

    if (!profileId || !projectId) {
      return NextResponse.json(
        { success: false, error: "profileId and projectId are required" },
        { status: 400 },
      );
    }

    const dna = await loadProfile(userId, profileId);
    if (!dna) {
      return NextResponse.json(
        { success: false, error: `Style profile '${profileId}' not found` },
        { status: 404 },
      );
    }

    const plan = await applyEditDNA(projectId, userId, dna);

    return NextResponse.json({
      success: true,
      plan,
      profile: dna,
    });
  } catch (error: any) {
    console.error("[style-transfer/PUT] Error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Internal server error" },
      { status: 500 },
    );
  }
}

/* ------------------------------------------------------------------ */
/*  GET — List saved style profiles for the user                       */
/* ------------------------------------------------------------------ */

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const profiles = await listProfiles(userId);

    return NextResponse.json({
      success: true,
      profiles,
    });
  } catch (error: any) {
    console.error("[style-transfer/GET] Error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Internal server error" },
      { status: 500 },
    );
  }
}
