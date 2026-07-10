import { describe, expect, it } from 'vitest';

import { assessCoverage, type CoverageQuery, type CoverageVerify } from '@/lib/editron/storyline/coverage';
import { makeScene, type Scene, type SceneInput } from '@/lib/editron/storyline/scene';

function scene(over: Partial<SceneInput> = {}): Scene {
  return makeScene({ source: 'a', startTime: 0, endTime: 3, objects: [], faces: [], detectedText: [], transcription: '', ...over });
}
const q = (embedding: number[], text = 'the moment she opens the box'): CoverageQuery => ({ text, embedding });
const confirmAll: CoverageVerify = async () => ({ confirmed: true });
const rejectAll: CoverageVerify = async () => ({ confirmed: false });

describe('assessCoverage - conviction-backed "do we have this shot?"', () => {
  it('HAVE: a matching scene the vision confirms -> verdict have, cites the frame + timecode', async () => {
    const s = scene({ source: 'box', visualMode: 'product-shot', startTime: 42, endTime: 45, embedding: [1, 0] });
    const r = await assessCoverage(q([1, 0]), [s], confirmAll);
    expect(r.verdict).toBe('have');
    expect(r.best?.scene.source).toBe('box');
    expect(r.statement).toContain('0:42');
  });

  it('★ CONVICTION: vision is the authority — a lower-sim CONFIRMED scene beats a higher-sim REJECTED one', async () => {
    const looksSimilar = scene({ source: 'looks-similar', startTime: 10, endTime: 13, embedding: [1, 0.05] }); // higher sim
    const actuallyIt = scene({ source: 'actually-it', startTime: 20, endTime: 23, embedding: [0.9, 0.2] });     // lower sim
    const verify: CoverageVerify = async (_query, sc) => ({ confirmed: sc.source === 'actually-it' });
    const r = await assessCoverage(q([1, 0]), [looksSimilar, actuallyIt], verify);
    expect(r.verdict).toBe('have');
    expect(r.best?.scene.source).toBe('actually-it'); // confirmed wins over merely-similar
  });

  it('★ never claims HAVE on similarity alone: a high-sim scene the vision REJECTS is at most partial', async () => {
    const r = await assessCoverage(q([1, 0]), [scene({ source: 'not-really', embedding: [1, 0] })], rejectAll);
    expect(r.verdict).not.toBe('have');
    expect(r.verdict).toBe('partial');
  });

  it('PARTIAL: a moderately-similar but unconfirmed scene -> close, not exact', async () => {
    const r = await assessCoverage(q([1, 0]), [scene({ source: 'close', embedding: [0.5, 1] })], rejectAll); // sim ~0.447
    expect(r.verdict).toBe('partial');
    expect(r.statement).toMatch(/close|exact|film/i);
  });

  it('MISSING: nothing similar and unconfirmed -> honest gap (film it)', async () => {
    const r = await assessCoverage(q([1, 0]), [scene({ source: 'unrelated', embedding: [0.2, 1] })], rejectAll); // sim ~0.196
    expect(r.verdict).toBe('missing');
    expect(r.statement).toMatch(/don't have|film it/i);
  });

  it('empty footage -> missing, no vision call', async () => {
    let called = false;
    const r = await assessCoverage(q([1, 0]), [], async () => { called = true; return { confirmed: true }; });
    expect(r.verdict).toBe('missing');
    expect(called).toBe(false);
  });

  it('ranks candidates by similarity and only verifies the top-k', async () => {
    const scenes = [
      scene({ source: 'lo', embedding: [0.3, 1] }),
      scene({ source: 'hi', embedding: [1, 0] }),
      scene({ source: 'mid', embedding: [0.7, 0.3] }),
    ];
    let verifyCount = 0;
    const verify: CoverageVerify = async () => { verifyCount++; return { confirmed: false }; };
    const r = await assessCoverage(q([1, 0]), scenes, verify, { topK: 2 });
    expect(r.candidates.map((c) => c.scene.source)).toEqual(['hi', 'mid', 'lo']); // similarity desc
    expect(verifyCount).toBe(2); // only the top-2 vision-verified
  });

  it('a vision call that THROWS can never back a HAVE (fails honest)', async () => {
    const verify: CoverageVerify = async () => { throw new Error('vision down'); };
    const r = await assessCoverage(q([1, 0]), [scene({ source: 's', embedding: [1, 0] })], verify);
    expect(r.verdict).not.toBe('have'); // unverifiable -> partial/missing, never a false yes
  });
});
