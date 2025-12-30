import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { processChat } from '@/lib/thinkforge/services/chat-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Unified chat endpoint
 * Handles both Q&A and script editing
 */
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let prompt: string | undefined;
  let sessionId: string | undefined;
  let selection: string | undefined;
  
  try {
    const body = await req.json();
    prompt = (body?.prompt ?? '').toString();
    if (body?.sessionId) sessionId = String(body.sessionId);
    if (body?.selection) selection = String(body.selection);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!prompt?.trim()) {
    return NextResponse.json({ error: 'Missing prompt' }, { status: 400 });
  }

  try {
    const result = await processChat({
      sessionId,
      prompt,
      selection,
      userId
    });

    return new Response(result.stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no'
      }
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
