/**
 * POST /api/services/editron/analysis
 *
 * Run 5-track analysis on a project's video assets.
 * Returns analysis results + edit decisions + cinematic moments.
 *
 * This is the intelligence entry point — triggered by:
 * 1. Director Agent (auto-analyze before editing)
 * 2. Quality Review panel refresh
 * 3. User clicking "Analyze" in the editor
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { analyzeProjectAssets, getAnalysis, type AssetAnalysis } from '@/lib/editron/services/five-track-analysis';
import { generateEditDecisionList } from '@/lib/editron/services/reactive-edit-engine';
import { detectCinematicMoments } from '@/lib/editron/services/cinematic-moment-detector';
// Content-to-graphic mapping is now handled by Track A (speech semantic classification)
// in the Reactive Edit Engine. The EDL contains graphic decisions directly.
import { getDatabase, COLLECTIONS } from '@/lib/editron/db/mongodb';

export const runtime = 'nodejs';
export const maxDuration = 120; // Analysis can take time for multiple assets

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { projectId, tracks } = await req.json();
    if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });

    console.log(`[Analysis] Starting 5-track analysis for project ${projectId}`);

    // Step 1: Run 5-track analysis on all video assets
    const assetResults = await analyzeProjectAssets(projectId, userId);
    console.log(`[Analysis] Assets: ${assetResults.analyzed} analyzed, ${assetResults.cached} cached, ${assetResults.failed} failed`);

    // Step 2: Gather all analyses
    const db = await getDatabase();
    const project = await db.collection(COLLECTIONS.PROJECTS).findOne({ projectId, userId }) as any;
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const videoOverlays = (project.overlays || []).filter((o: any) => o.type === 'video');
    const analyses: AssetAnalysis[] = [];

    for (const overlay of videoOverlays) {
      if (overlay.assetId) {
        const analysis = await getAnalysis(overlay.assetId);
        if (analysis) analyses.push(analysis);
      }
    }

    // Step 3: Generate Edit Decision List
    const totalDurationMs = (project.durationInFrames || 900) / 30 * 1000;
    const edl = generateEditDecisionList(analyses, totalDurationMs, {
      targetCutsPerMinute: 6,
      transitionStyle: 'mixed',
      graphicDensity: 'moderate',
      pacing: 'medium',
    });
    edl.projectId = projectId;

    // Step 4: Detect cinematic moments
    const allMoments = analyses.flatMap(a => detectCinematicMoments(a));
    allMoments.sort((a, b) => b.intensity - a.intensity);
    const topMoments = allMoments.slice(0, 10); // Top 10

    // Step 5: Extract graphic suggestions from EDL (Track A generates them directly)
    const graphicDecisions = edl.decisions.filter(d => d.type === 'graphic');

    console.log(`[Analysis] Complete: ${edl.totalDecisions} edit decisions, ${topMoments.length} cinematic moments, ${graphicDecisions.length} graphic suggestions`);

    return NextResponse.json({
      success: true,
      assets: assetResults,
      editDecisionList: edl,
      cinematicMoments: topMoments,
      graphicSuggestions: graphicDecisions,
      // Per-asset analysis summaries
      analysisSummaries: analyses.map(a => ({
        assetId: a.assetId,
        shots: a.shots.length,
        motionSegments: a.motionSegments.length,
        keyframes: a.keyframeAnalyses.length,
        subjects: a.subjectTracks.length,
        speechSegments: a.speechSegments.length,
        musicSections: a.musicStructure?.sections.length || 0,
      })),
    });
  } catch (error: any) {
    console.error('[Analysis] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * GET /api/services/editron/analysis?assetId=xxx
 * Retrieve cached analysis for a specific asset (debug panel).
 */
export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const assetId = req.nextUrl.searchParams.get('assetId');
    if (!assetId) return NextResponse.json({ error: 'assetId required' }, { status: 400 });

    const analysis = await getAnalysis(assetId);
    if (!analysis) {
      return NextResponse.json({ error: 'No analysis found for this asset', assetId }, { status: 404 });
    }

    return NextResponse.json({ assetId, analysis });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
