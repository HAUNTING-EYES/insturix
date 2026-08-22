import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

import {
  buildThinkForgeDeployedGeminiCanaryAttestation,
  THINKFORGE_DEPLOYED_GEMINI_CANARY_MODE_ENV,
  THINKFORGE_DEPLOYED_GEMINI_CANARY_SECRET_ENV,
} from '@/lib/thinkforge/operations/deployed-gemini-canary-attestation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CANARY_SECRET_HEADER = 'x-thinkforge-canary-secret';
const PROVIDER_COST_EVENTS_COLLECTION = 'provider_cost_events';

type CanaryDocumentRequest = {
  sessionId: string;
  scriptId: string;
};

type CanaryCostEvent = {
  eventId: string | null;
  provider: string | null;
  model: string | null;
  operation: string | null;
  status: string | null;
  costUsd: number | null;
  functionMs: number | null;
};

function secretsMatch(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function unavailable(): NextResponse {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readCanaryDocumentRequest(value: unknown): CanaryDocumentRequest | null {
  const body = asRecord(value);
  const sessionId = stringValue(body?.sessionId);
  const scriptId = stringValue(body?.scriptId);
  if (!sessionId || !scriptId || sessionId.length > 160 || scriptId.length > 160) return null;
  return { sessionId, scriptId };
}

function toCanaryCostEvent(value: unknown): CanaryCostEvent {
  const event = asRecord(value);
  const units = asRecord(event?.units);
  const actualCostUsd = finiteNumber(event?.actualCostUsd);
  const estimatedCostUsd = finiteNumber(event?.estimatedCostUsd);
  return {
    eventId: stringValue(event?.eventId),
    provider: stringValue(event?.provider),
    model: stringValue(event?.model),
    operation: stringValue(event?.operation),
    status: stringValue(event?.status),
    costUsd: actualCostUsd ?? estimatedCostUsd,
    functionMs: finiteNumber(units?.functionMs),
  };
}

function authorized(request: Request): boolean {
  const expectedSecret = process.env[THINKFORGE_DEPLOYED_GEMINI_CANARY_SECRET_ENV]?.trim();
  return Boolean(expectedSecret && secretsMatch(request.headers.get(CANARY_SECRET_HEADER), expectedSecret));
}

async function verifyPersistedCanaryDocument(input: CanaryDocumentRequest) {
  const [{ getDatabase }, { getThinkForgeOperationalDiagnostics }] = await Promise.all([
    import('@/lib/editron/db/mongodb'),
    import('@/lib/thinkforge/operations/operational-diagnostics'),
  ]);
  const database = await getDatabase();
  const diagnostics = await getThinkForgeOperationalDiagnostics({
    database,
    sessionId: input.sessionId,
    scriptId: input.scriptId,
  });
  const document = diagnostics.document;
  const rawEvents = await database.collection(PROVIDER_COST_EVENTS_COLLECTION).find({
    service: 'thinkforge',
    taskId: input.sessionId,
  }, {
    projection: {
      _id: 0,
      eventId: 1,
      provider: 1,
      model: 1,
      operation: 1,
      status: 1,
      estimatedCostUsd: 1,
      actualCostUsd: 1,
      units: 1,
    },
  }).toArray();
  const costEvents = rawEvents.map(toCanaryCostEvent);
  const failures: string[] = [];
  const writer = document?.writer ?? null;

  if (!document) failures.push('document_missing');
  if (document?.outputKind !== 'video_script') failures.push('video_script_contract_missing');
  if (writer?.provider !== 'gemini') failures.push('writer_not_gemini');
  if (!writer?.model) failures.push('writer_model_missing');
  if (!document?.traceIntegrity.valid) failures.push('generation_trace_invalid');
  if (!document?.generationReceipt?.valid) failures.push('generation_receipt_invalid');
  if (diagnostics.alerts.some((alert) => alert.severity === 'critical')) failures.push('critical_operational_alert');
  if (!costEvents.some((event) => event.provider === 'gemini' && event.status === 'success')) {
    failures.push('gemini_cost_event_missing');
  }
  if (costEvents.some((event) => event.provider !== 'gemini')) failures.push('non_gemini_cost_event_detected');
  if (costEvents.some((event) => event.costUsd === null || event.costUsd < 0)) {
    failures.push('cost_event_missing_value');
  }
  if (costEvents.some((event) => event.functionMs === null || event.functionMs < 0)) {
    failures.push('latency_event_missing_value');
  }

  return {
    version: 1,
    verified: failures.length === 0,
    failures: [...new Set(failures)].sort(),
    document: document ? {
      sessionId: document.sessionId,
      scriptId: document.scriptId,
      documentVersion: document.documentVersion,
      outputKind: document.outputKind,
      authoringContext: {
        brandId: stringValue(document.authoringContext?.brand?.brandId),
        profileFingerprint: stringValue(document.authoringContext?.brand?.profileFingerprint),
      },
      writer: {
        provider: writer?.provider ?? null,
        model: writer?.model ?? null,
        cacheStatus: writer?.cacheStatus ?? null,
      },
      traceIntegrity: document.traceIntegrity,
      generationReceipt: document.generationReceipt,
    } : null,
    cost: {
      eventCount: costEvents.length,
      totalCostUsd: costEvents.reduce((total, event) => total + (event.costUsd ?? 0), 0),
      events: costEvents,
    },
    diagnostics: {
      criticalAlertCodes: diagnostics.alerts
        .filter((alert) => alert.severity === 'critical')
        .map((alert) => alert.code),
    },
  };
}

/**
 * This route exists only in a separately configured disposable canary.
 * Production deployments return 404 and the response never includes secrets.
 */
export async function GET(request: Request): Promise<Response> {
  if (process.env[THINKFORGE_DEPLOYED_GEMINI_CANARY_MODE_ENV] !== '1') {
    return unavailable();
  }

  if (!authorized(request)) {
    return unavailable();
  }

  const attestation = buildThinkForgeDeployedGeminiCanaryAttestation();
  return NextResponse.json(attestation, {
    status: attestation.safe ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}

/**
 * Verifies persisted output only after the separate canary deployment has
 * attested its isolation. It intentionally returns receipts as evidence,
 * never raw prompts, source facts, or provider credentials.
 */
export async function POST(request: Request): Promise<Response> {
  if (process.env[THINKFORGE_DEPLOYED_GEMINI_CANARY_MODE_ENV] !== '1' || !authorized(request)) {
    return unavailable();
  }

  const attestation = buildThinkForgeDeployedGeminiCanaryAttestation();
  if (!attestation.safe) {
    return NextResponse.json(attestation, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }

  const input = readCanaryDocumentRequest(await request.json().catch(() => null));
  if (!input) {
    return NextResponse.json({ error: 'A valid sessionId and scriptId are required.' }, { status: 400 });
  }

  try {
    const verification = await verifyPersistedCanaryDocument(input);
    return NextResponse.json(verification, {
      status: verification.verified ? 200 : 422,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json({ error: 'Canary verification failed.' }, {
      status: 500,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
