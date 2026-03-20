/**
 * Text-to-Speech Service
 *
 * Uses Deepgram Aura TTS for generating AI voiceover from narration text.
 * Reuses existing Deepgram SDK and API key.
 */

import { createClient } from '@deepgram/sdk';
import { uploadToGCS } from '@/lib/editron/services/gcs-service';
import { nanoid } from 'nanoid';

/** Available TTS voices */
export const TTS_VOICES = [
  { id: 'aura-asteria-en', name: 'Asteria', gender: 'female', style: 'neutral' },
  { id: 'aura-luna-en', name: 'Luna', gender: 'female', style: 'warm' },
  { id: 'aura-orion-en', name: 'Orion', gender: 'male', style: 'neutral' },
  { id: 'aura-arcas-en', name: 'Arcas', gender: 'male', style: 'authoritative' },
] as const;

export type TTSVoiceId = typeof TTS_VOICES[number]['id'];

function getDeepgramClient() {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    throw new Error('DEEPGRAM_API_KEY environment variable is not set');
  }
  return createClient(apiKey);
}

interface TTSResult {
  audioBuffer: Buffer;
  durationMs: number;
  audioUrl: string;
  audioAssetId: string;
  gcsPath: string;
}

/**
 * Generate voiceover audio from text.
 * Returns audio buffer, URL (uploaded to GCS), and duration estimate.
 */
export async function generateVoiceover(
  text: string,
  userId: string,
  options: {
    voice?: string;
    language?: string;
  } = {},
): Promise<TTSResult> {
  const deepgram = getDeepgramClient();
  const voice = options.voice || 'aura-asteria-en';

  // Call Deepgram Aura TTS
  const response = await deepgram.speak.request(
    { text },
    {
      model: voice,
      encoding: 'mp3',
      container: 'mp3',
    },
  );

  const stream = await response.getStream();
  if (!stream) {
    throw new Error('Failed to get audio stream from Deepgram TTS');
  }

  // Read the stream into a buffer
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let done = false;
  while (!done) {
    const result = await reader.read();
    done = result.done;
    if (result.value) {
      chunks.push(result.value);
    }
  }
  const audioBuffer = Buffer.concat(chunks);

  // Estimate duration from text (rough: ~150 words per minute)
  const wordCount = text.split(/\s+/).length;
  const durationMs = Math.round((wordCount / 150) * 60 * 1000);

  // Upload to GCS
  const assetId = `voiceover_${nanoid(12)}`;
  const filename = `${assetId}.mp3`;
  const uploadResult = await uploadToGCS(audioBuffer, userId, filename, 'audio/mpeg');

  return {
    audioBuffer,
    durationMs,
    audioUrl: uploadResult.signedUrl,
    audioAssetId: assetId,
    gcsPath: uploadResult.gcsPath,
  };
}

/**
 * Check if TTS is available (Deepgram API key configured).
 */
export function isTTSAvailable(): boolean {
  return !!process.env.DEEPGRAM_API_KEY;
}
