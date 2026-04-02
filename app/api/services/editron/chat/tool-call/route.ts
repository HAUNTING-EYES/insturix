/**
 * POST /api/services/editron/chat/tool-call
 *
 * Direct tool invocation endpoint — bypasses AI chat LLM.
 * Used by UI panels (transition browser, SFX library, motion graphics)
 * to call tools directly without going through the AI agent.
 *
 * This is the "fast path" for UI-driven actions. The AI chat stream
 * is for conversational tool use. This endpoint is for button clicks.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createTools } from '@/lib/editron/agent/tools';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    let userId: string | null = null;
    try {
      const authResult = await auth();
      userId = authResult.userId;
    } catch {}

    if (!userId) {
      return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { projectId, toolName, params } = body;

    if (!projectId || !toolName) {
      return NextResponse.json({ status: 'error', message: 'projectId and toolName required' }, { status: 400 });
    }

    // Create the tools with the user's context
    const tools = createTools(userId, projectId);

    // Find the requested tool
    const targetTool = tools.find((t: any) => t.name === toolName);
    if (!targetTool) {
      return NextResponse.json({
        status: 'error',
        message: `Tool "${toolName}" not found. Available: ${tools.map((t: any) => t.name).join(', ')}`,
      }, { status: 404 });
    }

    // Invoke the tool directly
    const resultStr = await (targetTool as any).invoke(params || {});
    let result: any;
    try {
      result = JSON.parse(resultStr);
    } catch {
      result = { status: 'success', data: resultStr };
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[tool-call]', error);
    return NextResponse.json({ status: 'error', message: error.message }, { status: 500 });
  }
}
