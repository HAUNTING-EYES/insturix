/**
 * Text-to-Speech Service
 *
 * Primary: Kokoro TTS via fal.ai (more human-sounding, $0.02/1000 chars)
 * Fallback: Deepgram Aura TTS (reliable, wider voice range)
 */

import { fal } from '@fal-ai/client';
import { uploadMedia } from '@/lib/editron/services/upload-service';
import { nanoid } from 'nanoid';
import { TTS_VOICES, TTS_SPEED_MAP, TTS_PAUSE_CONFIG } from './config/tts-config';
export type { TTSVoice } from './config/tts-config';
export { TTS_VOICES };

// ─── Pause Mapping Helpers ──────────────────────────────────────

function getRandomInRange(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function generateSilence(durationSeconds: number, sampleRate: number = 24000): Buffer {
  const numSamples = Math.floor(durationSeconds * sampleRate);
  const bytesPerSample = 2; // 16-bit
  return Buffer.alloc(numSamples * bytesPerSample, 0);
}

function mergeWavBuffers(buffers: Buffer[]): Buffer {
  if (buffers.length === 0) return Buffer.alloc(0);
  if (buffers.length === 1) return buffers[0];

  const header = Buffer.alloc(44);
  const firstWav = buffers.find(b => b.length >= 44 && b.toString('utf8', 0, 4) === 'RIFF');
  if (!firstWav) return Buffer.concat(buffers);

  firstWav.copy(header, 0, 0, 44);
  const dataChunks: Buffer[] = [];
  for (const b of buffers) {
    if (b.length >= 44 && b.toString('utf8', 0, 4) === 'RIFF') {
      dataChunks.push(b.slice(44));
    } else {
      dataChunks.push(b);
    }
  }

  const totalDataSize = dataChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  header.writeUInt32LE(totalDataSize + 36, 4);
  header.writeUInt32LE(totalDataSize, 40);

  return Buffer.concat([header, ...dataChunks]);
}

/**
 * Splits text into segments with associated pause types.
 */
function splitTextByPauses(text: string): { segment: string; pauseType: keyof typeof TTS_PAUSE_CONFIG | null }[] {
  // Regex to capture punctuation and double newlines
  const regex = /(\n\n+|\.\.\.|—|[.,!?;:])/g;
  const parts = text.split(regex);
  const result: { segment: string; pauseType: keyof typeof TTS_PAUSE_CONFIG | null }[] = [];

  for (let i = 0; i < parts.length; i += 2) {
    const rawSegment = parts[i];
    const mark = parts[i + 1];
    
    if (rawSegment?.trim() || mark) {
      let pauseType: keyof typeof TTS_PAUSE_CONFIG | null = null;
      if (mark) {
        if (mark.includes('\n\n')) pauseType = 'paragraphBreak';
        else if (mark === '...') pauseType = 'ellipsis';
        else if (mark === '—') pauseType = 'emDash';
        else if (mark === ',') pauseType = 'comma';
        else if (mark === '.') pauseType = 'period';
        else if (mark === '?') pauseType = 'questionMark';
        else if (mark === '!') pauseType = 'exclamation';
        else if (mark === ':') pauseType = 'colon';
        else if (mark === ';') pauseType = 'period';
      }

      // Combine text with its trailing punctuation for natural inflection
      result.push({
        segment: (rawSegment || '') + (mark || ''),
        pauseType
      });
    }
  }
  return result;
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

  // Split text by punctuation to inject precise pauses
  const segments = splitTextByPauses(text);
  const audioChunks: Buffer[] = [];

  console.log(`[TTS] Kokoro processing ${segments.length} segments for precise pauses`);

  for (const { segment, pauseType } of segments) {
    if (!segment.trim()) {
      // Just add silence if segment is empty but has a pause type
      if (pauseType) {
        const pause = TTS_PAUSE_CONFIG[pauseType];
        audioChunks.push(generateSilence(getRandomInRange(pause.min, pause.max)));
      }
      continue;
    }

    const result: any = await fal.subscribe('fal-ai/kokoro/american-english', {
      input: {
        prompt: segment,
        voice: kokoroVoice as any,
        speed: ttsSpeed,
      },
      logs: false,
    });

    const data = (result as any).data || result;
    const audioUrl = data?.audio?.url || data?.audio_file?.url || data?.output?.url;
    if (audioUrl) {
      const response = await fetch(audioUrl);
      if (response.ok) {
        audioChunks.push(Buffer.from(await response.arrayBuffer()));
      }
    }

    // Inject silence after segment if mapped
    if (pauseType) {
      const pause = TTS_PAUSE_CONFIG[pauseType];
      audioChunks.push(generateSilence(getRandomInRange(pause.min, pause.max)));
    }
  }

  if (audioChunks.length === 0) throw new Error('Kokoro returned no audio for any segment');

  const audioBuffer = mergeWavBuffers(audioChunks);

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

  // Use SSML for precise punctuation pauses in Deepgram Aura
  const segments = splitTextByPauses(text);
  let ssml = '';
  for (const { segment, pauseType } of segments) {
    ssml += segment;
    if (pauseType) {
      const pause = TTS_PAUSE_CONFIG[pauseType];
      const duration = getRandomInRange(pause.min, pause.max).toFixed(2);
      ssml += `<break time="${duration}s"/>`;
    }
  }

  const response = await deepgram.speak.request(
    { text: `<speak>${ssml}</speak>` },
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
