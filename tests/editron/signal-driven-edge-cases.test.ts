/**
 * Adversarial edge-case tests for the signal-driven executor pipeline.
 * Tests: empty inputs, budget exhaustion, mid-word protection, constraint ordering.
 *
 * Run: npx vitest run lib/editron/services/__tests__/signal-driven-edge-cases.test.ts
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

// ─── humanize-pass.ts edge cases ────────────────────────────────────────────

describe('humanize-pass', () => {
  it('handles empty decision list without crashing', async () => {
    const { humanizeEdl } = await import('@/lib/editron/services/humanize-pass');
    const result = humanizeEdl(
      { decisions: [], metadata: { totalMappingsEvaluated: 0, totalMappingsFired: 0, totalDecisionsGenerated: 0, totalDecisionsSuppressed: 0, executionTimeMs: 0 } },
      'test-project-123',
      null,
      30
    );
    expect(result.decisions).toEqual([]);
  });

  it('does NOT jitter montage-mode sections', async () => {
    const { humanizeEdl } = await import('@/lib/editron/services/humanize-pass');
    // Create 6 rapid-fire cuts (montage pattern: <2s apart, should be exempt)
    const montageCuts = Array.from({ length: 6 }, (_, i) => ({
      type: 'cut' as const, frame: i * 30, confidence: 0.7, // every 1s
      source: 'mapping:audio.cut_on_downbeat', technique: 'technique:transition.hard_cut',
      params: { type: 'hard-cut' },
    }));
    const result = humanizeEdl(
      { decisions: montageCuts, metadata: { totalMappingsEvaluated: 6, totalMappingsFired: 6, totalDecisionsGenerated: 6, totalDecisionsSuppressed: 0, executionTimeMs: 1 } },
      'test-montage-project',
      null,
      30
    );
    // Montage cuts should be UNCHANGED (exempt from humanization)
    expect(result.decisions.map(d => d.frame)).toEqual(montageCuts.map(d => d.frame));
  });

  it('never pushes cuts INTO mid-word positions via jitter', async () => {
    const { humanizeEdl } = await import('@/lib/editron/services/humanize-pass');
    const rawFootage = {
      transcription: {
        words: [
          { word: 'hello', startMs: 0, endMs: 400 },
          { word: 'world', startMs: 600, endMs: 900 },
          { word: 'test', startMs: 1100, endMs: 1400 },
          { word: 'data', startMs: 1600, endMs: 1900 },
          { word: 'here', startMs: 2100, endMs: 2400 },
          { word: 'again', startMs: 2600, endMs: 2900 },
          { word: 'more', startMs: 3100, endMs: 3400 },
          { word: 'words', startMs: 3600, endMs: 3900 },
        ],
      },
      segments: [],
      originalDurationMs: 5000,
    };
    // Place cuts BETWEEN words (at the gaps: 450ms, 1000ms, 1500ms, 2000ms, 2500ms, 3000ms, 3500ms, 4000ms)
    // These start at word boundaries — humanize must NOT jitter them INTO words
    const gapTimesMs = [450, 1000, 1500, 2000, 2500, 3000, 3500, 4000];
    const cuts = gapTimesMs.map(ms => ({
      type: 'transition' as const, frame: Math.round((ms / 1000) * 30), confidence: 0.7,
      source: 'mapping:audio.cut_on_downbeat', technique: 'technique:transition.hard_cut',
      params: { type: 'hard-cut' },
    }));
    const result = humanizeEdl(
      { decisions: cuts, metadata: { totalMappingsEvaluated: 8, totalMappingsFired: 8, totalDecisionsGenerated: 8, totalDecisionsSuppressed: 0, executionTimeMs: 1 } },
      'test-word-protect',
      rawFootage as any,
      30
    );
    // Verify no cut was jittered INTO a word (with 50ms buffer)
    for (const d of result.decisions) {
      const timestampMs = (d.frame / 30) * 1000;
      for (const w of rawFootage.transcription.words) {
        if (timestampMs > w.startMs + 50 && timestampMs < w.endMs - 50) {
          throw new Error(`Cut at frame ${d.frame} (${timestampMs}ms) was jittered into word "${w.word}" (${w.startMs}-${w.endMs}ms)`);
        }
      }
    }
  });

  it('is deterministic (same projectId = same output)', async () => {
    const { humanizeEdl } = await import('@/lib/editron/services/humanize-pass');
    const decisions = Array.from({ length: 10 }, (_, i) => ({
      type: 'zoom' as const, frame: i * 90, confidence: 0.7,
      source: 'mapping:speech.speaker_building_energy', technique: 'technique:zoom.zoom_push',
      params: { end_scale: 1.1, duration_s: 3 },
    }));
    const edl = { decisions, metadata: { totalMappingsEvaluated: 10, totalMappingsFired: 10, totalDecisionsGenerated: 10, totalDecisionsSuppressed: 0, executionTimeMs: 1 } };

    const result1 = humanizeEdl(edl, 'deterministic-test', null, 30);
    const result2 = humanizeEdl(edl, 'deterministic-test', null, 30);
    expect(result1.decisions).toEqual(result2.decisions);
  });
});

// ─── constraint-enforcer.ts edge cases ──────────────────────────────────────

describe('constraint-enforcer', () => {
  it('handles empty decisions array', async () => {
    const { enforceConstraints } = await import('@/lib/editron/services/constraint-enforcer');
    const { loadGraph } = await import('@/lib/editron/services/graph-query');
    const graphIndex = loadGraph();

    const result = enforceConstraints([], [], graphIndex!, null, 30);
    expect(result.totalViolations).toBe(0);
    expect(result.totalChecked).toBe(0);
  });

  it('shifts cut_mid_word violations to word boundaries', async () => {
    const { enforceConstraints } = await import('@/lib/editron/services/constraint-enforcer');
    const { loadGraph } = await import('@/lib/editron/services/graph-query');
    const graphIndex = loadGraph();

    const rawFootage = {
      transcription: {
        words: [
          { word: 'important', startMs: 1000, endMs: 1500 },
          { word: 'word', startMs: 1600, endMs: 1900 },
        ],
      },
    };

    // Cut at frame 38 = 1266ms — lands inside "important" (1000-1500ms)
    const decisions = [{
      type: 'cut' as const, frame: 38, confidence: 0.7,
      source: 'test', technique: 'technique:transition.hard_cut',
      params: { type: 'hard-cut' },
    }];

    const result = enforceConstraints(decisions, [], graphIndex!, rawFootage as any, 30);

    // Should have auto-corrected the mid-word cut
    const midWordViolation = result.violations.find(v => v.constraintId === 'constraint:temporal.cut_mid_word');
    expect(midWordViolation).toBeDefined();
    expect(midWordViolation!.autoCorrected).toBe(true);

    // Decision frame should now be at word boundary (end of "important" = 1500ms = frame 45)
    expect(decisions[0].frame).toBe(45);
  });

  it('removes excess flashes for accessibility (NON-OVERRIDABLE)', async () => {
    const { enforceConstraints } = await import('@/lib/editron/services/constraint-enforcer');
    const { loadGraph } = await import('@/lib/editron/services/graph-query');
    const graphIndex = loadGraph();

    // 5 flashes within 1 second (30 frames) — exceeds 3/sec limit
    const decisions = Array.from({ length: 5 }, (_, i) => ({
      type: 'transition' as const, frame: i * 5, confidence: 0.9,
      source: 'test', technique: 'technique:transition.flash',
      params: { type: 'flash' },
    }));

    const result = enforceConstraints(decisions, [], graphIndex!, null, 30);

    // Should have removed 2 excess flashes (5 - 3 = 2)
    const flashViolations = result.violations.filter(v => v.constraintId === 'constraint:accessibility.flash_rate_violation');
    expect(flashViolations.length).toBe(2);
    expect(flashViolations.every(v => v.autoCorrected)).toBe(true);

    // Only 3 flash decisions should remain
    const remainingFlashes = decisions.filter(d => d.params['type'] === 'flash');
    expect(remainingFlashes.length).toBe(3);
  });
});

// ─── signal-executor.ts edge cases ──────────────────────────────────────────

describe('signal-executor', () => {
  it('handles empty signal timeline gracefully', async () => {
    const { executeSignalDrivenEdit } = await import('@/lib/editron/services/signal-executor');
    const { loadGraph } = await import('@/lib/editron/services/graph-query');
    const { buildMomentWeightMap } = await import('@/lib/editron/services/moment-weight-service');
    const graphIndex = loadGraph();
    const weightMap = buildMomentWeightMap(null, null);

    const emptyTimeline = {
      gridSignals: new Map(),
      eventSignals: [],
      globalSignals: {},
      fps: 30,
      totalFrames: 0,
      gridInterval: 15,
    };

    const result = executeSignalDrivenEdit(emptyTimeline, {
      pacing_tolerance: 5, energy_baseline: 0.45, transition_density: 10,
      graphic_density: 3, silence_tolerance: 1, zoom_budget: 5,
      sfx_density: 0.5, color_temperature: 5500, formality: 0.5,
    }, weightMap, graphIndex!, []);

    expect(result.decisions).toEqual([]);
    expect(result.metadata.totalDecisionsGenerated).toBe(0);
  });

  it('respects zoom budget (no more than zoom_budget zooms)', async () => {
    const { executeSignalDrivenEdit } = await import('@/lib/editron/services/signal-executor');
    const { loadGraph } = await import('@/lib/editron/services/graph-query');
    const { buildMomentWeightMap } = await import('@/lib/editron/services/moment-weight-service');
    const graphIndex = loadGraph();
    const weightMap = buildMomentWeightMap(null, null);

    // Create a timeline with MANY high-energy speech peaks (all want zoom)
    const gridSignals = new Map<number, any>();
    for (let frame = 0; frame < 900; frame += 15) {
      gridSignals.set(frame, {
        frame,
        timestampMs: (frame / 30) * 1000,
        'speech.energy': 0.9,  // Very high — triggers zoom mappings
        'speech.energy_delta': 0.2,
        'visual.motion_intensity': 0.1,
        'audio.music_energy': 0,
        'structural.position_in_video': frame / 900,
        'structural.time_since_last_cut': frame / 30,
        'structural.active_overlays_count': 0,
        'structural.cumulative_edit_density': 0,
        'composite.narrative_pressure': 0.7,
        'composite.montage_mode': false,
        'composite.cinematic_moment': 0,
      });
    }

    const timeline = {
      gridSignals,
      eventSignals: [],
      globalSignals: { 'content.formality': 0.3 },
      fps: 30,
      totalFrames: 900,
      gridInterval: 15,
    };

    const result = executeSignalDrivenEdit(timeline, {
      pacing_tolerance: 5, energy_baseline: 0.45, transition_density: 10,
      graphic_density: 3, silence_tolerance: 1, zoom_budget: 3, // Only 3 allowed!
      sfx_density: 0.5, color_temperature: 5500, formality: 0.3,
    }, weightMap, graphIndex!, []);

    const zoomDecisions = result.decisions.filter(d => d.type === 'zoom');
    // Should not exceed budget (3) + at most 1 override for weight > 0.9
    expect(zoomDecisions.length).toBeLessThanOrEqual(4);
  });

  it('emits semantic facts for numeric MG claims instead of shallow text params', async () => {
    const { executeSignalDrivenEdit } = await import('@/lib/editron/services/signal-executor');
    const { loadGraph } = await import('@/lib/editron/services/graph-query');
    const { buildMomentWeightMap } = await import('@/lib/editron/services/moment-weight-service');
    const graphIndex = loadGraph();
    const weightMap = buildMomentWeightMap(null, null);

    const timeline = {
      gridSignals: new Map([[30, {
        frame: 30,
        timestampMs: 1000,
        'speech.energy': 0.45,
        'speech.energy_delta': 0,
        'visual.motion_intensity': 0.1,
        'structural.active_overlays_count': 0,
        'composite.montage_mode': false,
      }]]),
      eventSignals: [{
        timestampMs: 1000,
        frame: 30,
        signal: 'entity.number',
        value: true,
        context: '0.02 humans spoken to per day',
      }],
      globalSignals: { 'content.formality': 0.4, formality: 0.4 },
      fps: 30,
      totalFrames: 180,
      gridInterval: 15,
    };

    const result = executeSignalDrivenEdit(timeline, {
      pacing_tolerance: 5, energy_baseline: 0.45, transition_density: 10,
      graphic_density: 3, silence_tolerance: 1, zoom_budget: 5,
      sfx_density: 0.5, color_temperature: 5500, formality: 0.4,
    }, weightMap, graphIndex!, [{ id: 'video', type: 'video', from: 0, durationInFrames: 180 }]);

    const graphic = result.decisions.find((d) => d.type === 'graphic');
    expect(graphic).toBeDefined();
    const params = graphic!.params as Record<string, any>;
    expect(params.value).toBe('0.02');
    expect(params.label).toBe('humans spoken to per day');
    expect(params.semanticAtoms.quantity).toEqual(expect.objectContaining({
      displayText: '0.02',
      kind: 'rate',
      label: 'humans spoken to per day',
      unit: 'per day',
    }));
    expect(params.contentStructure.evidence).toEqual(expect.objectContaining({
      hasScalar: true,
      quantityKind: 'rate',
    }));
    expect(params.graphicType).toBeUndefined();
  });

  it('separates execution confidence from moment importance on real signal decisions', async () => {
    const { executeSignalDrivenEdit } = await import('@/lib/editron/services/signal-executor');
    const { loadGraph } = await import('@/lib/editron/services/graph-query');
    const { buildMomentWeightMap } = await import('@/lib/editron/services/moment-weight-service');
    const graphIndex = loadGraph();
    const weightMap = buildMomentWeightMap(null, null);

    const result = executeSignalDrivenEdit({
      gridSignals: new Map([[30, {
        frame: 30,
        timestampMs: 1000,
        'speech.energy': 0.4,
        'speech.energy_delta': 0,
        'visual.motion_intensity': 0.1,
        'structural.active_overlays_count': 0,
        'composite.montage_mode': false,
      }]]),
      eventSignals: [{
        timestampMs: 1000,
        frame: 30,
        signal: 'entity.number',
        value: true,
        context: '42 percent retention lift',
      }],
      globalSignals: { 'content.formality': 0.4, formality: 0.4 },
      fps: 30,
      totalFrames: 180,
      gridInterval: 15,
    }, {
      pacing_tolerance: 5, energy_baseline: 0.45, transition_density: 10,
      graphic_density: 3, silence_tolerance: 1, zoom_budget: 5,
      sfx_density: 0.5, color_temperature: 5500, formality: 0.4,
    }, weightMap, graphIndex!, [{ id: 'video', type: 'video', from: 0, durationInFrames: 180 }]);

    const graphic = result.decisions.find((d) => d.type === 'graphic');
    expect(graphic).toBeDefined();
    const params = graphic!.params as Record<string, any>;
    expect(params.momentImportance).toBe(0.55);
    expect(params.evidenceStrength).toBe(1);
    expect(params.candidateConfidence).toBeGreaterThan(params.momentImportance);
    expect(params.executionConfidence).toBeGreaterThan(params.momentImportance);
    expect(graphic!.confidence).toBe(params.executionConfidence);
    expect(params.signalNormalization).toEqual(expect.objectContaining({
      version: 'signal-candidate-normalization-v1',
      triggerSignalCount: expect.any(Number),
      strongestSignal: 'signal:entity.number',
      strongestSignalValue: true,
      calibrationStatus: 'invented-needs-calibration',
    }));
  });

  it('keeps signal dedupe best-wins instead of first-wins', () => {
    const source = readFileSync(join(process.cwd(), 'lib/editron/services/signal-executor.ts'), 'utf8');

    expect(source).toContain('decisionCandidateRank(d) > decisionCandidateRank(current)');
    expect(source).not.toContain('if (seen.has(key)) continue;');
  });

  it('does not license hedged numeric claims as executable MGs', async () => {
    const { executeSignalDrivenEdit } = await import('@/lib/editron/services/signal-executor');
    const { loadGraph } = await import('@/lib/editron/services/graph-query');
    const { buildMomentWeightMap } = await import('@/lib/editron/services/moment-weight-service');
    const graphIndex = loadGraph();
    const weightMap = buildMomentWeightMap(null, null);

    const result = executeSignalDrivenEdit({
      gridSignals: new Map(),
      eventSignals: [{
        timestampMs: 1000,
        frame: 30,
        signal: 'entity.number',
        value: true,
        context: 'maybe around 42 people',
      }],
      globalSignals: { formality: 0.4 },
      fps: 30,
      totalFrames: 180,
      gridInterval: 15,
    }, {
      pacing_tolerance: 5, energy_baseline: 0.45, transition_density: 10,
      graphic_density: 3, silence_tolerance: 1, zoom_budget: 5,
      sfx_density: 0.5, color_temperature: 5500, formality: 0.4,
    }, weightMap, graphIndex!, [{ id: 'video', type: 'video', from: 0, durationInFrames: 180 }]);

    expect(result.decisions.some((d) => d.type === 'graphic')).toBe(false);
  });

  it('does not convert diagnostic prose into a transition even when it mentions flash or cut', async () => {
    const { executeSignalDrivenEdit } = await import('@/lib/editron/services/signal-executor');
    const { loadGraph } = await import('@/lib/editron/services/graph-query');
    const { buildMomentWeightMap } = await import('@/lib/editron/services/moment-weight-service');
    const graphIndex = loadGraph();
    const weightMap = buildMomentWeightMap(null, null);

    const result = executeSignalDrivenEdit({
      gridSignals: new Map([[60, {
        frame: 60,
        timestampMs: 2000,
        'structural.time_since_last_cut': 1,
        'structural.active_overlays_count': 0,
        'composite.montage_mode': false,
      }]]),
      eventSignals: [],
      globalSignals: {},
      fps: 30,
      totalFrames: 180,
      gridInterval: 15,
    }, {
      pacing_tolerance: 5, energy_baseline: 0.45, transition_density: 10,
      graphic_density: 3, silence_tolerance: 1, zoom_budget: 5,
      sfx_density: 0.5, color_temperature: 5500, formality: 0.4,
    }, weightMap, graphIndex!, [
      { id: 'clip-a', type: 'video', from: 0, durationInFrames: 90 },
      { id: 'clip-b', type: 'video', from: 90, durationInFrames: 90 },
    ]);

    expect(result.decisions.some((d) => d.source === 'mapping:cross_domain.eye_trace_continuity_across_cuts')).toBe(false);
    expect(result.decisions.some((d) => d.type === 'transition' && d.params.transitionType === 'flash')).toBe(false);
  });

  it('does not emit EDL decisions for mappings that produce non-render technique families', async () => {
    const { executeSignalDrivenEdit } = await import('@/lib/editron/services/signal-executor');
    const { loadGraph } = await import('@/lib/editron/services/graph-query');
    const { buildMomentWeightMap } = await import('@/lib/editron/services/moment-weight-service');
    const graphIndex = loadGraph()!;
    const weightMap = buildMomentWeightMap(null, null);
    const nonExecutablePrefixes = [
      'technique:composition.',
      'technique:flag.',
      'technique:pacing.',
      'technique:cut.',
      'technique:hold.',
      'technique:layout.',
      'technique:silence.',
      'technique:shot-type.',
    ];
    const nonExecutableMappingIds = new Set(
      Array.from(graphIndex.producesTechnique.entries())
        .filter(([, techniqueId]) => nonExecutablePrefixes.some((prefix) =>
          techniqueId.toLowerCase().startsWith(prefix)
        ))
        .map(([mappingId]) => mappingId)
    );
    expect([...nonExecutableMappingIds]).toEqual(expect.arrayContaining([
      'mapping:visual.shot_scale_monotony_break',
      'mapping:structural.hook_zone_treatment',
      'mapping:cross_domain.eye_trace_continuity_across_cuts',
    ]));

    const allActiveSignals = Object.fromEntries(
      Array.from(graphIndex.signals.keys()).flatMap((signalId) => {
        const bareId = signalId.replace(/^signal:/, '');
        return [[signalId, 1], [bareId, 1]];
      })
    );

    const result = executeSignalDrivenEdit({
      gridSignals: new Map([[60, {
        frame: 60,
        timestampMs: 2000,
        ...allActiveSignals,
        'structural.time_since_last_cut': 1,
        'structural.active_overlays_count': 0,
        'composite.montage_mode': false,
      }]]),
      eventSignals: [],
      globalSignals: {},
      fps: 30,
      totalFrames: 180,
      gridInterval: 15,
    }, {
      pacing_tolerance: 5, energy_baseline: 0.45, transition_density: 10,
      graphic_density: 3, silence_tolerance: 1, zoom_budget: 5,
      sfx_density: 0.5, color_temperature: 5500, formality: 0.4,
    }, weightMap, graphIndex, [
      { id: 'clip-a', type: 'video', from: 0, durationInFrames: 90 },
      { id: 'clip-b', type: 'video', from: 90, durationInFrames: 90 },
    ]);

    expect(result.decisions
      .filter((decision) => nonExecutableMappingIds.has(decision.source))
      .map((decision) => decision.source)
    ).toEqual([]);
  });
  it('does not turn prose-only complements into executable decisions', async () => {
    const { executeSignalDrivenEdit } = await import('@/lib/editron/services/signal-executor');
    const { loadGraph } = await import('@/lib/editron/services/graph-query');
    const { buildMomentWeightMap } = await import('@/lib/editron/services/moment-weight-service');
    const graphIndex = loadGraph()!;
    const weightMap = buildMomentWeightMap(null, null);

    expect(graphIndex.producesTechnique.get('mapping:speech.speaker_emphasis_word')).toBe('technique:caption.caption_emphasis');
    const captionEmphasisComplements = graphIndex.edgesFrom.get('technique:caption.caption_emphasis')
      ?.filter((edge) => edge.type === 'composes_with') ?? [];
    expect(captionEmphasisComplements).toHaveLength(0);

    const result = executeSignalDrivenEdit({
      gridSignals: new Map([[30, {
        frame: 30,
        timestampMs: 1000,
        spike: 1.8,
        duration: 130,
        'structural.active_overlays_count': 0,
        'composite.montage_mode': false,
      }]]),
      eventSignals: [{
        timestampMs: 1000,
        frame: 30,
        signal: 'speech.emphasis_word',
        value: true,
        context: 'process',
      }],
      globalSignals: { formality: 0.3 },
      fps: 30,
      totalFrames: 180,
      gridInterval: 15,
    }, {
      pacing_tolerance: 5, energy_baseline: 0.45, transition_density: 10,
      graphic_density: 3, silence_tolerance: 1, zoom_budget: 5,
      sfx_density: 0.5, color_temperature: 5500, formality: 0.3,
    }, weightMap, graphIndex, [{ id: 'video', type: 'video', from: 0, durationInFrames: 180 }]);

    const decisions = result.decisions.filter((decision) => decision.source === 'mapping:speech.speaker_emphasis_word');
    expect(decisions.some((decision) => decision.type === 'caption-emphasis')).toBe(true);
    expect(decisions.some((decision) => decision.type === 'zoom')).toBe(false);
    expect(decisions.map((decision) => decision.technique)).not.toContain('technique:zoom.zoom_drift');
  });

  it('creates complements only from graph-composed techniques', async () => {
    const { executeSignalDrivenEdit } = await import('@/lib/editron/services/signal-executor');
    const { loadGraph } = await import('@/lib/editron/services/graph-query');
    const { buildMomentWeightMap } = await import('@/lib/editron/services/moment-weight-service');
    const graphIndex = loadGraph()!;
    const weightMap = buildMomentWeightMap(null, null);

    const producedTechnique = graphIndex.producesTechnique.get('mapping:composite.cinematic_moment_emphasis');
    expect(producedTechnique).toBe('technique:zoom.zoom_punch');
    const graphComplementTechniques = graphIndex.edgesFrom.get(producedTechnique!)
      ?.filter((edge) => edge.type === 'composes_with')
      .map((edge) => edge.to) ?? [];
    expect(graphComplementTechniques).toEqual(expect.arrayContaining([
      'technique:sound.sfx_impact',
      'technique:other.camera_shake',
      'technique:transition.flash',
    ]));

    const result = executeSignalDrivenEdit({
      gridSignals: new Map([[60, {
        frame: 60,
        timestampMs: 2000,
        'composite.cinematic_moment': true,
        'structural.active_overlays_count': 0,
        'composite.montage_mode': false,
      }]]),
      eventSignals: [],
      globalSignals: { formality: 0.3 },
      fps: 30,
      totalFrames: 180,
      gridInterval: 15,
    }, {
      pacing_tolerance: 5, energy_baseline: 0.45, transition_density: 10,
      graphic_density: 3, silence_tolerance: 1, zoom_budget: 5,
      sfx_density: 0.5, color_temperature: 5500, formality: 0.3,
    }, weightMap, graphIndex, [{ id: 'video', type: 'video', from: 0, durationInFrames: 180 }]);

    const decisions = result.decisions.filter((decision) => decision.source === 'mapping:composite.cinematic_moment_emphasis');
    expect(decisions.map((decision) => decision.technique)).toEqual(expect.arrayContaining([
      'technique:zoom.zoom_punch',
      'technique:sound.sfx_impact',
      'technique:other.camera_shake',
      'technique:transition.flash',
    ]));
    expect(decisions.some((decision) => decision.type === 'caption-emphasis')).toBe(false);
    expect(decisions.find((decision) => decision.technique === 'technique:sound.sfx_impact')?.params).toEqual(expect.objectContaining({
      sfxType: 'impact',
      sfxCue: 'impact',
    }));
  });
  it('uses transcript phrase context for numeric events so MG labels have evidence', async () => {
    const { buildSignalTimeline } = await import('@/lib/editron/services/signal-registry');
    const timeline = buildSignalTimeline([], {
      transcription: {
        words: [
          { word: 'talked', startMs: 0, endMs: 100 },
          { word: 'to', startMs: 120, endMs: 180 },
          { word: '0.02', startMs: 200, endMs: 280 },
          { word: 'humans', startMs: 300, endMs: 420 },
          { word: 'spoken', startMs: 440, endMs: 520 },
          { word: 'to', startMs: 540, endMs: 600 },
          { word: 'per', startMs: 620, endMs: 700 },
          { word: 'day', startMs: 720, endMs: 800 },
        ],
      },
      originalDurationMs: 3000,
    }, [], 30);

    const numberEvent = timeline.eventSignals.find((event) => event.signal === 'entity.number');
    expect(numberEvent?.context).toBe('to 0.02 humans spoken to per day');
  });
});

// ─── graph-query.ts edge cases ──────────────────────────────────────────────

describe('graph-query', () => {
  it('loads graph and has expected node counts', async () => {
    const { loadGraph } = await import('@/lib/editron/services/graph-query');
    const index = loadGraph();

    expect(index).not.toBeNull();
    expect(index!.signals.size).toBe(49);
    expect(index!.mappings.size).toBe(95);
    expect(index!.techniques.size).toBe(115);
    expect(index!.constraints.size).toBe(50);
  });

  it('indexes mapping produces edges as the authored technique route', async () => {
    const { loadGraph, getTechniqueForMapping } = await import('@/lib/editron/services/graph-query');
    const index = loadGraph()!;

    const technique = getTechniqueForMapping(index, 'mapping:cross_domain.eye_trace_continuity_across_cuts');

    expect(technique?.id).toBe('technique:shot-type.center_framing');
    expect(technique?.id).not.toBe('technique:transition.flash');
  });

  it('resolves aliases correctly', async () => {
    const { loadGraph, resolveAlias } = await import('@/lib/editron/services/graph-query');
    const index = loadGraph()!;

    // Known alias from the graph
    expect(resolveAlias(index, 'technique:zoom.punch')).toBe('technique:zoom.zoom_punch');
    expect(resolveAlias(index, 'technique:zoom.push')).toBe('technique:zoom.zoom_push');
    // Non-alias returns input
    expect(resolveAlias(index, 'technique:zoom.zoom_punch')).toBe('technique:zoom.zoom_punch');
  });

  it('returns empty array for unknown signal (not crash)', async () => {
    const { loadGraph, getMappingsForSignal } = await import('@/lib/editron/services/graph-query');
    const index = loadGraph()!;

    const result = getMappingsForSignal(index, 'signal:nonexistent.fake');
    expect(result).toEqual([]);
  });
});
