import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';
import { NextResponse } from 'next/server';
import { observerWorkerHandler } from '@/lib/thinkforge/events/observer-worker-handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

const isDev = process.env.APP_ENV === 'development' || process.env.NODE_ENV === 'development';
const hasSigningKeys = Boolean(process.env.QSTASH_CURRENT_SIGNING_KEY && process.env.QSTASH_NEXT_SIGNING_KEY);

async function workerNotConfigured() {
  return NextResponse.json({ error: 'Worker not configured.' }, { status: 503 });
}

export const POST = isDev
  ? observerWorkerHandler
  : hasSigningKeys
    ? verifySignatureAppRouter(observerWorkerHandler)
    : workerNotConfigured;
