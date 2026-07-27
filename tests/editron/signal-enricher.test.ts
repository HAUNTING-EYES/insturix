import { describe, expect, it } from 'vitest';

import {
  buildClipDigest,
  buildOrderingDigest,
  narrativeLine,
  formatDigestForPrompt,
} from '@/lib/editron/storyline/ordering-digest';
import { buildOrderingPrompt } from '@/lib/editron/storyline/ordering-prompt';
import { makeScene, type Scene, type SceneInput } from '@/lib/editron/storyline/scene';
import {
  enrichScenes,
  narrativeSourceFromTimeline,
  type NarrativeSignalEvent,
  type NarrativeSignalSource,
  type TimelineLike,
} from '@/lib/editron/storyline/signal-enricher';

const OPENING = 0.15; // graph threshold: first 15% of a source = opening

function scene(over: Partial<SceneInput> = {}): Scene {
  return makeScene({
    source: 'a',
    startTime: 0,
    endTime: 10,
    objects: [],
    faces: [],
    detectedText: [],
    transcription: '',
    ...over,
  });
}

function sourceWith(events: NarrativeSignalEvent[], extra: Partial<NarrativeSignalSource> = {}): NarrativeSignalSource {
  return { events, ...extra };
}

describe('signal-enricher - narrative_phase (graph entity.narrative_phase recipe)', () => {
  // One source, 100s arc; energy shape gives build -> climax -> resolve between opening/closing.
  const scenes = [
    scene({ source: 'a', startTime: 0, endTime: 10, importance: 0.2 }), // pos 0.05 -> opening
    scene({ source: 'a', startTime: 20, endTime: 30, importance: 0.4 }), // pos 0.25, rising -> build
    scene({ source: 'a', startTime: 40, endTime: 50, importance: 0.9 }), // pos 0.45, peak -> climax
    scene({ source: 'a', startTime: 60, endTime: 70, importance: 0.5 }), // pos 0.65, falling -> resolve
    scene({ source: 'a', startTime: 90, endTime: 100, importance: 0.3 }), // pos 0.95 -> closing
  ];

  it('★ assigns opening/build/climax/resolve/closing from position + energy shape', () => {
    const enriched = enrichScenes(scenes);
    expect(enriched.map((s) => s.narrative?.phase)).toEqual(['opening', 'build', 'climax', 'resolve', 'closing']);
  });

  it('a cta forces the closing phase regardless of position', () => {
    const withCta = enrichScenes([scene({ source: 'a', startTime: 10, endTime: 20, importance: 0.5 })], {
      sources: new Map([['a', sourceWith([{ timestampMs: 15000, kind: 'cta' }], { durationMs: 100000 })]]),
    });
    expect(withCta[0].narrative?.phase).toBe('closing');
    expect(withCta[0].narrative?.cta).toBe(true);
  });

  it('position is computed WITHIN each source (its own arc), not across sources', () => {
    // Each source has its own early+late arc; the early scene of each is an opening, independent
    // of the other source. (A source's position is scene-mid / that-source's-own duration.)
    const enriched = enrichScenes([
      scene({ source: 'a', startTime: 0, endTime: 5, importance: 0.4 }),
      scene({ source: 'a', startTime: 80, endTime: 90, importance: 0.4 }),
      scene({ source: 'b', startTime: 0, endTime: 5, importance: 0.5 }), // early in b's 0-90 arc
      scene({ source: 'b', startTime: 80, endTime: 90, importance: 0.5 }),
    ]);
    const bEarly = enriched.find((s) => s.source === 'b' && s.startTime === 0);
    expect(bEarly?.narrative?.phase).toBe('opening');
    expect(bEarly?.narrative?.position).toBeLessThan(OPENING);
  });

  it('never fabricates a climax when there is no energy signal (position-only bucketing)', () => {
    const enriched = enrichScenes([
      scene({ source: 'a', startTime: 0, endTime: 10 }),
      scene({ source: 'a', startTime: 30, endTime: 40 }), // pos 0.35 -> build (no energy)
      scene({ source: 'a', startTime: 60, endTime: 70 }), // pos 0.65 -> resolve (no energy)
      scene({ source: 'a', startTime: 90, endTime: 100 }),
    ]);
    expect(enriched.map((s) => s.narrative?.phase)).toEqual(['opening', 'build', 'resolve', 'closing']);
  });
});

describe('signal-enricher - window-local event tags', () => {
  const events: NarrativeSignalEvent[] = [
    { timestampMs: 10_000, kind: 'topic_boundary' },
    { timestampMs: 12_000, kind: 'rhetorical_question' },
    { timestampMs: 13_000, kind: 'number', context: '40%' },
    { timestampMs: 14_000, kind: 'claim_assertive' },
    { timestampMs: 15_000, kind: 'name', context: 'Acme' },
    { timestampMs: 16_000, kind: 'name', context: 'Acme' }, // duplicate entity
    { timestampMs: 30_000, kind: 'cta' }, // OUTSIDE the 10-20s window
  ];
  const sources = new Map([['a', sourceWith(events, { durationMs: 60_000, pressureAt: () => 0.72 })]]);

  it('tags topic-boundary, question, statistic, claim strength, and dedup entities in-window', () => {
    const [s] = enrichScenes([scene({ source: 'a', startTime: 10, endTime: 20 })], { sources });
    const n = s.narrative!;
    expect(n.topicBoundary).toBe(true);
    expect(n.rhetoricalQuestion).toBe(true);
    expect(n.statistic).toBe(true);
    expect(n.claimStrength).toBe('assertive');
    expect(n.entities).toEqual(['Acme']); // deduped
    expect(n.cta).toBeUndefined(); // cta at 30s is not in this scene's window
    expect(n.pressure).toBe(0.72);
  });

  it('assertive dominates hedged when both appear in the window', () => {
    const both = new Map([
      ['a', sourceWith([
        { timestampMs: 11_000, kind: 'claim_hedged' },
        { timestampMs: 12_000, kind: 'claim_assertive' },
      ], { durationMs: 60_000 })],
    ]);
    const [s] = enrichScenes([scene({ source: 'a', startTime: 10, endTime: 20 })], { sources: both });
    expect(s.narrative?.claimStrength).toBe('assertive');
  });

  it('with no sources, only phase/position are set (event tags honestly absent)', () => {
    const [s] = enrichScenes([scene({ source: 'a', startTime: 0, endTime: 10, importance: 0.5 })]);
    expect(s.narrative?.position).toBeDefined();
    expect(s.narrative?.cta).toBeUndefined();
    expect(s.narrative?.topicBoundary).toBeUndefined();
    expect(s.narrative?.entities).toBeUndefined();
  });
});

describe('signal-enricher - narrativeSourceFromTimeline bridge', () => {
  const timeline: TimelineLike = {
    eventSignals: [
      { timestampMs: 1000, signal: 'entity.cta', value: true, context: 'subscribe' },
      { timestampMs: 2000, signal: 'entity.claim_strength', value: 'assertive', context: 'we grew 40%' },
      { timestampMs: 2500, signal: 'entity.claim_strength', value: 'hedged', context: 'maybe' },
      { timestampMs: 3000, signal: 'entity.name', value: true, context: 'Acme' },
      { timestampMs: 3500, signal: 'visual.motion_intensity', value: 0.8 }, // NOT a narrative event -> dropped
      { timestampMs: Number.NaN, signal: 'entity.cta', value: true }, // malformed -> dropped
    ],
    gridSignals: new Map<number, Record<string, unknown>>([
      [0, { timestampMs: 0, 'composite.narrative_pressure': 0.2 }],
      [15, { timestampMs: 500, 'composite.narrative_pressure': 0.9 }],
      [30, { timestampMs: 1000, 'composite.narrative_pressure': 0.4 }],
    ]),
  };

  it('maps only narrative event signals and reads the pressure grid', () => {
    const src = narrativeSourceFromTimeline(timeline);
    expect(src.events.map((e) => e.kind).sort()).toEqual(['claim_assertive', 'claim_hedged', 'cta', 'name']);
    expect(src.events.find((e) => e.kind === 'name')?.context).toBe('Acme');
    // pressureAt nearest sample: 480ms is closest to the 500ms sample (0.9).
    expect(src.pressureAt?.(480)).toBe(0.9);
    expect(src.durationMs).toBe(1000);
  });

  it('a real timeline drives the enricher end to end (bridge -> enrich)', () => {
    const src = narrativeSourceFromTimeline(timeline);
    const [s] = enrichScenes([scene({ source: 'a', startTime: 0, endTime: 4 })], {
      sources: new Map([['a', src]]),
    });
    expect(s.narrative?.cta).toBe(true);
    expect(s.narrative?.claimStrength).toBe('assertive');
    expect(s.narrative?.entities).toEqual(['Acme']);
    expect(s.narrative?.phase).toBe('closing'); // cta present
  });
});

describe('signal-enricher - adversarial / robustness (Rule 29)', () => {
  it('empty input returns empty', () => {
    expect(enrichScenes([])).toEqual([]);
  });

  it('non-finite scene times do not crash and yield no bogus position', () => {
    const bad = makeScene({ source: 'a', startTime: Number.NaN, endTime: Number.POSITIVE_INFINITY, objects: [], faces: [], detectedText: [], transcription: '' });
    const [s] = enrichScenes([bad]);
    expect(s.narrative?.position).toBeUndefined();
  });

  it('events outside the window are ignored; NaN pressure is dropped', () => {
    const src = sourceWith([{ timestampMs: 99_000, kind: 'cta' }], {
      durationMs: 100_000,
      pressureAt: () => Number.NaN,
    });
    const [s] = enrichScenes([scene({ source: 'a', startTime: 0, endTime: 10 })], { sources: new Map([['a', src]]) });
    expect(s.narrative?.cta).toBeUndefined();
    expect(s.narrative?.pressure).toBeUndefined();
  });

  it('does not mutate the input scenes (purity)', () => {
    const orig = scene({ source: 'a', startTime: 0, endTime: 10, importance: 0.5 });
    const [enriched] = enrichScenes([orig]);
    expect(orig.narrative).toBeUndefined();
    expect(enriched.narrative).toBeDefined();
    expect(enriched).not.toBe(orig);
  });

  it('a malformed timeline (missing arrays) does not throw', () => {
    const src = narrativeSourceFromTimeline({ eventSignals: [], gridSignals: new Map() });
    expect(src.events).toEqual([]);
    expect(src.pressureAt).toBeUndefined();
  });
});

describe('signal-enricher - digest + prompt integration (the signals reach the LLM)', () => {
  const enriched = makeScene({
    source: 'a', startTime: 0, endTime: 10, objects: [], faces: [], detectedText: [], transcription: 'we grew 40% last quarter',
    narrative: { phase: 'climax', pressure: 0.8, cta: true, statistic: true, claimStrength: 'assertive', entities: ['Acme'] },
  });

  it('buildClipDigest carries the narrative signals through', () => {
    const d = buildClipDigest(enriched, 'c0');
    expect(d.phase).toBe('climax');
    expect(d.pressure).toBe(0.8);
    expect(d.cta).toBe(true);
    expect(d.entities).toEqual(['Acme']);
  });

  it('narrativeLine renders present signals only', () => {
    const d = buildClipDigest(enriched, 'c0');
    const line = narrativeLine(d)!;
    expect(line).toContain('phase:climax');
    expect(line).toContain('tension 0.8');
    expect(line).toContain('cta');
    expect(line).toContain('assertive-claim');
    expect(line).toContain('entities: Acme');
    expect(line).not.toContain('question'); // absent signal not shown
  });

  it('narrativeLine is null when a clip has no narrative signals', () => {
    const plain = buildClipDigest(scene({ transcription: 'hello' }), 'c0');
    expect(narrativeLine(plain)).toBeNull();
  });

  it('the runtime ordering prompt includes the narrative line', () => {
    const digests = buildOrderingDigest([enriched]);
    const prompt = buildOrderingPrompt(digests);
    expect(prompt).toContain('phase:climax');
    expect(prompt).toContain('entities: Acme');
  });

  it('formatDigestForPrompt (eval formatter) includes the narrative line', () => {
    const text = formatDigestForPrompt(buildOrderingDigest([enriched]));
    expect(text).toContain('narrative: phase:climax');
  });
});
