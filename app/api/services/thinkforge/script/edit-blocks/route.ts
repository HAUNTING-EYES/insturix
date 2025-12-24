import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getSessionState, updateScriptState } from '@/lib/thinkforge/state/session-state';
import { generateScriptDraft } from '@/lib/thinkforge/agents/script-draft-agent';
import { queueRefinement } from '@/lib/thinkforge/jobs/refinement-queue';
import type { BlockTree } from '@/lib/thinkforge/schemas/canonical';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Apply block patches to existing blocks
 */
function applyBlockPatches(
  currentBlocks: BlockTree,
  updates: { title?: string; blocks?: BlockTree; replacements?: Array<{ index: number; block: any }> }
): BlockTree {
  if (updates.replacements && updates.replacements.length > 0) {
    // Apply targeted replacements
    const newBlocks = [...currentBlocks];
    for (const replacement of updates.replacements) {
      if (replacement.index >= 0 && replacement.index < newBlocks.length) {
        newBlocks[replacement.index] = replacement.block;
      }
    }
    return newBlocks;
  }
  
  // Use new blocks if provided
  if (updates.blocks && updates.blocks.length > 0) {
    return updates.blocks;
  }
  
  // Return current blocks if no updates
  return currentBlocks;
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });

  let instruction: string;
  let script: any | undefined;
  let sessionId: string | undefined;
  let selection: string | undefined;
  let indices: number[] | undefined;
  try {
    const payload = await req.json();
    instruction = String(payload?.instruction || '');
    script = payload?.script;
    sessionId = payload?.sessionId ? String(payload.sessionId) : undefined;
    selection = payload?.selection ? String(payload.selection) : undefined;
    indices = Array.isArray(payload?.indices) ? payload.indices : undefined;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!instruction?.trim()) {
    return NextResponse.json({ error: 'Missing instruction' }, { status: 400 });
  }

  try {
    // Load session state if sessionId provided
    const sessionState = sessionId ? await getSessionState(sessionId, userId) : null;
    
    // Use existing script blocks if available
    const existingScript = script || sessionState?.script;
    
    // Generate draft with instruction
    const draft = await generateScriptDraft(
      instruction + (selection ? `\n\nSelected text:\n${selection}` : ''),
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
      existingScript
    );
    
    // Apply patches if we have existing blocks and indices
    let finalBlocks = draft.blocks;
    if (existingScript?.blocks && indices && indices.length > 0) {
      // Create replacements array
      const replacements = indices.map((idx, i) => ({
        index: idx,
        block: draft.blocks[i] || draft.blocks[0]
      }));
      
      finalBlocks = applyBlockPatches(existingScript.blocks, {
        blocks: draft.blocks,
        replacements
      });
    }
    
    // Update script state immediately
    if (sessionId) {
      await updateScriptState(sessionId, userId, {
        title: draft.title,
        blocks: finalBlocks,
        content: draft.content,
        draft: true,
        version: (sessionState?.script?.version || 0) + 1
      });
      
      // Queue refinement in background
      await queueRefinement(sessionId, userId, instruction, finalBlocks);
    }
    
    return NextResponse.json({
      title: draft.title,
      blocks: finalBlocks,
      content: draft.content,
      replacements: indices ? indices.map((idx, i) => ({
        index: idx,
        block: finalBlocks[i] || finalBlocks[0]
      })) : undefined
    });
  } catch (error: any) {
    console.error('Error in script edit-blocks:', error);
    return NextResponse.json(
      { error: 'Failed to edit blocks', details: error?.message },
      { status: 500 }
    );
  }
}
