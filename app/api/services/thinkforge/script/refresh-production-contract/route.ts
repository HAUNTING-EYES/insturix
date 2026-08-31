import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getCreditCost } from '@/lib/config/creditCosts';
import { resolveContextBillingOwner } from '@/lib/editron/services/project-ownership';
import { hashScriptDocumentContent } from '@/lib/thinkforge/persistence/script-sidecar-binding';
import {
  dispatchProductionContractRefreshJob,
  isProductionContractRefreshWorkerConfigured,
} from '@/lib/thinkforge/production-contract-refresh/job';
import {
  productionContractRefreshJobStore,
  type ProductionContractRefreshJobSnapshot,
} from '@/lib/thinkforge/production-contract-refresh/job-store';
import { normalizeThinkForgeDocumentType } from '@/lib/thinkforge/schemas/document-contract';
import * as db from '@/lib/thinkforge/services/db';
import { CreditsService } from '@/lib/services/creditsService';
import { isOrgWalletBillingEnabled } from '@/lib/services/org-wallet-flag';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ExactIdSchema = z.string().min(1).refine(
  (value) => value.trim().length > 0 && value.trim() === value,
  { message: 'must be a non-empty trimmed string' },
);
const JobIdSchema = z.string().regex(/^contractrefresh_[a-f0-9]+$/);

const RefreshProductionContractRequestSchema = z.object({
  sessionId: ExactIdSchema,
  scriptId: ExactIdSchema,
  baseVersion: z.number().int().nonnegative(),
}).strict();

export async function POST(req: Request) {
  const parsed = RefreshProductionContractRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body', details: parsed.error.issues }, { status: 400 });
  }

  const { userId, orgId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isProductionContractRefreshWorkerConfigured()) {
    return NextResponse.json({ error: 'Production refresh worker is not configured' }, { status: 503 });
  }

  const { sessionId, scriptId, baseVersion } = parsed.data;
  try {
    const session = await db.getSession(sessionId, userId, orgId);
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    const storedDocument = await db.getScript(session._id, scriptId);
    if (!storedDocument) return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    if (normalizeThinkForgeDocumentType(storedDocument.documentType) !== 'video_script') {
      return NextResponse.json({ error: 'Production contract refresh is available only for video scripts' }, { status: 422 });
    }
    const currentVersion = storedDocument.version ?? 0;
    if (currentVersion !== baseVersion) {
      return NextResponse.json({ error: 'Document changed before production contract refresh', currentVersion }, { status: 409 });
    }

    const canonicalOrgId = session.orgId ?? orgId ?? null;
    const queued = await productionContractRefreshJobStore.createOrGet({
      userId,
      orgId: canonicalOrgId,
      sessionId: session._id,
      scriptId,
      baseVersion,
      documentHash: hashScriptDocumentContent(storedDocument.content),
    });
    let job = queued.job;
    if (job.billing.status === 'pending') {
      const wallet = resolveContextBillingOwner(userId, canonicalOrgId, isOrgWalletBillingEnabled());
      const cost = getCreditCost('thinkforge', 'document_creation');
      const charge = await CreditsService.deductForWallet(wallet, 'thinkforge', 'document_creation', {
        taskId: session._id,
        projectId: session._id,
        idempotencyKey: job.id,
      });
      if (!charge.success) {
        await productionContractRefreshJobStore.cancelUncharged(job.id, charge.error || 'Insufficient credits');
        return NextResponse.json({ error: charge.error || 'Insufficient credits' }, { status: 402 });
      }
      if (!charge.transactionId) {
        throw new Error('Credit deduction succeeded without a transaction receipt. Retry this request to reconcile it.');
      }
      await productionContractRefreshJobStore.markCharged(job.id, {
        wallet,
        transactionId: charge.transactionId,
        cost,
      });
      job = await productionContractRefreshJobStore.getAuthorized(job.id, userId, canonicalOrgId) ?? job;
    }

    let recoveryPending = false;
    if (job.status === 'queued') {
      try {
        await dispatchProductionContractRefreshJob(job.id);
      } catch (error) {
        recoveryPending = true;
        console.error('[ThinkForge:refresh-production-contract] Initial dispatch failed; recovery cron will retry:', {
          jobId: job.id,
          error: error instanceof Error ? error.message : 'unknown',
        });
      }
    }
    const latest = await productionContractRefreshJobStore.getAuthorized(job.id, userId, canonicalOrgId) ?? job;
    return NextResponse.json({ job: toClientJob(latest), recoveryPending }, { status: 202 });
  } catch (error) {
    console.error('[ThinkForge:refresh-production-contract] Admission failed:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Production contract refresh could not be queued',
    }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const { userId, orgId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const jobId = new URL(req.url).searchParams.get('jobId');
  const parsedJobId = JobIdSchema.safeParse(jobId);
  if (!parsedJobId.success) return NextResponse.json({ error: 'Invalid jobId' }, { status: 400 });

  const job = await productionContractRefreshJobStore.getAuthorized(parsedJobId.data, userId, orgId ?? null);
  if (!job) return NextResponse.json({ error: 'Refresh job not found' }, { status: 404 });
  if (job.status !== 'completed' || !job.commitReceipt) {
    return NextResponse.json({ job: toClientJob(job) });
  }
  const script = await db.getScript(job.sessionId, job.scriptId);
  if (!script
    || (script.version ?? 0) !== job.commitReceipt.documentVersion
    || hashScriptDocumentContent(script.content) !== job.commitReceipt.contentHash) {
    return NextResponse.json({ error: 'Completed refresh receipt does not match the saved document' }, { status: 409 });
  }
  return NextResponse.json({
    job: toClientJob(job),
    script: {
      scriptId: script.scriptId ?? job.scriptId,
      title: script.title,
      content: script.content,
      blocks: script.blocks ?? [],
      richText: script.richText ?? null,
      metadata: script.metadata ?? {},
      version: script.version,
      documentType: script.documentType,
      contentContract: script.contentContract,
    },
  });
}

function toClientJob(job: ProductionContractRefreshJobSnapshot) {
  return {
    id: job.id,
    status: job.status,
    stage: job.stage,
    error: job.error ? { code: job.error.code, message: job.error.message } : null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}
