import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { processChat } from '@/lib/thinkforge/services/chat-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Unified chat endpoint
 * Handles both Q&A and script editing
 * Uses SSE format like Editron for consistent streaming
 */
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let prompt: string | undefined;
  let sessionId: string | undefined;
  let selection: string | undefined;
  let script: any | undefined;
  let project: any | undefined;
  let selectionBlocks: any[] | undefined;
  let selectionRange: { from: number; to: number } | undefined;
  
  try {
    const body = await req.json();
    prompt = (body?.prompt ?? '').toString();
    if (body?.sessionId) sessionId = String(body.sessionId);
    if (body?.selection) selection = String(body.selection);
    if (body?.script) script = body.script;
    if (body?.project) project = body.project;
    if (body?.selectionBlocks) selectionBlocks = body.selectionBlocks;
    if (body?.selectionRange) selectionRange = body.selectionRange;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!prompt?.trim()) {
    return NextResponse.json({ error: 'Missing prompt' }, { status: 400 });
  }

  try {
    const stream = await processChat({
      sessionId,
      prompt,
      selection,
      userId,
      script,
      project,
      selectionBlocks,
      selectionRange,
    });

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error: any) {
    console.error('Error in chat endpoint:', error);
    
    // Handle rate limit errors
    if (error.message?.includes('limit reached')) {
      return NextResponse.json(
        { error: error.message },
        { status: 429 }
      );
    }
    
    return NextResponse.json(
      { error: 'Chat failure', details: error?.message },
      { status: 500 }
    );
  }
}
