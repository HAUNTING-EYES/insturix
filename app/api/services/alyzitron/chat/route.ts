import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { runChatTurnStreaming } from "@/lib/alyzitron/chat/chatEngine";
import {
  needsSummarization,
  splitMessagesForSummarization,
  summarizeMessages,
} from "@/lib/alyzitron/chat/contextManager";
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

    await requireOwnedAlyzitronTask(taskId, userId);

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
              newSummary = await summarizeMessages(
                toSummarize,
                activeSession.summary,
                videoTitle
              );
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

          send({
            type: "done",
            sessionId: activeSession._id!.toString(),
            didSummarize,
          });

          controller.close();
        } catch (err: any) {
          console.error("[Alyzitron/chat] Streaming error:", err);
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
