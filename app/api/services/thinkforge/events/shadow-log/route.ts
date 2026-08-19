import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import {
  INTERACTION_EVENT_TYPES,
  admitInteractionEventPayload,
} from '@/lib/thinkforge/events/interaction-event-policy';
import {
  assertDataBankSessionPrincipal,
  getSession,
  logInteractionEvent,
} from '@/lib/thinkforge/services/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_REQUEST_BYTES = 32_000;
const ShadowLogRequestSchema = z.object({
  projectId: z.string().trim().min(1).max(200),
  sessionId: z.string().trim().min(1).max(200),
  artifactId: z.string().trim().min(1).max(200).optional(),
  versionId: z.string().trim().min(1).max(200).optional(),
  type: z.enum(INTERACTION_EVENT_TYPES),
  payload: z.record(z.string(), z.unknown()).default({}),
}).strict();

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
 * The endpoint acknowledges only after the authorized event is persisted.
 */
export async function POST(req: Request) {
  const { userId, orgId } = await auth();
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });

  const parsed = await parseShadowLogRequest(req);
  if (!parsed.ok) return parsed.response;
  const { projectId, sessionId, artifactId, versionId, type, payload } = parsed.value;
  if (projectId !== sessionId) {
    return NextResponse.json({ error: 'projectId must match sessionId' }, { status: 400 });
  }

  try {
    const principal = { userId, orgId: orgId ?? null };
    const session = await getSession(sessionId, userId, orgId);
    if (!session) {
      return NextResponse.json({ error: 'Session not found or unavailable to this actor' }, { status: 404 });
    }
    try {
      assertDataBankSessionPrincipal(principal, session);
    } catch {
      return NextResponse.json({ error: 'Session not found or unavailable to this actor' }, { status: 404 });
    }

    const payloadAdmission = admitInteractionEventPayload(type, payload);
    if (!payloadAdmission.ok) {
      if (payloadAdmission.reason === 'invalid_interaction_payload') {
        return NextResponse.json({ error: payloadAdmission.reason }, { status: 400 });
      }
      return NextResponse.json({ accepted: false, reason: payloadAdmission.reason }, { status: 202 });
    }

    await logInteractionEvent(principal, sessionId, type, payloadAdmission.payload, {
      sessionId,
      artifactId,
      versionId,
    });
    return NextResponse.json({ accepted: true }, { status: 202 });
  } catch (error) {
    console.error('[ThinkForge] Failed to persist interaction event:', error);
    return NextResponse.json({ error: 'Failed to persist interaction event' }, { status: 500 });
  }
}

async function parseShadowLogRequest(req: Request): Promise<
  | { ok: true; value: z.infer<typeof ShadowLogRequestSchema> }
  | { ok: false; response: NextResponse }
> {
  const declaredLength = Number(req.headers.get('content-length') ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return { ok: false, response: NextResponse.json({ error: 'Request body is too large' }, { status: 413 }) };
  }

  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return { ok: false, response: NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) };
  }
  if (new TextEncoder().encode(raw).byteLength > MAX_REQUEST_BYTES) {
    return { ok: false, response: NextResponse.json({ error: 'Request body is too large' }, { status: 413 }) };
  }

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, response: NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) };
  }
  const parsed = ShadowLogRequestSchema.safeParse(value);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, response: NextResponse.json({ error: 'Invalid interaction event' }, { status: 400 }) };
}
