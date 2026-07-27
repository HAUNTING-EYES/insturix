import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { applyCommand, type CommandRequest } from '@/lib/thinkforge/services/command-service';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CommandRequestSchema = z.object({
  type: z.enum(['UpdateBlock', 'InsertBlock', 'DeleteBlock', 'ReplaceDocument']),
  payload: z.record(z.string(), z.unknown()),
  sessionId: z.string().trim().min(1),
  baseVersion: z.number().int().min(0),
  source: z.enum(['user', 'ai']),
}).strict();

/**
 * Unified command endpoint for ThinkForge mutations
 * POST /api/commands
 */
export async function POST(req: Request) {
  const { userId, orgId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = CommandRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid command', details: parsed.error.issues }, { status: 400 });
  }
  const command = parsed.data as CommandRequest;

  try {
    const result = await applyCommand(command, userId, orgId);
    if (!result.ok) {
      const status = result.error === 'Version conflict' ? 409 : result.error === 'Session not found' ? 404 : 400;
      return NextResponse.json({ error: result.error, currentVersion: result.currentVersion }, { status });
    }

    return NextResponse.json({
      success: true,
      script: {
        scriptId: result.script.scriptId || 'default',
        title: result.script.title,
        content: result.script.content,
        blocks: result.script.blocks || [],
        richText: result.script.richText || null,
        version: result.script.version ?? 1,
      }
    });
  } catch (error: any) {
    console.error('[commands] Error applying command:', error);
    return NextResponse.json({ error: 'Command failed', details: error?.message }, { status: 500 });
  }
}
