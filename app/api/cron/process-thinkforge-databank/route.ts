import { NextRequest, NextResponse } from 'next/server';
import { backfillDataBankProvenanceAndQueueEmbeddings } from '@/lib/thinkforge/services/db';
import { processPendingEmbeddings } from '@/lib/thinkforge/services/embedding-service';

export const runtime = 'nodejs';
export const maxDuration = 300;

const BACKFILL_BATCH_SIZE = 50;

/**
 * Bounded DataBank lifecycle maintenance:
 * - stamp only legacy global entries with explicit existing provenance
 * - quarantine ambiguous legacy entries
 * - refresh vector metadata through the shared embedding claim worker
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  const isVercelCron = request.headers.get('user-agent')?.includes('vercel-cron') ?? false;

  if (!cronSecret) {
    console.error('[cron/process-thinkforge-databank] CRON_SECRET is not configured');
    return NextResponse.json({ ok: false, error: 'Cron authentication is not configured.' }, { status: 503 });
  }
  if (authHeader !== `Bearer ${cronSecret}` && !isVercelCron) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const provenance = await backfillDataBankProvenanceAndQueueEmbeddings(BACKFILL_BATCH_SIZE);
    const embeddings = await processPendingEmbeddings(BACKFILL_BATCH_SIZE);
    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      provenance,
      embeddings,
    });
  } catch (error) {
    console.error('[cron/process-thinkforge-databank] failed:', error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
