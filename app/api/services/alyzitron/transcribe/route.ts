import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { transcribeAudio } from "@/lib/alyzitron/transcription/transcriptionService";
import { getCreditCost } from "@/lib/config/creditCosts";
import { CreditsService } from "@/lib/services/creditsService";
import { recordProviderCostEvent } from "@/lib/financials/provider-cost-events";
import {
  findTranscription,
  upsertTranscriptionProcessing,
  upsertTranscriptionCompleted,
  upsertTranscriptionError,
} from "@/lib/alyzitron";
import {
  AlyzitronTaskOwnershipError,
  requireOwnedAlyzitronTask,
} from "../utils/task-ownership";

function taskMediaUrl(task: any): string | null {
  return typeof task?.videoUrl === "string" && task.videoUrl.trim() ? task.videoUrl : null;
}

function ownershipErrorResponse(error: AlyzitronTaskOwnershipError) {
  return NextResponse.json({ error: error.message }, { status: error.status });
}

function getRequestedDurationMinutes(body: any): number {
  const seconds = Number(body.durationSeconds ?? body.duration ?? 0);
  const milliseconds = Number(body.durationMs ?? 0);
  const minutes = Number(body.durationMinutes ?? 0);

  if (Number.isFinite(minutes) && minutes > 0) return Math.ceil(minutes);
  if (Number.isFinite(seconds) && seconds > 0) return Math.ceil(seconds / 60);
  if (Number.isFinite(milliseconds) && milliseconds > 0) return Math.ceil(milliseconds / 60_000);
  return 1;
}

function getActualDurationMinutes(durationMs: number | null | undefined, fallbackMinutes: number): number {
  if (durationMs && durationMs > 0) return Math.max(1, Math.ceil(durationMs / 60_000));
  return fallbackMinutes;
}

export async function POST(req: NextRequest) {
  let taskId: string | undefined;
  let billedUserId: string | null = null;
  let debitedDurationMinutes = 0;
  let initialTransactionId: string | undefined;
  let additionalTransactionId: string | undefined;
  let shouldRefundDebit = false;

  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    billedUserId = userId;

    const body = await req.json();
    taskId = body.taskId;

    if (!taskId) {
      return NextResponse.json(
        { error: "taskId is required" },
        { status: 400 }
      );
    }

    const task = await requireOwnedAlyzitronTask(taskId, userId);
    const audioUrl = taskMediaUrl(task);
    if (!audioUrl) {
      return NextResponse.json({ error: "Task media URL missing" }, { status: 400 });
    }

    const existing = await findTranscription(taskId);
    if (existing?.status === "completed" && existing.formattedTranscript) {
      return NextResponse.json({
        status: "completed",
        detectedLanguage: existing.detectedLanguage,
        wordCount: existing.wordCount,
        durationMs: existing.durationMs,
        cached: true,
      });
    }

    const estimatedDurationMinutes = getRequestedDurationMinutes(body);
    const creditCheck = await CreditsService.hasCredits(
      userId,
      "alyzitron",
      "transcription",
      { durationMinutes: estimatedDurationMinutes }
    );

    if (!creditCheck.hasCredits) {
      return NextResponse.json(
        {
          error: "Insufficient credits",
          required: creditCheck.required,
          available: creditCheck.available,
          code: "INSUFFICIENT_CREDITS",
        },
        { status: 402 }
      );
    }

    const initialDeduct = await CreditsService.deductCredits(
      userId,
      "alyzitron",
      "transcription",
      { durationMinutes: estimatedDurationMinutes, taskId }
    );

    if (!initialDeduct.success) {
      return NextResponse.json(
        {
          error: "Unable to deduct transcription credits",
          details: initialDeduct.error,
          code: "CREDIT_DEDUCTION_FAILED",
        },
        { status: 402 }
      );
    }

    debitedDurationMinutes = estimatedDurationMinutes;
    initialTransactionId = initialDeduct.transactionId;
    shouldRefundDebit = true;

    // Mark as processing - upsert so re-triggering a failed/partial job works cleanly.
    await upsertTranscriptionProcessing(taskId, audioUrl);
    const result = await transcribeAudio(audioUrl, {
      userId,
      taskId,
      route: "/api/services/alyzitron/transcribe",
      creditTransactionId: initialTransactionId,
      estimatedDurationMs: estimatedDurationMinutes * 60_000,
      recordSuccessEvent: false,
    });
    const actualDurationMinutes = getActualDurationMinutes(result.durationMs, estimatedDurationMinutes);

    if (actualDurationMinutes > estimatedDurationMinutes) {
      const additionalMinutes = actualDurationMinutes - estimatedDurationMinutes;
      const additionalDeduct = await CreditsService.deductCredits(
        userId,
        "alyzitron",
        "transcription",
        { durationMinutes: additionalMinutes, taskId }
      );
      if (!additionalDeduct.success) {
        throw new Error(`Unable to deduct remaining transcription credits: ${additionalDeduct.error}`);
      }
      additionalTransactionId = additionalDeduct.transactionId;
      debitedDurationMinutes += additionalMinutes;
    } else if (actualDurationMinutes < estimatedDurationMinutes) {
      const minutesToRefund = estimatedDurationMinutes - actualDurationMinutes;
      const refundCredits = getCreditCost("alyzitron", "transcription", { durationMinutes: minutesToRefund });
      await CreditsService.refundCredits(
        userId,
        refundCredits,
        "Alyzitron transcription duration was shorter than estimated",
        {
          service: "alyzitron",
          action: "transcription",
          originalTransactionId: initialTransactionId,
        }
      );
      debitedDurationMinutes = actualDurationMinutes;
    }

    await upsertTranscriptionCompleted(taskId, {
      deepgramRequestId: result.id,
      text: result.text,
      detectedLanguage: result.detectedLanguage,
      confidence: result.confidence,
      speakerSegments: result.speakerSegments,
      formattedTranscript: result.formattedTranscript,
      durationMs: result.durationMs,
      wordCount: result.wordCount,
    });

    shouldRefundDebit = false;
    const creditsConsumed = getCreditCost("alyzitron", "transcription", { durationMinutes: actualDurationMinutes });
    await recordAlyzitronTranscriptionCost({
      userId,
      taskId,
      result,
      chargedCredits: creditsConsumed,
      creditTransactionId: initialTransactionId,
      additionalCreditTransactionId: additionalTransactionId,
      estimatedDurationMinutes,
      actualDurationMinutes,
    });

    return NextResponse.json({
      status: "completed",
      detectedLanguage: result.detectedLanguage,
      wordCount: result.wordCount,
      durationMs: result.durationMs,
      creditsConsumed,
      cached: false,
    });
  } catch (error: any) {
    if (error instanceof AlyzitronTaskOwnershipError) {
      return ownershipErrorResponse(error);
    }

    console.error("[Alyzitron/transcribe] Error:", error);

    if (taskId) {
      await upsertTranscriptionError(taskId, error.message).catch(() => {});
    }

    if (shouldRefundDebit && billedUserId && debitedDurationMinutes > 0) {
      const refundCredits = getCreditCost("alyzitron", "transcription", { durationMinutes: debitedDurationMinutes });
      await CreditsService.refundCredits(
        billedUserId,
        refundCredits,
        `Alyzitron transcription failed: ${error.message}`,
        {
          service: "alyzitron",
          action: "transcription",
          originalTransactionId: initialTransactionId,
        }
      ).catch(() => {});
    }

    return NextResponse.json(
      { error: "Transcription failed", details: error.message },
      { status: 500 }
    );
  }
}
/**
 * GET /api/alyzitron/transcribe?taskId=xxx
 *
 * Returns transcription status and metadata.
 * The full transcript is intentionally excluded — it is loaded server-side
 * by the chat route to keep response payloads small.
 *
 * Possible status values: not_found | processing | completed | error
 */
export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const taskId = req.nextUrl.searchParams.get("taskId");
    if (!taskId) {
      return NextResponse.json({ error: "taskId is required" }, { status: 400 });
    }

    await requireOwnedAlyzitronTask(taskId, userId);
    const transcription = await findTranscription(taskId);
    if (!transcription) {
      return NextResponse.json({ status: "not_found" }, { status: 404 });
    }

    return NextResponse.json({
      status: transcription.status,
      detectedLanguage: transcription.detectedLanguage,
      confidence: transcription.confidence,
      wordCount: transcription.wordCount,
      durationMs: transcription.durationMs,
      ...(transcription.status === "error" && {
        errorMessage: transcription.errorMessage,
      }),
    });
  } catch (error: any) {
    if (error instanceof AlyzitronTaskOwnershipError) {
      return ownershipErrorResponse(error);
    }

    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function recordAlyzitronTranscriptionCost(input: {
  userId: string;
  taskId: string;
  result: Awaited<ReturnType<typeof transcribeAudio>>;
  chargedCredits: number;
  creditTransactionId?: string;
  additionalCreditTransactionId?: string;
  estimatedDurationMinutes: number;
  actualDurationMinutes: number;
}) {
  const provider = input.result.provider ?? (input.result.id.startsWith("whisper-") ? "fal-ai" : "deepgram");
  const model = input.result.model ?? (provider === "fal-ai" ? "fal-ai/whisper" : "nova-2");
  const mediaSeconds = input.result.durationMs && input.result.durationMs > 0
    ? Math.round((input.result.durationMs / 1000) * 100) / 100
    : input.actualDurationMinutes * 60;

  await recordProviderCostEvent({
    idempotencyKey: `alyzitron:transcribe:${input.taskId}:${provider}:${input.result.id}`,
    status: "success",
    userId: input.userId,
    taskId: input.taskId,
    assetId: input.taskId,
    creditTransactionId: input.creditTransactionId,
    service: "alyzitron",
    action: "transcription",
    route: "/api/services/alyzitron/transcribe",
    provider,
    model,
    operation: "transcription",
    chargedCredits: input.chargedCredits,
    providerJobId: input.result.id,
    units: { requestCount: 1, mediaSeconds },
    metadata: {
      detectedLanguage: input.result.detectedLanguage,
      wordCount: input.result.wordCount,
      estimatedDurationMinutes: input.estimatedDurationMinutes,
      actualDurationMinutes: input.actualDurationMinutes,
      additionalCreditTransactionId: input.additionalCreditTransactionId,
    },
  });
}
