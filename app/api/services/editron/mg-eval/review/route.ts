import { NextResponse } from 'next/server';

import { MIN_CALIBRATION_LABELS } from '@/lib/editron/motion-graphics/eval/eval-dataset';
import {
  evalCorpusDir,
  labelsFileFor,
  loadEvalCorpus,
  loadEvalLabels,
  resolveEvalMedia,
  saveEvalLabel,
  seedFileFor,
} from '@/lib/editron/eval/eval-review-store';

/** GET: the review corpus (renders + judge verdicts + current labels). POST: save a human label. */
export async function GET() {
  const corpusDir = evalCorpusDir();
  const items = loadEvalCorpus(seedFileFor(corpusDir));
  const labels = loadEvalLabels(labelsFileFor(corpusDir));
  const review = items.map((it) => ({
    id: it.id,
    source: it.source,
    score: it.judge.score,
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
    media: resolveEvalMedia(it, corpusDir),
    human: labels.get(it.id) ?? null,
  }));
  return NextResponse.json({ items: review, labeled: labels.size, min: MIN_CALIBRATION_LABELS, ready: labels.size >= MIN_CALIBRATION_LABELS });
}

export async function POST(request: Request) {
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
    const corpusDir = evalCorpusDir();
    const items = loadEvalCorpus(seedFileFor(corpusDir));
    const base = items.find((i) => i.id === body.itemId);
    if (!base) return NextResponse.json({ ok: false, error: `unknown item ${body.itemId}` }, { status: 404 });
    const { count } = saveEvalLabel(labelsFileFor(corpusDir), body.itemId, {
      accept: body.accept,
      reasonCodes: body.reasonCodes,
      notes: body.notes,
    }, base);
    return NextResponse.json({ ok: true, count, ready: count >= MIN_CALIBRATION_LABELS });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'bad request' }, { status: 500 });
  }
}
