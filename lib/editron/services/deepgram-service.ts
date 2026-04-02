/**
 * Deepgram Transcription Service
 * 
 * Handles video-to-text transcription with word-level timestamps
 * using Deepgram Nova-3 model.
 */

import { createClient, PrerecordedSchema, SyncPrerecordedResponse } from '@deepgram/sdk';
import type { CaptionWord } from '@/components/editron/editor/version-7.0.0/types';

// Initialize Deepgram client
const getDeepgramClient = () => {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    throw new Error('DEEPGRAM_API_KEY environment variable is not set');
  }
  return createClient(apiKey);
};

export interface TranscriptionOptions {
  /** Language code (e.g., 'en', 'es', 'hi') - if not provided, auto-detect is used */
  language?: string;
  /** Deepgram model to use - defaults to 'nova-2' */
  model?: string;
  /** Enable punctuation */
  punctuate?: boolean;
  /** Enable smart formatting (numbers, dates, etc.) */
  smartFormat?: boolean;
}

export interface TranscriptionResult {
  /** Word-level timestamps matching CaptionWord format */
  words: CaptionWord[];
  /** Total duration in milliseconds */
  durationMs: number;
  /** Detected or specified language */
  detectedLanguage: string;
  /** Overall confidence score (0-1) */
  confidence: number;
  /** Full transcript text */
  transcript: string;
}

/**
 * Supported languages for Deepgram Nova-2
 * Full list at: https://developers.deepgram.com/docs/models-languages-overview
 */
export const SUPPORTED_LANGUAGES = [
  { code: 'auto', label: 'Auto-detect' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'it', label: 'Italian' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'nl', label: 'Dutch' },
  { code: 'hi', label: 'Hindi' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'zh', label: 'Chinese' },
  { code: 'ru', label: 'Russian' },
  { code: 'ar', label: 'Arabic' },
  { code: 'id', label: 'Indonesian' },
  { code: 'tr', label: 'Turkish' },
  { code: 'pl', label: 'Polish' },
  { code: 'uk', label: 'Ukrainian' },
  { code: 'vi', label: 'Vietnamese' },
  { code: 'th', label: 'Thai' },
] as const;

/**
 * Transcribe a video/audio file URL to get word-level timestamps
 * 
 * @param mediaUrl - Direct URL to the video or audio file
 * @param options - Transcription options
 * @returns TranscriptionResult with word timestamps
 */
export async function transcribeMedia(
  mediaUrl: string,
  options: TranscriptionOptions = {}
): Promise<TranscriptionResult> {
  const deepgram = getDeepgramClient();

  const {
    language,
    model = 'nova-2',
    punctuate = true,
    smartFormat = true,
  } = options;

  // Build transcription options
  const transcriptionOptions: PrerecordedSchema = {
    model,
    punctuate,
    smart_format: smartFormat,
    // Enable word-level timestamps - critical for our use case
    utterances: false,
    // Detect language if not specified
    detect_language: !language || language === 'auto',
  };

  // Only set language if explicitly provided (not auto)
  if (language && language !== 'auto') {
    transcriptionOptions.language = language;
  }

  try {
    // Download file first, then transcribe — GCS signed URLs often expire
    // or are inaccessible from Deepgram's servers. Downloading ensures
    // the audio data is available regardless of URL type/expiry.
    let response: SyncPrerecordedResponse;
    const isGCSUrl = mediaUrl.includes('storage.googleapis.com') && mediaUrl.includes('X-Goog-Signature');

    if (isGCSUrl) {
      console.log('[Deepgram] Downloading GCS file before transcription...');
      const fileResponse = await fetch(mediaUrl);
      if (!fileResponse.ok) throw new Error(`Failed to download media for transcription (${fileResponse.status})`);
      const buffer = Buffer.from(await fileResponse.arrayBuffer());
      const mimeType = fileResponse.headers.get('content-type') || 'audio/wav';

      response = await deepgram.listen.prerecorded.transcribeFile(
        buffer,
        { ...transcriptionOptions, mimetype: mimeType },
      ) as unknown as SyncPrerecordedResponse;
    } else {
      response = await deepgram.listen.prerecorded.transcribeUrl(
        { url: mediaUrl },
        transcriptionOptions,
      ) as unknown as SyncPrerecordedResponse;
    }

    // Extract word-level data from response
    const result = response.results ? response : (response as any).result;
    
    if (!result?.results?.channels?.[0]?.alternatives?.[0]) {
      throw new Error('No transcription results returned from Deepgram');
    }

    const alternative = result.results.channels[0].alternatives[0];
    const deepgramWords = alternative.words || [];
    
    // Convert Deepgram words to our CaptionWord format
    const words: CaptionWord[] = deepgramWords.map((w: any) => ({
      word: w.punctuated_word || w.word,
      startMs: Math.round(w.start * 1000),
      endMs: Math.round(w.end * 1000),
      confidence: w.confidence,
    }));

    // Calculate overall confidence
    const totalConfidence = words.reduce((sum, w) => sum + w.confidence, 0);
    const avgConfidence = words.length > 0 ? totalConfidence / words.length : 0;

    // Get duration
    const durationMs = words.length > 0 
      ? words[words.length - 1].endMs 
      : 0;

    // Detected language
    const detectedLanguage = result.results.channels[0].detected_language || language || 'en';

    return {
      words,
      durationMs,
      detectedLanguage,
      confidence: avgConfidence,
      transcript: alternative.transcript || '',
    };
  } catch (error: any) {
    // Handle specific Deepgram errors
    if (error.message?.includes('401')) {
      throw new Error('Invalid Deepgram API key');
    }
    if (error.message?.includes('400')) {
      throw new Error('Invalid audio format or URL not accessible');
    }
    if (error.message?.includes('429')) {
      throw new Error('Deepgram rate limit exceeded. Please try again later.');
    }
    
    throw new Error(`Transcription failed: ${error.message}`);
  }
}

/**
 * Check if Deepgram is properly configured
 */
export function isDeepgramConfigured(): boolean {
  return !!process.env.DEEPGRAM_API_KEY;
}
