/**
 * POST /api/services/editron/debug/simulate-assembly
 *
 * Takes parsed scenes and runs scene-to-editron.ts to show
 * what overlays would be created — without generating any media.
 * $0 cost, instant response.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { scenesToOverlays, scenesToTotalFrames, ROW } from '@/lib/pipeline/scene-to-editron';

export const maxDuration = 10;

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Auth required' }, { status: 401 });
    }

    const body = await request.json();
    const { scenes, fps = 30, width = 1920, height = 1080 } = body;

    if (!scenes || !Array.isArray(scenes)) {
      return NextResponse.json({ error: 'scenes array required' }, { status: 400 });
    }

    // Run the assembly (no media, just overlay structure)
    const overlays = scenesToOverlays(scenes, { fps, width, height });
    const totalFrames = scenesToTotalFrames(scenes, fps);

    // Analyze the result
    const overlaysByRow: Record<number, number> = {};
    const overlaysByType: Record<string, number> = {};
    for (const o of overlays) {
      overlaysByRow[o.row] = (overlaysByRow[o.row] || 0) + 1;
      overlaysByType[o.type] = (overlaysByType[o.type] || 0) + 1;
    }

    return NextResponse.json({
      overlays,
      totalFrames,
      totalDurationSeconds: Math.round(totalFrames / fps),
      overlayCount: overlays.length,
      overlaysByRow,
      overlaysByType,
      rowLayout: ROW,
      inputSceneCount: scenes.length,
    });
  } catch (err: any) {
    console.error('[SimulateAssembly] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
