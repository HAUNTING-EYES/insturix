import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { runChatTurnStreaming } from "@/lib/alyzitron/chat/chatEngine";
import {
  estimateTokens,
  needsSummarization,
  splitMessagesForSummarization,
  summarizeMessages,
} from "@/lib/alyzitron/chat/contextManager";
import { CreditsService } from "@/lib/services/creditsService";
import {
  recordProviderCostEvent,
  type ProviderCostEventStatus,
} from "@/lib/financials/provider-cost-events";
import {
  findTranscription,
  findChatSession,
  findChatSessionById,
  createChatSession,
  saveChatSessionTurn,
  ChatSessionDoc,
} from "@/lib/alyzitron";
import {
  AlyzitronTaskOwnershipError,
  assertAlyzitronChatSessionOwned,
  requireOwnedAlyzitronTask,
} from "../utils/task-ownership";

function ownershipErrorResponse(error: AlyzitronTaskOwnershipError) {
  return NextResponse.json({ error: error.message }, { status: error.status });
}

const ALYZITRON_CHAT_MODEL = "gemini-2.5-flash";
const MINIMUM_CHAT_TOKENS = 1000;
const ALYZITRON_CHAT_PROVIDER = "gemini";

/**
 * POST /api/alyzitron/chat
 *
 * Sends a user message and streams the assistant reply via Server-Sent Events.
 * Manages conversation history, rolling summarization, and persists everything
 * to MongoDB on completion.
 *
 * Body: {
 *   taskId:       string  — required
 *   message:       string  — required
 *   videoAnalysis: object  — your existing Gemini analysis JSON
 *   videoTitle?:   string
 *   sessionId?:    string  — omit to auto-find or create a session for this taskId
 *   userId?:       string
 * }
 *
 * SSE event shapes:
 *   { type: "summarized" } — fired once if context was compressed
 *   { type: "chunk", text: string } — one or more per response
 *   { type: "done", sessionId: string, didSummarize: boolean }
 *   { type: "error", message: string }
 */
export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { taskId, message, videoAnalysis, videoTitle, sessionId } = body;

    if (!taskId || !message) {
      return NextResponse.json(
        { error: "taskId and message are required" },
        { status: 400 }
      );
    }

    // Ownership gate FIRST — never touch credits or sessions for a task the
    // caller does not own (prevents IDOR + billing another user's account).
    await requireOwnedAlyzitronTask(taskId, userId);

    // Credit check AFTER auth + ownership, BEFORE the (expensive) chat turn.
    const creditCheck = await CreditsService.hasCredits(
      userId,
      "alyzitron",
      "chat_message",
      { tokenCount: MINIMUM_CHAT_TOKENS, model: ALYZITRON_CHAT_MODEL }
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
      "chat_message",
      { tokenCount: MINIMUM_CHAT_TOKENS, model: ALYZITRON_CHAT_MODEL, taskId }
    );

    if (!initialDeduct.success) {
      return NextResponse.json(
        {
          error: "Unable to deduct chat credits",
          details: initialDeduct.error,
          code: "CREDIT_DEDUCTION_FAILED",
        },
        { status: 402 }
      );
    }

    let chatCreditsFinalized = false;
    let additionalTransactionId: string | undefined;
    let chatProviderStarted = false;

    // Load or create session — ownership-scoped to the authenticated user.
    let session: ChatSessionDoc | null = null;
    if (sessionId) {
      try {
        session = await findChatSessionById(sessionId);
      } catch {
        session = null;
      }
      assertAlyzitronChatSessionOwned(session, taskId, userId);
    } else {
      session = await findChatSession(taskId, userId);
      if (!session) {
        session = await createChatSession(taskId, userId);
      }
    }

    if (!session) {
      throw new AlyzitronTaskOwnershipError("Chat session not found", 404);
    }

    const activeSession = session;
    const transcription = await findTranscription(taskId);
    const encoder = new TextEncoder();
    let fullAssistantResponse = "";
    let newSummary = activeSession.summary;
    let newSummarizedUpToIndex = activeSession.summarizedUpToIndex;
    let didSummarize = false;

    const stream = new ReadableStream({
      async start(controller) {
        const send = (payload: object) =>
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
          );

        try {
          const unsummarized = activeSession.messages.slice(activeSession.summarizedUpToIndex);

          if (needsSummarization(unsummarized)) {
            const { toSummarize } = splitMessagesForSummarization(unsummarized);

            if (toSummarize.length > 0) {
              const summaryInputTokens = estimateTokens(
                [
                  activeSession.summary ?? "",
                  videoTitle ?? "",
                  toSummarize.map((m) => `${m.role}:${m.content}`).join("\n\n"),
                ].filter(Boolean).join("\n\n")
              );
              try {
                newSummary = await summarizeMessages(
                  toSummarize,
                  activeSession.summary,
                  videoTitle
                );
                await recordAlyzitronChatProviderCost({
                  status: "success",
                  operation: "chat_summarization",
                  userId,
                  taskId,
                  sessionId: activeSession._id?.toString(),
                  inputTokens: summaryInputTokens,
                  outputTokens: estimateTokens(newSummary ?? ""),
                  totalTokens: summaryInputTokens + estimateTokens(newSummary ?? ""),
                  summaryMessageCount: toSummarize.length,
                  didSummarize: true,
                });
              } catch (summaryErr) {
                await recordAlyzitronChatProviderCost({
                  status: "failed",
                  operation: "chat_summarization",
                  userId,
                  taskId,
                  sessionId: activeSession._id?.toString(),
                  inputTokens: summaryInputTokens,
                  summaryMessageCount: toSummarize.length,
                  error: summaryErr,
                });
                throw summaryErr;
              }
              newSummarizedUpToIndex = activeSession.summarizedUpToIndex + toSummarize.length;
              didSummarize = true;
              send({ type: "summarized" });
            }
          }

          const generator = runChatTurnStreaming({
            systemPromptOptions: {
              videoAnalysis: videoAnalysis ?? null,
              transcription: transcription?.status === "completed"
                ? {
                    formattedTranscript: transcription.formattedTranscript,
                    detectedLanguage: transcription.detectedLanguage,
                    confidence: transcription.confidence,
                    wordCount: transcription.wordCount,
                  }
                : null,
              videoTitle,
            },
            existingSummary: newSummary,
            summarizedUpToIndex: newSummarizedUpToIndex,
            messages: activeSession.messages,
            userMessage: message,
            videoTitle,
          });

          chatProviderStarted = true;
          for await (const chunk of generator) {
            fullAssistantResponse += chunk;
            send({ type: "chunk", text: chunk });
          }

          const now = new Date();
          await saveChatSessionTurn(
            activeSession._id!,
            { role: "user", content: message, timestamp: now },
            { role: "assistant", content: fullAssistantResponse, timestamp: now },
            newSummary,
            newSummarizedUpToIndex,
            activeSession.totalMessagesEver + 2
          );

          const estimatedTokensUsed = Math.max(
            MINIMUM_CHAT_TOKENS,
            estimateTokens(
              [
                message,
                fullAssistantResponse,
                newSummary ?? "",
                videoTitle ?? "",
              ].filter(Boolean).join("\n\n")
            )
          );

          let creditsConsumed = initialDeduct.creditsDeducted;
          if (estimatedTokensUsed > MINIMUM_CHAT_TOKENS) {
            const additionalDeduct = await CreditsService.deductCredits(
              userId,
              "alyzitron",
              "chat_message",
              {
                tokenCount: estimatedTokensUsed - MINIMUM_CHAT_TOKENS,
                model: ALYZITRON_CHAT_MODEL,
                taskId,
              }
            );
            if (!additionalDeduct.success) {
              throw new Error(`Unable to deduct remaining chat credits: ${additionalDeduct.error}`);
            }
            additionalTransactionId = additionalDeduct.transactionId;
            creditsConsumed += additionalDeduct.creditsDeducted;
          }
          chatCreditsFinalized = true;
          await recordAlyzitronChatProviderCost({
            status: "success",
            operation: "chat_completion",
            userId,
            taskId,
            sessionId: activeSession._id?.toString(),
            creditTransactionId: initialDeduct.transactionId,
            additionalCreditTransactionId: additionalTransactionId,
            chargedCredits: creditsConsumed,
            inputTokens: Math.max(0, estimatedTokensUsed - estimateTokens(fullAssistantResponse)),
            outputTokens: estimateTokens(fullAssistantResponse),
            totalTokens: estimatedTokensUsed,
            didSummarize,
          });

          send({
            type: "done",
            sessionId: activeSession._id!.toString(),
            didSummarize,
            tokensUsed: estimatedTokensUsed,
            creditsConsumed,
          });

          controller.close();
        } catch (err: any) {
          console.error("[Alyzitron/chat] Streaming error:", err);
          if (chatProviderStarted) {
            await recordAlyzitronChatProviderCost({
              status: "failed",
              operation: "chat_completion",
              userId,
              taskId,
              sessionId: activeSession._id?.toString(),
              creditTransactionId: initialDeduct.transactionId,
              inputTokens: estimateTokens(message),
              outputTokens: estimateTokens(fullAssistantResponse),
              totalTokens: estimateTokens(message) + estimateTokens(fullAssistantResponse),
              didSummarize,
              error: err,
            });
          }
          if (!chatCreditsFinalized) {
            await CreditsService.refundCredits(
              userId,
              initialDeduct.creditsDeducted,
              `Alyzitron chat failed: ${err.message}`,
              {
                service: "alyzitron",
                action: "chat_message",
                originalTransactionId: initialDeduct.transactionId,
              }
            ).catch(() => {});
          }
          send({ type: "error", message: err.message });
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (error: any) {
    if (error instanceof AlyzitronTaskOwnershipError) {
      return ownershipErrorResponse(error);
    }

    console.error("[Alyzitron/chat] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
async function recordAlyzitronChatProviderCost(input: {
  status: ProviderCostEventStatus;
  operation: "chat_completion" | "chat_summarization";
  userId: string;
  taskId: string;
  sessionId?: string;
  creditTransactionId?: string;
  additionalCreditTransactionId?: string;
  chargedCredits?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  summaryMessageCount?: number;
  didSummarize?: boolean;
  error?: unknown;
}) {
  await recordProviderCostEvent({
    idempotencyKey:
      input.status === "success" && input.operation === "chat_completion" && input.creditTransactionId
        ? `alyzitron:chat:${input.taskId}:${input.creditTransactionId}`
        : undefined,
    status: input.status,
    userId: input.userId,
    taskId: input.taskId,
    assetId: input.taskId,
    creditTransactionId: input.creditTransactionId,
    service: "alyzitron",
    action: "chat_message",
    route: "/api/services/alyzitron/chat",
    provider: ALYZITRON_CHAT_PROVIDER,
    model: ALYZITRON_CHAT_MODEL,
    operation: input.operation,
    chargedCredits: input.chargedCredits,
    units: {
      requestCount: 1,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      totalTokens: input.totalTokens,
    },
    metadata: {
      sessionId: input.sessionId,
      didSummarize: input.didSummarize,
      summaryMessageCount: input.summaryMessageCount,
      additionalCreditTransactionId: input.additionalCreditTransactionId,
      errorClass: input.error instanceof Error ? input.error.name : input.error ? typeof input.error : undefined,
    },
  });
}
