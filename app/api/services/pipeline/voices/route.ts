import { NextRequest, NextResponse } from 'next/server';
import { TTS_VOICES, isTTSAvailable, generateVoicePreview } from '@/lib/pipeline/tts-service';

/**
 * GET /api/services/pipeline/voices
 * Returns available TTS voices.
 */
export async function GET() {
  return NextResponse.json({
    available: isTTSAvailable(),
    voices: TTS_VOICES.map((v) => ({
      id: v.id,
      name: v.name,
      gender: v.gender,
      style: v.style,
      provider: v.provider,
    })),
  });
}

/**
 * POST /api/services/pipeline/voices
 * Generate a voice preview clip (returns WAV audio).
 */
export async function POST(req: NextRequest) {
  try {
    if (!isTTSAvailable()) {
      return NextResponse.json({ error: 'TTS not configured' }, { status: 503 });
    }

    const { voiceId } = await req.json();
    if (!voiceId) {
      return NextResponse.json({ error: 'voiceId required' }, { status: 400 });
    }

    const { audioBuffer } = await generateVoicePreview(voiceId);

    return new Response(new Uint8Array(audioBuffer), {
      headers: {
        'Content-Type': 'audio/wav',
        'Content-Length': String(audioBuffer.length),
        'Cache-Control': 'public, max-age=86400', // Cache previews for 24h
      },
    });
  } catch (error: any) {
    console.error('[voices/preview]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
