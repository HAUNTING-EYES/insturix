/**
 * Text-to-Speech Service
 *
 * Uses Deepgram Aura TTS for generating AI voiceover from narration text.
 * Supports voice preview so users can hear each voice before selecting.
 */

import { createClient } from '@deepgram/sdk';
import { uploadToGCS } from '@/lib/editron/services/gcs-service';
import { nanoid } from 'nanoid';

// ─── Voice Catalog ──────────────────────────────────────────────

export interface TTSVoice {
  id: string;
  name: string;
  gender: 'male' | 'female';
  style: string;
  /** Short sample text for preview */
  previewText: string;
}

/** Available Deepgram Aura voices with preview support */
export const TTS_VOICES: TTSVoice[] = [
  { id: 'aura-asteria-en', name: 'Asteria', gender: 'female', style: 'Neutral, professional', previewText: 'Welcome to your story. Every scene tells something unique.' },
  { id: 'aura-luna-en', name: 'Luna', gender: 'female', style: 'Warm, conversational', previewText: 'Let me take you on a journey through this narrative.' },
  { id: 'aura-stella-en', name: 'Stella', gender: 'female', style: 'Calm, soothing', previewText: 'In every frame, there is a story waiting to be told.' },
  { id: 'aura-athena-en', name: 'Athena', gender: 'female', style: 'Confident, clear', previewText: 'This is your vision, brought to life through words and motion.' },
  { id: 'aura-hera-en', name: 'Hera', gender: 'female', style: 'Mature, authoritative', previewText: 'The power of storytelling lies in every carefully chosen word.' },
  { id: 'aura-orion-en', name: 'Orion', gender: 'male', style: 'Deep, narrative', previewText: 'From the first frame to the last, this is your story.' },
  { id: 'aura-arcas-en', name: 'Arcas', gender: 'male', style: 'Authoritative, bold', previewText: 'Bold ideas deserve bold presentation. Let us begin.' },
  { id: 'aura-perseus-en', name: 'Perseus', gender: 'male', style: 'Energetic, dynamic', previewText: 'Every second counts. Let us make each moment matter.' },
  { id: 'aura-angus-en', name: 'Angus', gender: 'male', style: 'Warm, friendly', previewText: 'Hey there! Let me walk you through what we have here.' },
  { id: 'aura-orpheus-en', name: 'Orpheus', gender: 'male', style: 'Rich, dramatic', previewText: 'In the realm of visual storytelling, every detail matters.' },
  { id: 'aura-helios-en', name: 'Helios', gender: 'male', style: 'Clear, polished', previewText: 'Precision and clarity define the quality of narration.' },
  { id: 'aura-zeus-en', name: 'Zeus', gender: 'male', style: 'Commanding, powerful', previewText: 'When the story demands presence, every word carries weight.' },
];

export type TTSVoiceId = typeof TTS_VOICES[number]['id'];

// ─── Client ─────────────────────────────────────────────────────

function getDeepgramClient() {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    throw new Error('DEEPGRAM_API_KEY environment variable is not set');
  }
  return createClient(apiKey);
}

// ─── Core Generation ────────────────────────────────────────────

interface TTSResult {
  audioBuffer: Buffer;
  durationMs: number;
  audioUrl: string;
  audioAssetId: string;
  gcsPath: string;
}

/**
 * Generate voiceover audio from text.
 * Returns audio buffer, URL (uploaded to GCS), and duration.
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

  console.log(`[TTS] Generating voiceover: voice=${voice}, text="${text.substring(0, 80)}..." (${text.length} chars)`);

  const response = await deepgram.speak.request(
    { text },
    {
      model: voice,
      encoding: 'linear16',
      container: 'wav',
      sample_rate: 24000,
    },
  );

  const stream = await response.getStream();
  if (!stream) {
    throw new Error('Failed to get audio stream from Deepgram TTS — no stream returned');
  }

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

  if (audioBuffer.length === 0) {
    throw new Error('Deepgram TTS returned empty audio buffer');
  }
  console.log(`[TTS] Audio buffer: ${audioBuffer.length} bytes`);

  // Calculate duration from WAV header (linear16, 24kHz, mono = 48000 bytes/sec)
  const pcmBytes = Math.max(0, audioBuffer.length - 44);
  const bytesPerSecond = 24000 * 2;
  const durationMs = Math.round((pcmBytes / bytesPerSecond) * 1000);

  // Upload to GCS as WAV
  const assetId = `voiceover_${nanoid(12)}`;
  const filename = `${assetId}.wav`;
  const uploadResult = await uploadToGCS(audioBuffer, userId, filename, 'audio/wav');

  return {
    audioBuffer,
    durationMs,
    audioUrl: uploadResult.signedUrl,
    audioAssetId: assetId,
    gcsPath: uploadResult.gcsPath,
  };
}

/**
 * Generate a short voice preview clip (for voice selection UI).
 * Returns raw WAV audio buffer without uploading to GCS.
 */
export async function generateVoicePreview(
  voiceId: string,
): Promise<{ audioBuffer: Buffer; durationMs: number }> {
  const deepgram = getDeepgramClient();

  // Find the voice's preview text, or use a default
  const voice = TTS_VOICES.find((v) => v.id === voiceId);
  const text = voice?.previewText || 'This is a preview of the selected voice for your narration.';

  const response = await deepgram.speak.request(
    { text },
    {
      model: voiceId,
      encoding: 'linear16',
      container: 'wav',
      sample_rate: 24000,
    },
  );

  const stream = await response.getStream();
  if (!stream) throw new Error('No audio stream from Deepgram');

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let done = false;
  while (!done) {
    const result = await reader.read();
    done = result.done;
    if (result.value) chunks.push(result.value);
  }
  const audioBuffer = Buffer.concat(chunks);

  const pcmBytes = Math.max(0, audioBuffer.length - 44);
  const bytesPerSecond = 24000 * 2;
  const durationMs = Math.round((pcmBytes / bytesPerSecond) * 1000);

  return { audioBuffer, durationMs };
}

/**
 * Check if TTS is available.
 */
export function isTTSAvailable(): boolean {
  return !!process.env.DEEPGRAM_API_KEY;
}
