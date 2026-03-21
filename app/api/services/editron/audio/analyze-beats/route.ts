/**
 * POST /api/services/editron/audio/analyze-beats
 *
 * Analyze an audio asset for beats, tempo (BPM), and energy peaks.
 * Results are cached on the MediaAsset document (same pattern as transcription caching).
 *
 * Used by: sync_cuts_to_beats agent tool (server-side, no Web Audio API)
 * Client-side: use-beat-sync.tsx hook runs the same algorithm directly in the browser
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getDatabase, COLLECTIONS } from '@/lib/editron/db/mongodb';
import { assetResolver } from '@/lib/editron/services/asset-resolver';
import { analyzeBeatsFull } from '@/lib/editron/services/media/beat-detection-service';
import type { BeatAnalysis, BeatDetectionOptions } from '@/lib/editron/services/media/types';

export const runtime = 'nodejs';
export const maxDuration = 60; // Beat detection is fast (<3s for a 5-min track)

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      assetId,
      forceRefresh = false,
      options: detectionOptions,
    }: {
      assetId: string;
      forceRefresh?: boolean;
      options?: BeatDetectionOptions;
    } = body;

    if (!assetId) {
      return NextResponse.json(
        { success: false, error: 'assetId is required' },
        { status: 400 },
      );
    }

    const db = await getDatabase();

    // Fetch asset
    const asset = await db
      .collection(COLLECTIONS.MEDIA_ASSETS)
      .findOne({ assetId, userId }) as any;

    if (!asset) {
      return NextResponse.json(
        { success: false, error: `Asset ${assetId} not found` },
        { status: 404 },
      );
    }

    // Check for audio type
    if (asset.type !== 'audio' && asset.type !== 'video') {
      return NextResponse.json(
        { success: false, error: `Asset ${assetId} is not an audio or video file` },
        { status: 400 },
      );
    }

    // Return cached if exists and not forcing refresh
    if (asset.beatAnalysis && !forceRefresh) {
      console.log(`[analyze-beats] Returning cached beat analysis for ${assetId}`);
      return NextResponse.json({
        success: true,
        analysis: asset.beatAnalysis,
        cached: true,
      });
    }

    // Resolve audio URL
    const audioUrl = await assetResolver.resolveAssetUrl(assetId, userId);

    // Fetch and decode audio server-side using node-web-audio-api
    console.log(`[analyze-beats] Fetching audio for ${assetId}...`);
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      throw new Error(`Failed to fetch audio: ${audioResponse.status}`);
    }
    const arrayBuffer = await audioResponse.arrayBuffer();

    // Use node-web-audio-api to decode audio on the server
    // This polyfills OfflineAudioContext for Node.js — same API as browser
    let audioBuffer: any;
    try {
      const { AudioContext } = await import('node-web-audio-api');
      const ctx = new AudioContext();
      audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      await ctx.close();
    } catch (decodeErr: any) {
      console.error(`[analyze-beats] Audio decode failed: ${decodeErr.message}`);
      return NextResponse.json(
        { success: false, error: `Failed to decode audio: ${decodeErr.message}` },
        { status: 422 },
      );
    }

    // Run beat detection
    console.log(`[analyze-beats] Running beat detection (${(audioBuffer.duration).toFixed(1)}s, ${audioBuffer.sampleRate}Hz)...`);
    const startTime = Date.now();
    const analysis: BeatAnalysis = await analyzeBeatsFull(audioBuffer, detectionOptions);
    const elapsed = Date.now() - startTime;

    console.log(`[analyze-beats] Complete in ${elapsed}ms: ${analysis.bpm} BPM (confidence=${analysis.bpmConfidence}), ${analysis.beats.length} beats, ${analysis.energyPeaks.length} energy peaks`);

    // Cache to database (same pattern as transcription caching)
    await db.collection(COLLECTIONS.MEDIA_ASSETS).updateOne(
      { assetId },
      { $set: { beatAnalysis: analysis } },
    );

    return NextResponse.json({
      success: true,
      analysis,
      cached: false,
      processingMs: elapsed,
    });
  } catch (error: any) {
    console.error('[analyze-beats] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Beat analysis failed' },
      { status: 500 },
    );
  }
}
