/**
 * POST /api/services/editron/transcribe
 * 
 * Transcribe a video asset to get word-level timestamps for captions.
 * Uses the transcription service which caches results in DB.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { isDeepgramConfigured, SUPPORTED_LANGUAGES } from '@/lib/editron/services/deepgram-service';
import { getTranscription } from '@/lib/editron/services/media';

export const runtime = 'nodejs';
// Increase timeout for long transcriptions
export const maxDuration = 120; // 2 minutes max

interface TranscribeRequest {
  assetId: string;
  language?: string;
  forceRefresh?: boolean;
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
    const { assetId, language, forceRefresh } = body;

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

    // Use the transcription service (handles caching automatically)
    const result = await getTranscription(assetId, userId, {
      forceRefresh,
      language: language || undefined,
    });

    // Check if any words were transcribed
    if (result.words.length === 0) {
      return NextResponse.json({
        success: true,
        words: [],
        durationMs: 0,
        detectedLanguage: result.language,
        confidence: 0,
        transcript: '',
        message: 'No speech detected in this media file',
      });
    }

    // Calculate duration from words
    const durationMs = result.words[result.words.length - 1].endMs;

    return NextResponse.json({
      success: true,
      words: result.words,
      durationMs,
      detectedLanguage: result.language,
      confidence: result.confidence,
      transcript: result.transcript,
      cached: !forceRefresh && result.generatedAt < new Date(Date.now() - 1000), // Indicate if from cache
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

