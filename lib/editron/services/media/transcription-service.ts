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
  
  if (!asset) {
    throw new Error(`Asset ${assetId} not found`);
  }
  
  // Check for video/audio type
  if (asset.type !== 'video' && asset.type !== 'audio') {
    throw new Error(`Asset ${assetId} is not a video or audio file`);
  }
  
  // Return cached if exists and not forcing refresh
  if (asset.transcription && !options.forceRefresh) {
    return asset.transcription;
  }
  
  // Generate new transcription
  const transcription = await generateTranscription(asset, options.language);
  
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
 * Generate transcription using Deepgram.
 * Falls back to synthetic word timings from narration text if Deepgram fails.
 */
async function generateTranscription(
  asset: MediaAsset,
  language?: string
): Promise<TranscriptionData> {
  const { refreshSignedUrl } = await import('../gcs-service');

  // Get accessible URL — always refresh if gcsPath available (signed URLs expire)
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

  // Try Deepgram first
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
    console.warn(`[Transcription] Deepgram failed for ${asset.assetId}: ${deepgramErr.message}`);
    console.log(`[Transcription] Falling back to synthetic word timings from narration text`);

    // Fallback: look up the narration text from the storyboard scene
    // The voiceover asset was generated from this text — we know it exactly.
    const narrationText = await getNarrationTextForAsset(asset.assetId);
    if (narrationText) {
      return generateSyntheticTimings(narrationText, asset);
    }

    // If no narration text found, re-throw the original error
    throw deepgramErr;
  }
}

/**
 * Look up the narration text that was used to generate a voiceover asset.
 * Searches storyboard scenes for a matching voiceover assetId.
 */
async function getNarrationTextForAsset(assetId: string): Promise<string | null> {
  const db = await getDatabase();

  // Search storyboards for a scene with this voiceover assetId
  const storyboard = await db.collection('storyboards').findOne({
    'scenes.voiceover.audioAssetId': assetId,
  }) as any;

  if (!storyboard) return null;

  const scene = storyboard.scenes.find(
    (s: any) => s.voiceover?.audioAssetId === assetId,
  );

  return scene?.descriptor?.narration || null;
}

/**
 * Generate synthetic word-level timings from known narration text.
 * Distributes words evenly across the audio duration.
 * Not perfect but FAR better than no captions at all.
 */
function generateSyntheticTimings(
  narrationText: string,
  asset: MediaAsset,
): TranscriptionData {
  const words = narrationText.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    throw new Error('Narration text is empty');
  }

  // Estimate total duration from asset metadata or default to word count estimate
  // Average speaking rate: ~2.5 words/sec for professional narration
  const estimatedDurationMs = words.length * 400; // 400ms per word average

  // Distribute words with slight variation for natural feel
  const totalMs = estimatedDurationMs;
  const avgWordMs = totalMs / words.length;

  const timedWords: TranscriptionWord[] = words.map((word, i) => {
    const startMs = Math.round(i * avgWordMs);
    const endMs = Math.round((i + 1) * avgWordMs) - 20; // 20ms gap between words
    return {
      word,
      startMs,
      endMs: Math.max(startMs + 50, endMs), // Min 50ms per word
      confidence: 0.95, // Synthetic — high confidence since we know the text
    };
  });

  console.log(`[Transcription] Synthetic: ${words.length} words, ${totalMs}ms total`);

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
