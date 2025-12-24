import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getSessionState, updateScriptState } from '@/lib/thinkforge/state/session-state';
import { generateScriptDraft } from '@/lib/thinkforge/agents/script-draft-agent';
import { queueRefinement } from '@/lib/thinkforge/jobs/refinement-queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });

  let instruction: string;
  let script: any | undefined;
  let sessionId: string | undefined;
  try {
    const payload = await req.json();
    instruction = String(payload?.instruction || '');
    script = payload?.script;
    sessionId = payload?.sessionId ? String(payload.sessionId) : undefined;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!instruction?.trim()) {
    return NextResponse.json({ error: 'Missing instruction' }, { status: 400 });
  }

  try {
    // Load session state if sessionId provided
    const sessionState = sessionId ? await getSessionState(sessionId, userId) : null;
    
    // Generate draft immediately
    const draft = await generateScriptDraft(
      instruction,
      sessionState || {
        sessionId: sessionId || 'temp',
        userId,
        chat: [],
        script: null,
        ideas: [],
        metadata: {},
        version: 1,
        lastUpdated: new Date()
      },
      script
    );
    
    // Update script state immediately
    if (sessionId) {
      await updateScriptState(sessionId, userId, {
        ...draft,
        version: (sessionState?.script?.version || 0) + 1
      });
      
      // Queue refinement in background
      await queueRefinement(sessionId, userId, instruction, draft.blocks);
    }
    
    return NextResponse.json({
      title: draft.title,
      blocks: draft.blocks,
      content: draft.content,
      metadata: {
        workflow: 'draft',
        thoughts: 'Draft generated, refinement in progress',
        duration_ms: 0
      }
    });
  } catch (error: any) {
    console.error('Error in script edit:', error);
    return NextResponse.json(
      { error: 'Failed to edit script', details: error?.message },
      { status: 500 }
    );
  }
}
