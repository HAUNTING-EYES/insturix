/**
 * Phase 9 review tooling: EVAL REVIEW STORE — load the seed corpus + human labels, save a label, resolve
 * viewable media for each render. Dev-scoped (operates on the gitignored .calibration-temp corpus; dir overridable
 * via MG_EVAL_CORPUS_DIR). The labeled output file is exactly what `eval-mg-calibrate --labels` consumes.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { parseLabeledDataset, type EvalItem } from '../motion-graphics/eval/eval-dataset';

export interface EvalReviewLabel {
  accept: 'accept' | 'watchlist' | 'reject';
  reasonCodes?: string[];
  notes?: string;
}

export interface EvalReviewMedia {
  kind: 'video' | 'image';
  url: string;
  caption: string;
}

export function evalCorpusDir(env: Record<string, string | undefined> = process.env): string {
  return env.MG_EVAL_CORPUS_DIR?.trim() || path.resolve('.calibration-temp');
}

/** 'local' = gitignored .calibration-temp (dev). 'public' = committed public/mg-eval + Mongo labels (deployed).
 *  Env override wins; otherwise AUTO: a deployed bundle has public/mg-eval but NO local .calibration-temp seed →
 *  public; a local dev machine has both → local. */
export function corpusMode(env: Record<string, string | undefined> = process.env): 'local' | 'public' {
  const m = (env.MG_EVAL_CORPUS_MODE ?? '').trim().toLowerCase();
  if (m === 'public' || m === 'local') return m === 'public' ? 'public' : 'local';
  try {
    if (existsSync(publicSeedPath()) && !existsSync(path.resolve('.calibration-temp/mg-eval-seed.jsonl'))) return 'public';
  } catch { /* ignore */ }
  return 'local';
}

export function publicSeedPath(): string {
  return path.join(process.cwd(), 'public', 'mg-eval', 'seed.jsonl');
}

export function seedFileFor(corpusDir: string): string {
  return path.join(corpusDir, 'mg-eval-seed.jsonl');
}
export function labelsFileFor(corpusDir: string): string {
  return path.join(corpusDir, 'mg-eval-labeled.jsonl');
}

export function loadEvalCorpus(seedFile: string): EvalItem[] {
  if (!existsSync(seedFile)) return [];
  return parseLabeledDataset(readFileSync(seedFile, 'utf8')).items;
}

export function loadEvalLabels(labelsFile: string): Map<string, EvalReviewLabel> {
  if (!existsSync(labelsFile)) return new Map();
  const { items } = parseLabeledDataset(readFileSync(labelsFile, 'utf8'));
  return new Map(items.filter((i) => i.human).map((i) => [i.id, i.human as EvalReviewLabel]));
}

/** Upsert a human label onto the labeled dataset (idempotent; re-labels overwrite). Returns the labeled count. */
export function saveEvalLabel(
  labelsFile: string,
  itemId: string,
  label: EvalReviewLabel,
  base: EvalItem,
): { saved: boolean; count: number } {
  const items: EvalItem[] = existsSync(labelsFile)
    ? parseLabeledDataset(readFileSync(labelsFile, 'utf8')).items
    : [];
  const idx = items.findIndex((i) => i.id === itemId);
  const updated: EvalItem = {
    ...(idx >= 0 ? items[idx] : base),
    human: { accept: label.accept, reasonCodes: label.reasonCodes, notes: label.notes },
  };
  if (idx >= 0) items[idx] = updated;
  else items.push(updated);
  writeFileSync(labelsFile, `${items.map((i) => JSON.stringify(i)).join('\n')}\n`, 'utf8');
  return { saved: true, count: items.filter((i) => i.human).length };
}

/** Map a render ref to viewable media URLs. Local mode: files/composites in corpusDir. Public (deployed) mode:
 *  a committed per-item review image served statically. Pure by pattern (the media ROUTE does file existence). */
export function resolveEvalMedia(
  item: EvalItem,
  corpusDir: string,
  opts: { mode?: 'local' | 'public' } = {},
): EvalReviewMedia[] {
  if ((opts.mode ?? 'local') === 'public') {
    return [{ kind: 'image', url: `/mg-eval/${item.id}.png`, caption: 'review composite (deployed)' }];
  }
  const ref = (item.renderRef ?? '').replace(/\\/g, '/').trim();
  const rel = (p: string) => path.relative(corpusDir, p).replace(/\\/g, '/');
  const base = '/api/services/editron/mg-eval/media';
  if (ref.endsWith('.mp4') || ref.includes('omni-out')) {
    return [{ kind: 'video', url: `${base}?asset=file&path=${encodeURIComponent(rel(path.resolve(corpusDir, 'omni-out', path.basename(ref))))}`, caption: 'render clip' }];
  }
  if (/\.(png|jpe?g|webp)$/.test(ref)) {
    return [{ kind: 'image', url: `${base}?asset=file&path=${encodeURIComponent(rel(path.resolve(corpusDir, ref)))}`, caption: 'render frame' }];
  }
  // A directory (e.g. mg-vlog-eval/lower-third): composite overlay(settled) over the sibling footage frame.
  if (ref.includes('mg-vlog-eval') && ref.endsWith('/')) {
    const dirName = path.basename(ref.slice(0, -1));
    return [
      { kind: 'image', url: `${base}?asset=composite&dir=${encodeURIComponent(dirName)}&phase=2`, caption: 'settled composite over footage' },
      { kind: 'image', url: `${base}?asset=file&path=${encodeURIComponent('mg-vlog-eval/f0.png')}`, caption: 'raw footage frame' },
    ];
  }
  return [];
}
