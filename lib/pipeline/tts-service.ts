/**
 * Text-to-Speech Service
 *
 * Primary: Kokoro TTS via fal.ai (more human-sounding, $0.02/1000 chars)
 * Fallback: Deepgram Aura TTS (reliable, wider voice range)
 */

import { fal } from '@fal-ai/client';
import { uploadMedia } from '@/lib/editron/services/upload-service';
import { nanoid } from 'nanoid';

// ─── Voice Catalog ──────────────────────────────────────────────

export interface TTSVoice {
  id: string;
  name: string;
  gender: 'male' | 'female';
  style: string;
  previewText: string;
  provider: 'kokoro' | 'deepgram';
  /** Kokoro voice ID (e.g., 'af_heart') or Deepgram model (e.g., 'aura-asteria-en') */
  providerVoiceId: string;
}

/** Available voices — Kokoro first (more human), Deepgram as extras */
export const TTS_VOICES: TTSVoice[] = [
  // Kokoro voices (primary — more natural/human-sounding)
  { id: 'kokoro-heart', name: 'Heart', gender: 'female', style: 'Warm, natural', previewText: 'Welcome to your story. Every scene tells something unique.', provider: 'kokoro', providerVoiceId: 'af_heart' },
  { id: 'kokoro-bella', name: 'Bella', gender: 'female', style: 'Confident, clear', previewText: 'This is your vision, brought to life through words and motion.', provider: 'kokoro', providerVoiceId: 'af_bella' },
  { id: 'kokoro-nova', name: 'Nova', gender: 'female', style: 'Bright, professional', previewText: 'Let me take you on a journey through this narrative.', provider: 'kokoro', providerVoiceId: 'af_nova' },
  { id: 'kokoro-sarah', name: 'Sarah', gender: 'female', style: 'Calm, soothing', previewText: 'In every frame, there is a story waiting to be told.', provider: 'kokoro', providerVoiceId: 'af_sarah' },
  { id: 'kokoro-jessica', name: 'Jessica', gender: 'female', style: 'Energetic, friendly', previewText: 'Hey there! Let me walk you through what we have here.', provider: 'kokoro', providerVoiceId: 'af_jessica' },
  { id: 'kokoro-adam', name: 'Adam', gender: 'male', style: 'Deep, narrative', previewText: 'From the first frame to the last, this is your story.', provider: 'kokoro', providerVoiceId: 'am_adam' },
  { id: 'kokoro-michael', name: 'Michael', gender: 'male', style: 'Authoritative, bold', previewText: 'Bold ideas deserve bold presentation. Let us begin.', provider: 'kokoro', providerVoiceId: 'am_michael' },
  { id: 'kokoro-eric', name: 'Eric', gender: 'male', style: 'Warm, conversational', previewText: 'Every second counts. Let us make each moment matter.', provider: 'kokoro', providerVoiceId: 'am_eric' },
  { id: 'kokoro-liam', name: 'Liam', gender: 'male', style: 'Clear, polished', previewText: 'Precision and clarity define the quality of narration.', provider: 'kokoro', providerVoiceId: 'am_liam' },
  { id: 'kokoro-fenrir', name: 'Fenrir', gender: 'male', style: 'Rich, dramatic', previewText: 'In the realm of visual storytelling, every detail matters.', provider: 'kokoro', providerVoiceId: 'am_fenrir' },

  // Deepgram voices removed from UI — robotic compared to Kokoro.
  // Deepgram still works as internal fallback if Kokoro fails (provider logic in generateVoiceover).
];

export type TTSVoiceId = typeof TTS_VOICES[number]['id'];

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
 * Primary: Kokoro via fal.ai. Fallback: Deepgram Aura.
 */
export async function generateVoiceover(
  text: string,
  userId: string,
  options: {
    voice?: string;
    language?: string;
  } = {},
): Promise<TTSResult> {
  const voiceId = options.voice || 'kokoro-heart';
  const voiceConfig = TTS_VOICES.find(v => v.id === voiceId);
  const provider = voiceConfig?.provider || (voiceId.startsWith('kokoro-') ? 'kokoro' : 'deepgram');

  console.log(`[TTS] Generating: provider=${provider}, voice=${voiceId}, text="${text.substring(0, 80)}..." (${text.length} chars)`);

  if (provider === 'kokoro') {
    try {
      return await generateWithKokoro(text, userId, voiceConfig?.providerVoiceId || 'af_heart');
    } catch (err: any) {
      console.warn(`[TTS] Kokoro failed (${err.message}), falling back to Deepgram`);
      return await generateWithDeepgram(text, userId, 'aura-asteria-en');
    }
  } else {
    return await generateWithDeepgram(text, userId, voiceConfig?.providerVoiceId || voiceId);
  }
}

// ─── Kokoro TTS (fal.ai) ────────────────────────────────────────

async function generateWithKokoro(
  text: string,
  userId: string,
  kokoroVoice: string,
  ttsSpeedOverride?: number,
): Promise<TTSResult> {
  const key = process.env.FAL_AI_API_KEY;
  if (!key) throw new Error('FAL_AI_API_KEY not set');
  fal.config({ credentials: key });

  // Pacing-aware TTS speed — defaults to 1.0
  const ttsSpeed = ttsSpeedOverride || 1.0;

  // Natural cadence: inject subtle pauses at ellipses and em-dashes
  const processedText = text
    .replace(/\.\.\./g, '... ')
    .replace(/—/g, '— ');

  const result: any = await fal.subscribe('fal-ai/kokoro/american-english', {
    input: {
      prompt: processedText,
      voice: kokoroVoice,
      speed: ttsSpeed,
    },
    logs: false,
  });

  const data = (result as any).data || result;
  const audioUrl = data?.audio?.url || data?.audio_file?.url || data?.output?.url;
  if (!audioUrl) {
    throw new Error('Kokoro returned no audio URL: ' + JSON.stringify(data).substring(0, 300));
  }

  // Download the WAV file
  const response = await fetch(audioUrl);
  if (!response.ok) throw new Error(`Failed to download Kokoro audio (${response.status})`);
  const audioBuffer = Buffer.from(await response.arrayBuffer());

  if (audioBuffer.length === 0) throw new Error('Kokoro returned empty audio');
  console.log(`[TTS] Kokoro audio: ${audioBuffer.length} bytes`);

  // Estimate duration from WAV (linear16, assumed 24kHz mono)
  // Kokoro outputs WAV — check actual sample rate from header
  const pcmBytes = Math.max(0, audioBuffer.length - 44);
  const bytesPerSecond = 24000 * 2; // 24kHz, 16-bit
  const durationMs = Math.round((pcmBytes / bytesPerSecond) * 1000);

  const assetId = `voiceover_${nanoid(12)}`;
  const filename = `${assetId}.wav`;
  const uploadResult = await uploadMedia(audioBuffer, userId, filename, 'audio/wav', { customAssetId: assetId });

  return {
    audioBuffer,
    durationMs,
    audioUrl: uploadResult.signedUrl,
    audioAssetId: uploadResult.assetId,
    gcsPath: uploadResult.gcsPath,
  };
}

// ─── Deepgram Aura TTS (fallback) ───────────────────────────────

async function generateWithDeepgram(
  text: string,
  userId: string,
  deepgramVoice: string,
): Promise<TTSResult> {
  const { createClient } = await import('@deepgram/sdk');
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) throw new Error('DEEPGRAM_API_KEY not set');

  const deepgram = createClient(apiKey);

  const response = await deepgram.speak.request(
    { text },
    {
      model: deepgramVoice,
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

  if (audioBuffer.length === 0) throw new Error('Deepgram returned empty audio');
  console.log(`[TTS] Deepgram audio: ${audioBuffer.length} bytes`);

  const pcmBytes = Math.max(0, audioBuffer.length - 44);
  const bytesPerSecond = 24000 * 2;
  const durationMs = Math.round((pcmBytes / bytesPerSecond) * 1000);

  const assetId = `voiceover_${nanoid(12)}`;
  const filename = `${assetId}.wav`;
  const uploadResult = await uploadMedia(audioBuffer, userId, filename, 'audio/wav', { customAssetId: assetId });

  return {
    audioBuffer,
    durationMs,
    audioUrl: uploadResult.signedUrl,
    audioAssetId: uploadResult.assetId,
    gcsPath: uploadResult.gcsPath,
  };
}

/**
 * Generate a short voice preview clip (for voice selection UI).
 */
export async function generateVoicePreview(
  voiceId: string,
): Promise<{ audioBuffer: Buffer; durationMs: number }> {
  const voice = TTS_VOICES.find(v => v.id === voiceId);
  const text = voice?.previewText || 'This is a preview of the selected voice for your narration.';

  if (voice?.provider === 'kokoro' || voiceId.startsWith('kokoro-')) {
    const key = process.env.FAL_AI_API_KEY;
    if (!key) throw new Error('FAL_AI_API_KEY not set');
    fal.config({ credentials: key });

    const result: any = await fal.subscribe('fal-ai/kokoro/american-english', {
      input: { prompt: text, voice: voice?.providerVoiceId || 'af_heart', speed: 1.0 },
      logs: false,
    });

    const data = (result as any).data || result;
    const audioUrl = data?.audio?.url || data?.audio_file?.url || data?.output?.url;
    if (!audioUrl) throw new Error('Kokoro preview failed');

    const response = await fetch(audioUrl);
    const audioBuffer = Buffer.from(await response.arrayBuffer());
    const pcmBytes = Math.max(0, audioBuffer.length - 44);
    const durationMs = Math.round((pcmBytes / (24000 * 2)) * 1000);

    return { audioBuffer, durationMs };
  }

  // Deepgram fallback
  const { createClient } = await import('@deepgram/sdk');
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) throw new Error('DEEPGRAM_API_KEY not set');

  const deepgram = createClient(apiKey);
  const response = await deepgram.speak.request(
    { text },
    { model: voice?.providerVoiceId || voiceId, encoding: 'linear16', container: 'wav', sample_rate: 24000 },
  );

  const stream = await response.getStream();
  if (!stream) throw new Error('No stream from Deepgram');

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
  const durationMs = Math.round((pcmBytes / (24000 * 2)) * 1000);

  return { audioBuffer, durationMs };
}

/**
 * Check if TTS is available (either Kokoro via fal.ai or Deepgram).
 */
export function isTTSAvailable(): boolean {
  return !!(process.env.FAL_AI_API_KEY || process.env.DEEPGRAM_API_KEY);
}
