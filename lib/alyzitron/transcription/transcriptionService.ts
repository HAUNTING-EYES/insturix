import { createClient, DeepgramClient } from "@deepgram/sdk";
import { fal } from "@fal-ai/client";
import { logger } from "@/app/api/services/alyzitron/utils/logger";
import { recordProviderCostEvent, type ProviderCostEventStatus } from "@/lib/financials/provider-cost-events";

// ---------------------------------------------------------------------------
// Types — Consistent across all tiers so Gemini + UI never break
// ---------------------------------------------------------------------------
export type TranscriptionProvider = "deepgram" | "fal-ai";

export interface SpeakerSegment {
    speaker: string;
    text: string;
    start: number; // ms
    end: number;   // ms
}

export interface TranscriptionTelemetryContext {
    userId?: string;
    orgId?: string;
    taskId?: string;
    assetId?: string;
    route?: string;
    creditTransactionId?: string;
    chargedCredits?: number;
    estimatedDurationMs?: number;
    recordSuccessEvent?: boolean;
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
    provider?: TranscriptionProvider;
    model?: string;
}

// ---------------------------------------------------------------------------
// Error — Tier 3 custom error
// ---------------------------------------------------------------------------
export class TranscriptionError extends Error {
    code: string;
    constructor(message: string) {
        super(message);
        this.name = "TranscriptionError";
        this.code = "TRANSCRIPTION_FAILED";
    }
}

// ---------------------------------------------------------------------------
// Deepgram Client — lazily instantiated, reused across calls
// ---------------------------------------------------------------------------
let _dgClient: DeepgramClient | null = null;

function getDeepgramClient(): DeepgramClient {
    if (!_dgClient) {
        const key = process.env.DEEPGRAM_API_KEY;
        if (!key) throw new Error("DEEPGRAM_API_KEY is not set");
        _dgClient = createClient(key);
    }
    return _dgClient;
}

// ---------------------------------------------------------------------------
// Shared Deepgram options
// ---------------------------------------------------------------------------
const DEEPGRAM_OPTIONS = {
    model: "nova-2" as const,
    diarize: true,
    detect_language: true,
    smart_format: true,
    utterances: true,
    punctuate: true,
    paragraphs: false,
    filler_words: true,
    vad_events: true,
};

// ---------------------------------------------------------------------------
// TIER 1: Deepgram Nova-2 (Primary)
//
// Accepts a GCS Signed URL. Returns the full TranscriptionResult with
// diarization, language detection, and speaker segments.
// ---------------------------------------------------------------------------
async function transcribeWithDeepgram(signedUrl: string): Promise<TranscriptionResult> {
    const client = getDeepgramClient();

    logger.info("🎙️ [Tier 1] Attempting Deepgram Nova-2...", {
        data: { url: signedUrl.substring(0, 60) + "..." },
    });

    const { result, error } = await client.listen.prerecorded.transcribeUrl(
        { url: signedUrl },
        DEEPGRAM_OPTIONS
    );

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

    const rawLang = channel?.detected_language ?? null;
    const detectedLanguage = rawLang ? rawLang.split("-")[0] : null;
    const confidence = alternative.confidence ?? null;
    const durationMs = result.metadata?.duration
        ? Math.round(result.metadata.duration * 1000)
        : null;
    const wordCount =
        alternative.words?.length ?? text.split(/\s+/).filter(Boolean).length;
    const id = result.metadata?.request_id ?? crypto.randomUUID();

    logger.info(`✅ [Tier 1] Deepgram completed. RequestID: ${id}`, {
        data: { wordCount, durationMs, detectedLanguage },
    });

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
        provider: "deepgram",
        model: DEEPGRAM_OPTIONS.model,
    };
}

// ---------------------------------------------------------------------------
// TIER 2: Fal.ai Whisper Large v3 (Fallback)
//
// Accepts a GCS Signed URL directly — Fal.ai fetches the audio itself.
// Maps Whisper's chunks → our SpeakerSegment format.
// ---------------------------------------------------------------------------
async function transcribeWithWhisper(signedUrl: string): Promise<TranscriptionResult> {
    const falKey = process.env.FAL_AI_API_KEY;
    if (!falKey) throw new Error("FAL_AI_API_KEY is not set");

    fal.config({ credentials: falKey });

    logger.info("🎙️ [Tier 2] Attempting Fal.ai Whisper Large v3...", {
        data: { url: signedUrl.substring(0, 60) + "..." },
    });

    const falResult = await fal.subscribe("fal-ai/whisper", {
        input: {
            audio_url: signedUrl,
            task: "transcribe",
            diarize: true, // 👈 Ye enable karna zaroori hai!
            chunk_level: "word",
        },
    });

    const data = falResult.data as any;

    if (!data?.text) {
        throw new Error("Fal.ai Whisper returned no transcript text");
    }

    // Map Whisper chunks → SpeakerSegment format
    // Fal.ai mapping logic for speakers
    const speakerSegments: SpeakerSegment[] = data.chunks?.map((chunk: any) => ({
        // Agar Fal.ai speaker ID deta hai toh wo use karo, warna default "0"
        speaker: String(chunk.speaker ?? "0"),
        text: chunk.text?.trim() ?? "",
        start: Math.round((chunk.timestamp?.[0] ?? 0) * 1000),
        end: Math.round((chunk.timestamp?.[1] ?? 0) * 1000),
    })) ?? [];

    const text = data.text;
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    const detectedLanguage = data.language ?? null; // Whisper returns ISO lang code
    const id = `whisper-${crypto.randomUUID()}`;

    // Calculate duration from last chunk's end timestamp
    const durationMs =
        speakerSegments.length > 0
            ? speakerSegments[speakerSegments.length - 1].end
            : null;

    logger.info(`✅ [Tier 2] Whisper completed. ID: ${id}`, {
        data: { wordCount, durationMs, detectedLanguage, chunksCount: speakerSegments.length },
    });

    return {
        id,
        status: "completed",
        text,
        detectedLanguage,
        confidence: 1, // Whisper doesn't return per-alternative confidence
        speakerSegments,
        formattedTranscript: buildFormattedTranscript(speakerSegments, text),
        durationMs,
        wordCount,
        provider: "fal-ai",
        model: "fal-ai/whisper",
    };
}

// ---------------------------------------------------------------------------
// buildFormattedTranscript
//
// [MM:SS] Speaker N: <text>
// Falls back to plain text if no segments available.
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

// ---------------------------------------------------------------------------
// MAIN ORCHESTRATOR — 3-Tier Failover
//
// Tier 1: Deepgram Nova-2 (fast, diarized, best for GCS signed URLs)
// Tier 2: Fal.ai Whisper v3 (reliable fallback, great accuracy)
// Tier 3: Throw TranscriptionError (triggers credit refund in processor)
//
// CRITICAL: Always pass a GCS Signed URL, NOT raw external download URLs.
// ---------------------------------------------------------------------------
async function recordTranscriptionProviderCost(input: {
    context: TranscriptionTelemetryContext;
    status: ProviderCostEventStatus;
    provider: TranscriptionProvider;
    model: string;
    tier: "deepgram" | "whisper";
    providerJobId?: string;
    durationMs?: number | null;
    wordCount?: number;
    detectedLanguage?: string | null;
    error?: unknown;
}) {
    const durationMs = typeof input.durationMs === "number" && input.durationMs > 0
        ? input.durationMs
        : input.context.estimatedDurationMs;
    const mediaSeconds = typeof durationMs === "number" && durationMs > 0
        ? Math.round((durationMs / 1000) * 100) / 100
        : undefined;

    await recordProviderCostEvent({
        idempotencyKey:
            input.status === "success" && input.providerJobId
                ? `alyzitron:transcription:${input.context.taskId ?? "unknown"}:${input.provider}:${input.providerJobId}`
                : undefined,
        status: input.status,
        userId: input.context.userId,
        orgId: input.context.orgId,
        taskId: input.context.taskId,
        assetId: input.context.assetId ?? input.context.taskId,
        creditTransactionId: input.context.creditTransactionId,
        service: "alyzitron",
        action: "transcription",
        route: input.context.route ?? "lib/alyzitron/transcription/transcriptionService",
        provider: input.provider,
        model: input.model,
        operation: "transcription",
        chargedCredits: input.context.chargedCredits,
        providerJobId: input.providerJobId,
        units: { requestCount: 1, mediaSeconds },
        metadata: {
            tier: input.tier,
            detectedLanguage: input.detectedLanguage,
            wordCount: input.wordCount,
            errorClass: getErrorClass(input.error),
            hasTaskId: Boolean(input.context.taskId),
        },
    });
}

function getErrorClass(error: unknown): string | undefined {
    if (!error) return undefined;
    return error instanceof Error ? error.name : typeof error;
}

export async function transcribeAudio(
    signedUrl: string,
    telemetry: TranscriptionTelemetryContext = {}
): Promise<TranscriptionResult> {
    // -- Tier 1: Deepgram Nova-2 --
    try {
        const result = await transcribeWithDeepgram(signedUrl);
        if (telemetry.recordSuccessEvent !== false) {
            await recordTranscriptionProviderCost({
                context: telemetry,
                status: "success",
                provider: "deepgram",
                model: DEEPGRAM_OPTIONS.model,
                tier: "deepgram",
                providerJobId: result.id,
                durationMs: result.durationMs,
                wordCount: result.wordCount,
                detectedLanguage: result.detectedLanguage,
            });
        }
        return result;
    } catch (tier1Err: any) {
        await recordTranscriptionProviderCost({
            context: telemetry,
            status: "failed",
            provider: "deepgram",
            model: DEEPGRAM_OPTIONS.model,
            tier: "deepgram",
            error: tier1Err,
        });
        logger.warn("[Tier 1] Deepgram FAILED. Switching to Tier 2 (Fal.ai Whisper)...", {
            data: { error: tier1Err.message },
        });
    }

    // -- Tier 2: Fal.ai Whisper Large v3 --
    try {
        const result = await transcribeWithWhisper(signedUrl);
        if (telemetry.recordSuccessEvent !== false) {
            await recordTranscriptionProviderCost({
                context: telemetry,
                status: "success",
                provider: "fal-ai",
                model: "fal-ai/whisper",
                tier: "whisper",
                providerJobId: result.id,
                durationMs: result.durationMs,
                wordCount: result.wordCount,
                detectedLanguage: result.detectedLanguage,
            });
        }
        return result;
    } catch (tier2Err: any) {
        await recordTranscriptionProviderCost({
            context: telemetry,
            status: "failed",
            provider: "fal-ai",
            model: "fal-ai/whisper",
            tier: "whisper",
            error: tier2Err,
        });
        logger.error("[Tier 2] Fal.ai Whisper FAILED.", {
            data: { error: tier2Err.message },
        });
    }

    // -- Tier 3: Total failure --
    logger.error("[Tier 3] ALL transcription providers failed. Throwing TRANSCRIPTION_FAILED.");
    throw new TranscriptionError(
        "All transcription providers failed (Deepgram + Whisper). Please retry or contact support."
    );
}
