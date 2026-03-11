import { NextRequest, NextResponse } from "next/server";
import { findChatSession, deleteChatSession } from "@/lib/alyzitron";

/**
 * GET /api/alyzitron/chat-session?videoId=xxx&userId=xxx
 *
 * Returns stored chat history for a video.
 * Response: { sessionId, messages, hasSummary, totalMessagesEver }
 *           or { session: null, messages: [] } if no session exists yet.
 */
export async function GET(req: NextRequest) {
  try {
    const videoId = req.nextUrl.searchParams.get("videoId");
    const userId  = req.nextUrl.searchParams.get("userId") ?? null;

    if (!videoId) {
      return NextResponse.json({ error: "videoId is required" }, { status: 400 });
    }

    const session = await findChatSession(videoId, userId);

    if (!session) {
      return NextResponse.json({ session: null, messages: [] });
    }

    return NextResponse.json({
      sessionId: session._id,
      messages: session.messages,
      hasSummary: !!session.summary,
      totalMessagesEver: session.totalMessagesEver,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * DELETE /api/alyzitron/chat-session?videoId=xxx&userId=xxx
 *
 * Clears the chat history and summary for a video (start fresh).
 * The transcription record is unaffected.
 */
export async function DELETE(req: NextRequest) {
  try {
    const videoId = req.nextUrl.searchParams.get("videoId");
    const userId  = req.nextUrl.searchParams.get("userId") ?? null;

    if (!videoId) {
      return NextResponse.json({ error: "videoId is required" }, { status: 400 });
    }

    await deleteChatSession(videoId, userId);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}