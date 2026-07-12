/**
 * POST /api/services/editron/chat/tool-call
 *
 * Narrow direct invocation endpoint for deterministic UI editing actions.
 * Provider-backed agent tools are intentionally not reachable here.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { createTools } from '@/lib/editron/agent/tools';
import { projectService } from '@/lib/editron/services/project-service';
import { checkDirectToolRateLimit } from '@/lib/editron/utils/rate-limiter';

export const runtime = 'nodejs';
export const maxDuration = 60;

const directToolNames = ['add_transition', 'batch_edit_captions'] as const;
const directToolRequestSchema = z.object({
  projectId: z.string().min(1).max(128),
  toolName: z.string().min(1).max(128),
  params: z.record(z.string(), z.unknown()).optional().default({}),
}).strict();

function isDirectToolName(toolName: string): toolName is typeof directToolNames[number] {
  return directToolNames.includes(toolName as typeof directToolNames[number]);
}

export async function POST(req: NextRequest) {
  try {
    let userId: string | null = null;
    try {
      const authResult = await auth();
      userId = authResult.userId;
    } catch (err: unknown) {
      console.warn('[ToolCall] auth failed:', err instanceof Error ? err.message : err);
    }

    if (!userId) {
      return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 401 });
    }

    const parsed = directToolRequestSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ status: 'error', message: 'Invalid direct tool request' }, { status: 400 });
    }
    const { projectId, toolName, params } = parsed.data;

    if (!isDirectToolName(toolName)) {
      return NextResponse.json(
        { status: 'error', message: 'Tool is not available for direct invocation' },
        { status: 403 },
      );
    }

    const rateLimit = await checkDirectToolRateLimit(userId);
    if (!rateLimit.success) {
      const unavailable = rateLimit.reason === 'unavailable';
      return NextResponse.json(
        {
          status: 'error',
          message: unavailable
            ? 'Direct editing is temporarily unavailable'
            : 'Too many direct edit requests',
        },
        {
          status: unavailable ? 503 : 429,
          headers: { 'X-RateLimit-Reset': String(rateLimit.reset) },
        },
      );
    }

    const project = await projectService.loadProject(userId, projectId);
    if (!project) {
      return NextResponse.json({ status: 'error', message: 'Project not found' }, { status: 404 });
    }

    const tools = createTools(userId, projectId);
    const targetTool = tools.find((tool: { name: string }) => tool.name === toolName);
    if (!targetTool) {
      return NextResponse.json(
        { status: 'error', message: 'Direct tool capability is unavailable' },
        { status: 404 },
      );
    }

    const resultStr = await (targetTool as { invoke: (input: Record<string, unknown>) => Promise<string> }).invoke(params);
    let result: unknown;
    try {
      result = JSON.parse(resultStr);
    } catch (err: unknown) {
      console.warn('[ToolCall] result JSON parse failed:', err instanceof Error ? err.message : err);
      result = { status: 'success', data: resultStr };
    }

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('[tool-call]', error);
    const message = error instanceof Error ? error.message : 'Direct tool invocation failed';
    return NextResponse.json({ status: 'error', message }, { status: 500 });
  }
}
