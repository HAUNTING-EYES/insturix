import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { classifyObserverTextPrivacy } from '@/lib/thinkforge/events/observer-memory-policy';
import {
  createOrGetQueuedThinkForgeObserverJob,
  dispatchThinkForgeObserverJob,
  getThinkForgeObserverJob,
  isThinkForgeObserverWorkerConfigured,
  markThinkForgeObserverDispatchFailed,
} from '@/lib/thinkforge/events/observer-job';
import {
  assertDataBankSessionPrincipal,
  getSession,
  type DataBankPrincipal,
} from '@/lib/thinkforge/services/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_REQUEST_BYTES = 24_000;
const ObserverRequestSchema = z.object({
  text: z.string().max(20_000),
  sessionId: z.string().trim().min(1).max(200),
  source: z.enum(['chat', 'editor', 'observer']).default('observer'),
}).strict();

export async function GET(request: Request) {
  const { userId, orgId } = await auth();
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });
  const jobId = new URL(request.url).searchParams.get('jobId')?.trim();
  if (!jobId || !/^observer_[a-zA-Z0-9]+$/.test(jobId)) {
    return NextResponse.json({ error: 'A valid observer jobId is required.' }, { status: 400 });
  }
  try {
    const job = await getThinkForgeObserverJob(jobId, userId, orgId ?? null);
    if (!job) return NextResponse.json({ error: 'Observer job not found.' }, { status: 404 });
    return NextResponse.json({
      jobId: job.id,
      status: job.status,
      attemptCount: job.attemptCount,
      maxAttempts: job.maxAttempts,
      result: job.result,
      error: job.error,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    });
  } catch (error) {
    console.error('[Observer] Job status lookup failed', {
      jobId,
      errorClass: error instanceof Error ? error.name : typeof error,
    });
    return NextResponse.json({ error: 'Observer status is temporarily unavailable.' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (process.env.OBSERVER_ENABLED !== 'true') {
    return NextResponse.json({ accepted: true, disabled: true }, { status: 202 });
  }

  const { userId, orgId: clerkOrgId } = await auth();
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });
  const parsed = await parseBoundedJson(request);
  if (!parsed.ok) return parsed.response;
  const text = parsed.value.text.trim();
  if (text.length < 50) {
    return NextResponse.json({ accepted: true, reason: 'too_short_or_invalid' }, { status: 202 });
  }

  const orgId = nonEmptyString(clerkOrgId);
  const principal: DataBankPrincipal = { userId, ...(orgId ? { orgId } : {}) };
  const session = await getSession(parsed.value.sessionId, userId, orgId);
  if (!session) {
    return NextResponse.json({ error: 'Session not found or unavailable to this principal' }, { status: 404 });
  }
  try {
    assertDataBankSessionPrincipal(principal, session);
  } catch (error) {
    console.warn('[Observer] Session principal mismatch', {
      sessionId: parsed.value.sessionId,
      hasOrganizationPrincipal: Boolean(orgId),
      errorClass: error instanceof Error ? error.name : typeof error,
    });
    return NextResponse.json({ error: 'Session is unavailable to this principal' }, { status: 403 });
  }

  if (classifyObserverTextPrivacy(text) === 'child_data') {
    console.warn('[Observer] Child-data input excluded from memory ingestion', {
      sessionId: parsed.value.sessionId,
      source: parsed.value.source,
    });
    return NextResponse.json({ accepted: false, reason: 'child_data_not_observed' }, { status: 202 });
  }
  if (!isThinkForgeObserverWorkerConfigured()) {
    return NextResponse.json({ accepted: false, error: 'observer_worker_not_configured' }, { status: 503 });
  }

  try {
    const queued = await createOrGetQueuedThinkForgeObserverJob({
      userId,
      orgId: orgId ?? null,
      sessionId: parsed.value.sessionId,
      source: parsed.value.source,
      text,
    });
    let dispatchDeferred = false;
    if (queued.created && queued.job.status === 'queued') {
      try {
        await dispatchThinkForgeObserverJob(queued.job);
      } catch (error) {
        dispatchDeferred = true;
        await markThinkForgeObserverDispatchFailed(queued.job.id, error);
        console.error('[Observer] Initial dispatch failed; durable recovery will retry', {
          jobId: queued.job.id,
          errorClass: error instanceof Error ? error.name : typeof error,
        });
      }
    }
    return NextResponse.json({
      accepted: true,
      queued: true,
      created: queued.created,
      dispatchDeferred,
      jobId: queued.job.id,
      status: queued.job.status,
    }, { status: 202 });
  } catch (error) {
    console.error('[Observer] Durable enqueue failed', {
      sessionId: parsed.value.sessionId,
      source: parsed.value.source,
      errorClass: error instanceof Error ? error.name : typeof error,
    });
    return NextResponse.json({ accepted: false, error: 'observation_enqueue_failed' }, { status: 503 });
  }
}

async function parseBoundedJson(request: Request): Promise<
  | { ok: true; value: z.infer<typeof ObserverRequestSchema> }
  | { ok: false; response: NextResponse }
> {
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return { ok: false, response: NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) };
  }
  if (new TextEncoder().encode(raw).byteLength > MAX_REQUEST_BYTES) {
    return { ok: false, response: NextResponse.json({ error: 'Request body is too large' }, { status: 413 }) };
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return { ok: false, response: NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) };
  }
  const parsed = ObserverRequestSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, response: NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) };
  }
  return { ok: true, value: parsed.data };
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}
