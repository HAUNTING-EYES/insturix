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
import {
  ProjectMutationConflictError,
  ProjectNotFoundOrForbiddenError,
  projectService,
} from '@/lib/editron/services/project-service';
import { planLegacyAudioOverlayMigrationV1 } from '@/lib/editron/services/legacy-audio-overlay-migration-v1';

export const runtime = 'nodejs';
export const maxDuration = 60;

type AudioMigrationProject = {
  projectId?: unknown;
  userId?: unknown;
};

export async function POST(request: NextRequest) {
  const migrationSecret = process.env.EDITRON_MIGRATION_SECRET;
  if (!migrationSecret) {
    return NextResponse.json({ error: 'Audio migration is not configured' }, { status: 503 });
  }
  if (request.headers.get('authorization') !== `Bearer ${migrationSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = await getDatabase();

    // Find all projects that have sound overlays in state.overlays
    const projects = await db.collection<AudioMigrationProject>(COLLECTIONS.PROJECTS).find({
      'state.overlays': { $elemMatch: { type: 'sound', row: { $in: [5, 6] } } },
    })
      .project({ projectId: 1, userId: 1, _id: 0 })
      .limit(100)
      .toArray();

    let migrated = 0;
    let skipped = 0;
    let conflicted = 0;
    let unverifiable = 0;
    const details: Array<{ projectId: string; disposition: string; reason?: string }> = [];

    for (const project of projects) {
      const projectId = typeof project.projectId === 'string' && project.projectId.trim()
        ? project.projectId.trim()
        : null;
      const userId = typeof project.userId === 'string' && project.userId.trim()
        ? project.userId.trim()
        : null;
      if (!projectId || !userId) {
        unverifiable++;
        details.push({ projectId: projectId ?? 'unknown', disposition: 'UNVERIFIABLE', reason: 'MISSING_OWNER_OR_PROJECT_ID' });
        continue;
      }

      try {
        const snapshot = await projectService.loadProjectForMutation(userId, projectId);
        const projectRecord = snapshot.project as unknown as Record<string, unknown>;
        const legacyState = projectRecord.state && typeof projectRecord.state === 'object'
          ? projectRecord.state as Record<string, unknown>
          : null;
        const plan = planLegacyAudioOverlayMigrationV1({
          topLevelOverlays: snapshot.project.overlays,
          legacyStateOverlays: legacyState?.overlays,
        });
        if (plan.disposition === 'UNVERIFIABLE') {
          unverifiable++;
          details.push({ projectId, disposition: plan.disposition, reason: plan.reason });
          continue;
        }
        if (plan.disposition === 'NO_CHANGES') {
          skipped++;
          details.push({ projectId, disposition: plan.disposition });
          continue;
        }

        await projectService.saveProjectWithReceipt(
          userId,
          projectId,
          { ...snapshot.project, overlays: plan.overlays as typeof snapshot.project.overlays },
          { expectedRevision: snapshot.revision },
        );
        migrated++;
        details.push({ projectId, disposition: 'MIGRATED' });
      } catch (error) {
        if (error instanceof ProjectMutationConflictError) {
          conflicted++;
          details.push({ projectId, disposition: 'CONFLICT' });
          continue;
        }
        if (error instanceof ProjectNotFoundOrForbiddenError) {
          unverifiable++;
          details.push({ projectId, disposition: 'UNVERIFIABLE', reason: 'PROJECT_NOT_FOUND_OR_FORBIDDEN' });
          continue;
        }
        throw error;
      }
    }

    return NextResponse.json({
      success: true,
      batchLimit: 100,
      projectsChecked: projects.length,
      projectsMigrated: migrated,
      projectsSkipped: skipped,
      projectsConflicted: conflicted,
      projectsUnverifiable: unverifiable,
      details,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown audio migration failure';
    console.error('[migrate-audio] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
