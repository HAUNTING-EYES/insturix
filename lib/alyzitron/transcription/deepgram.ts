import { createClient, DeepgramClient } from "@deepgram/sdk";

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
// Shared types — identical interface to the previous AssemblyAI module so
// nothing else in the codebase needs to change.
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
// Deepgram's prerecorded API is synchronous — one call, no polling needed.
// ---------------------------------------------------------------------------
export async function transcribeAudio(audioUrl: string): Promise<TranscriptionResult> {
  const deepgram = getClient();

  const { result, error } = await deepgram.listen.prerecorded.transcribeUrl(
    { url: audioUrl },
    {
      model: "nova-2",
      diarize: true,
      detect_language: true,
      smart_format: true,
      utterances: true,    // Gives us per-speaker segments
      punctuate: true,
      paragraphs: false,   // Keep flat for LLM consumption
      filler_words: false, // Strip "um", "uh" etc.
    }
  );

  if (error) {
    throw new Error(`Deepgram transcription failed: ${error.message}`);
  }

  if (!result) {
    throw new Error("Deepgram returned an empty result");
  }

  const channel = result.results?.channels?.[0];
  const alternative = channel?.alternatives?.[0];

  if (!alternative) {
    throw new Error("Deepgram returned no transcript alternatives");
  }

  // Plain full transcript
  const text = alternative.transcript ?? "";

  // Per-speaker utterance segments (requires utterances: true)
  const speakerSegments: SpeakerSegment[] =
    result.results?.utterances?.map((u) => ({
      speaker: String(u.speaker ?? "0"),
      text: u.transcript,
      start: Math.round(u.start * 1000), // Deepgram gives seconds → convert to ms
      end: Math.round(u.end * 1000),
    })) ?? [];

  // Deepgram returns language code like "en", "es-419", etc. Normalise to base code.
  const rawLang = result.results?.channels?.[0]?.detected_language ?? null;
  const detectedLanguage = rawLang ? rawLang.split("-")[0] : null;

  // Confidence: average across all words, or top-level alternative confidence
  const confidence = alternative.confidence ?? null;

  // Duration
  const durationMs = result.metadata?.duration
    ? Math.round(result.metadata.duration * 1000)
    : null;

  // Word count from word-level data (most accurate)
  const wordCount = alternative.words?.length ?? text.split(/\s+/).filter(Boolean).length;

  // Unique job ID — Deepgram uses request_id in metadata
  const id = result.metadata?.request_id ?? crypto.randomUUID();

  const formattedTranscript = buildFormattedTranscript(speakerSegments, text);

  return {
    id,
    status: "completed",
    text,
    detectedLanguage,
    confidence,
    speakerSegments,
    formattedTranscript,
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