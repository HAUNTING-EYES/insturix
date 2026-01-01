/**
 * POST /api/services/editron/transcribe
 * 
 * Transcribe a video asset to get word-level timestamps for captions.
 * Uses Deepgram Nova-2 for accurate multilingual transcription.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { assetResolver } from '@/lib/editron/services/asset-resolver';
import { transcribeMedia, isDeepgramConfigured, SUPPORTED_LANGUAGES } from '@/lib/editron/services/deepgram-service';

export const runtime = 'nodejs';
// Increase timeout for long transcriptions
export const maxDuration = 120; // 2 minutes max

interface TranscribeRequest {
  assetId: string;
  language?: string;
}

export async function POST(request: NextRequest) {
  try {
    // Check Deepgram configuration
    if (!isDeepgramConfigured()) {
      return NextResponse.json(
        { success: false, error: 'Transcription service not configured' },
        { status: 503 }
      );
    }

    // Authenticate user
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse request body
    const body: TranscribeRequest = await request.json();
    const { assetId, language } = body;

    if (!assetId) {
      return NextResponse.json(
        { success: false, error: 'assetId is required' },
        { status: 400 }
      );
    }

    // Validate language if provided
    if (language && language !== 'auto') {
      const isValidLanguage = SUPPORTED_LANGUAGES.some(l => l.code === language);
      if (!isValidLanguage) {
        return NextResponse.json(
          { success: false, error: `Unsupported language: ${language}` },
          { status: 400 }
        );
      }
    }

    // Fetch asset to get the video URL
    const asset = await assetResolver.getAsset(assetId, userId);
    
    if (!asset) {
      return NextResponse.json(
        { success: false, error: 'Asset not found' },
        { status: 404 }
      );
    }

    // Check if asset is a video or audio
    if (asset.type !== 'video' && asset.type !== 'audio') {
      return NextResponse.json(
        { success: false, error: 'Asset must be a video or audio file' },
        { status: 400 }
      );
    }

    // Get the accessible URL for the asset
    let mediaUrl: string;
    
    if (asset.source === 'public' && asset.publicUrl) {
      mediaUrl = asset.publicUrl;
    } else if (asset.cachedUrl) {
      // Check if URL is expired
      const now = Date.now();
      const expiresAt = new Date(asset.urlExpiresAt).getTime();
      
      if (expiresAt < now && asset.gcsPath) {
        // Refresh the URL
        const { refreshSignedUrl } = await import('@/lib/editron/services/gcs-service');
        const { url } = await refreshSignedUrl(asset.gcsPath);
        mediaUrl = url;
      } else {
        mediaUrl = asset.cachedUrl;
      }
    } else {
      return NextResponse.json(
        { success: false, error: 'No accessible URL for asset' },
        { status: 400 }
      );
    }

    // Transcribe the media
    const result = await transcribeMedia(mediaUrl, {
      language: language || undefined,
    });

    // Check if any words were transcribed
    if (result.words.length === 0) {
      return NextResponse.json({
        success: true,
        words: [],
        durationMs: asset.duration ? asset.duration * 1000 : 0,
        detectedLanguage: result.detectedLanguage,
        confidence: 0,
        transcript: '',
        message: 'No speech detected in this media file',
      });
    }

    return NextResponse.json({
      success: true,
      words: result.words,
      durationMs: result.durationMs,
      detectedLanguage: result.detectedLanguage,
      confidence: result.confidence,
      transcript: result.transcript,
    });

  } catch (error: any) {
    console.error('Transcription error:', error);
    
    // Return user-friendly error messages
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'Transcription failed',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/services/editron/transcribe
 * 
 * Get supported languages for transcription
 */
export async function GET() {
  return NextResponse.json({
    success: true,
    languages: SUPPORTED_LANGUAGES,
    configured: isDeepgramConfigured(),
  });
}
