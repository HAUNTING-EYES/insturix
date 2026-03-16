import { createClient, DeepgramClient } from "@deepgram/sdk";
import ytdl from "@distube/ytdl-core";
// import ytdlp from "yt-dlp-exec";

// ---------------------------------------------------------------------------
// Deepgram supports these languages for transcription + speaker diarization.
// Nova-2 is the recommended model — best accuracy-to-cost ratio.
// https://developers.deepgram.com/docs/models-languages-overview
// ---------------------------------------------------------------------------
export const SUPPORTED_LANGUAGES = [
  { code: "en", name: "English" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "it", name: "Italian" },
  { code: "pt", name: "Portuguese" },
  { code: "nl", name: "Dutch" },
  { code: "hi", name: "Hindi" },
  { code: "ja", name: "Japanese" },
  { code: "zh", name: "Chinese" },
  { code: "ko", name: "Korean" },
  { code: "pl", name: "Polish" },
  { code: "ru", name: "Russian" },
  { code: "tr", name: "Turkish" },
  { code: "uk", name: "Ukrainian" },
  { code: "sv", name: "Swedish" },
  { code: "no", name: "Norwegian" },
  { code: "da", name: "Danish" },
  { code: "id", name: "Indonesian" },
  { code: "ro", name: "Romanian" },
];

export const SUPPORTED_LANGUAGE_NAMES = SUPPORTED_LANGUAGES.map((l) => l.name);

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------
export interface SpeakerSegment {
  speaker: string; // "0", "1", "2" … (Deepgram uses numeric speaker IDs)
  text: string;
  start: number;   // ms
  end: number;     // ms
}

export interface TranscriptionResult {
  id: string;
  status: "completed" | "error";
  text: string;                  // Full plain transcript
  detectedLanguage: string | null;
  confidence: number | null;
  speakerSegments: SpeakerSegment[];
  formattedTranscript: string;   // Speaker-labelled text for the LLM system prompt
  durationMs: number | null;
  wordCount: number;
}

// ---------------------------------------------------------------------------
// Client — lazily instantiated, reused across calls in the same process.
// ---------------------------------------------------------------------------
let _client: DeepgramClient | null = null;

function getClient(): DeepgramClient {
  if (!_client) {
    const key = process.env.DEEPGRAM_API_KEY;
    if (!key) throw new Error("DEEPGRAM_API_KEY is not set");
    _client = createClient(key);
  }
  return _client;
}

// ---------------------------------------------------------------------------
// transcribeAudio
//
// Sends a pre-signed or public URL to Deepgram's prerecorded transcription
// endpoint with:
//   • Nova-2 model      — best accuracy, ~$0.0043/min (~$0.26/hr)
//   • diarize: true     — speaker diarization
//   • detect_language   — auto-detect, falls back to "en" if unsupported
//   • smart_format      — punctuation, paragraphs, numerals
//   • utterances: true  — required to get per-speaker utterance segments
//
// ---------------------------------------------------------------------------
// isYouTubeUrl
// Matches youtube.com/watch, youtu.be, youtube.com/shorts, etc.
// ---------------------------------------------------------------------------
function isYouTubeUrl(url: string): boolean {
  return /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(url);
}

// ---------------------------------------------------------------------------
// downloadYouTubeAudio
//
// Uses youtube-dl-exec (bundles yt-dlp binary — no Python needed) to download
// audio-only as a raw buffer piped directly to stdout.
//
// --format bestaudio      picks best audio-only stream
// --output -              pipes raw bytes to stdout instead of writing a file
// --no-playlist           never accidentally download a full playlist
// ---------------------------------------------------------------------------
async function downloadYouTubeAudio(youtubeUrl: string) {
  try {
    if (!ytdl.validateURL(youtubeUrl)) {
      throw new Error("Invalid YouTube URL");
    }

    const stream = ytdl(youtubeUrl, {
      quality: "highestaudio",
      filter: "audioonly"
    });

    return stream;

  } catch (err: any) {
    throw new Error(`YouTube audio download failed: ${err?.stderr || err?.message}`);
  }
}

// ---------------------------------------------------------------------------
// Shared Deepgram options
// ---------------------------------------------------------------------------
const DEEPGRAM_OPTIONS = {
  model: "nova-2" as const,
  diarize: true,
  detect_language: true,
  smart_format: true,
  utterances: true,   // Required for per-speaker segments
  punctuate: true,
  paragraphs: false,  // Keep flat for LLM consumption
  filler_words: false,  // Strip "um", "uh" etc.
};

// ---------------------------------------------------------------------------
// transcribeAudio
//
// Entry point for all transcription. Detects YouTube URLs and downloads audio
// first before sending to Deepgram as a file buffer. All other URLs (GCS
// signed URLs, direct media URLs) are sent directly via transcribeUrl.
// ---------------------------------------------------------------------------
export async function transcribeAudio(publicUrl: string) {
  if (isYouTubeUrl(publicUrl)) {
    return transcribeYouTube(publicUrl);
  }
  else{
    return transcribeUrl(publicUrl);
  }
}

// ---------------------------------------------------------------------------
// transcribeUrl — for direct media URLs (signed GCS, CDN, etc.)
// ---------------------------------------------------------------------------
async function transcribeUrl(publicUrl: string): Promise<TranscriptionResult> {
  const deepgram = getClient();
 
  const { result, error } = await deepgram.listen.prerecorded.transcribeUrl(
    { url: publicUrl },
    DEEPGRAM_OPTIONS
  );
 
  if (error) {
    throw new Error(`Deepgram transcription failed: ${JSON.stringify(error)}`);
  }
  if (!result) {
    throw new Error("Deepgram returned an empty result");
  }
 
  return parseDeepgramResult(result);
}

// ---------------------------------------------------------------------------
// transcribeYouTube — downloads audio buffer then sends as a file to Deepgram
// ---------------------------------------------------------------------------
async function transcribeYouTube(youtubeUrl: string): Promise<TranscriptionResult> {
  const deepgram = getClient();

  const audioStream = await downloadYouTubeAudio(youtubeUrl);

  const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
    audioStream,
    DEEPGRAM_OPTIONS
  );

  if (error) {
    throw new Error(`Deepgram transcription failed: ${JSON.stringify(error)}`);
  }

  if (!result) {
    throw new Error("Deepgram returned an empty result");
  }

  return parseDeepgramResult(result);
}

// ---------------------------------------------------------------------------
// parseDeepgramResult — shared result parser for both transcription paths
// ---------------------------------------------------------------------------
function parseDeepgramResult(result: any): TranscriptionResult {
  const channel = result.results?.channels?.[0];
  const alternative = channel?.alternatives?.[0];

  if (!alternative) {
    throw new Error("Deepgram returned no transcript alternatives");
  }

  const text = alternative.transcript ?? "";

  const speakerSegments: SpeakerSegment[] =
    result.results?.utterances?.map((u: any) => ({
      speaker: String(u.speaker ?? "0"),
      text: u.transcript,
      start: Math.round(u.start * 1000),
      end: Math.round(u.end * 1000),
    })) ?? [];

  const rawLang = result.results?.channels?.[0]?.detected_language ?? null;
  const detectedLanguage = rawLang ? rawLang.split("-")[0] : null;
  const confidence = alternative.confidence ?? null;
  const durationMs = result.metadata?.duration
    ? Math.round(result.metadata.duration * 1000)
    : null;
  const wordCount = alternative.words?.length
    ?? text.split(/\s+/).filter(Boolean).length;
  const id = result.metadata?.request_id ?? crypto.randomUUID();

  return {
    id,
    status: "completed",
    text,
    detectedLanguage,
    confidence,
    speakerSegments,
    formattedTranscript: buildFormattedTranscript(speakerSegments, text),
    durationMs,
    wordCount,
  };
}

// ---------------------------------------------------------------------------
// buildFormattedTranscript
//
// Produces a speaker-labelled, timestamped transcript for the LLM system
// prompt. Format: [MM:SS] Speaker N: <text>
// Falls back to plain text if no diarization segments are available.
// ---------------------------------------------------------------------------
function buildFormattedTranscript(
  segments: SpeakerSegment[],
  plainText: string
): string {
  if (!segments.length) return plainText;

  return segments
    .map((seg) => {
      const minutes = Math.floor(seg.start / 60_000);
      const seconds = Math.floor((seg.start % 60_000) / 1_000);
      const timestamp = `[${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}]`;
      return `${timestamp} Speaker ${seg.speaker}: ${seg.text}`;
    })
    .join("\n");
}