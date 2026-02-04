import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import * as db from '@/lib/thinkforge/services/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * STEP 4: Session verification endpoint
 * Lightweight check that a session exists and is accessible by the current user
 */
export async function GET(req: Request) {
  const { userId, orgId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('sessionId');

  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
  }

  try {
    const session = await db.getSession(sessionId, userId, orgId);
    
    if (!session) {
      return NextResponse.json({ 
        valid: false, 
        error: 'Session not found or not accessible' 
      }, { status: 404 });
    }

    return NextResponse.json({
      valid: true,
      sessionId: session._id,
      userId: session.userId,
      orgId: session.orgId || null,
      createdAt: session.createdAt,
    });
  } catch (error: any) {
    console.error('[ThinkForge] Session verification failed:', error);
    return NextResponse.json(
      { valid: false, error: 'Verification failed', details: error?.message },
      { status: 500 }
    );
  }
}
