import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import * as db from '@/lib/thinkforge/services/db';
import {
  buildSelectedTrend,
  selectedTrendToContentCardContext,
  SelectedTrendInputError,
  TrendSelectionPersistenceRequestSchema,
} from '@/lib/thinkforge/trends/selected-trend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Records explicit user trend selection; source-video analysis happens in a later workflow. */
export async function POST(request: Request) {
  const { userId, orgId } = await auth();
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  try {
    const selection = TrendSelectionPersistenceRequestSchema.parse(body);
    const session = await db.getSession(selection.sessionId, userId, orgId);
    if (!session) {
      return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
    }

    const selectedTrend = buildSelectedTrend(selection);
    const projectMeta = await db.setSessionSelectedTrend(
      session._id,
      selectedTrend,
      selection.authoringRequest,
    );

    return NextResponse.json({
      sessionId: session._id,
      selectedTrend,
      projectMeta,
      calendarTrendContext: selectedTrendToContentCardContext(selectedTrend),
    });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SelectedTrendInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error('[ThinkForge:TrendSelection] Failed to persist selection:', error);
    return NextResponse.json(
      { error: 'Trend selection could not be saved. Please try again.' },
      { status: 500 },
    );
  }
}
