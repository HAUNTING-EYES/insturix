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
 * Generate transcription using Deepgram
 */
async function generateTranscription(
  asset: MediaAsset,
  language?: string
): Promise<TranscriptionData> {
  // Import Deepgram service
  const { transcribeMedia } = await import('../deepgram-service');
  const { refreshSignedUrl } = await import('../gcs-service');
  
  // Get accessible URL
  let mediaUrl: string;
  
  if (asset.source === 'public' && asset.publicUrl) {
    mediaUrl = asset.publicUrl;
  } else if (asset.cachedUrl) {
    // Check if URL is expired
    const now = Date.now();
    const expiresAt = new Date(asset.urlExpiresAt).getTime();
    
    if (expiresAt < now && asset.gcsPath) {
      const { url } = await refreshSignedUrl(asset.gcsPath);
      mediaUrl = url;
    } else {
      mediaUrl = asset.cachedUrl;
    }
  } else {
    throw new Error(`No accessible URL for asset ${asset.assetId}`);
  }
  
  // Transcribe
  const result = await transcribeMedia(mediaUrl, {
    language: language || undefined,
  });
  
  // Convert to our format (already 0-based from Deepgram)
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
