import { createClient } from "@deepgram/sdk";
import { logger } from "@/app/api/services/alyzitron/utils/logger";

// --- Types (Vahi purane taaki Gemini na phate) ---
export interface SpeakerSegment {
  speaker: string;
  text: string;
  start: number;   // ms
  end: number;     // ms
}

export interface TranscriptionResult {
    id: string;
    status: "completed" | "error";
    text: string;
    detectedLanguage: string | null;
    confidence: number | null;
    speakerSegments: SpeakerSegment[];
    formattedTranscript: string;
    durationMs: number | null;
    wordCount: number;
}

// --- PRIMARY: Whisper Large v3 (Groq) ---
async function transcribeWithWhisper(buffer: Buffer): Promise<Partial<TranscriptionResult>> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error("GROQ_API_KEY is missing");

    // Groq uses OpenAI-compatible FormData API
    const formData = new FormData();
    const blob = new Blob([buffer], { type: 'audio/mpeg' });
    formData.append("file", blob, "audio.mp3");
    formData.append("model", "whisper-large-v3");
    formData.append("response_format", "json");

    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}` },
        body: formData,
    });

    if (!res.ok) throw new Error(`Groq API Error: ${res.statusText}`);

    const data = await res.json();
    return {
        text: data.text,
        id: `whisper-${crypto.randomUUID()}`,
        wordCount: data.text.split(/\s+/).length,
    };
}

// --- FALLBACK: Deepgram Nova-2 ---
async function transcribeWithDeepgram(source: string | Buffer): Promise<TranscriptionResult> {
    const client = createClient(process.env.DEEPGRAM_API_KEY!);
    const options = { model: "nova-2", diarize: true, smart_format: true };

    const { result, error } = Buffer.isBuffer(source)
        ? await client.listen.prerecorded.transcribeFile(source, options)
        : await client.listen.prerecorded.transcribeUrl({ url: source }, options);

    if (error) throw error;
    if (!result) throw new Error("Deepgram returned an empty result");

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

// --- MAIN WRAPPER (The Orchestrator) ---
export async function transcribeAudio(source: string | Buffer): Promise<TranscriptionResult> {
    try {
        logger.info("🎙️ Attempting Primary Transcription: Whisper Large v3 (Groq)");

        // Whisper needs a Buffer. If we have a URL, we fetch it first.
        let buffer: Buffer;
        if (typeof source === "string") {
            const res = await fetch(source);
            buffer = Buffer.from(await res.arrayBuffer());
        } else {
            buffer = source;
        }

        const whisperData = await transcribeWithWhisper(buffer);

        return {
            ...whisperData,
            status: "completed",
            speakerSegments: [],
            formattedTranscript: whisperData.text || "",
            detectedLanguage: "auto",
            confidence: 1,
            durationMs: 0
        } as TranscriptionResult;

    } catch (err: any) {
        logger.warn("⚠️ Whisper Failed, falling back to Deepgram...", { data: { error: err.message } });
        return transcribeWithDeepgram(source);
    }
}