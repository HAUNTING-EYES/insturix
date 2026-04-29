/**
 * Text-to-Speech Service
 *
 * Primary: Kokoro TTS via fal.ai (more human-sounding, $0.02/1000 chars)
 * Fallback: Deepgram Aura TTS (reliable, wider voice range)
 */

import { fal } from '@fal-ai/client';
import { uploadMedia } from '@/lib/editron/services/upload-service';
import { nanoid } from 'nanoid';
import { TTS_VOICES, TTS_SPEED_MAP } from './config/tts-config';
export type { TTSVoice } from './config/tts-config';
export { TTS_VOICES };

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
    contentType?: string; // New: content type for pacing
  } = {},
): Promise<TTSResult> {
  const voiceId = options.voice || 'kokoro-heart';
  const voiceConfig = TTS_VOICES.find(v => v.id === voiceId);
  const provider = voiceConfig?.provider || (voiceId.startsWith('kokoro-') ? 'kokoro' : 'deepgram');

  console.log(`[TTS] Generating: provider=${provider}, voice=${voiceId}, text="${text.substring(0, 80)}..." (${text.length} chars)`);

  // Determine TTS speed based on content type (default 1.0)
  const contentType = options.contentType?.toLowerCase();
  const ttsSpeed = contentType && TTS_SPEED_MAP[contentType] ? TTS_SPEED_MAP[contentType] : 1.0;
  if (provider === 'kokoro') {
    try {
      return await generateWithKokoro(text, userId, voiceConfig?.providerVoiceId || 'af_heart', ttsSpeed);
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
      voice: kokoroVoice as any,
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
    gcsPath: uploadResult.gcsPath!,
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
    gcsPath: uploadResult.gcsPath!,
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
      input: { prompt: text, voice: (voice?.providerVoiceId || 'af_heart') as any, speed: 1.0 },
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
