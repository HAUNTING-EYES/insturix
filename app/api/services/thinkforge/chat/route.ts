import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { auth } from '@clerk/nextjs/server';
import { fastRouter } from '@/lib/thinkforge/router/fast-router';
import { getSessionState, appendChatMessage } from '@/lib/thinkforge/state/session-state';
import { chatAgent, chatAgentWithScriptUpdate } from '@/lib/thinkforge/agents/chat-agent';
import { generateScriptDraft } from '@/lib/thinkforge/agents/script-draft-agent';
import { queueRefinement } from '@/lib/thinkforge/jobs/refinement-queue';
import { updateScriptState } from '@/lib/thinkforge/state/session-state';

// Unified chat endpoint - routes to chat or script generation
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });

  let prompt: string | undefined;
  let sessionId: string | undefined;
  let script: any | undefined;
  let project: any | undefined;
  let selection: string | undefined;
  try {
    const body = await req.json();
    prompt = (body?.prompt ?? '').toString();
    if (body?.sessionId) sessionId = String(body.sessionId);
    if (body?.script) script = body.script;
    if (body?.project) project = body.project;
    if (body?.selection) selection = String(body.selection);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!prompt?.trim()) {
    return NextResponse.json({ error: 'Missing prompt' }, { status: 400 });
  }

  try {
    // Load session state if sessionId provided
    const sessionState = sessionId ? await getSessionState(sessionId, userId) : null;
    
    // Fast router decision
    const route = fastRouter(prompt, !!script || !!sessionState?.script);
    
    // Persist user message
    if (sessionId && sessionState) {
      await appendChatMessage(sessionId, userId, 'user', prompt);
    }
    
    if (route === 'script') {
      // Generate script draft immediately
      const draft = await generateScriptDraft(
        prompt,
        sessionState || {
          sessionId: sessionId || 'temp',
          userId,
          chat: [],
          script: null,
          ideas: [],
          metadata: project || {},
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
        await queueRefinement(sessionId, userId, prompt, draft.blocks);
      }
      
      // Stream response with script update marker
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          try {
            controller.enqueue(encoder.encode('Working on your script...\n\n'));
            
            // Send script update in marker format
            const scriptUpdate = {
              script: {
                title: draft.title,
                blocks: draft.blocks,
                content: draft.content
              },
              metadata: {
                workflow: 'draft',
                thoughts: 'Draft generated, refinement in progress',
                duration_ms: 0,
                agent_steps: []
              }
            };
            
            controller.enqueue(encoder.encode(`<script_update>${JSON.stringify(scriptUpdate)}</script_update>`));
            
            // Persist assistant message
            if (sessionId) {
              await appendChatMessage(sessionId, userId, 'assistant', 'Script draft generated. Refinement in progress...');
            }
            
            controller.close();
          } catch (error) {
            console.error('Error in script stream:', error);
            controller.error(error);
          }
        }
      });
      
      return new Response(stream, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'X-Accel-Buffering': 'no'
        }
      });
    } else {
      // Chat response
      const chatStream = await chatAgent(prompt, {
        sessionState: sessionState || {
          sessionId: sessionId || 'temp',
          userId,
          chat: [],
          script: null,
          ideas: [],
          metadata: project || {},
          version: 1,
          lastUpdated: new Date()
        },
        script,
        project,
        selection
      });
      
      // Persist assistant message after streaming (best effort)
      if (sessionId && sessionState) {
        // Note: We'd need to accumulate the stream to persist, but for now we'll persist a placeholder
        // In production, you might want to accumulate and persist after stream completes
        setTimeout(async () => {
          try {
            await appendChatMessage(sessionId, userId, 'assistant', '[Response streamed]');
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
    }
  } catch (e: any) {
    console.error('Error in chat endpoint:', e);
    return NextResponse.json({ error: 'Chat failure', details: e?.message }, { status: 500 });
  }
}

