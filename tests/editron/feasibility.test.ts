import { describe, expect, it } from 'vitest';

import type { CoverageVerify } from '@/lib/editron/storyline/coverage';
import { assessFeasibility, type ShotRequest } from '@/lib/editron/storyline/feasibility';
import { makeScene, type Scene, type SceneInput } from '@/lib/editron/storyline/scene';

function scene(over: Partial<SceneInput> = {}): Scene {
  return makeScene({ source: 'a', startTime: 0, endTime: 3, objects: [], faces: [], detectedText: [], transcription: '', ...over });
}
const req = (id: string, embedding: number[], priority?: 'must' | 'nice'): ShotRequest => ({ id, text: `shot ${id}`, embedding, priority });
// verify confirms a scene only when its source matches the request id (grounded truth per test)
const verifyBySource = (map: Record<string, string>): CoverageVerify => async (query, sc) => ({ confirmed: sc.source === map[(query.text.split(' ')[1])] });

describe('assessFeasibility - shot-list coverage', () => {
  it('READY: every requested moment is covered', async () => {
    const scenes = [scene({ source: 'sA', embedding: [1, 0] }), scene({ source: 'sB', embedding: [0, 1] })];
    const requests = [req('A', [1, 0]), req('B', [0, 1])];
    const r = await assessFeasibility(requests, scenes, verifyBySource({ A: 'sA', B: 'sB' }));
    expect(r.status).toBe('ready');
    expect(r.coverageGaps).toHaveLength(0);
    expect(r.statement).toMatch(/covered|make this/i);
  });

  it('GAPS: a nice-to-have moment is missing -> still makeable, gap reported', async () => {
    const scenes = [scene({ source: 'sA', embedding: [1, 0] })];
    const requests = [req('A', [1, 0], 'nice'), req('B', [0, 1], 'nice')]; // B has no matching footage
    const r = await assessFeasibility(requests, scenes, verifyBySource({ A: 'sA' }));
    expect(r.status).toBe('gaps');
    expect(r.coverageGaps.map((g) => g.request.id)).toContain('B');
    expect(r.statement).toMatch(/film/i);
  });

  it('★ BLOCKED: an ESSENTIAL (must) moment is missing -> can\'t fully make it, names what to film', async () => {
    const scenes = [scene({ source: 'sA', embedding: [1, 0] })];
    const requests = [req('A', [1, 0], 'nice'), req('B', [0.1, 1], 'must')]; // must-have B missing
    const r = await assessFeasibility(requests, scenes, verifyBySource({ A: 'sA' }));
    expect(r.status).toBe('blocked');
    expect(r.statement).toMatch(/essential|Film|re-run/i);
    expect(r.statement).toContain('shot B');
  });

  it('gaps are ordered worst-first (missing before partial)', async () => {
    const scenes = [scene({ source: 'sMed', embedding: [1, 1, 0] })];
    // A ~0.707 sim (partial, unconfirmed); B orthogonal, 0 sim (missing)
    const requests = [req('A', [1, 0, 0], 'nice'), req('B', [0, 0, 1], 'nice')];
    const verify: CoverageVerify = async () => ({ confirmed: false });
    const r = await assessFeasibility(requests, scenes, verify);
    expect(r.coverageGaps.map((g) => g.verdict)).toEqual(['missing', 'partial']); // worst first
  });

  it('empty request list -> ready with the "no specific moments" note, no verify call', async () => {
    let called = false;
    const r = await assessFeasibility([], [scene({ embedding: [1, 0] })], async () => { called = true; return { confirmed: true }; });
    expect(r.status).toBe('ready');
    expect(called).toBe(false);
    expect(r.statement).toMatch(/no specific moments/i);
  });
});
