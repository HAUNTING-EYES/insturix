/**
 * Transcription Service
 * 
 * Single source of truth for video/audio transcription data.
 * Handles caching, retrieval, and generation of transcriptions.
 * 
 * All timestamps are 0-based (relative to source video start).
 */

import { getDatabase, COLLECTIONS } from '../../db/mongodb';
import { recordProviderCostEvent, type ProviderCostEventStatus } from '@/lib/financials/provider-cost-events';
import type { AssetTranscriptionTimingEvidenceV2 } from '../asset-transcription-source-cache-v2';
import type { MediaAsset } from '../asset-resolver';
import type { SourceTranscriptionProviderIdV1 }
  from '../source-transcription-egress-authorization-v1';
import type { 
  TranscriptionData, 
  TranscriptionWord, 
  TranscriptionOptions 
} from './types';

type TranscriptionProviderCostInput = {
  status: ProviderCostEventStatus;
  userId?: string;
  provider: string;
  model: string;
  strategy: string;
  operation?: string;
  requestCount?: number;
  retryCount?: number;
  responseStatus?: number;
  bytesIn?: number;
  mediaSeconds?: number;
  functionMs?: number;
  wordCount?: number;
  segmentCount?: number;
  speakerCount?: number;
  language?: string;
  preferWordLevel?: boolean;
  error?: unknown;
};

export type GeneratedTranscriptionV2 = Readonly<{
  transcription: TranscriptionData;
  timingEvidence: AssetTranscriptionTimingEvidenceV2;
}>;

type TranscriptionGenerationOptionsV2 = Readonly<{
  preferWordLevel?: boolean;
  userId?: string;
  exactMediaUrl?: string;
  allowSyntheticNarration?: boolean;
  allowedProviderIds?: readonly SourceTranscriptionProviderIdV1[];
}>;

export function hasUsableWordTimings(transcription: unknown): transcription is TranscriptionData {
  if (!transcription || typeof transcription !== 'object') return false;
  const words = (transcription as { words?: unknown }).words;
  if (!Array.isArray(words) || words.length === 0) return false;

  let timedWordCount = 0;
  let previousStartMs = -Infinity;
  for (const rawWord of words) {
    if (!rawWord || typeof rawWord !== 'object') return false;
    const word = rawWord as { word?: unknown; startMs?: unknown; endMs?: unknown };
    if (typeof word.word !== 'string' || !word.word.trim()) continue;
    if (
      typeof word.startMs !== 'number'
      || !Number.isFinite(word.startMs)
      || word.startMs < 0
      || typeof word.endMs !== 'number'
      || !Number.isFinite(word.endMs)
      || word.endMs <= word.startMs
      || word.startMs < previousStartMs
    ) {
      return false;
    }
    timedWordCount += 1;
    previousStartMs = word.startMs;
  }

  return timedWordCount > 0;
}

function getErrorClass(error: unknown): string | undefined {
  if (!error) return undefined;
  return error instanceof Error ? error.name : typeof error;
}

async function recordEditronTranscriptionProviderCost(
  asset: MediaAsset,
  input: TranscriptionProviderCostInput,
): Promise<void> {
  await recordProviderCostEvent({
    status: input.status,
    userId: input.userId,
    assetId: asset.assetId,
    taskId: asset.assetId,
    service: 'editron',
    action: 'media_transcription',
    route: 'lib/editron/services/media/transcription-service',
    provider: input.provider,
    model: input.model,
    operation: input.operation ?? 'transcription',
    units: {
      requestCount: input.requestCount,
      retryCount: input.retryCount,
      bytesIn: input.bytesIn,
      mediaSeconds: input.mediaSeconds,
      functionMs: input.functionMs,
    },
    metadata: {
      strategy: input.strategy,
      assetType: asset.type,
      assetSource: asset.source,
      hasGcsPath: Boolean(asset.gcsPath),
      preferWordLevel: Boolean(input.preferWordLevel),
      languageProvided: Boolean(input.language),
      responseStatus: input.responseStatus,
      wordCount: input.wordCount,
      segmentCount: input.segmentCount,
      speakerCount: input.speakerCount,
      errorClass: getErrorClass(input.error),
    },
  });
}

/**
 * Get transcription for an asset (cached or fresh)
 * 
 * @param assetId - The asset ID to get transcription for
 * @param userId - User ID for authorization
 * @param options - Optional settings
 * @returns Transcription data with 0-based timestamps
 */
export async function getTranscription(
  assetId: string,
  userId: string,
  options: TranscriptionOptions = {}
): Promise<TranscriptionData> {
  const db = await getDatabase();
  
  // Fetch asset
  const asset = await db
    .collection(COLLECTIONS.MEDIA_ASSETS)
    .findOne({ assetId, userId }) as unknown as MediaAsset | null;

  if (!asset) {
    throw new Error(`Asset ${assetId} not found for userId=${userId}`);
  }

  // Check for video/audio type
  if (asset.type !== 'video' && asset.type !== 'audio') {
    throw new Error(`Asset ${assetId} is type '${asset.type}', not video or audio`);
  }

  // A text-only cache is useful for reading, but unsafe for frame-addressed edits.
  // When a caller requests word-level grounding, regenerate instead of fabricating
  // frames from word order or returning stale segment-only timing.
  if (asset.transcription && !options.forceRefresh) {
    if (!options.preferWordLevel || hasUsableWordTimings(asset.transcription)) {
      return asset.transcription;
    }
    console.warn(`[Transcription] Cached transcript for ${assetId} has no usable word alignment; regenerating word timings.`);
  }
  
  // Generate new transcription
  const generated = await generateTranscription(asset, options.language, {
    preferWordLevel: options.preferWordLevel,
    userId,
  });
  const { transcription } = generated;
  
  if (options.preferWordLevel && (
    generated.timingEvidence.timingBasis !== 'MEASURED_WORD'
    || !hasUsableWordTimings(transcription)
  )) {
    throw new Error(`Transcription for ${assetId} did not produce usable word-level timing.`);
  }

  // Cache to database
  await db.collection(COLLECTIONS.MEDIA_ASSETS).updateOne(
    { assetId, userId },
    { $set: { transcription } }
  );
  
  return transcription;
}

/**
 * Raw provider adapter for a caller that already owns a qualified source
 * lease. This function neither authorizes provider egress nor revalidates the
 * lease after provider work; the source-bound orchestration owner must do both.
 * Unlike the legacy asset path, no provider may substitute another asset URL.
 */
export async function transcribeLeasedMediaSourceWithProviderV2(input: Readonly<{
  asset: MediaAsset;
  userId: string;
  sourceUrl: string;
  requestedLanguage?: string | null;
  precision: 'TEXT_ALLOWED' | 'MEASURED_WORD_REQUIRED';
  approvedProviderIds: readonly SourceTranscriptionProviderIdV1[];
}>): Promise<GeneratedTranscriptionV2> {
  if (input.asset.type !== 'video' && input.asset.type !== 'audio') {
    throw new Error('ASSET_TRANSCRIPTION_PROVIDER_MEDIA_KIND_INVALID');
  }
  const sourceUrl = exactProviderMediaUrl(input.sourceUrl);
  const requestedLanguage = input.requestedLanguage?.trim() || undefined;
  if (requestedLanguage && requestedLanguage.length > 64) {
    throw new Error('ASSET_TRANSCRIPTION_PROVIDER_LANGUAGE_INVALID');
  }
  const approvedProviderIds = approvedProviderSet(input.approvedProviderIds);
  return generateTranscription(input.asset, requestedLanguage, {
    preferWordLevel: input.precision === 'MEASURED_WORD_REQUIRED',
    userId: input.userId,
    exactMediaUrl: sourceUrl,
    allowSyntheticNarration: false,
    allowedProviderIds: approvedProviderIds,
  });
}

/**
 * Generate transcription.
 * Text priority: synthetic narration, fal.ai segment timing, Gemini estimated
 * timing, then Deepgram measured word timing. Precision requests may only use
 * measured Grok or Deepgram word timing.
 */
async function generateTranscription(
  asset: MediaAsset,
  language?: string,
  options?: TranscriptionGenerationOptionsV2,
): Promise<GeneratedTranscriptionV2> {
  // Synthetic timing is suitable for non-precision reading/caption previews only.
  // Frame-addressed edits require measured ASR timing even when narration text is known.
  const narrationText = options?.allowSyntheticNarration === false
    ? null
    : await getNarrationTextForAsset(asset.assetId);
  if (narrationText && !options?.preferWordLevel) {
    return {
      transcription: generateSyntheticTimings(narrationText, asset),
      timingEvidence: {
        timingBasis: 'SYNTHETIC_NARRATION',
        providerId: 'editron',
        modelId: 'synthetic-narration-v1',
        strategy: 'synthetic_narration',
        providerContractVersion: '1',
      },
    };
  }

  // --- Mode 2: Grok STT for real footage (word-level timestamps) --
  // Grok STT: $0.10/hr (3.6x cheaper than Deepgram), word-level timestamps,
  // accepts URL directly (no download), 500MB max, speaker diarization.
  // Per v3 constraint:overlay.caption_timing_drift - "max 0.5s before speech onset."
  // Wizper only returns segment-level -> 10-30s drift on long videos.
  if (options?.preferWordLevel) {
    const xaiKey = process.env.XAI_API_KEY || process.env.GROK_API_KEY;
    if (providerAllowed(options, 'xai') && xaiKey) {
      let grokProviderAttempted = false;
      let grokRequestCount = 0;
      let grokResponseStatus: number | undefined;
      let grokBytesIn: number | undefined;
      const grokStartedAt = Date.now();
      try {
        let mediaUrl = options.exactMediaUrl ?? asset.cachedUrl;
        if (!mediaUrl && asset.gcsPath) {
          const { refreshSignedUrl } = await import('../gcs-service');
          const signed = await refreshSignedUrl(asset.gcsPath);
          mediaUrl = signed.url;
        }
        if (!mediaUrl) throw new Error('No URL for asset');

        // xAI STT API: use `file` parameter (binary upload), NOT `url`.
        // The `url` parameter was undocumented and xAI broke/deprecated it (~May 2026).
        // Official docs: "The file parameter must be provided after all other parameters."
        // See: https://docs.x.ai/developers/model-capabilities/audio/speech-to-text
        // Download from R2 (same cloud, ~1-2s), upload binary to xAI with correct MIME.
        // Scale note: holds file in memory (~90MB typical). For 1000+ concurrent, use
        // xAI Files API (upload once, reference by ID). Documented in scaling phase backlog.
        let fileUrl = mediaUrl;
        if (!options.exactMediaUrl) {
          try {
            const { isR2Available, getR2PresignedReadUrl } = await import('../r2-service');
            if (isR2Available()) {
              fileUrl = await getR2PresignedReadUrl(asset.assetId, 3600);
            }
          } catch (e) { console.warn(`[Transcription] R2 presigned URL failed, using CDN:`, e instanceof Error ? e.message : e); }
        }

        const dlController = new AbortController();
        const dlTimer = setTimeout(() => dlController.abort(), 120_000);
        const dlResponse = await fetch(fileUrl, { signal: dlController.signal });
        clearTimeout(dlTimer);
        if (!dlResponse.ok) throw new Error(`File download failed: ${dlResponse.status}`);
        const fileBuffer = await dlResponse.arrayBuffer();
        grokBytesIn = fileBuffer.byteLength;
        const fileBlob = new Blob([fileBuffer], { type: 'video/mp4' });
        let response: Response | null = null;
        const maxRetries = 3;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
          const formData = new FormData();
          formData.append('language', language || 'en');
          formData.append('format', 'true');
          formData.append('diarize', 'true');
          formData.append('file', fileBlob, `${asset.assetId}.mp4`);

          const grokController = new AbortController();
          const grokTimer = setTimeout(() => grokController.abort(), 90_000);
          grokProviderAttempted = true;
          grokRequestCount += 1;
          response = await fetch('https://api.x.ai/v1/stt', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${xaiKey}`,
            },
            body: formData,
            signal: grokController.signal,
          });
          clearTimeout(grokTimer);
          grokResponseStatus = response.status;

          if (response.ok) break;

          const bodyText = await response.text().catch(() => 'no body');
          const is429 = response.status === 429 || bodyText.includes('429');
          if (is429 && attempt < maxRetries - 1) {
            const delayMs = (attempt + 1) * 5000; // 5s, 10s backoff
            console.warn(`[Transcription] Grok STT 429 (attempt ${attempt + 1}/${maxRetries}), retrying in ${delayMs / 1000}s...`);
            await new Promise(r => setTimeout(r, delayMs));
            continue;
          }

          throw new Error(`Grok STT returned ${response.status}: ${bodyText}`);
        }

        if (!response || !response.ok) {
          throw new Error('Grok STT: all retry attempts failed');
        }

        const data = await response.json();
        if (data.words && data.words.length > 0) {
          const words: TranscriptionWord[] = data.words.map((w: any) => ({
            word: w.text || '',
            startMs: Math.round((w.start || 0) * 1000),
            endMs: Math.round((w.end || 0) * 1000),
            confidence: 0.95,
            ...(w.speaker !== undefined && { speaker: w.speaker }),
          }));

          // Count distinct speakers from diarization (0 if no speaker labels)
          const speakerIds = new Set(words.filter(w => w.speaker !== undefined).map(w => w.speaker));
          const speakerCount = speakerIds.size;
          await recordEditronTranscriptionProviderCost(asset, {
            status: 'success',
            userId: options?.userId,
            provider: 'xai',
            model: 'grok-stt',
            strategy: 'grok_stt',
            requestCount: grokRequestCount,
            retryCount: Math.max(grokRequestCount - 1, 0),
            responseStatus: grokResponseStatus,
            bytesIn: grokBytesIn,
            mediaSeconds: typeof data.duration === 'number' ? data.duration : undefined,
            functionMs: Date.now() - grokStartedAt,
            wordCount: words.length,
            speakerCount,
            language,
            preferWordLevel: options?.preferWordLevel,
          });
          return {
            transcription: {
              words,
              transcript: data.text || words.map((w: any) => w.word).join(' '),
              language: data.language || language || 'en',
              confidence: 0.95,
              generatedAt: new Date(),
              ...(speakerCount > 1 && { speakerCount }),
            },
            timingEvidence: {
              timingBasis: 'MEASURED_WORD',
              providerId: 'xai',
              modelId: 'grok-stt',
              strategy: 'grok_stt',
              providerContractVersion: 'xai-stt-word-v1',
            },
          };
        }
        console.warn(`[Transcription] Grok STT returned 0 words for ${asset.assetId}, falling through`);
      } catch (grokErr: any) {
        if (grokProviderAttempted) {
          await recordEditronTranscriptionProviderCost(asset, {
            status: 'failed',
            userId: options?.userId,
            provider: 'xai',
            model: 'grok-stt',
            strategy: 'grok_stt',
            requestCount: grokRequestCount || 1,
            retryCount: Math.max(grokRequestCount - 1, 0),
            responseStatus: grokResponseStatus,
            bytesIn: grokBytesIn,
            functionMs: Date.now() - grokStartedAt,
            language,
            preferWordLevel: options?.preferWordLevel,
            error: grokErr,
          });
        }
        console.warn(`[Transcription] Grok STT failed for ${asset.assetId}: ${grokErr.message}, falling through to ${options?.preferWordLevel ? 'Deepgram' : 'Wizper'}`);
      }
    }
  }

  // --- Get accessible URL for external transcription --------------
  let mediaUrl: string;

  if (options?.exactMediaUrl) {
    mediaUrl = options.exactMediaUrl;
  } else if (asset.gcsPath) {
    try {
      const { refreshSignedUrl } = await import('../gcs-service');
      const { url } = await refreshSignedUrl(asset.gcsPath);
      mediaUrl = url;
    } catch (refreshErr: any) {
      console.warn(`[Transcription] Failed to refresh URL for ${asset.assetId}: ${refreshErr.message}, using cachedUrl`);
      mediaUrl = asset.cachedUrl || '';
    }
  } else if (asset.source === 'public' && asset.publicUrl) {
    mediaUrl = asset.publicUrl;
  } else if (asset.cachedUrl) {
    mediaUrl = asset.cachedUrl;
  } else {
    throw new Error(`No accessible URL for asset ${asset.assetId}`);
  }

  if (!mediaUrl) {
    throw new Error(`Empty URL for asset ${asset.assetId} - gcsPath: ${asset.gcsPath || 'none'}, source: ${asset.source}`);
  }

  if (!options?.preferWordLevel) {
    // --- Strategy 2: Whisper Large V3 on fal.ai -------------------
    // Wizper exposes segment boundaries here. The per-word values below are
    // proportional estimates and must never authorize frame-addressed edits.
    if (providerAllowed(options, 'fal-ai')) {
      let falProviderAttempted = false;
      const falStartedAt = Date.now();
      try {
        const { fal } = await import('@fal-ai/client');
        const falKey = process.env.FAL_AI_API_KEY || process.env.FAL_KEY;
        if (falKey) fal.config({ credentials: falKey });
        falProviderAttempted = true;
        const whisperResult = await Promise.race([
          fal.subscribe('fal-ai/wizper', {
            input: {
              audio_url: mediaUrl,
              task: 'transcribe',
              language: (language || undefined) as any,
              chunk_level: 'segment',
            },
            logs: false,
          }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Whisper/fal timeout (90s)')), 90_000)),
        ]);
        const data = whisperResult.data as any;
        if (data?.chunks && data.chunks.length > 0) {
          // Wizper returns segment-level chunks. Split each segment into word-level
          // timestamps by distributing the segment duration proportionally by word length.
          const words: TranscriptionWord[] = [];
          for (const chunk of data.chunks) {
            const segText = (chunk.text || '').trim();
            const segStart = (chunk.timestamp?.[0] || 0) * 1000;
            const segEnd = (chunk.timestamp?.[1] || 0) * 1000;
            const segWords = segText.split(/\s+/).filter(Boolean);
            if (segWords.length === 0) continue;

            const totalChars = segWords.reduce((sum: number, w: string) => sum + w.length, 0);
            let cursor = segStart;
            for (const w of segWords) {
              const wordDuration = ((w.length / totalChars) * (segEnd - segStart));
              words.push({
                word: w,
                startMs: Math.round(cursor),
                endMs: Math.round(cursor + wordDuration),
                confidence: 0.9,
              });
              cursor += wordDuration;
            }
          }

          const mediaSeconds = data.chunks.reduce(
            (max: number, chunk: any) => Math.max(max, Number(chunk.timestamp?.[1] || 0)),
            0,
          ) || undefined;
          await recordEditronTranscriptionProviderCost(asset, {
            status: 'success',
            userId: options?.userId,
            provider: 'fal-ai',
            model: 'fal-ai/wizper',
            strategy: 'fal_wizper',
            requestCount: 1,
            mediaSeconds,
            functionMs: Date.now() - falStartedAt,
            wordCount: words.length,
            segmentCount: data.chunks.length,
            language,
            preferWordLevel: options?.preferWordLevel,
          });
          return {
            transcription: {
              words,
              transcript: data.text || words.map((w: any) => w.word).join(' '),
              language: data.inferred_languages?.[0] || language || 'en',
              confidence: 0.9,
              generatedAt: new Date(),
            },
            timingEvidence: {
              timingBasis: 'SEGMENT_ESTIMATED',
              providerId: 'fal-ai',
              modelId: 'fal-ai-wizper',
              strategy: 'fal_wizper',
              providerContractVersion: 'fal-wizper-segment-v1',
            },
          };
        }
        await recordEditronTranscriptionProviderCost(asset, {
          status: 'failed',
          userId: options?.userId,
          provider: 'fal-ai',
          model: 'fal-ai/wizper',
          strategy: 'fal_wizper',
          requestCount: 1,
          functionMs: Date.now() - falStartedAt,
          language,
          preferWordLevel: options?.preferWordLevel,
          segmentCount: 0,
          error: new Error('Fal Wizper returned 0 chunks'),
        });
        console.warn(`[Transcription] Whisper returned 0 chunks for ${asset.assetId}, trying Gemini`);
      } catch (whisperErr: any) {
        if (falProviderAttempted) {
          await recordEditronTranscriptionProviderCost(asset, {
            status: 'failed',
            userId: options?.userId,
            provider: 'fal-ai',
            model: 'fal-ai/wizper',
            strategy: 'fal_wizper',
            requestCount: 1,
            functionMs: Date.now() - falStartedAt,
            language,
            preferWordLevel: options?.preferWordLevel,
            error: whisperErr,
          });
        }
        console.warn(`[Transcription] Whisper failed for ${asset.assetId}: ${whisperErr.message}, trying Gemini`);
      }
    }
    // --- Strategy 3: Gemini transcription (estimated fallback) ---
    // Prompt-produced timestamp numbers are not measured word alignment.
    if (providerAllowed(options, 'google-gemini')) {
      try {
        const result = await transcribeWithGemini(mediaUrl, asset, language, {
          userId: options?.userId,
          preferWordLevel: options?.preferWordLevel,
        });
        if (result.words.length > 0) {
          return {
            transcription: result,
            timingEvidence: {
              timingBasis: 'SEGMENT_ESTIMATED',
              providerId: 'google-gemini',
              modelId: 'editron-analysis-model',
              strategy: 'gemini_transcription',
              providerContractVersion: 'gemini-prompt-estimated-v1',
            },
          };
        }
        console.warn(`[Transcription] Gemini returned 0 words for ${asset.assetId}, trying Deepgram`);
      } catch (geminiErr: any) {
        console.warn(`[Transcription] Gemini failed for ${asset.assetId}: ${geminiErr.message}, trying Deepgram`);
      }
    }
  }

  // --- Strategy 4: Deepgram Nova-2 (final fallback) --------------
  if (!providerAllowed(options, 'deepgram')) {
    throw new Error('ASSET_TRANSCRIPTION_APPROVED_PROVIDERS_EXHAUSTED');
  }
  try {
    const { transcribeMedia } = await import('../deepgram-service');
    const result = await transcribeMedia(mediaUrl, {
      language: language || undefined,
      telemetry: {
        userId: options?.userId,
        assetId: asset.assetId,
        taskId: asset.assetId,
        route: 'lib/editron/services/media/transcription-service',
        strategy: 'deepgram_fallback',
        assetType: asset.type,
        assetSource: asset.source,
        hasGcsPath: Boolean(asset.gcsPath),
        preferWordLevel: options?.preferWordLevel,
      },
    });

    const words: TranscriptionWord[] = result.words.map(w => ({
      word: w.word,
      startMs: w.startMs,
      endMs: w.endMs,
      confidence: w.confidence,
    }));

    const transcription: TranscriptionData = {
      words,
      transcript: result.transcript,
      language: result.detectedLanguage,
      confidence: result.confidence,
      generatedAt: new Date(),
    };
    return {
      transcription,
      timingEvidence: {
        timingBasis: words.length > 0 ? 'MEASURED_WORD' : 'NO_SPEECH',
        providerId: 'deepgram',
        modelId: 'nova-2',
        strategy: 'deepgram_fallback',
        providerContractVersion: 'deepgram-word-v1',
      },
    };
  } catch (deepgramErr: any) {
    const route = options?.preferWordLevel
      ? 'measured-word Deepgram fallback'
      : 'text fallback Deepgram route';
    throw new Error(`Transcription failed: ${route} failed. Last error: ${deepgramErr.message}`);
  }
}

function exactProviderMediaUrl(value: unknown): string {
  const candidate = typeof value === 'string' ? value.trim() : '';
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error('ASSET_TRANSCRIPTION_PROVIDER_SOURCE_URL_INVALID');
  }
  if (parsed.protocol !== 'https:'
    || parsed.username
    || parsed.password
    || parsed.hash) {
    throw new Error('ASSET_TRANSCRIPTION_PROVIDER_SOURCE_URL_INVALID');
  }
  return candidate;
}

function approvedProviderSet(
  value: readonly SourceTranscriptionProviderIdV1[],
): readonly SourceTranscriptionProviderIdV1[] {
  const allowed: readonly SourceTranscriptionProviderIdV1[] = [
    'xai', 'deepgram', 'fal-ai', 'google-gemini',
  ];
  if (!Array.isArray(value) || value.length < 1 || value.length > allowed.length
    || value.some((providerId) => !allowed.includes(providerId))
    || new Set(value).size !== value.length) {
    throw new Error('ASSET_TRANSCRIPTION_APPROVED_PROVIDER_SET_INVALID');
  }
  return Object.freeze([...value]);
}

function providerAllowed(
  options: TranscriptionGenerationOptionsV2 | undefined,
  providerId: SourceTranscriptionProviderIdV1,
): boolean {
  return options?.allowedProviderIds === undefined
    || options.allowedProviderIds.includes(providerId);
}

/**
 * Transcribe audio/video using Gemini 2.0 Flash.
 * Downloads the file, sends to Gemini with a transcription prompt.
 */
async function transcribeWithGemini(
  mediaUrl: string,
  asset: MediaAsset,
  language?: string,
  telemetry?: { userId?: string; preferWordLevel?: boolean },
): Promise<TranscriptionData> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('No Gemini API key for transcription');

  const dlController = new AbortController();
  const dlTimer = setTimeout(() => dlController.abort(), 60_000);
  const response = await fetch(mediaUrl, { signal: dlController.signal });
  clearTimeout(dlTimer);
  if (!response.ok) throw new Error(`Failed to download media (${response.status})`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const mimeType = response.headers.get('content-type') || (asset.type === 'video' ? 'video/mp4' : 'audio/wav');

  // OLD: hardcoded gemini-2.5-flash. NEW: Gemma 4 via factory.
  const { getAnalysisModel } = await import('@/lib/editron/utils/gemini-model-factory');
  const model = await getAnalysisModel();
  const geminiStartedAt = Date.now();
  let geminiProviderAttempted = false;

  try {
    geminiProviderAttempted = true;
    const result = await Promise.race([
      model.generateContent([
        {
          inlineData: {
            data: buffer.toString('base64'),
            mimeType,
          },
        },
        {
          text: `Transcribe this audio with precise word-level timestamps.

Return a JSON array where each element is: {"word": "the_word", "start": 0.123, "end": 0.456}
- "start" and "end" are in SECONDS (decimal)
- Include ALL spoken words, including filler words
- Preserve punctuation on words (e.g., "Hello," not "Hello")
${language ? `- Language: ${language}` : '- Auto-detect language'}

Return ONLY the JSON array, no other text. Example:
[{"word":"Hello,","start":0.1,"end":0.4},{"word":"world.","start":0.5,"end":0.9}]`,
        },
      ]),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Gemini transcription timeout (90s)')), 90_000)),
    ]);

    const text = result.response.text()?.trim() || '';

    // Parse JSON response - handle markdown code blocks
    let jsonStr = text;
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    }

    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) throw new Error('Gemini did not return a JSON array');

    const words: TranscriptionWord[] = parsed.map((w: any) => ({
      word: String(w.word || ''),
      startMs: Math.round((w.start || 0) * 1000),
      endMs: Math.round((w.end || 0) * 1000),
      confidence: 0.9,
    })).filter((w: TranscriptionWord) => w.word.length > 0);

    const transcript = words.map(w => w.word).join(' ');
    await recordEditronTranscriptionProviderCost(asset, {
      status: words.length > 0 ? 'success' : 'failed',
      userId: telemetry?.userId,
      provider: 'google-gemini',
      model: 'editron-analysis-model',
      strategy: 'gemini_transcription',
      requestCount: 1,
      bytesIn: buffer.byteLength,
      functionMs: Date.now() - geminiStartedAt,
      wordCount: words.length,
      language,
      preferWordLevel: telemetry?.preferWordLevel,
    });

    return {
      words,
      transcript,
      language: language || 'en',
      confidence: 0.9,
      generatedAt: new Date(),
    };
  } catch (geminiErr: unknown) {
    if (geminiProviderAttempted) {
      await recordEditronTranscriptionProviderCost(asset, {
        status: 'failed',
        userId: telemetry?.userId,
        provider: 'google-gemini',
        model: 'editron-analysis-model',
        strategy: 'gemini_transcription',
        requestCount: 1,
        bytesIn: buffer.byteLength,
        functionMs: Date.now() - geminiStartedAt,
        language,
        preferWordLevel: telemetry?.preferWordLevel,
        error: geminiErr,
      });
    }
    throw geminiErr;
  }
}

/**
 * Look up the narration text that was used to generate a voiceover asset.
 * Searches storyboard scenes for a matching voiceover assetId.
 */
async function getNarrationTextForAsset(assetId: string): Promise<string | null> {
  const db = await getDatabase();

  // Strategy 1: Direct lookup by voiceover assetId in storyboard scenes
  const storyboard = await db.collection('storyboards').findOne({
    'scenes.voiceover.audioAssetId': assetId,
  }) as any;

  if (storyboard) {
    const scene = storyboard.scenes.find(
      (s: any) => s.voiceover?.audioAssetId === assetId,
    );
    if (scene?.descriptor?.narration) {
      return scene.descriptor.narration;
    }
  }

  // Strategy 2: Find via project -> sourceStoryboardId -> match by time position
  // This handles cases where the assetId format doesn't match exactly
  if (assetId.startsWith('voiceover_') || assetId.startsWith('vo_')) {
    // Find any project that references this asset
    const project = await db.collection('projects').findOne({
      'overlays.assetId': assetId,
    }) as any;

    if (project?.sourceStoryboardId) {
      const sb = await db.collection('storyboards').findOne({
        storyboardId: project.sourceStoryboardId,
      }) as any;

      if (sb?.scenes) {
        // Find the overlay with this assetId to get its time position
        const overlay = (project.overlays || []).find((o: any) => o.assetId === assetId);
        if (overlay) {
          // Match by time position - find the scene that covers this overlay's start frame
          const fps = project.fps || 30;
          const overlayStartSec = overlay.from / fps;
          let cumulativeSec = 0;
          for (const scene of sb.scenes) {
            const sceneDur = scene.descriptor?.durationSeconds || 5;
            if (overlayStartSec >= cumulativeSec && overlayStartSec < cumulativeSec + sceneDur) {
              if (scene.descriptor?.narration) {
                return scene.descriptor.narration;
              }
            }
            cumulativeSec += sceneDur;
          }
        }

        // Last resort: if only one scene has narration matching the overlay count
        const scenesWithNarration = sb.scenes.filter((s: any) => s.descriptor?.narration?.trim());
        if (scenesWithNarration.length > 0) {
          // Try matching by position in the voiceover list
          const voiceoverOverlays = (project.overlays || [])
            .filter((o: any) => (o.assetId || '').startsWith('voiceover_') || (o.assetId || '').startsWith('vo_'))
            .sort((a: any, b: any) => a.from - b.from);
          const idx = voiceoverOverlays.findIndex((o: any) => o.assetId === assetId);
          if (idx >= 0 && idx < scenesWithNarration.length) {
            return scenesWithNarration[idx].descriptor.narration;
          }
        }
      }
    }
  }

  return null;
}

/**
 * Generate synthetic word-level timings from known narration text.
 *
 * Uses weighted distribution based on:
 * - Syllable count (longer words = longer duration)
 * - Punctuation pauses (commas = 150ms, periods = 300ms, ellipsis = 400ms)
 * - Natural speech rhythm (short words like "a", "the" are faster)
 *
 * Calibrated to match professional TTS narration pacing (~150 words/min).
 */
function generateSyntheticTimings(
  narrationText: string,
  asset: MediaAsset,
): TranscriptionData {
  const words = narrationText.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    throw new Error('Narration text is empty');
  }

  // Use actual audio duration if available, otherwise estimate
  // TTS generates at ~2.5 words/sec (400ms/word average)
  const totalMs = (asset as any).durationMs
    || (asset as any).audioDurationMs
    || words.length * 400;

  // Estimate syllable count for each word (simple heuristic)
  const estimateSyllables = (word: string): number => {
    const clean = word.replace(/[^a-zA-Z]/g, '').toLowerCase();
    if (clean.length <= 2) return 1;
    // Count vowel groups as syllables
    const matches = clean.match(/[aeiouy]+/gi);
    let count = matches ? matches.length : 1;
    // Adjust for silent 'e' at end
    if (clean.endsWith('e') && count > 1) count--;
    return Math.max(1, count);
  };

  // Calculate weights: each word gets time proportional to its syllables
  // Short function words ("a", "the", "is") get reduced weight
  const shortWords = new Set(['a', 'an', 'the', 'is', 'it', 'in', 'on', 'to', 'of', 'at', 'by', 'or', 'as', 'if', 'so', 'no', 'do', 'up', 'my', 'we', 'he', 'me', 'am']);

  const weights = words.map(word => {
    const clean = word.replace(/[^a-zA-Z]/g, '').toLowerCase();
    const syllables = estimateSyllables(clean);
    const isShort = shortWords.has(clean);
    return isShort ? 0.6 : syllables;
  });

  // Calculate pause durations after each word based on trailing punctuation
  const pauses = words.map(word => {
    if (word.includes('...')) return 400;
    if (word.endsWith('.') || word.endsWith('!') || word.endsWith('?')) return 300;
    if (word.endsWith(',') || word.endsWith(';') || word.endsWith(':')) return 150;
    if (word.endsWith('"') || word.endsWith('"')) return 100;
    return 30; // Normal inter-word gap
  });

  // Total weight = sum of word weights + sum of pauses
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const totalPauseMs = pauses.reduce((a, b) => a + b, 0);

  // Allocate: speech time = totalMs - total pause time
  const speechMs = Math.max(totalMs - totalPauseMs, totalMs * 0.7); // At least 70% for speech
  const adjustedPauseScale = (totalMs - speechMs) / Math.max(totalPauseMs, 1);

  let currentMs = 0;
  const timedWords: TranscriptionWord[] = words.map((word, i) => {
    const wordDuration = Math.round((weights[i] / totalWeight) * speechMs);
    const startMs = Math.round(currentMs);
    const endMs = startMs + Math.max(wordDuration, 80); // Min 80ms per word
    const pauseAfter = Math.round(pauses[i] * adjustedPauseScale);
    currentMs = endMs + pauseAfter;
    return {
      word,
      startMs,
      endMs,
      confidence: 0.95,
    };
  });

  return {
    words: timedWords,
    transcript: narrationText,
    language: 'en',
    confidence: 0.95,
    generatedAt: new Date(),
  };
}
