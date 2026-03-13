import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { logInteractionEvent, type EventType } from '@/lib/thinkforge/services/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const INTERACTION_EVENT_TYPES: EventType[] = [
  'content_deleted',
  'hook_rejected',
  'style_corrected',
  'regeneration_requested',
  'feedback_given',
];

/**
 * Shadow Logger API
 *
 * POST /api/services/thinkforge/events/shadow-log
 *
 * Accepts background telemetry from the editor:
 *   - content_deleted: user deleted AI-generated content
 *   - hook_rejected: user explicitly rejected a suggested hook
 *   - style_corrected: user gave tone/style feedback ("too formal", etc.)
 *   - regeneration_requested: user asked to regenerate a section
 *   - feedback_given: explicit text feedback about AI output
 *
 * All writes are fire-and-forget; the endpoint returns 202 immediately.
 */
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { projectId, sessionId, artifactId, versionId, type, payload } = body;

  if (!projectId || !type) {
    return NextResponse.json(
      { error: 'Missing required fields: projectId, type' },
      { status: 400 },
    );
  }

  if (!INTERACTION_EVENT_TYPES.includes(type)) {
    return NextResponse.json(
      { error: `Invalid event type. Must be one of: ${INTERACTION_EVENT_TYPES.join(', ')}` },
      { status: 400 },
    );
  }

  logInteractionEvent(userId, projectId, type, payload || {}, {
    sessionId,
    artifactId,
    versionId,
  });

  return NextResponse.json({ accepted: true }, { status: 202 });
}
