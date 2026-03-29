/**
 * POST /api/services/editron/analysis/test-single
 *
 * Debug endpoint: Run 5-Track analysis on a single video URL.
 * Returns the full analysis result INCLUDING the diagnostic trace
 * showing exactly where each step succeeded/failed.
 *
 * Body: { videoUrl: string, durationMs?: number }
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { runFullAnalysis } from '@/lib/editron/services/five-track-analysis';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { videoUrl, durationMs = 5000 } = body;

    if (!videoUrl) {
      return NextResponse.json({ error: 'videoUrl is required' }, { status: 400 });
    }

    console.log(`[AnalysisTest] Running single-video analysis: ${videoUrl.substring(0, 80)}...`);

    // First test: can we even fetch the video?
    const fetchTest: { status: string; statusCode?: number; contentType?: string; sizeKb?: number; error?: string } = { status: 'pending' };
    try {
      const res = await fetch(videoUrl, { method: 'HEAD' });
      fetchTest.status = res.ok ? 'ok' : 'failed';
      fetchTest.statusCode = res.status;
      fetchTest.contentType = res.headers.get('content-type') || 'unknown';
      const cl = res.headers.get('content-length');
      if (cl) fetchTest.sizeKb = Math.round(parseInt(cl) / 1024);
    } catch (e: any) {
      fetchTest.status = 'error';
      fetchTest.error = e.message;
    }

    // Second test: is Gemini API key present?
    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    const geminiKeyStatus = geminiKey ? `present (${geminiKey.substring(0, 8)}...)` : 'MISSING';

    // Third test: run full analysis with trace
    const testAssetId = `test_${Date.now()}`;
    const startTime = Date.now();
    let analysis: any = null;
    let analysisError: string | null = null;

    try {
      analysis = await runFullAnalysis(testAssetId, userId, {
        videoUrl,
        durationMs,
        sourceType: 'ai-generated',
      });
    } catch (e: any) {
      analysisError = e.message;
    }

    const totalMs = Date.now() - startTime;

    return NextResponse.json({
      testResults: {
        videoUrl: videoUrl.substring(0, 100) + '...',
        fetchTest,
        geminiKeyStatus,
        analysisDurationMs: totalMs,
        analysisError,
      },
      analysisResult: analysis ? {
        status: analysis.status,
        shots: analysis.shots?.length || 0,
        motionSegments: analysis.motionSegments?.length || 0,
        keyframes: analysis.keyframeAnalyses?.length || 0,
        subjects: analysis.subjectTracks?.length || 0,
        speechSegments: analysis.speechSegments?.length || 0,
        musicSections: analysis.musicStructure?.sections?.length || 0,
        naturalCutPoints: analysis.naturalCutPoints?.length || 0,
        audioSyncPoints: analysis.audioSyncPoints?.length || 0,
        // THE CRITICAL DEBUG INFO:
        _diagnosticTrace: (analysis as any)?._diagnosticTrace || [],
      } : null,
      // Also include raw keyframe data if it exists (to verify Vision output)
      sampleKeyframe: analysis?.keyframeAnalyses?.[0] || null,
      sampleMotion: analysis?.motionSegments?.[0] || null,
      sampleSubject: analysis?.subjectTracks?.[0] || null,
    });
  } catch (error: any) {
    console.error('[AnalysisTest] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
