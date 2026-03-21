/**
 * POST /api/services/editron/analyze
 *
 * Runs content analysis on all video overlays in a project and returns
 * a structured array of actionable suggestions (silences, fillers,
 * missing captions, missing BGM, audio peaks).
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { projectService } from "@/lib/editron/services/project-service";
import { analyzeContent } from "@/lib/editron/services/media";

export const runtime = "nodejs";
export const maxDuration = 120; // transcription + analysis can be slow

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Suggestion {
  id: string;
  type:
    | "silence"
    | "filler"
    | "no_bgm"
    | "no_captions"
    | "audio_peaks";
  icon: string;
  title: string;
  description: string;
  /** Pre-built prompt the UI can send to the AI chat to apply the fix */
  actionPrompt: string;
  /** Extra payload (counts, timestamps, overlay ids, etc.) */
  meta: Record<string, any>;
}

/* ------------------------------------------------------------------ */
/*  Handler                                                            */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest) {
  try {
    /* ---- auth ---- */
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    /* ---- body ---- */
    const body = await request.json();
    const { projectId } = body as { projectId: string };

    if (!projectId) {
      return NextResponse.json(
        { success: false, error: "projectId is required" },
        { status: 400 }
      );
    }

    /* ---- load project ---- */
    const project = await projectService.loadProject(userId, projectId);
    if (!project) {
      return NextResponse.json(
        { success: false, error: "Project not found" },
        { status: 404 }
      );
    }

    const fps = project.fps || 30;
    const overlays: any[] = project.overlays || [];

    /* ---- gather video overlays ---- */
    const videoOverlays = overlays.filter(
      (o: any) => o.type === "video" && o.assetId
    );

    const suggestions: Suggestion[] = [];
    let suggestionIdx = 0;

    /* ---- run analysis on each video ---- */
    let totalSilences = 0;
    let totalFillers = 0;
    const silenceSegments: any[] = [];
    const fillerSegments: any[] = [];
    const peakTimestamps: string[] = [];
    const analyzedVideoIds: number[] = [];

    for (const overlay of videoOverlays) {
      try {
        const analysis = await analyzeContent(overlay.assetId, userId, {
          silenceThresholdMs: 2000,
          detectFillers: true,
        });

        if (!analysis) continue;
        analyzedVideoIds.push(overlay.id);

        const silences = analysis.silenceGaps || [];
        const fillers = analysis.fillerWords || [];

        totalSilences += silences.length;
        totalFillers += fillers.length;

        for (const gap of silences) {
          const startFrame =
            overlay.from +
            Math.round(((gap.startMs / 1000) - (overlay.videoStartTime || 0)) * fps);
          const endFrame =
            overlay.from +
            Math.round(((gap.endMs / 1000) - (overlay.videoStartTime || 0)) * fps);
          silenceSegments.push({
            videoId: overlay.id,
            startFrame,
            endFrame,
            durationMs: gap.durationMs,
          });
        }

        for (const filler of fillers) {
          fillerSegments.push({
            videoId: overlay.id,
            word: filler.word,
            startMs: filler.startMs,
            endMs: filler.endMs,
          });
        }

        // Simple audio-peak heuristic: look for very short silences (<200ms)
        // surrounded by speech -- these often correlate with volume spikes.
        const problematic = analysis.problematicSegments || [];
        for (const seg of problematic) {
          if (seg.endMs - seg.startMs < 200) {
            const sec = Math.round(seg.startMs / 1000);
            const min = Math.floor(sec / 60);
            const s = sec % 60;
            peakTimestamps.push(
              `${min}:${s.toString().padStart(2, "0")}`
            );
          }
        }
      } catch {
        // Skip overlays that fail (e.g. no transcription available)
        continue;
      }
    }

    /* ---- build suggestions ---- */

    // 1. Silences
    if (totalSilences > 0) {
      const totalMs = silenceSegments.reduce((a, s) => a + s.durationMs, 0);
      const savingSec = Math.round(totalMs / 100) / 10;
      suggestions.push({
        id: `sug_${++suggestionIdx}`,
        type: "silence",
        icon: "\uD83D\uDD07", // muted speaker
        title: `Found ${totalSilences} silence gap${totalSilences > 1 ? "s" : ""} (${savingSec}s)`,
        description: `Remove all silence gaps to tighten the edit and save ~${savingSec} seconds.`,
        actionPrompt: `Remove all silence gaps from the video. There are ${totalSilences} silence gaps totaling ${savingSec}s.`,
        meta: { count: totalSilences, savingsSeconds: savingSec, segments: silenceSegments },
      });
    }

    // 2. Fillers
    if (totalFillers > 0) {
      const uniqueWords = [...new Set(fillerSegments.map((f) => f.word))];
      suggestions.push({
        id: `sug_${++suggestionIdx}`,
        type: "filler",
        icon: "\uD83D\uDDE3\uFE0F", // speaking head
        title: `Found ${totalFillers} filler word${totalFillers > 1 ? "s" : ""} ('${uniqueWords.slice(0, 3).join("', '")}')`,
        description: `Clean up filler words to make the narration sound more polished.`,
        actionPrompt: `Remove all filler words from the video. Found ${totalFillers} filler words including: ${uniqueWords.join(", ")}.`,
        meta: { count: totalFillers, words: uniqueWords, segments: fillerSegments },
      });
    }

    // 3. Missing background music
    const hasAudioOverlay = overlays.some(
      (o: any) => o.type === "sound" || o.type === "audio"
    );
    if (!hasAudioOverlay && videoOverlays.length > 0) {
      suggestions.push({
        id: `sug_${++suggestionIdx}`,
        type: "no_bgm",
        icon: "\uD83C\uDFB5", // musical note
        title: "No background music detected",
        description:
          "Adding ambient background music can make the video feel more professional.",
        actionPrompt:
          "Add subtle ambient background music to the video. Keep volume low so it doesn't overpower speech.",
        meta: {},
      });
    }

    // 4. Missing captions
    const hasCaptions = overlays.some((o: any) => o.type === "caption");
    if (!hasCaptions && videoOverlays.length > 0) {
      suggestions.push({
        id: `sug_${++suggestionIdx}`,
        type: "no_captions",
        icon: "\uD83D\uDCDD", // memo
        title: "No captions found",
        description:
          "Auto-generate captions to improve accessibility and engagement.",
        actionPrompt: `Auto-generate captions for video overlay ${videoOverlays[0].id}.`,
        meta: { videoOverlayId: videoOverlays[0].id },
      });
    }

    // 5. Audio peaks
    if (peakTimestamps.length > 0) {
      const shown = peakTimestamps.slice(0, 5);
      suggestions.push({
        id: `sug_${++suggestionIdx}`,
        type: "audio_peaks",
        icon: "\u26A1", // lightning
        title: `Audio peaks detected at ${shown.join(", ")}${peakTimestamps.length > 5 ? "..." : ""}`,
        description:
          "Normalize audio volume to prevent clipping and ensure consistent levels.",
        actionPrompt:
          "Normalize the audio volume across the entire video to ensure consistent levels.",
        meta: { timestamps: peakTimestamps },
      });
    }

    return NextResponse.json({
      success: true,
      suggestions,
      analyzedVideos: analyzedVideoIds.length,
      totalOverlays: overlays.length,
    });
  } catch (error: any) {
    console.error("[analyze] Error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
