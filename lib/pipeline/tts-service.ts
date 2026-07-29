/**
 * Text-to-Speech Service
 *
 * Primary: Kokoro TTS via fal.ai (more human-sounding, $0.02/1000 chars)
 * Fallback: Deepgram Aura TTS (reliable, wider voice range)
 */

import { fal } from '@fal-ai/client';
import { uploadMedia } from '@/lib/editron/services/upload-service';
import { getDatabase, COLLECTIONS } from '@/lib/editron/db/mongodb';
import { nanoid } from 'nanoid';
import { TTS_VOICES, TTS_SPEED_MAP, TTS_PAUSE_CONFIG } from './config/tts-config';
import {
  DEEPGRAM_ENGLISH_MODEL,
  KOKORO_ENGLISH_MODEL,
  resolveSpeechSynthesisCapability,
  type GeneratedSpeechCapability,
  type SpeechSynthesisCapability,
  type SpeechSynthesisProvider,
} from './speech-capabilities';
import { recordProviderCostEvent, type ProviderCostEventStatus } from '@/lib/financials/provider-cost-events';
import type { AudioRightsContract } from '@/lib/editron/shared/render-request-payload';
import {
  mergePcmWavSegments,
  normalizeSpeechPcmWav,
  type PcmWavSegment,
  type SpeechWavNormalizationReceipt,
} from './wav-audio';
export type { TTSVoice } from './config/tts-config';
export { TTS_VOICES };
export {
  listSupportedSpeechLanguages,
  resolveSpeechSynthesisCapability,
} from './speech-capabilities';
export type {
  CanonicalSpeechLanguage,
  GeneratedSpeechCapability,
  SpeechSynthesisCapability,
} from './speech-capabilities';

// ─── Pause Mapping Helpers ──────────────────────────────────────

function getRandomInRange(min: number, max: number): number {
  return Math.random() * (max - min) + min;
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

export const GENERATED_AUDIO_RECEIPT_VERSION = 'editron-generated-audio-receipt-v1' as const;
export const KOKORO_MIN_SPEECH_RATE = 0.1;
export const KOKORO_MAX_SPEECH_RATE = 5;

export type GeneratedSpeechRole = 'voiceover' | 'dubbing';
export type TTSPausePolicy = 'editorial' | 'provider-native';

type GeneratedSpeechProvider = SpeechSynthesisProvider;

export interface GeneratedAudioReceipt {
  version: typeof GENERATED_AUDIO_RECEIPT_VERSION;
  provider: GeneratedSpeechProvider;
  model: string;
  licenseId: string;
  assetId: string;
  mediaRole: GeneratedSpeechRole;
  synthesisSpeed: number;
  normalization?: SpeechWavNormalizationReceipt;
  generatedAt: string;
}

export interface TTSResult {
  audioBuffer: Buffer;
  durationMs: number;
  synthesisSpeed: number;
  audioUrl: string;
  audioAssetId: string;
  gcsPath?: string;
  r2Key: string | null;
  audioRights: AudioRightsContract;
  generatedAudioReceipt: GeneratedAudioReceipt;
  generatedSpeechCapability: GeneratedSpeechCapability;
}

async function recordPipelineTTSProviderCost(input: {
  status: ProviderCostEventStatus;
  userId?: string;
  action: 'voiceover_generation' | 'voice_preview';
  provider: 'fal-ai' | 'deepgram';
  model: string;
  voiceId?: string;
  audioCharacters: number;
  mediaSeconds?: number;
  bytesOut?: number;
  requestCount?: number;
  segmentCount?: number;
  functionMs?: number;
  error?: unknown;
}): Promise<void> {
  await recordProviderCostEvent({
    eventId: `pce_pipeline_tts_${input.action}_${input.provider}_${nanoid(10)}`,
    status: input.status,
    userId: input.userId,
    service: 'pipeline',
    action: input.action,
    route: input.action === 'voice_preview' ? '/api/services/pipeline/voices' : undefined,
    provider: input.provider,
    model: input.model,
    operation: 'voiceover_generation',
    units: {
      audioCharacters: input.audioCharacters,
      mediaSeconds: input.mediaSeconds,
      bytesOut: input.bytesOut,
      requestCount: input.requestCount ?? 1,
      functionMs: input.functionMs,
    },
    metadata: {
      voiceId: input.voiceId,
      segmentCount: input.segmentCount,
      errorClass: input.error instanceof Error ? input.error.name : undefined,
    },
  });
}

function mediaSecondsFromDurationMs(durationMs: number): number | undefined {
  return Number.isFinite(durationMs) && durationMs > 0
    ? Math.round((durationMs / 1000) * 100) / 100
    : undefined;
}

function resolveExplicitSpeechRate(
  speechRate: number | undefined,
  provider: GeneratedSpeechProvider,
): number | undefined {
  if (speechRate === undefined) return undefined;
  if (!Number.isFinite(speechRate) || speechRate <= 0) {
    throw new Error(`invalid-speech-rate:${String(speechRate)}`);
  }
  if (provider !== 'fal-ai') {
    if (speechRate !== 1) throw new Error(`provider-native-speech-rate-unsupported:${provider}`);
    return 1;
  }
  if (speechRate < KOKORO_MIN_SPEECH_RATE || speechRate > KOKORO_MAX_SPEECH_RATE) {
    throw new Error(
      `speech-rate-out-of-provider-range:${speechRate}:${KOKORO_MIN_SPEECH_RATE}-${KOKORO_MAX_SPEECH_RATE}`,
    );
  }
  return speechRate;
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
    mediaRole?: GeneratedSpeechRole;
    pausePolicy?: TTSPausePolicy;
    speechRate?: number;
  } = {},
): Promise<TTSResult> {
  const capability = resolveSpeechSynthesisCapability(options.language, options.voice);
  if (!capability) {
    throw new Error(`unsupported-speech-capability:${String(options.language ?? 'English')}:${String(options.voice ?? 'default')}`);
  }
  const mediaRole = options.mediaRole ?? 'voiceover';
  const pausePolicy = options.pausePolicy ?? 'editorial';

  // Determine TTS speed based on content type (default 1.0)
  const contentType = options.contentType?.toLowerCase();
  const explicitSpeechRate = resolveExplicitSpeechRate(options.speechRate, capability.provider);
  const ttsSpeed = explicitSpeechRate
    ?? (contentType && TTS_SPEED_MAP[contentType] ? TTS_SPEED_MAP[contentType] : 1.0);
  if (capability.provider === 'fal-ai') {
    try {
      return await generateWithKokoro(
        text,
        userId,
        capability.model,
        capability.voiceId,
        ttsSpeed,
        mediaRole,
        generatedCapability(capability, false),
        pausePolicy,
      );
    } catch (error) {
      if (!capability.fallback || explicitSpeechRate !== undefined) throw error;
      console.warn(`[TTS] ${capability.model} failed (${errorMessage(error)}), using same-language fallback ${capability.fallback.model}`);
      return await generateWithDeepgram(
        text,
        userId,
        capability.fallback.voiceId,
        mediaRole,
        generatedCapability({
          ...capability,
          provider: capability.fallback.provider,
          model: capability.fallback.model,
          voiceId: capability.fallback.voiceId,
        }, true),
        pausePolicy,
      );
    }
  }
  return await generateWithDeepgram(
    text,
    userId,
    capability.voiceId,
    mediaRole,
    generatedCapability(capability, false),
    pausePolicy,
  );
}

// ─── Kokoro TTS (fal.ai) ────────────────────────────────────────

async function generateWithKokoro(
  text: string,
  userId: string,
  model: string,
  kokoroVoice: string,
  ttsSpeedOverride?: number,
  mediaRole: GeneratedSpeechRole = 'voiceover',
  speechCapability: GeneratedSpeechCapability = {
    language: 'en',
    displayName: 'English',
    provider: 'fal-ai',
    model: KOKORO_ENGLISH_MODEL,
    voiceId: 'af_heart',
    fallbackUsed: false,
  },
  pausePolicy: TTSPausePolicy = 'editorial',
): Promise<TTSResult> {
  const costStartMs = Date.now();
  let requestCount = 0;
  const key = process.env.FAL_AI_API_KEY;
  if (!key) throw new Error('FAL_AI_API_KEY not set');
  fal.config({ credentials: key });

  // Pacing-aware TTS speed - defaults to 1.0
  const ttsSpeed = ttsSpeedOverride || 1.0;

  // Split text by punctuation to inject precise pauses
  const segments = pausePolicy === 'provider-native'
    ? [{ segment: text, pauseType: null }]
    : splitTextByPauses(text);
  const audioChunks: PcmWavSegment[] = [];

  try {
    for (const { segment, pauseType } of segments) {
      if (!segment.trim()) {
        // Just add silence if segment is empty but has a pause type
        if (pauseType) {
          const pause = TTS_PAUSE_CONFIG[pauseType];
          audioChunks.push({
            kind: 'silence',
            durationMs: getRandomInRange(pause.min, pause.max) * 1000,
          });
        }
        continue;
      }

      requestCount += 1;
      const result: any = await fal.subscribe(model, {
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
        if (!response.ok) throw new Error(`Kokoro audio download failed: ${response.status}`);
        audioChunks.push({ kind: 'wav', buffer: Buffer.from(await response.arrayBuffer()) });
      }

      // Inject silence after segment if mapped
      if (pauseType) {
        const pause = TTS_PAUSE_CONFIG[pauseType];
        audioChunks.push({
          kind: 'silence',
          durationMs: getRandomInRange(pause.min, pause.max) * 1000,
        });
      }
    }

    if (audioChunks.length === 0) throw new Error('Kokoro returned no audio for any segment');

    const merged = mergePcmWavSegments(audioChunks);
    const normalized = normalizeSpeechPcmWav(merged.buffer, {
      trimBoundarySilence: mediaRole === 'dubbing',
      previouslyRemovedNonAudioBytes: merged.removedNonAudioBytes,
    });
    const audioBuffer = normalized.buffer;
    const durationMs = normalized.durationMs;

    const assetId = `voiceover_${nanoid(12)}`;
    const uploaded = await uploadVoiceoverAudio(audioBuffer, userId, assetId, durationMs, {
      provider: 'fal-ai',
      model,
      mediaRole,
      speechCapability,
      synthesisSpeed: ttsSpeed,
      normalization: normalized.receipt,
    });

    await recordPipelineTTSProviderCost({
      status: 'success',
      userId,
      action: 'voiceover_generation',
      provider: 'fal-ai',
      model,
      voiceId: kokoroVoice,
      audioCharacters: text.length,
      mediaSeconds: mediaSecondsFromDurationMs(durationMs),
      bytesOut: audioBuffer.length,
      requestCount,
      segmentCount: segments.length,
      functionMs: Date.now() - costStartMs,
    });

    return {
      audioBuffer,
      durationMs,
      synthesisSpeed: ttsSpeed,
      ...uploaded,
    };
  } catch (err) {
    await recordPipelineTTSProviderCost({
      status: 'failed',
      userId,
      action: 'voiceover_generation',
      provider: 'fal-ai',
      model,
      voiceId: kokoroVoice,
      audioCharacters: text.length,
      requestCount,
      segmentCount: segments.length,
      functionMs: Date.now() - costStartMs,
      error: err,
    });
    throw err;
  }
}
async function generateWithDeepgram(
  text: string,
  userId: string,
  deepgramVoice: string,
  mediaRole: GeneratedSpeechRole = 'voiceover',
  speechCapability: GeneratedSpeechCapability = {
    language: 'en',
    displayName: 'English',
    provider: 'deepgram',
    model: DEEPGRAM_ENGLISH_MODEL,
    voiceId: DEEPGRAM_ENGLISH_MODEL,
    fallbackUsed: false,
  },
  pausePolicy: TTSPausePolicy = 'editorial',
): Promise<TTSResult> {
  const costStartMs = Date.now();
  const { createClient } = await import('@deepgram/sdk');
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) throw new Error('DEEPGRAM_API_KEY not set');

  const deepgram = createClient(apiKey);

  // Use SSML for precise punctuation pauses in Deepgram Aura
  const segments = pausePolicy === 'provider-native'
    ? [{ segment: text, pauseType: null }]
    : splitTextByPauses(text);
  let ssml = '';
  for (const { segment, pauseType } of segments) {
    ssml += segment;
    if (pauseType) {
      const pause = TTS_PAUSE_CONFIG[pauseType];
      const duration = getRandomInRange(pause.min, pause.max).toFixed(2);
      ssml += `<break time="${duration}s"/>`;
    }
  }

  try {
    const response = await deepgram.speak.request(
      { text: pausePolicy === 'provider-native' ? text : `<speak>${ssml}</speak>` },
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
    const rawAudioBuffer = Buffer.concat(chunks);

    if (rawAudioBuffer.length === 0) throw new Error('Deepgram returned empty audio');
    const normalized = normalizeSpeechPcmWav(rawAudioBuffer, {
      trimBoundarySilence: mediaRole === 'dubbing',
    });
    const audioBuffer = normalized.buffer;
    const durationMs = normalized.durationMs;

    const assetId = `voiceover_${nanoid(12)}`;
    const uploaded = await uploadVoiceoverAudio(audioBuffer, userId, assetId, durationMs, {
      provider: 'deepgram',
      model: deepgramVoice,
      mediaRole,
      speechCapability,
      synthesisSpeed: 1,
      normalization: normalized.receipt,
    });

    await recordPipelineTTSProviderCost({
      status: 'success',
      userId,
      action: 'voiceover_generation',
      provider: 'deepgram',
      model: deepgramVoice,
      voiceId: deepgramVoice,
      audioCharacters: text.length,
      mediaSeconds: mediaSecondsFromDurationMs(durationMs),
      bytesOut: audioBuffer.length,
      requestCount: 1,
      segmentCount: segments.length,
      functionMs: Date.now() - costStartMs,
    });

    return {
      audioBuffer,
      durationMs,
      synthesisSpeed: 1,
      ...uploaded,
    };
  } catch (err) {
    await recordPipelineTTSProviderCost({
      status: 'failed',
      userId,
      action: 'voiceover_generation',
      provider: 'deepgram',
      model: deepgramVoice,
      voiceId: deepgramVoice,
      audioCharacters: text.length,
      requestCount: 1,
      segmentCount: segments.length,
      functionMs: Date.now() - costStartMs,
      error: err,
    });
    throw err;
  }
}
async function uploadVoiceoverAudio(
  audioBuffer: Buffer,
  userId: string,
  assetId: string,
  durationMs: number,
  provenance: {
    provider: GeneratedSpeechProvider;
    model: string;
    mediaRole: GeneratedSpeechRole;
    speechCapability: GeneratedSpeechCapability;
    synthesisSpeed: number;
    normalization: SpeechWavNormalizationReceipt;
  },
): Promise<Pick<
  TTSResult,
  | 'audioUrl'
  | 'audioAssetId'
  | 'gcsPath'
  | 'r2Key'
  | 'audioRights'
  | 'generatedAudioReceipt'
  | 'generatedSpeechCapability'
>> {
  const filename = `${assetId}.wav`;
  const uploadResult = await uploadMedia(audioBuffer, userId, filename, 'audio/wav', { customAssetId: assetId });
  const urlExpiresAt = uploadResult.urlExpiresAt ?? new Date('2099-12-31T00:00:00.000Z');
  const licenseId = provenance.provider === 'fal-ai'
    ? `fal-ai:${provenance.model.replace(/^fal-ai\//, '')}:commercial-use`
    : `deepgram:${provenance.model}:service-output-terms`;
  const audioRights: AudioRightsContract = {
    mediaRole: provenance.mediaRole,
    source: 'generated',
    userChoice: 'attested',
    licensed: true,
    evidence: {
      kind: 'generated-provider',
      sourceAssetId: uploadResult.assetId,
      licenseId,
    },
  };
  const generatedAudioReceipt: GeneratedAudioReceipt = {
    version: GENERATED_AUDIO_RECEIPT_VERSION,
    provider: provenance.provider,
    model: provenance.model,
    licenseId,
    assetId: uploadResult.assetId,
    mediaRole: provenance.mediaRole,
    synthesisSpeed: provenance.synthesisSpeed,
    normalization: provenance.normalization,
    generatedAt: new Date().toISOString(),
  };

  const db = await getDatabase();
  await db.collection(COLLECTIONS.MEDIA_ASSETS).updateOne(
    { assetId: uploadResult.assetId },
    {
      $set: {
        cachedUrl: uploadResult.signedUrl,
        gcsPath: uploadResult.gcsPath ?? null,
        r2Key: uploadResult.r2Key,
        urlExpiresAt,
        durationMs,
        audioDurationMs: durationMs,
        source: 'generated',
        audioRights,
        generatedAudioReceipt,
        generatedSpeechCapability: provenance.speechCapability,
        synthesisSpeed: provenance.synthesisSpeed,
        updatedAt: new Date(),
      },
      $setOnInsert: {
        assetId: uploadResult.assetId,
        userId,
        type: 'audio',
        filename,
        size: uploadResult.size,
        contentType: uploadResult.contentType,
        uploadedAt: new Date(),
      },
    },
    { upsert: true },
  );

  return {
    audioUrl: uploadResult.signedUrl,
    audioAssetId: uploadResult.assetId,
    gcsPath: uploadResult.gcsPath ?? undefined,
    r2Key: uploadResult.r2Key,
    audioRights,
    generatedAudioReceipt,
    generatedSpeechCapability: provenance.speechCapability,
  };
}

function generatedCapability(
  capability: Omit<SpeechSynthesisCapability, 'fallback'>,
  fallbackUsed: boolean,
): GeneratedSpeechCapability {
  return {
    language: capability.language,
    displayName: capability.displayName,
    provider: capability.provider,
    model: capability.model,
    voiceId: capability.voiceId,
    fallbackUsed,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
    const costStartMs = Date.now();
    const key = process.env.FAL_AI_API_KEY;
    if (!key) throw new Error('FAL_AI_API_KEY not set');
    fal.config({ credentials: key });

    try {
      const result: any = await fal.subscribe('fal-ai/kokoro/american-english', {
        input: { prompt: text, voice: (voice?.providerVoiceId || 'af_heart') as any, speed: 1.0 },
        logs: false,
      });

      const data = (result as any).data || result;
      const audioUrl = data?.audio?.url || data?.audio_file?.url || data?.output?.url;
      if (!audioUrl) throw new Error('Kokoro preview failed');

      const response = await fetch(audioUrl);
      const audioBuffer = Buffer.from(await response.arrayBuffer());
      const durationMs = normalizeSpeechPcmWav(audioBuffer, {
        trimBoundarySilence: false,
      }).durationMs;

      await recordPipelineTTSProviderCost({
        status: 'success',
        action: 'voice_preview',
        provider: 'fal-ai',
        model: 'fal-ai/kokoro/american-english',
        voiceId,
        audioCharacters: text.length,
        mediaSeconds: mediaSecondsFromDurationMs(durationMs),
        bytesOut: audioBuffer.length,
        requestCount: 1,
        functionMs: Date.now() - costStartMs,
      });

      return { audioBuffer, durationMs };
    } catch (err) {
      await recordPipelineTTSProviderCost({
        status: 'failed',
        action: 'voice_preview',
        provider: 'fal-ai',
        model: 'fal-ai/kokoro/american-english',
        voiceId,
        audioCharacters: text.length,
        requestCount: 1,
        functionMs: Date.now() - costStartMs,
        error: err,
      });
      throw err;
    }
  }

  // Deepgram fallback
  const costStartMs = Date.now();
  const { createClient } = await import('@deepgram/sdk');
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) throw new Error('DEEPGRAM_API_KEY not set');

  const deepgram = createClient(apiKey);
  const model = voice?.providerVoiceId || voiceId;

  try {
    const response = await deepgram.speak.request(
      { text },
      { model, encoding: 'linear16', container: 'wav', sample_rate: 24000 },
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
    const durationMs = normalizeSpeechPcmWav(audioBuffer, {
      trimBoundarySilence: false,
    }).durationMs;

    await recordPipelineTTSProviderCost({
      status: 'success',
      action: 'voice_preview',
      provider: 'deepgram',
      model,
      voiceId,
      audioCharacters: text.length,
      mediaSeconds: mediaSecondsFromDurationMs(durationMs),
      bytesOut: audioBuffer.length,
      requestCount: 1,
      functionMs: Date.now() - costStartMs,
    });

    return { audioBuffer, durationMs };
  } catch (err) {
    await recordPipelineTTSProviderCost({
      status: 'failed',
      action: 'voice_preview',
      provider: 'deepgram',
      model,
      voiceId,
      audioCharacters: text.length,
      requestCount: 1,
      functionMs: Date.now() - costStartMs,
      error: err,
    });
    throw err;
  }
}
/**
 * Check if TTS is available (either Kokoro via fal.ai or Deepgram).
 */
export function isTTSAvailable(): boolean {
  return !!(process.env.FAL_AI_API_KEY || process.env.DEEPGRAM_API_KEY);
}
