/**
 * Transcription Service
 * 
 * Single source of truth for video/audio transcription data.
 * Handles caching, retrieval, and generation of transcriptions.
 * 
 * All timestamps are 0-based (relative to source video start).
 */

import { getDatabase, COLLECTIONS } from '../../db/mongodb';
import type { MediaAsset } from '../asset-resolver';
import type { 
  TranscriptionData, 
  TranscriptionWord, 
  TranscriptionOptions 
} from './types';

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

  console.log(`[Transcription] Lookup: assetId=${assetId}, userId=${userId}, found=${!!asset}, type=${asset?.type || 'N/A'}, hasCached=${!!(asset as any)?.transcription}, durationMs=${(asset as any)?.durationMs || (asset as any)?.audioDurationMs || 'N/A'}`);

  if (!asset) {
    throw new Error(`Asset ${assetId} not found for userId=${userId}`);
  }

  // Check for video/audio type
  if (asset.type !== 'video' && asset.type !== 'audio') {
    throw new Error(`Asset ${assetId} is type '${asset.type}', not video or audio`);
  }

  // Return cached if exists and not forcing refresh
  if (asset.transcription && !options.forceRefresh) {
    console.log(`[Transcription] Using cached transcription for ${assetId}: ${asset.transcription.words?.length || 0} words`);
    return asset.transcription;
  }
  
  // Generate new transcription
  const transcription = await generateTranscription(asset, options.language, { preferWordLevel: options.preferWordLevel });
  
  // Cache to database
  await db.collection(COLLECTIONS.MEDIA_ASSETS).updateOne(
    { assetId },
    { $set: { transcription } }
  );
  
  return transcription;
}

/**
 * Check if an asset has cached transcription (without generating)
 */
export async function hasTranscription(
  assetId: string,
  userId: string
): Promise<boolean> {
  const db = await getDatabase();
  
  const asset = await db
    .collection(COLLECTIONS.MEDIA_ASSETS)
    .findOne(
      { assetId, userId, transcription: { $exists: true, $ne: null } },
      { projection: { _id: 1 } }
    );
  
  return asset !== null;
}

/**
 * Generate transcription.
 * Priority: 1) Synthetic from narration text (ThinkForge projects — instant, free, always accurate)
 *           2) Whisper Large V3 on fal.ai (best ASR — word timestamps, ~$0.006/min)
 *           3) Gemma 4 (free fallback — less accurate for speech)
 *           4) Deepgram Nova-2 (final fallback)
 */
async function generateTranscription(
  asset: MediaAsset,
  language?: string,
  options?: { preferWordLevel?: boolean }
): Promise<TranscriptionData> {
  const { refreshSignedUrl } = await import('../gcs-service');

  // ─── Strategy 1: Synthetic timings from known narration text ────
  // For ThinkForge-generated voiceovers, we already know the exact text.
  // No transcription needed — instant, free, always accurate.
  const narrationText = await getNarrationTextForAsset(asset.assetId);
  if (narrationText) {
    console.log(`[Transcription] Using synthetic timings from narration text for ${asset.assetId}`);
    return generateSyntheticTimings(narrationText, asset);
  }

  // ─── Mode 2: Grok STT for real footage (word-level timestamps) ──
  // Grok STT: $0.10/hr (3.6x cheaper than Deepgram), word-level timestamps,
  // accepts URL directly (no download), 500MB max, speaker diarization.
  // Per v3 constraint:overlay.caption_timing_drift — "max 0.5s before speech onset."
  // Wizper only returns segment-level → 10-30s drift on long videos.
  if (options?.preferWordLevel) {
    const xaiKey = process.env.XAI_API_KEY || process.env.GROK_API_KEY;
    if (xaiKey) {
      try {
        let mediaUrl = asset.cachedUrl;
        if (!mediaUrl && asset.gcsPath) {
          const signed = await refreshSignedUrl(asset.gcsPath);
          mediaUrl = signed.url;
        }
        if (!mediaUrl) throw new Error('No URL for asset');

        // NOTE: Grok STT 400 "Could not detect audio format" is a known issue.
        // Root cause: R2 CDN worker (editron-asset-proxy) may not serve headers that
        // let xAI's format detection work. Fix options (not yet implemented):
        //   a) R2 Worker: serve Content-Type from stored metadata (separate deploy)
        //   b) Download file + upload directly as FormData 'file' (doubles bandwidth)
        //   c) xAI fix: they should detect MP4 from magic bytes regardless of headers
        // Until fixed: Grok fails with 400, falls through to Whisper (works, no diarization).

        console.log(`[Transcription] Grok STT: transcribing ${asset.assetId} via CDN URL...`);

        // xAI STT API expects FormData (multipart/form-data), NOT JSON.
        // Retry on 429 — CDN rate-limits when multiple services download simultaneously
        // (VideoUnderstanding + multipart upload + Grok all hit CDN around the same time)
        let response: Response | null = null;
        const maxRetries = 3;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
          const formData = new FormData();
          formData.append('url', mediaUrl);
          formData.append('language', language || 'en');
          formData.append('format', 'true');
          formData.append('diarize', 'true');

          const grokController = new AbortController();
          const grokTimer = setTimeout(() => grokController.abort(), 90_000);
          response = await fetch('https://api.x.ai/v1/stt', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${xaiKey}`,
            },
            body: formData,
            signal: grokController.signal,
          });
          clearTimeout(grokTimer);

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
          console.log(`[Transcription] Grok STT: ${words.length} words, ${speakerCount} speakers, duration=${data.duration?.toFixed(1)}s for ${asset.assetId}`);
          return {
            words,
            transcript: data.text || words.map((w: any) => w.word).join(' '),
            language: data.language || language || 'en',
            confidence: 0.95,
            generatedAt: new Date(),
            ...(speakerCount > 1 && { speakerCount }),
          };
        }
        console.warn(`[Transcription] Grok STT returned 0 words for ${asset.assetId}, falling through`);
      } catch (grokErr: any) {
        console.warn(`[Transcription] Grok STT failed for ${asset.assetId}: ${grokErr.message}, falling through to Wizper`);
      }
    }
  }

  // ─── Get accessible URL for external transcription ──────────────
  let mediaUrl: string;

  if (asset.gcsPath) {
    try {
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
    throw new Error(`Empty URL for asset ${asset.assetId} — gcsPath: ${asset.gcsPath || 'none'}, source: ${asset.source}`);
  }

  // ─── Strategy 2: Whisper Large V3 on fal.ai ─────────────────────
  // Industry-standard ASR. Accurate word timestamps. ~$0.006/min.
  // Better than Gemma/Gemini for transcription (dedicated speech model).
  try {
    const { fal } = await import('@fal-ai/client');
    const falKey = process.env.FAL_AI_API_KEY || process.env.FAL_KEY;
    if (falKey) fal.config({ credentials: falKey });
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

      console.log(`[Transcription] Whisper: ${words.length} words (from ${data.chunks.length} segments) for ${asset.assetId}`);
      return {
        words,
        transcript: data.text || words.map((w: any) => w.word).join(' '),
        language: data.inferred_languages?.[0] || language || 'en',
        confidence: 0.9,
        generatedAt: new Date(),
      };
    }
    console.warn(`[Transcription] Whisper returned 0 chunks for ${asset.assetId}, trying Gemini`);
  } catch (whisperErr: any) {
    console.warn(`[Transcription] Whisper failed for ${asset.assetId}: ${whisperErr.message}, trying Gemini`);
  }

  // ─── Strategy 3: Gemma 4 transcription (fallback) ──────────────
  // Free but less accurate for speech-to-text than Whisper.
  try {
    const result = await transcribeWithGemini(mediaUrl, asset, language);
    if (result.words.length > 0) {
      console.log(`[Transcription] Gemma/Gemini: ${result.words.length} words for ${asset.assetId}`);
      return result;
    }
    console.warn(`[Transcription] Gemma/Gemini returned 0 words for ${asset.assetId}, trying Deepgram`);
  } catch (geminiErr: any) {
    console.warn(`[Transcription] Gemma/Gemini failed for ${asset.assetId}: ${geminiErr.message}, trying Deepgram`);
  }

  // ─── Strategy 4: Deepgram Nova-2 (final fallback) ──────────────
  try {
    const { transcribeMedia } = await import('../deepgram-service');
    const result = await transcribeMedia(mediaUrl, {
      language: language || undefined,
    });

    const words: TranscriptionWord[] = result.words.map(w => ({
      word: w.word,
      startMs: w.startMs,
      endMs: w.endMs,
      confidence: w.confidence,
    }));

    return {
      words,
      transcript: result.transcript,
      language: result.detectedLanguage,
      confidence: result.confidence,
      generatedAt: new Date(),
    };
  } catch (deepgramErr: any) {
    console.error(`[Transcription] All strategies failed for ${asset.assetId}`);
    throw new Error(`Transcription failed: Gemini and Deepgram both failed. Last error: ${deepgramErr.message}`);
  }
}

/**
 * Transcribe audio/video using Gemini 2.0 Flash.
 * Downloads the file, sends to Gemini with a transcription prompt.
 */
async function transcribeWithGemini(
  mediaUrl: string,
  asset: MediaAsset,
  language?: string,
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

  // Parse JSON response — handle markdown code blocks
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

  return {
    words,
    transcript,
    language: language || 'en',
    confidence: 0.9,
    generatedAt: new Date(),
  };
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
      console.log(`[Transcription] Narration found via Strategy 1 (direct storyboard lookup) for ${assetId}: ${scene.descriptor.narration.length} chars`);
      return scene.descriptor.narration;
    }
    console.log(`[Transcription] Strategy 1: storyboard found but no narration for ${assetId}`);
  } else {
    console.log(`[Transcription] Strategy 1: no storyboard found with voiceover.audioAssetId=${assetId}`);
  }

  // Strategy 2: Find via project → sourceStoryboardId → match by time position
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
          // Match by time position — find the scene that covers this overlay's start frame
          const fps = project.fps || 30;
          const overlayStartSec = overlay.from / fps;
          let cumulativeSec = 0;
          for (const scene of sb.scenes) {
            const sceneDur = scene.descriptor?.durationSeconds || 5;
            if (overlayStartSec >= cumulativeSec && overlayStartSec < cumulativeSec + sceneDur) {
              if (scene.descriptor?.narration) {
                console.log(`[Transcription] Found narration via project→storyboard time match for ${assetId}`);
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
            console.log(`[Transcription] Found narration via voiceover index match (${idx}) for ${assetId}`);
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
    if (word.includes('...') || word.includes('…')) return 400;
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

  console.log(`[Transcription] Synthetic: ${words.length} words, ${totalMs}ms total (weighted syllable distribution)`);

  return {
    words: timedWords,
    transcript: narrationText,
    language: 'en',
    confidence: 0.95,
    generatedAt: new Date(),
  };
}

/**
 * Get transcription for a specific time range (useful for clips)
 * 
 * @param transcription - Full transcription data
 * @param startMs - Start of range (0-based)
 * @param endMs - End of range (0-based)
 */
export function getWordsInRange(
  transcription: TranscriptionData,
  startMs: number,
  endMs: number
): TranscriptionWord[] {
  return transcription.words.filter(
    w => w.startMs >= startMs && w.endMs <= endMs
  );
}

/**
 * Clear cached transcription (e.g., if user wants to regenerate)
 */
export async function clearTranscription(
  assetId: string,
  userId: string
): Promise<void> {
  const db = await getDatabase();
  
  await db.collection(COLLECTIONS.MEDIA_ASSETS).updateOne(
    { assetId, userId },
    { $unset: { transcription: '' } }
  );
}
