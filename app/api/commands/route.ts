import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { applyCommand, type CommandRequest } from '@/lib/thinkforge/services/command-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Unified command endpoint for ThinkForge mutations
 * POST /api/commands
 */
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let command: CommandRequest | null = null;
  try {
    const body = await req.json();
    command = body as CommandRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!command?.sessionId || !command.type || typeof command.baseVersion !== 'number') {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  try {
    const result = await applyCommand(command, userId);
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
