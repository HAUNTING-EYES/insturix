import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { executeScriptOperation } from '@/lib/thinkforge/services/script-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Unified script endpoint
 * Handles get, save, and update operations
 */
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let sessionId: string | undefined;
  let action: 'get' | 'save' | 'update' | undefined;
  let script: any | undefined;

  try {
    const body = await req.json();
    sessionId = body?.sessionId ? String(body.sessionId) : undefined;
    action = body?.action;
    script = body?.script;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!sessionId) {
    return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
  }

  if (!action || !['get', 'save', 'update'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action. Must be: get, save, or update' }, { status: 400 });
  }

  try {
    const result = await executeScriptOperation({
      sessionId,
      action,
      script
    });

    return NextResponse.json({ script: result });
  } catch (error: any) {
    console.error('Error in script endpoint:', error);
    return NextResponse.json(
      { error: 'Script operation failed', details: error?.message },
      { status: 500 }
    );
  }
}

