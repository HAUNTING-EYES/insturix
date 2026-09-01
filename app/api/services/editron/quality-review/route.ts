/**
 * POST /api/services/editron/quality-review
 *
 * Run quality review on a project and return the report.
 * Used by the quality review panel in the editor toolbar.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { runQualityReview } from '@/lib/editron/services/quality-review-service';
import { buildPersistedQualityReview } from '@/lib/editron/services/quality-review-persistence';
import {
  ProjectMutationConflictError,
  ProjectNotFoundOrForbiddenError,
  projectService,
} from '@/lib/editron/services/project-service';
import { emitBrandEvent } from '@/lib/shared/brand-events';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { projectId } = await req.json();
    if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });

    const snapshot = await projectService.loadProjectForMutation(userId, projectId);
    const project = snapshot.project;

    const overlaysForReview: Parameters<typeof runQualityReview>[0] = project.overlays.map((overlay) => ({
      ...overlay,
      content: readReviewContent(overlay),
    }));

    const report = runQualityReview(overlaysForReview, project.fps || 30, project.durationInFrames);
    const reviewedAt = new Date();
    const persistedReview = buildPersistedQualityReview(report, reviewedAt);
    const receipt = await projectService.saveProjectWithReceipt(
      userId,
      projectId,
      project,
      {
        expectedRevision: snapshot.revision,
        projectUpdates: {
          qualityScore: report.overallScore,
          qualityReview: {
            ...persistedReview,
            source: 'manual-quality-review',
            reviewedProjectRevision: snapshot.revision,
          },
        },
      },
    );

    emitBrandEvent({
      userId,
      projectId,
      service: 'editron',
      type: 'quality_reviewed',
      payload: {
        qualityScore: report.overallScore,
        score: report.overallScore,
        issueCount: report.issues?.length ?? 0,
        autoFixableCount: report.autoFixable?.length ?? 0,
        projectRevision: receipt.revision.value,
      },
    }).catch((err) => console.error('[quality-review] Brand event failed:', err));

    return NextResponse.json({
      success: true,
      ...report,
    });
  } catch (error: unknown) {
    if (error instanceof ProjectMutationConflictError) {
      return NextResponse.json({
        error: 'Project changed during quality review. Reload and review the current edit.',
        code: error.code,
        currentRevision: error.currentRevision,
      }, { status: 409 });
    }
    if (error instanceof ProjectNotFoundOrForbiddenError) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    console.error('[quality-review]', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Quality review failed',
    }, { status: 500 });
  }
}

function readReviewContent(overlay: object): string | undefined {
  if ('content' in overlay && typeof overlay.content === 'string') {
    return overlay.content;
  }

  if ('text' in overlay && typeof overlay.text === 'string') {
    return overlay.text;
  }

  if (!('captions' in overlay) || !Array.isArray(overlay.captions)) {
    return undefined;
  }

  const text = overlay.captions
    .map((caption) => {
      if (!caption || typeof caption !== 'object') {
        return '';
      }
      return 'text' in caption && typeof caption.text === 'string'
        ? caption.text
        : '';
    })
    .filter(Boolean)
    .join(' ');

  return text || undefined;
}
