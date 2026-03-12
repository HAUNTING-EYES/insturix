import { NextRequest, NextResponse } from "next/server";
// import { ObjectId } from "mongodb";
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
    const body = await req.json();
    const { taskId, message, videoAnalysis, videoTitle, sessionId, userId } = body;

    if (!taskId || !message) {
      return NextResponse.json(
        { error: "taskId and message are required" },
        { status: 400 }
      );
    }

    // Load or create session
    let session: ChatSessionDoc | null = sessionId
      ? await findChatSessionById(sessionId)
      : await findChatSession(taskId, userId ?? null);

    if (!session) {
      session = await createChatSession(taskId, userId ?? null);
    }

    // Load transcription server-side — never trust the client with this
    const transcription = await findTranscription(taskId);

    const encoder = new TextEncoder();
    let fullAssistantResponse = "";
    let newSummary = session.summary;
    let newSummarizedUpToIndex = session.summarizedUpToIndex;
    let didSummarize = false;

    const stream = new ReadableStream({
      async start(controller) {
        const send = (payload: object) =>
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
          );

        try {
          // Summarize if the unsummarized window exceeds 50% of token budget
          const unsummarized = session!.messages.slice(session!.summarizedUpToIndex);

          if (needsSummarization(unsummarized)) {
            const { toSummarize } = splitMessagesForSummarization(unsummarized);

            if (toSummarize.length > 0) {
              newSummary = await summarizeMessages(
                toSummarize,
                session!.summary,
                videoTitle
              );
              newSummarizedUpToIndex =
                session!.summarizedUpToIndex + toSummarize.length;
              didSummarize = true;
              send({ type: "summarized" });
            }
          }

          // Stream LLM response
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
            messages: session!.messages,
            userMessage: message,
            videoTitle,
          });

          for await (const chunk of generator) {
            console.log("[chunk raw]", JSON.stringify(chunk));
            fullAssistantResponse += chunk;
            send({ type: "chunk", text: chunk });
          }

          // Persist both new messages + updated summarization state atomically
          const now = new Date();
          await saveChatSessionTurn(
            session!._id!,
            { role: "user", content: message, timestamp: now },
            { role: "assistant", content: fullAssistantResponse, timestamp: now },
            newSummary,
            newSummarizedUpToIndex,
            session!.totalMessagesEver + 2
          );

          send({
            type: "done",
            sessionId: session!._id!.toString(),
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
    console.error("[Alyzitron/chat] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}