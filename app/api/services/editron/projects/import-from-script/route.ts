/**
 * POST /api/services/editron/projects/import-from-script
 *
 * Import a script (scenes) into a new or existing Editron project.
 * Converts SceneDescriptors into timeline overlays.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { projectService } from '@/lib/editron/services/project-service';
import { addProjectToLinkBySessionId, createProjectLink, findLinkBySessionId } from '@/lib/shared/project-links';
import { scenesToOverlays, scenesToTotalFrames, type StoryboardImage } from '@/lib/pipeline/scene-to-editron';
import { CreditsService } from '@/lib/services/creditsService';
import type { SceneDescriptor } from '@/lib/pipeline/schemas/storyboard';
import {
  verifyThinkForgeEditronProductionManifest,
  type VerifiedThinkForgeEditronProductionManifest,
} from '@/lib/thinkforge/export/editron-production-manifest-contract';

export const runtime = 'nodejs';

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

type ImportMode = 'draft-script-import';

function isDraftScriptImportMode(value: unknown): value is ImportMode {
  return value === 'draft-script-import';
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      scenes,
      title,
      aspectRatio,
      sourceScriptId,
      sourceSessionId,
      storyboardImages,
      brandId,
      importMode,
      productionManifest,
      dryRun,
    }: {
      scenes: SceneDescriptor[];
      title?: string;
      aspectRatio?: string;
      sourceScriptId?: string;
      sourceSessionId?: string;
      storyboardImages?: StoryboardImage[];
      brandId?: string;
      importMode?: string;
      productionManifest?: unknown;
      dryRun?: boolean;
    } = body;

    const normalizedBrandId = nonEmptyString(brandId);
    const normalizedImportMode = isDraftScriptImportMode(importMode) ? importMode : undefined;
    const normalizedSourceSessionId = nonEmptyString(sourceSessionId);
    const normalizedSourceScriptId = nonEmptyString(sourceScriptId);
    const shouldDryRun = dryRun === true;
    const warnings: string[] = [];
    let verifiedManifest: VerifiedThinkForgeEditronProductionManifest | null = null;

    if (!scenes || !Array.isArray(scenes) || scenes.length === 0) {
      return NextResponse.json(
        { success: false, error: 'scenes array is required and must not be empty' },
        { status: 400 },
      );
    }

    if (productionManifest !== undefined) {
      try {
        verifiedManifest = verifyThinkForgeEditronProductionManifest(productionManifest);
      } catch {
        return NextResponse.json(
          {
            success: false,
            error: 'The ThinkForge production manifest is invalid or unsupported.',
            reason: 'invalid-production-manifest',
          },
          { status: 400 },
        );
      }
      if (
        verifiedManifest.manifest.sourceSessionId !== normalizedSourceSessionId
        || verifiedManifest.manifest.sourceScriptId !== normalizedSourceScriptId
      ) {
        return NextResponse.json(
          {
            success: false,
            error: 'The ThinkForge production manifest does not belong to this script import.',
            reason: 'production-manifest-source-mismatch',
          },
          { status: 409 },
        );
      }
    }

    if (
      verifiedManifest?.manifest.coveragePolicy === 'production-require-all-scenes'
      && normalizedImportMode !== 'draft-script-import'
    ) {
      return NextResponse.json(
        {
          success: false,
          error: 'Production manifest requires storyboard finalization before creating an Editron project.',
          reason: 'production-manifest-requires-storyboard-finalize',
        },
        { status: 409 },
      );
    }

    // Determine dimensions from aspect ratio
    const ar = aspectRatio || '16:9';
    let width = 1920;
    let height = 1080;
    if (ar === '9:16') { width = 1080; height = 1920; }
    else if (ar === '1:1') { width = 1080; height = 1080; }
    else if (ar === '4:5') { width = 1080; height = 1350; }

    const fps = 30;
    const projectName = title || 'Imported Script';
    const overlays = scenesToOverlays(scenes, { fps, width, height }, storyboardImages);
    const totalFrames = scenesToTotalFrames(scenes, fps);
    const findExistingSourceProject = async () => normalizedSourceSessionId
      ? projectService.findProjectBySessionId(userId, normalizedSourceSessionId)
      : null;

    if (shouldDryRun) {
      const existingProject = await findExistingSourceProject();

      return NextResponse.json({
        success: true,
        dryRun: true,
        projectId: existingProject?.projectId ?? null,
        name: projectName,
        overlayCount: overlays.length,
        totalDurationFrames: totalFrames,
        totalDurationSeconds: Math.round(totalFrames / fps),
        creditsDeducted: 0,
        reusedProject: Boolean(existingProject),
        wouldReuseProject: Boolean(existingProject),
        importMode: normalizedImportMode || 'legacy-direct-import',
        draftOnly: normalizedImportMode === 'draft-script-import',
        writeOperationsSkipped: true,
        productionManifestHash: verifiedManifest?.sha256 ?? null,
      });
    }

    // Deduct credits (1 credit for script import)
    const deductResult = await CreditsService.deductCredits(
      userId,
      'pipeline',
      'script_import',
      { quantity: 1 },
    );
    if (!deductResult.success) {
      return NextResponse.json(
        { success: false, error: deductResult.error || 'Insufficient credits' },
        { status: 402 },
      );
    }

    // Reuse the source-session project when ThinkForge created one at script stage.
    const existingProject = await findExistingSourceProject();
    const project = existingProject || await projectService.createProject(userId, projectName, {
      brandId: normalizedBrandId,
      sourceSessionId: normalizedSourceSessionId,
    });

    const importedAt = new Date().toISOString();
    const projectUpdates: Record<string, unknown> = {
      name: projectName,
      pipelineStage: 'edit',
      ...(normalizedBrandId ? { brandId: normalizedBrandId } : {}),
      ...(normalizedSourceSessionId ? { sourceSessionId: normalizedSourceSessionId } : {}),
      ...(normalizedSourceScriptId ? { sourceScriptId: normalizedSourceScriptId } : {}),
    };
    if (verifiedManifest) {
      projectUpdates[`thinkforgeImportContracts.${verifiedManifest.sha256}`] = {
        schemaVersion: 1,
        manifestSha256: verifiedManifest.sha256,
        productionManifest: verifiedManifest.manifest,
      };
      projectUpdates.latestThinkforgeImport = {
        schemaVersion: 1,
        manifestSha256: verifiedManifest.sha256,
        sourceSessionId: normalizedSourceSessionId,
        sourceScriptId: normalizedSourceScriptId,
        importMode: normalizedImportMode || 'legacy-direct-import',
        importedAt,
      };
    }

    const mutationReceipt = await projectService.saveProjectWithReceipt(
      userId,
      project.projectId,
      {
        overlays,
        aspectRatio: ar as any,
        playerDimensions: { width, height },
        fps,
        durationInFrames: totalFrames,
      },
      { projectUpdates },
    );

    if (normalizedSourceSessionId) {
      try {
        const existingLink = await findLinkBySessionId(userId, normalizedSourceSessionId);
        if (existingLink) {
          await addProjectToLinkBySessionId(userId, normalizedSourceSessionId, project.projectId);
        } else {
          await createProjectLink(userId, {
            sessionId: normalizedSourceSessionId,
            sourceScriptId: normalizedSourceScriptId,
            projectId: project.projectId,
            brandId: normalizedBrandId,
          });
        }
      } catch (linkErr: any) {
        warnings.push(`Project link operation failed: ${linkErr.message}`);
      }
    }

    return NextResponse.json({
      success: true,
      projectId: project.projectId,
      name: projectName,
      overlayCount: overlays.length,
      totalDurationFrames: totalFrames,
      totalDurationSeconds: Math.round(totalFrames / fps),
      creditsDeducted: 1,
      reusedProject: Boolean(existingProject),
      importMode: normalizedImportMode || 'legacy-direct-import',
      draftOnly: normalizedImportMode === 'draft-script-import',
      projectRevision: mutationReceipt.revision,
      productionManifestHash: verifiedManifest?.sha256 ?? null,
      ...(warnings.length > 0 ? { warnings } : {}),
    });
  } catch (error: any) {
    console.error('[import-from-script] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to import script' },
      { status: 500 },
    );
  }
}
