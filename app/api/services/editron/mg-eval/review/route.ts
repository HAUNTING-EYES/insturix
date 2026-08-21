import { NextResponse } from 'next/server';

import { internalToolsEnabled } from '@/lib/editron/internal-tools';
import { MIN_CALIBRATION_LABELS } from '@/lib/editron/motion-graphics/eval/eval-dataset';
import type { EvalItem } from '@/lib/editron/motion-graphics/eval/eval-dataset';
import {
  corpusMode,
  evalCorpusDir,
  labelsFileFor,
  loadEvalCorpus,
  loadEvalLabels,
  publicSeedPath,
  resolveEvalMedia,
  saveEvalLabel,
  seedFileFor,
  type EvalReviewLabel,
} from '@/lib/editron/eval/eval-review-store';

const MODE = corpusMode();

interface LabelDoc { itemId: string; human: EvalReviewLabel; }

async function loadLabels(): Promise<Map<string, EvalReviewLabel>> {
  if (MODE === 'public') {
    const { getDatabase } = await import('@/lib/editron/db/mongodb');
    const docs = await (await getDatabase()).collection<LabelDoc>('editron_mg_eval_labels').find({}).toArray();
    return new Map(docs.map((d) => [d.itemId, d.human]));
  }
  return loadEvalLabels(labelsFileFor(evalCorpusDir()));
}

function loadSeed(): EvalItem[] {
  return MODE === 'public'
    ? loadEvalCorpus(publicSeedPath())
    : loadEvalCorpus(seedFileFor(evalCorpusDir()));
}

async function saveLabel(itemId: string, label: EvalReviewLabel): Promise<number> {
  if (MODE === 'public') {
    const { getDatabase } = await import('@/lib/editron/db/mongodb');
    const col = (await getDatabase()).collection<LabelDoc>('editron_mg_eval_labels');
    await col.updateOne(
      { itemId },
      { $set: { itemId, human: label, updatedAt: new Date().toISOString() } },
      { upsert: true },
    );
    return col.countDocuments();
  }
  const base = loadSeed().find((i) => i.id === itemId);
  if (!base) throw new Error(`unknown item ${itemId}`);
  return saveEvalLabel(labelsFileFor(evalCorpusDir()), itemId, label, base).count;
}

/** GET: the review corpus (renders + judge verdicts + current labels). POST: save a human label.
 *  Operator-only: labels are calibration ground truth, so both verbs 404 unless
 *  INTERNAL_TOOLS_ENABLED is set (mirrors the page gate — UI hiding alone is not a gate). */
export async function GET() {
  if (!internalToolsEnabled()) {
    return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 });
  }
  const items = loadSeed();
  const labels = await loadLabels();
  const review = items.map((it) => ({
    id: it.id,
    source: it.source,
    score: it.judge.score,
    scored: !(it.judge.issues ?? [])[0]?.startsWith?.('__UNSCORED__'),
    issues: (it.judge.issues ?? []).slice(0, 6),
    dims: {
      hierarchy: it.judge.hierarchy,
      typography: it.judge.typography,
      color: it.judge.color,
      composition: it.judge.composition,
      motion: it.judge.motion,
      form: it.judge.form,
    },
    geometry: it.geometry ?? null,
    media: resolveEvalMedia(it, evalCorpusDir(), { mode: MODE }),
    human: labels.get(it.id) ?? null,
  }));
  return NextResponse.json({ mode: MODE, items: review, labeled: labels.size, min: MIN_CALIBRATION_LABELS, ready: labels.size >= MIN_CALIBRATION_LABELS });
}

export async function POST(request: Request) {
  if (!internalToolsEnabled()) {
    return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 });
  }
  try {
    const body = (await request.json()) as {
      itemId: string;
      accept: 'accept' | 'watchlist' | 'reject';
      reasonCodes?: string[];
      notes?: string;
    };
    if (!body.itemId || !['accept', 'watchlist', 'reject'].includes(body.accept)) {
      return NextResponse.json({ ok: false, error: 'itemId + accept required' }, { status: 400 });
    }
    const items = loadSeed();
    if (!items.some((i) => i.id === body.itemId)) {
      return NextResponse.json({ ok: false, error: `unknown item ${body.itemId}` }, { status: 404 });
    }
    const count = await saveLabel(body.itemId, {
      accept: body.accept,
      reasonCodes: body.reasonCodes,
      notes: body.notes,
    });
    return NextResponse.json({ ok: true, count, ready: count >= MIN_CALIBRATION_LABELS });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'bad request' }, { status: 500 });
  }
}
