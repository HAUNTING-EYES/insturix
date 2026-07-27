import { describe, expect, it } from 'vitest';

import { cutToMoment, type CutWindow, type VlmCut } from '@/lib/editron/storyline/cutting';
import { makeScene, type Scene, type SceneInput } from '@/lib/editron/storyline/scene';

// a 10-second clip spanning source 10s..20s
function clip(over: Partial<SceneInput> = {}): Scene {
  return makeScene({ source: 'a', startTime: 10, endTime: 20, objects: [], faces: [], detectedText: [], transcription: 'talk', ...over });
}
const req = { text: 'she opens the box' };
const vlm = (present: boolean, windows: CutWindow[]): VlmCut => async () => ({ present, windows });
const w = (startSec: number, endSec: number, confidence = 0.9): CutWindow => ({ startSec, endSec, confidence });

describe('cutToMoment - VLM-cutting contract', () => {
  it('CUT: one in-bounds sub-window -> trims to exactly it', async () => {
    const r = await cutToMoment(clip(), req, vlm(true, [w(12, 15)]));
    expect(r.verdict).toBe('cut');
    expect(r.clips).toHaveLength(1);
    expect([r.clips[0].startTime, r.clips[0].endTime]).toEqual([12, 15]);
    expect(r.statement).toMatch(/12\.0.*15\.0/);
  });

  it('SPLIT: two in-bounds windows -> two usable clips, sorted by start', async () => {
    const r = await cutToMoment(clip(), req, vlm(true, [w(16, 18), w(11, 13)]));
    expect(r.verdict).toBe('split');
    expect(r.clips.map((c) => c.startTime)).toEqual([11, 16]);
  });

  it('WHOLE: a window covering the whole clip -> no trim', async () => {
    const r = await cutToMoment(clip(), req, vlm(true, [w(10, 20)]));
    expect(r.verdict).toBe('whole');
    expect(r.clips).toHaveLength(1);
    expect(r.clips[0].durationSec).toBe(10);
  });

  it('NOT-FOUND: the moment is absent -> honest, no fabricated cut', async () => {
    const r = await cutToMoment(clip(), req, vlm(false, []));
    expect(r.verdict).toBe('not-found');
    expect(r.clips).toHaveLength(0);
    expect(r.statement).toMatch(/isn't in this clip/i);
  });

  it("★ CONTRACT: a fully out-of-bounds window is rejected (not turned into a bad cut)", async () => {
    const r = await cutToMoment(clip(), req, vlm(true, [w(50, 60)])); // outside 10..20
    expect(r.verdict).toBe('not-found');
    expect(r.clips).toHaveLength(0);
  });

  it('★ CONTRACT: a partially-out window is clamped to the clip bounds', async () => {
    const r = await cutToMoment(clip(), req, vlm(true, [w(18, 60)])); // clamps to 18..20
    expect(r.verdict).toBe('cut');
    expect([r.clips[0].startTime, r.clips[0].endTime]).toEqual([18, 20]);
  });

  it('★ CONTRACT: inverted timecodes are swapped, not rejected', async () => {
    const r = await cutToMoment(clip(), req, vlm(true, [w(15, 12)])); // -> 12..15
    expect(r.verdict).toBe('cut');
    expect([r.clips[0].startTime, r.clips[0].endTime]).toEqual([12, 15]);
  });

  it('★ CONTRACT: a too-short window (< min clip) is dropped', async () => {
    const r = await cutToMoment(clip(), req, vlm(true, [w(12, 12.2)])); // 0.2s < 0.4 min
    expect(r.verdict).toBe('not-found');
  });

  it('a mix of valid + invalid windows keeps only the valid ones', async () => {
    const r = await cutToMoment(clip(), req, vlm(true, [w(12, 14), w(100, 200), w(NaN, 5)]));
    expect(r.verdict).toBe('cut');
    expect(r.clips).toHaveLength(1);
    expect([r.clips[0].startTime, r.clips[0].endTime]).toEqual([12, 14]);
  });

  it('a VLM that throws -> not-found (fails honest, never a fabricated cut)', async () => {
    const r = await cutToMoment(clip(), req, async () => { throw new Error('vision down'); });
    expect(r.verdict).toBe('not-found');
  });
});
