/**
 * POST /api/internal/migrate-audio
 *
 * One-time migration: copies BGM/SFX overlays from state.overlays
 * to the top-level overlays array for all projects that have audio
 * stuck in the wrong location.
 *
 * Safe to run multiple times — checks for duplicates by assetId.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDatabase, COLLECTIONS } from '@/lib/editron/db/mongodb';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const db = await getDatabase();

    // Find all projects that have sound overlays in state.overlays
    const projects = await db.collection(COLLECTIONS.PROJECTS).find({
      'state.overlays': { $elemMatch: { type: 'sound', row: { $in: [5, 6] } } },
    }).toArray();

    console.log(`[migrate-audio] Found ${projects.length} projects with audio in state.overlays`);

    let migrated = 0;
    let skipped = 0;

    for (const project of projects) {
      const stateOverlays = (project as any).state?.overlays || [];
      const topOverlays = (project as any).overlays || [];

      // Find audio overlays in state.overlays (BGM=row5, SFX=row6)
      const audioInState = stateOverlays.filter(
        (o: any) => o.type === 'sound' && (o.row === 5 || o.row === 6),
      );

      if (audioInState.length === 0) continue;

      // Check which ones are already in top-level overlays (by assetId)
      const existingAssetIds = new Set(
        topOverlays
          .filter((o: any) => o.type === 'sound')
          .map((o: any) => o.assetId),
      );

      const toMigrate = audioInState.filter(
        (o: any) => !existingAssetIds.has(o.assetId),
      );

      if (toMigrate.length === 0) {
        skipped++;
        continue;
      }

      // Push missing audio overlays to top-level overlays
      await db.collection(COLLECTIONS.PROJECTS).updateOne(
        { projectId: (project as any).projectId },
        {
          $push: { overlays: { $each: toMigrate } },
          $set: { updatedAt: new Date() },
        },
      );

      console.log(`[migrate-audio] ${(project as any).projectId}: migrated ${toMigrate.length} audio overlays`);
      migrated++;
    }

    return NextResponse.json({
      success: true,
      projectsChecked: projects.length,
      projectsMigrated: migrated,
      projectsSkipped: skipped,
    });
  } catch (error: any) {
    console.error('[migrate-audio] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
