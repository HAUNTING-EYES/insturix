import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  corpusMode,
  evalCorpusDir,
  labelsFileFor,
  loadEvalCorpus,
  loadEvalLabels,
  resolveEvalMedia,
  saveEvalLabel,
  seedFileFor,
} from '@/lib/editron/eval/eval-review-store';
import type { EvalItem } from '@/lib/editron/motion-graphics/eval/eval-dataset';

let tmp: string;

const item = (id: string, renderRef: string): EvalItem => ({
  id,
  source: `src-${id}`,
  renderRef,
  judge: {
    faithful: true,
    score: 3,
    issues: ['a real issue'],
    hierarchy: 5, typography: 3, color: 5, composition: 5, motion: 0, form: 3,
    hardFailures: {
      fabrication: false, nonBrandColor: false, clippedOrOverflowing: false, subjectInterference: false,
      captionOrExistingTextInterference: false, unreadableContrast: false, opaqueFootageOcclusion: false,
      missingMotionDevelopment: false, templateLikeForm: false,
    },
  },
});

beforeAll(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'mg-eval-review-'));
  writeFileSync(seedFileFor(tmp), `${JSON.stringify(item('a', '.calibration-temp/mg-vlog-eval/lower-third/'))}\n${JSON.stringify(item('b', '.calibration-temp/omni-out/omni-crash-4s.mp4'))}\n`, 'utf8');
});

afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe('eval review store', () => {
  it('loads the seed corpus from the corpus dir', () => {
    expect(evalCorpusDir({ MG_EVAL_CORPUS_DIR: tmp })).toBe(tmp);
    expect(loadEvalCorpus(seedFileFor(tmp))).toHaveLength(2);
  });

  it('saveEvalLabel upserts, overwrites on re-label, and counts', () => {
    const labelsFile = labelsFileFor(tmp);
    const first = saveEvalLabel(labelsFile, 'a', { accept: 'reject', reasonCodes: ['form'] }, item('a', 'x'));
    expect(first.count).toBe(1);
    const overwrite = saveEvalLabel(labelsFile, 'a', { accept: 'accept', reasonCodes: ['legibility'], notes: 'fixed glyph' }, item('a', 'x'));
    expect(overwrite.count).toBe(1); // still one label, overwritten
    const labels = loadEvalLabels(labelsFile);
    expect(labels.get('a')).toMatchObject({ accept: 'accept', notes: 'fixed glyph' });
  });

  it('resolveEvalMedia maps an mp4 renderRef to a video and a dir ref to composite+footage', () => {
    const media = resolveEvalMedia(item('b', '.calibration-temp/omni-out/omni-crash-4s.mp4'), tmp);
    expect(media[0].kind).toBe('video');
    expect(media[0].url).toContain('asset=file&path=');

    const dirMedia = resolveEvalMedia(item('a', '.calibration-temp/mg-vlog-eval/lower-third/'), tmp);
    expect(dirMedia[0].url).toContain('asset=composite&dir=lower-third&phase=2');
    expect(dirMedia[1].url).toContain('f0.png');
  });

  it('unknown renderRefs resolve to no media', () => {
    expect(resolveEvalMedia(item('c', ''), tmp)).toHaveLength(0);
    expect(existsSync(seedFileFor(tmp))).toBe(true);
    void mkdirSync;
  });

  it('public (deployed) mode: committed per-item review image + local default off', () => {
    expect(corpusMode({ MG_EVAL_CORPUS_MODE: 'public' })).toBe('public');
    expect(corpusMode({})).toBe('local');
    const m = resolveEvalMedia(item('a', '.calibration-temp/mg-vlog-eval/lower-third/'), tmp, { mode: 'public' });
    expect(m[0].kind).toBe('image');
    expect(m[0].url).toBe('/mg-eval/a.png');
  });
});