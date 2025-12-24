import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { auth } from '@clerk/nextjs/server';
import { getSessionState, appendChatMessage } from '@/lib/thinkforge/state/session-state';
import { chatAgent } from '@/lib/thinkforge/agents/chat-agent';

// Simple chat endpoint - Q&A without script editing
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });

  let prompt: string | undefined;
  let sessionId: string | undefined;
  let skipPersistUser: boolean | undefined;
  try {
    const body = await req.json();
    prompt = (body?.prompt ?? '').toString();
    if (body?.sessionId) sessionId = String(body.sessionId);
    if (typeof body?.skipPersistUser === 'boolean') skipPersistUser = body.skipPersistUser;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!prompt?.trim()) {
    return NextResponse.json({ error: 'Missing prompt' }, { status: 400 });
  }

  try {
    // Load session state if sessionId provided
    const sessionState = sessionId ? await getSessionState(sessionId, userId) : null;
    
    // Persist user message unless skipped
    if (sessionId && sessionState && !skipPersistUser) {
      await appendChatMessage(sessionId, userId, 'user', prompt);
    }
    
    // Generate chat response
    const chatStream = await chatAgent(prompt, {
      sessionState: sessionState || {
        sessionId: sessionId || 'temp',
        userId,
        chat: [],
        script: null,
        ideas: [],
        metadata: {},
        version: 1,
        lastUpdated: new Date()
      },
      script: null,
      project: null,
      selection: null,
      skipPersistUser
    });
    
    // Persist assistant message after streaming (best effort)
    if (sessionId && sessionState && !skipPersistUser) {
      setTimeout(async () => {
        try {
          await appendChatMessage(sessionId!, userId, 'assistant', '[Response streamed]');
        } catch (error) {
          console.error('Error persisting assistant message:', error);
        }
      }, 100);
    }
    
    return new Response(chatStream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no'
      }
    });
  } catch (e: any) {
    console.error('Error in ask endpoint:', e);
    return NextResponse.json({ error: 'Ask failure', details: e?.message }, { status: 500 });
  }
}
