import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';
import { NextResponse } from 'next/server';
import { longFormScriptWorkerHandler } from '@/lib/thinkforge/long-form/script-generation-worker-handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const isDev = process.env.APP_ENV === 'development' || process.env.NODE_ENV === 'development';
const hasSigningKeys = Boolean(process.env.QSTASH_CURRENT_SIGNING_KEY && process.env.QSTASH_NEXT_SIGNING_KEY);

async function workerNotConfigured() {
  return NextResponse.json({ error: 'Worker not configured.' }, { status: 503 });
}

export const POST = isDev
  ? longFormScriptWorkerHandler
  : hasSigningKeys
    ? verifySignatureAppRouter(longFormScriptWorkerHandler)
    : workerNotConfigured;
