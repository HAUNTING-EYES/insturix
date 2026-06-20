import { describe, expect, it } from 'vitest';
import type { EditDecision, EditDecisionList } from '../../lib/editron/services/reactive-edit-engine';
import {
  createUnifiedDecisionBundle,
  mergeSignalDrivenBundle,
  planUnifiedDecisionBundle,
  planUnifiedDecisionBundleFromCandidates,
} from '../../lib/editron/services/unified-decision-bundle';

describe('unified decision bundle merge', () => {
  it('keeps a Path E decision and attaches Path D validation for a near duplicate', () => {
    const pathE = createUnifiedDecisionBundle({
      source: 'creative-brief',
      edl: edl([
        decision({ type: 'zoom', frame: 60, durationFrames: 18, source: 'creative-brief:test' }),
      ]),
      expectedExecuted: 1,
      expectedSkipped: 0,
    });

    const merged = mergeSignalDrivenBundle(pathE, edl([
      decision({ type: 'zoom', frame: 66, durationFrames: 12, source: 'signal-executor:test', confidence: 0.83 }),
    ]));

    expect(merged.source).toBe('creative-brief+signal-driven');
    expect(merged.authority).toEqual({
      version: 'unified-decision-authority-v1',
      executableProducer: 'creative-brief',
      decisionMode: 'merged-supplemental',
      advisoryProducers: ['creative-brief', 'signal-driven'],
      signalDecisionRole: 'advisor',
      signalDecisionsCanAddExecutable: false,
    });
    expect(merged.edl.decisions).toHaveLength(1);
    expect(merged.evidence).toEqual(expect.objectContaining({
      signalDecisionCount: 1,
      addedSignalDecisionCount: 0,
      validatedDecisionCount: 1,
      suppressedSignalDuplicateCount: 1,
      evidenceOnlySignalDecisionCount: 0,
      evidenceOnlySignalDecisions: [],
    }));
    expect(merged.edl.decisions[0].params.unifiedDecisionMerge).toEqual(expect.objectContaining({
      version: 'unified-decision-bundle-v1',
      role: 'primary-validated',
      signalValidations: [
        expect.objectContaining({
          frame: 66,
          frameDistance: 6,
          source: 'signal-executor:test',
          confidence: 0.83,
        }),
      ],
    }));
    expect(merged.edl.decisions[0].params.unifiedDecisionOwner).toBeUndefined();
  });

  it('lets high-confidence non-overlapping signal transitions become executable through the unified planner', () => {
    const pathE = createUnifiedDecisionBundle({
      source: 'creative-brief',
      edl: edl([
        decision({ type: 'graphic', frame: 30, source: 'creative-brief:test' }),
      ]),
    });

    const merged = mergeSignalDrivenBundle(pathE, edl([
      decision({
        type: 'transition',
        frame: 140,
        source: 'signal-executor:test',
        confidence: 0.82,
        params: {
          transitionType: 'whip-pan',
          boundaryFrame: 140,
          motionVectorX: 0.8,
        },
      }),
    ]));

    expect(merged.source).toBe('creative-brief+signal-driven');
    expect(merged.authority).toEqual({
      version: 'unified-decision-authority-v1',
      executableProducer: 'unified-planner',
      decisionMode: 'unified-planner',
      advisoryProducers: ['creative-brief', 'signal-driven'],
      signalDecisionRole: 'co-owner',
      signalDecisionsCanAddExecutable: true,
      creativeBriefRole: 'semantic-context',
      signalRole: 'candidate-source',
    });
    expect(merged.edl.decisions.map((d) => d.type)).toEqual(['graphic', 'transition']);
    expect(merged.edl.stats).toEqual(expect.objectContaining({
      graphicCount: 1,
      transitionCount: 1,
    }));
    expect(merged.evidence).toEqual(expect.objectContaining({
      addedSignalDecisionCount: 1,
      validatedDecisionCount: 0,
      evidenceOnlySignalDecisionCount: 0,
    }));
    expect(merged.edl.decisions[1].params.unifiedDecisionMerge).toEqual(expect.objectContaining({
      role: 'signal-supplement',
      executionLicense: 'licensed-by-transition-boundary-atoms',
      plannerOwned: true,
    }));
    expect(merged.edl.decisions[0].params.unifiedDecisionOwner).toEqual(expect.objectContaining({
      version: 'unified-decision-owner-v1',
      owner: 'unified-planner',
      creativeBriefRole: 'semantic-context',
      signalRole: 'candidate-source',
      producerSource: 'creative-brief:test',
      plannerRole: 'planner-owned-primary',
    }));
    expect(merged.edl.decisions[1].params.unifiedDecisionOwner).toEqual(expect.objectContaining({
      owner: 'unified-planner',
      producerSource: 'signal-executor:test',
      plannerRole: 'signal-supplement',
    }));
    expect(merged.expectedSkipped).toBe(0);
  });

  it('keeps label-only family signals as evidence until their atoms are present', () => {
    const pathE = createUnifiedDecisionBundle({
      source: 'creative-brief',
      edl: edl([
        decision({ type: 'graphic', frame: 30, source: 'creative-brief:test' }),
      ]),
    });

    const merged = mergeSignalDrivenBundle(pathE, edl([
      decision({ type: 'transition', frame: 140, source: 'signal-executor:transition-label', confidence: 0.9, params: { transitionType: 'whip-pan' } }),
      decision({ type: 'zoom', frame: 260, source: 'signal-executor:zoom-label', confidence: 0.9, params: { scale: 1.08 } }),
      decision({ type: 'sfx-trigger', frame: 380, source: 'signal-executor:sfx-label', confidence: 0.9, params: { sfxType: 'impact' } }),
      decision({ type: 'caption-emphasis', frame: 500, source: 'signal-executor:caption-label', confidence: 0.9 }),
    ]));

    expect(merged.edl.decisions.map((d) => d.source)).toEqual(['creative-brief:test']);
    expect(merged.evidence).toEqual(expect.objectContaining({
      signalDecisionCount: 4,
      addedSignalDecisionCount: 0,
      evidenceOnlySignalDecisionCount: 4,
    }));
    expect(merged.evidence.signalDecisionAudit.byReason).toEqual(expect.objectContaining({
      'missing-transition-boundary-atoms': expect.objectContaining({ count: 1 }),
      'missing-camera-motion-atoms': expect.objectContaining({ count: 1 }),
      'missing-audio-beat-atoms': expect.objectContaining({ count: 1 }),
      'missing-caption-moment-atoms': expect.objectContaining({ count: 1 }),
    }));
    expect(merged.edl.decisions[0].params.unifiedDecisionOwner).toBeUndefined();
  });

  it('lets high-confidence signal graphics execute only when backed by content facts', () => {
    const pathE = createUnifiedDecisionBundle({
      source: 'creative-brief',
      edl: edl([
        decision({ type: 'zoom', frame: 30, source: 'creative-brief:test' }),
      ]),
    });

    const merged = mergeSignalDrivenBundle(pathE, edl([
      decision({
        type: 'graphic',
        frame: 180,
        source: 'signal-executor:number',
        signal: 'entity.number',
        confidence: 0.86,
        params: {
          value: '42%',
          label: 'retention lift',
          semanticAtoms: {
            quantity: {
              displayText: '42%',
              kind: 'percentage',
            },
          },
        },
      }),
    ]));

    expect(merged.authority).toMatchObject({
      executableProducer: 'unified-planner',
      decisionMode: 'unified-planner',
      signalDecisionRole: 'co-owner',
      signalDecisionsCanAddExecutable: true,
    });
    expect(merged.edl.decisions.map((d) => d.type)).toEqual(['zoom', 'graphic']);
    expect(merged.edl.decisions[1].params).toEqual(expect.objectContaining({
      value: '42%',
      label: 'retention lift',
      unifiedDecisionMerge: expect.objectContaining({
        role: 'signal-supplement',
        executionLicense: 'licensed-by-graphic-semantic-ledger',
      }),
    }));
    expect(merged.evidence).toEqual(expect.objectContaining({
      signalDecisionCount: 1,
      addedSignalDecisionCount: 1,
      evidenceOnlySignalDecisionCount: 0,
    }));
    expect(merged.evidence.signalDecisionAudit.byFamily.graphic).toEqual(expect.objectContaining({
      count: 1,
      sources: { 'signal-executor:number': 1 },
    }));
    expect(merged.evidence.signalDecisionAudit.byReason).toEqual(expect.objectContaining({
      'licensed-by-graphic-semantic-ledger': expect.objectContaining({ count: 1 }),
    }));
  });

  it('keeps text-only signal graphics as evidence instead of executable MGs', () => {
    const pathE = createUnifiedDecisionBundle({
      source: 'creative-brief',
      edl: edl([
        decision({ type: 'zoom', frame: 30, source: 'creative-brief:test' }),
      ]),
    });

    const merged = mergeSignalDrivenBundle(pathE, edl([
      decision({
        type: 'graphic',
        frame: 180,
        source: 'signal-executor:text-only',
        signal: 'speech.emphasis_word',
        confidence: 0.92,
        params: {
          text: 'this sounds important',
          keyword: 'important',
        },
      }),
    ]));

    expect(merged.edl.decisions.map((d) => d.type)).toEqual(['zoom']);
    expect(merged.evidence).toEqual(expect.objectContaining({
      signalDecisionCount: 1,
      addedSignalDecisionCount: 0,
      evidenceOnlySignalDecisionCount: 1,
    }));
    expect(merged.evidence.evidenceOnlySignalDecisions[0]).toEqual(expect.objectContaining({
      type: 'graphic',
      family: 'graphic',
      outcome: 'evidence-only',
      reason: 'missing-graphic-content-evidence',
      params: {
        keyword: 'important',
        text: 'this sounds important',
      },
    }));
    expect(merged.evidence.signalDecisionAudit.byReason).toEqual(expect.objectContaining({
      'missing-graphic-content-evidence': expect.objectContaining({ count: 1 }),
    }));
    expect(merged.evidence.signalDecisionAudit.samples[0].candidate.riskFlags).toEqual(expect.arrayContaining([
      'missing-graphic-content-evidence',
    ]));
  });

  it('keeps Creative Knowledge Graph placeholder graphics as evidence before EDL rendering', () => {
    const pathE = createUnifiedDecisionBundle({
      source: 'creative-brief',
      edl: edl([
        decision({ type: 'zoom', frame: 30, source: 'creative-brief:test' }),
      ]),
    });

    const merged = mergeSignalDrivenBundle(pathE, edl([
      decision({
        type: 'graphic',
        frame: 180,
        source: 'signal-executor:kg-placeholder',
        signal: 'semantic.placeholder',
        confidence: 0.95,
        params: {
          creativeDecisionType: 'graphic_lower_third',
          name: 'person/brand name from transcript or brief',
          title: 'role/description (optional)',
          animation: 'slide-in from left | fade-in',
        },
      }),
    ]));

    expect(merged.edl.decisions.map((d) => d.type)).toEqual(['zoom']);
    expect(merged.evidence).toEqual(expect.objectContaining({
      signalDecisionCount: 1,
      addedSignalDecisionCount: 0,
      evidenceOnlySignalDecisionCount: 1,
    }));
    expect(merged.evidence.evidenceOnlySignalDecisions[0]).toEqual(expect.objectContaining({
      type: 'graphic',
      family: 'graphic',
      outcome: 'evidence-only',
      reason: 'missing-graphic-content-evidence',
      params: {
        name: 'person/brand name from transcript or brief',
        title: 'role/description (optional)',
      },
    }));
    expect(merged.evidence.signalDecisionAudit.byReason).toEqual(expect.objectContaining({
      'missing-graphic-content-evidence': expect.objectContaining({ count: 1 }),
    }));
  });
  it('lets a weak creative primary supplement with bounded signal-driven decisions', () => {
    const pathE = createUnifiedDecisionBundle({
      source: 'creative-brief',
      edl: edl([
        decision({
          type: 'graphic',
          frame: 30,
          source: 'creative-brief:test',
          confidence: 0.48,
          params: { role: 'setup' },
        }),
        decision({
          type: 'zoom',
          frame: 210,
          source: 'creative-brief:test',
          confidence: 0.44,
          params: { role: 'weak-camera' },
        }),
      ]),
      expectedExecuted: 2,
      expectedSkipped: 0,
    });

    const merged = mergeSignalDrivenBundle(pathE, edl([
      decision({ type: 'transition', frame: 140, source: 'signal-executor:test', confidence: 0.82, params: { transitionType: 'whip-pan', boundaryFrame: 140, topicDelta: 0.7 } }),
      decision({ type: 'sfx-trigger', frame: 340, source: 'signal-executor:test', confidence: 0.82, params: { sfxType: 'impact', beatFrame: 340 } }),
      decision({ type: 'zoom', frame: 420, source: 'signal-executor:test', confidence: 0.78, params: { scale: 1.08, speechPeak: 0.82 } }),
    ]));

    expect(merged.source).toBe('creative-brief+signal-driven');
    expect(merged.authority).toMatchObject({
      executableProducer: 'unified-planner',
      decisionMode: 'unified-planner',
      signalDecisionRole: 'co-owner',
      signalDecisionsCanAddExecutable: true,
    });
    expect(merged.edl.decisions.map((d) => d.source)).toEqual(
      expect.arrayContaining(['creative-brief:test', 'signal-executor:test']),
    );
    expect(merged.evidence).toEqual(expect.objectContaining({
      addedSignalDecisionCount: 3,
      validatedDecisionCount: 0,
      evidenceOnlySignalDecisionCount: 0,
      signalDecisionCount: 3,
    }));
  });

  it('passes zoom camera atoms into the atomic zoom resolver instead of relying on scale labels', () => {
    const pathE = createUnifiedDecisionBundle({
      source: 'creative-brief',
      edl: edl([
        decision({ type: 'graphic', frame: 30, source: 'creative-brief:test' }),
      ]),
    });

    const merged = mergeSignalDrivenBundle(pathE, edl([
      decision({
        type: 'zoom',
        frame: 420,
        source: 'signal-executor:zoom-camera-atoms',
        confidence: 0.88,
        params: {
          signals: {
            speech_energy: 0.84,
            word_importance: 0.76,
            music_energy: 0.68,
            mainSubjectX: 0.72,
            mainSubjectY: 0.42,
            mainSubjectWidth: 0.34,
            mainSubjectHeight: 0.52,
            face_present: 1,
            eye_contact: 0.9,
            shot_scale: 'CU',
            motionVectorX: -0.36,
            cameraMotion: 0.42,
            subjectMotion: 0.31,
            motion_intensity: 0.28,
            text_on_screen: 0.12,
            timeSinceLastZoomSec: 6,
            recentZoomSimilarity: 0.12,
            activeOverlayDensity: 0.18,
          },
        },
      }),
    ]));

    const zoom = merged.edl.decisions.find((decision) => decision.type === 'zoom');
    expect(zoom?.params).toEqual(expect.objectContaining({
      signals: expect.objectContaining({
        speech_energy: 0.84,
        word_importance: 0.76,
        beat_strength: 0.68,
        main_subject_x: 0.72,
        main_subject_y: 0.42,
        shot_scale: 'CU',
        motion_vector_x: -0.36,
        time_since_last_zoom: 6,
        zoom_job_emphasis: expect.any(Number),
        zoom_push_pressure: expect.any(Number),
        zoom_repetition_pressure: expect.any(Number),
      }),
      zoomMotionPlan: expect.objectContaining({
        version: 'zoom-motion-plan-v1',
        visualMotionAllowed: true,
        reasonKeys: expect.arrayContaining([
          'speech-peak',
          'word-importance',
          'beat',
          'subject-anchor',
          'motion-direction',
          'shot-scale',
          'subject-off-center',
        ]),
        jobVector: expect.objectContaining({
          emphasis: expect.any(Number),
          intimacy: expect.any(Number),
          motionFollow: expect.any(Number),
          restraint: expect.any(Number),
        }),
        subjectGeometry: expect.objectContaining({
          hasSubjectAnchor: true,
          anchorX: 0.72,
          anchorY: 0.42,
          shotScale: 0.86,
          offCenter: expect.any(Number),
          anchorConfidence: expect.any(Number),
        }),
        motionMemory: expect.objectContaining({
          timeSinceLastZoomSec: 6,
          recentZoomSimilarity: 0.12,
          repeatedTargetRisk: expect.any(Number),
        }),
        physicalFormInputs: expect.objectContaining({
          anchorConfidence: expect.any(Number),
          pushPressure: expect.any(Number),
          punchPressure: expect.any(Number),
          cropRisk: expect.any(Number),
          repetitionPressure: expect.any(Number),
          sfxPairingEligibility: expect.any(Number),
        }),
        crossFamily: expect.objectContaining({
          sfxPairingAllowed: true,
          captionConflictRisk: expect.any(Number),
          transitionConflictRisk: expect.any(Number),
          mgConflictRisk: expect.any(Number),
        }),
        evidence: expect.objectContaining({
          intensity: 0.84,
          hasSubjectAnchor: true,
          shotScale: 0.86,
          directionMagnitude: 0.36,
        }),
        calibrationStatus: 'invented-needs-calibration',
      }),
      unifiedDecisionMerge: expect.objectContaining({
        executionLicense: 'licensed-by-camera-motion-atoms',
        familyPlanner: expect.objectContaining({
          version: 'zoom-family-planner-v1',
          family: 'zoom',
          visualMotionAllowed: true,
          jobVector: expect.objectContaining({
            emphasis: expect.any(Number),
            motionFollow: expect.any(Number),
          }),
          subjectGeometry: expect.objectContaining({
            hasSubjectAnchor: true,
            shotScale: 0.86,
          }),
          motionMemory: expect.objectContaining({
            timeSinceLastZoomSec: 6,
          }),
          physicalFormInputs: expect.objectContaining({
            pushPressure: expect.any(Number),
            repetitionPressure: expect.any(Number),
          }),
          crossFamily: expect.objectContaining({
            sfxPairingAllowed: true,
          }),
        }),
      }),
    }));
    expect(zoom?.params).not.toHaveProperty('zoomJob');
    expect(zoom?.params).not.toHaveProperty('zoomIntent');
    const zoomSignals = zoom?.params.signals as Record<string, unknown>;
    expect(zoomSignals).not.toHaveProperty('zoom_focal_x');
    expect(zoomSignals).not.toHaveProperty('zoom_focal_y');
    expect(merged.evidence.signalDecisionAudit.byReason).toEqual(expect.objectContaining({
      'licensed-by-camera-motion-atoms': expect.objectContaining({ count: 1 }),
    }));
  });

  it('keeps visually busy low-importance zoom signals as evidence instead of camera motion', () => {
    const pathE = createUnifiedDecisionBundle({
      source: 'creative-brief',
      edl: edl([
        decision({ type: 'graphic', frame: 30, source: 'creative-brief:test' }),
      ]),
    });

    const merged = mergeSignalDrivenBundle(pathE, edl([
      decision({
        type: 'zoom',
        frame: 420,
        source: 'signal-executor:busy-frame-zoom',
        confidence: 0.88,
        params: {
          signals: {
            speech_energy: 0.22,
            text_on_screen: 0.9,
            visual_complexity: 0.84,
          },
        },
      }),
    ]));

    expect(merged.edl.decisions.map((decision) => decision.type)).toEqual(['graphic']);
    expect(merged.evidence.evidenceOnlySignalDecisions[0]).toEqual(expect.objectContaining({
      type: 'zoom',
      family: 'camera',
      source: 'signal-executor:busy-frame-zoom',
      reason: 'zoom-family-plan-kept-clean-camera',
      candidate: expect.objectContaining({
        projectedAtoms: expect.objectContaining({
          speechPeak: 0.22,
          textOnScreen: 0.9,
          visualComplexity: 0.84,
        }),
      }),
    }));
    expect(merged.evidence.signalDecisionAudit.byReason).toEqual(expect.objectContaining({
      'zoom-family-plan-kept-clean-camera': expect.objectContaining({ count: 1 }),
    }));
  });

  it('keeps recently repeated zoom signals as evidence even when the moment is strong', () => {
    const pathE = createUnifiedDecisionBundle({
      source: 'creative-brief',
      edl: edl([
        decision({ type: 'graphic', frame: 30, source: 'creative-brief:test' }),
      ]),
    });

    const merged = mergeSignalDrivenBundle(pathE, edl([
      decision({
        type: 'zoom',
        frame: 420,
        source: 'signal-executor:repeated-zoom',
        confidence: 0.9,
        params: {
          signals: {
            speech_energy: 0.88,
            word_importance: 0.82,
            mainSubjectX: 0.5,
            mainSubjectY: 0.46,
            face_present: 1,
            timeSinceLastZoomSec: 0.4,
            recentZoomSimilarity: 0.94,
            recentZoomDensity: 0.82,
          },
        },
      }),
    ]));

    expect(merged.edl.decisions.map((decision) => decision.type)).toEqual(['graphic']);
    expect(merged.evidence.evidenceOnlySignalDecisions[0]).toEqual(expect.objectContaining({
      type: 'zoom',
      family: 'camera',
      source: 'signal-executor:repeated-zoom',
      reason: 'zoom-family-plan-kept-clean-camera',
      candidate: expect.objectContaining({
        projectedAtoms: expect.objectContaining({
          speechPeak: 0.88,
          wordImportance: 0.82,
          timeSinceLastZoomSec: 0.4,
          recentZoomSimilarity: 0.94,
          recentZoomDensity: 0.82,
        }),
      }),
    }));
    expect(merged.evidence.signalDecisionAudit.byReason).toEqual(expect.objectContaining({
      'zoom-family-plan-kept-clean-camera': expect.objectContaining({ count: 1 }),
    }));
  });

  it('keeps unreadable caption emphasis as evidence instead of adding noisy caption motion', () => {
    const pathE = createUnifiedDecisionBundle({
      source: 'creative-brief',
      edl: edl([
        decision({ type: 'graphic', frame: 30, source: 'creative-brief:test' }),
      ]),
    });

    const merged = mergeSignalDrivenBundle(pathE, edl([
      decision({
        type: 'caption-emphasis',
        frame: 520,
        source: 'signal-executor:busy-caption',
        confidence: 0.92,
        params: {
          keyword: 'everything',
          phrase: 'everything changed right here',
          signals: {
            speaking_rate_wpm: 232,
            speech_energy: 0.88,
            word_importance: 0.9,
            visceral_impact: 0.84,
            visual_complexity: 0.92,
            text_on_screen: 0.88,
            active_mg_pressure: 0.84,
            active_overlay_density: 0.91,
            caption_word_count: 4,
            display_duration_ms: 820,
          },
        },
      }),
    ]));

    expect(merged.edl.decisions.map((decision) => decision.type)).toEqual(['graphic']);
    expect(merged.evidence.evidenceOnlySignalDecisions[0]).toEqual(expect.objectContaining({
      type: 'caption-emphasis',
      family: 'caption',
      source: 'signal-executor:busy-caption',
      reason: 'caption-family-plan-kept-readable',
      candidate: expect.objectContaining({
        projectedAtoms: expect.objectContaining({
          speechRate: 232,
          speechPeak: 0.88,
          wordImportance: 0.9,
          phraseImpact: 0.84,
          visualComplexity: 0.92,
          textOnScreen: 0.88,
          mgPressure: 0.84,
          activeOverlayDensity: 0.91,
        }),
      }),
    }));
    expect(merged.evidence.signalDecisionAudit.byReason).toEqual(expect.objectContaining({
      'caption-family-plan-kept-readable': expect.objectContaining({ count: 1 }),
    }));
  });

  it('normalizes Path E brief-executor EDL shape before merge/execution', () => {
    const bundle = createUnifiedDecisionBundle({
      source: 'creative-brief',
      edl: {
        decisions: [{
          type: 'graphic',
          frame: 42,
          confidence: 0.72,
          source: 'creative-brief:test',
          technique: 'emphasis_word',
          params: { text: 'signal facts' },
        }],
        metadata: {
          totalMappingsEvaluated: 0,
          totalMappingsFired: 0,
          totalDecisionsGenerated: 1,
          totalDecisionsSuppressed: 0,
          executionTimeMs: 0,
        },
      },
    });

    expect(bundle.edl.projectId).toBe('unknown-project');
    expect(bundle.edl.generatedAt.toISOString()).toBe('1970-01-01T00:00:00.000Z');
    expect(bundle.edl.totalDecisions).toBe(1);
    expect(bundle.edl.stats).toEqual(expect.objectContaining({
      graphicCount: 1,
      averageConfidence: 0.72,
    }));
    expect(bundle.edl.decisions[0]).toEqual(expect.objectContaining({
      priority: 3,
      signal: 'emphasis_word',
      reason: '',
    }));
  });

  it('can represent Path D as the only producer when Path E has no bundle', () => {
    const bundle = createUnifiedDecisionBundle({
      source: 'signal-driven',
      edl: edl([
        decision({ type: 'zoom', frame: 24, source: 'signal-executor:test' }),
      ]),
    });

    expect(bundle.source).toBe('signal-driven');
    expect(bundle.authority).toEqual({
      version: 'unified-decision-authority-v1',
      executableProducer: 'signal-driven',
      decisionMode: 'signal-primary',
      advisoryProducers: [],
      signalDecisionRole: 'primary',
      signalDecisionsCanAddExecutable: true,
    });
    expect(bundle.edl.totalDecisions).toBe(1);
    expect(bundle.evidence).toEqual(expect.objectContaining({
      primaryDecisionCount: 0,
      signalDecisionCount: 1,
      addedSignalDecisionCount: 1,
      evidenceOnlySignalDecisionCount: 0,
      evidenceOnlySignalDecisions: [],
    }));
  });

  it('plans creative primary plus signal advisor through one planner boundary', () => {
    let bundle = planUnifiedDecisionBundle(null, {
      source: 'creative-brief',
      edl: edl([
        decision({ type: 'graphic', frame: 90, source: 'creative-brief:test' }),
      ]),
      expectedExecuted: 1,
      expectedSkipped: 0,
    });

    bundle = planUnifiedDecisionBundle(bundle, {
      source: 'signal-driven',
      edl: edl([
        decision({ type: 'graphic', frame: 96, source: 'signal-executor:test', confidence: 0.84 }),
        decision({ type: 'transition', frame: 180, source: 'signal-executor:test', confidence: 0.82, params: { transitionType: 'whip-pan', boundaryFrame: 180, topicDelta: 0.72 } }),
      ]),
    });

    expect(bundle.source).toBe('creative-brief+signal-driven');
    expect(bundle.authority).toEqual({
      version: 'unified-decision-authority-v1',
      executableProducer: 'unified-planner',
      decisionMode: 'unified-planner',
      advisoryProducers: ['creative-brief', 'signal-driven'],
      signalDecisionRole: 'co-owner',
      signalDecisionsCanAddExecutable: true,
      creativeBriefRole: 'semantic-context',
      signalRole: 'candidate-source',
    });
    expect(bundle.edl.decisions.map((d) => d.type)).toEqual(['graphic', 'transition']);
    expect(bundle.evidence).toEqual(expect.objectContaining({
      primaryDecisionCount: 1,
      signalDecisionCount: 2,
      addedSignalDecisionCount: 1,
      validatedDecisionCount: 1,
      suppressedSignalDuplicateCount: 1,
      evidenceOnlySignalDecisionCount: 0,
    }));
    expect(bundle.expectedSkipped).toBe(0);
  });

  it('keeps later signal batches executable when they pass the same unified policy', () => {
    let bundle = planUnifiedDecisionBundle(null, {
      source: 'creative-brief',
      edl: edl([
        decision({ type: 'graphic', frame: 90, source: 'creative-brief:test' }),
      ]),
    });

    bundle = planUnifiedDecisionBundle(bundle, {
      source: 'signal-driven',
      edl: edl([
        decision({ type: 'transition', frame: 180, source: 'signal-executor:first', confidence: 0.82, params: { transitionType: 'whip-pan', boundaryFrame: 180, topicDelta: 0.72 } }),
      ]),
    });

    bundle = planUnifiedDecisionBundle(bundle, {
      source: 'signal-driven',
      edl: edl([
        decision({ type: 'sfx-trigger', frame: 260, source: 'signal-executor:later', confidence: 0.86, params: { sfxType: 'impact', beatFrame: 260 } }),
      ]),
    });

    expect(bundle.source).toBe('creative-brief+signal-driven');
    expect(bundle.authority).toEqual({
      version: 'unified-decision-authority-v1',
      executableProducer: 'unified-planner',
      decisionMode: 'unified-planner',
      advisoryProducers: ['creative-brief', 'signal-driven'],
      signalDecisionRole: 'co-owner',
      signalDecisionsCanAddExecutable: true,
      creativeBriefRole: 'semantic-context',
      signalRole: 'candidate-source',
    });
    expect(bundle.edl.decisions.map((d) => d.source)).toEqual([
      'creative-brief:test',
      'signal-executor:first',
      'signal-executor:later',
    ]);
    expect(bundle.evidence).toEqual(expect.objectContaining({
      signalDecisionCount: 2,
      addedSignalDecisionCount: 2,
      evidenceOnlySignalDecisionCount: 0,
    }));
  });

  it('can accept signal producer before creative primary without changing precedence', () => {
    let bundle = planUnifiedDecisionBundle(null, {
      source: 'signal-driven',
      edl: edl([
        decision({ type: 'zoom', frame: 54, source: 'signal-executor:test', confidence: 0.82 }),
      ]),
    });

    bundle = planUnifiedDecisionBundle(bundle, {
      source: 'creative-brief',
      edl: edl([
        decision({ type: 'zoom', frame: 60, source: 'creative-brief:test', confidence: 0.9 }),
      ]),
      expectedExecuted: 1,
    });

    expect(bundle.source).toBe('creative-brief+signal-driven');
    expect(bundle.edl.decisions).toHaveLength(1);
    expect(bundle.edl.decisions[0].source).toBe('creative-brief:test');
    expect(bundle.edl.decisions[0].params.unifiedDecisionMerge).toEqual(expect.objectContaining({
      role: 'primary-validated',
    }));
    expect(bundle.evidence).toEqual(expect.objectContaining({
      addedSignalDecisionCount: 0,
      validatedDecisionCount: 1,
      evidenceOnlySignalDecisionCount: 0,
      evidenceOnlySignalDecisions: [],
    }));
  });

  it('lets a stronger licensed signal replace a weak near-equivalent creative hint', () => {
    let bundle = planUnifiedDecisionBundle(null, {
      source: 'creative-brief',
      edl: edl([
        decision({
          type: 'zoom',
          frame: 60,
          source: 'creative-brief:weak-zoom',
          confidence: 0.32,
          params: { scale: 1.04 },
        }),
      ]),
    });

    bundle = planUnifiedDecisionBundle(bundle, {
      source: 'signal-driven',
      edl: edl([
        decision({
          type: 'zoom',
          frame: 66,
          source: 'signal-executor:strong-zoom',
          signal: 'speech.emphasis_word',
          confidence: 0.94,
          params: {
            targetScale: 1.11,
            mainSubjectX: 0.48,
            mainSubjectY: 0.42,
            mainSubjectWidth: 0.34,
            mainSubjectHeight: 0.52,
            facePresent: 1,
            eyeContact: 0.8,
            speechPeak: 0.91,
            wordImportance: 0.88,
            visualMotion: 0.36,
            timeSinceLastZoomSec: 12,
            recentZoomSimilarity: 0.08,
          },
        }),
      ]),
    });

    expect(bundle.authority).toEqual({
      version: 'unified-decision-authority-v1',
      executableProducer: 'unified-planner',
      decisionMode: 'unified-planner',
      advisoryProducers: ['creative-brief', 'signal-driven'],
      signalDecisionRole: 'co-owner',
      signalDecisionsCanAddExecutable: true,
      creativeBriefRole: 'semantic-context',
      signalRole: 'candidate-source',
    });
    expect(bundle.edl.decisions).toHaveLength(1);
    expect(bundle.edl.decisions[0].source).toBe('signal-executor:strong-zoom');
    expect(bundle.edl.decisions[0].params.unifiedDecisionMerge).toEqual(expect.objectContaining({
      role: 'signal-replaced-primary',
      executionLicense: 'licensed-by-camera-motion-atoms',
      replacedPrimary: expect.objectContaining({
        type: 'zoom',
        frame: 60,
        source: 'creative-brief:weak-zoom',
      }),
    }));
    expect(bundle.edl.decisions[0].params.unifiedDecisionOwner).toEqual(expect.objectContaining({
      owner: 'unified-planner',
      plannerRole: 'signal-replaced-primary',
      producerSource: 'signal-executor:strong-zoom',
    }));
    expect(bundle.evidence).toEqual(expect.objectContaining({
      addedSignalDecisionCount: 1,
      validatedDecisionCount: 0,
      suppressedSignalDuplicateCount: 1,
      evidenceOnlySignalDecisionCount: 0,
    }));
    expect(bundle.evidence.signalDecisionAudit.byReason).toEqual(expect.objectContaining({
      'signal-replaced-primary:licensed-by-camera-motion-atoms': expect.objectContaining({ count: 1 }),
    }));
  });

  it('does not let an unlicensed near-equivalent signal replace a creative decision', () => {
    let bundle = planUnifiedDecisionBundle(null, {
      source: 'creative-brief',
      edl: edl([
        decision({ type: 'zoom', frame: 60, source: 'creative-brief:zoom', confidence: 0.82, params: { scale: 1.04 } }),
      ]),
    });

    bundle = planUnifiedDecisionBundle(bundle, {
      source: 'signal-driven',
      edl: edl([
        decision({ type: 'zoom', frame: 66, source: 'signal-executor:label-only-zoom', confidence: 0.94, params: { scale: 1.12 } }),
      ]),
    });

    expect(bundle.edl.decisions).toHaveLength(1);
    expect(bundle.edl.decisions[0].source).toBe('creative-brief:zoom');
    expect(bundle.edl.decisions[0].params.unifiedDecisionMerge).toEqual(expect.objectContaining({
      role: 'primary-validated',
    }));
    expect(bundle.edl.decisions[0].params.unifiedDecisionOwner).toBeUndefined();
    expect(bundle.evidence).toEqual(expect.objectContaining({
      addedSignalDecisionCount: 0,
      validatedDecisionCount: 1,
      evidenceOnlySignalDecisionCount: 0,
    }));
  });

  it('fails loud when a second creative primary tries to overwrite the planner', () => {
    const bundle = planUnifiedDecisionBundle(null, {
      source: 'creative-brief',
      edl: edl([
        decision({ type: 'graphic', frame: 30, source: 'creative-brief:first' }),
      ]),
    });

    expect(() => planUnifiedDecisionBundle(bundle, {
      source: 'creative-brief',
      edl: edl([
        decision({ type: 'graphic', frame: 60, source: 'creative-brief:second' }),
      ]),
    })).toThrow('already has primary producer');
  });

  it('plans an unordered producer candidate batch with unified planner authority', () => {
    const bundle = planUnifiedDecisionBundleFromCandidates([
      {
        source: 'signal-driven',
        edl: edl([
          decision({ type: 'transition', frame: 120, source: 'signal-executor:test', confidence: 0.82, params: { transitionType: 'whip-pan', boundaryFrame: 120, topicDelta: 0.72 } }),
        ]),
      },
      {
        source: 'creative-brief',
        edl: edl([
          decision({ type: 'graphic', frame: 60, source: 'creative-brief:test', confidence: 0.88 }),
        ]),
        expectedExecuted: 1,
      },
    ]);

    expect(bundle?.source).toBe('creative-brief+signal-driven');
    expect(bundle?.edl.decisions.map((d) => d.source)).toEqual([
      'creative-brief:test',
      'signal-executor:test',
    ]);
    expect(bundle?.evidence).toEqual(expect.objectContaining({
      primaryDecisionCount: 1,
      signalDecisionCount: 1,
      addedSignalDecisionCount: 1,
      evidenceOnlySignalDecisionCount: 0,
    }));
  });

  it('returns no bundle when no producer candidates exist', () => {
    expect(planUnifiedDecisionBundleFromCandidates([])).toBeNull();
  });

  it('lets signal SFX execute selectively without flooding the timeline', () => {
    const pathE = createUnifiedDecisionBundle({
      source: 'creative-brief',
      edl: edl([
        decision({ type: 'graphic', frame: 3400, source: 'creative-brief:test' }),
      ]),
    });

    const merged = mergeSignalDrivenBundle(pathE, edl([
      decision({ type: 'sfx-trigger', frame: 100, source: 'signal-executor:sfx-1', confidence: 0.9, params: { sfxType: 'impact', beatFrame: 100 } }),
      decision({ type: 'sfx-trigger', frame: 220, source: 'signal-executor:sfx-2', confidence: 0.9, params: { sfxType: 'impact', beatFrame: 220 } }),
      decision({ type: 'sfx-trigger', frame: 340, source: 'signal-executor:sfx-3', confidence: 0.9, params: { sfxType: 'impact', beatFrame: 340 } }),
      decision({ type: 'sfx-trigger', frame: 460, source: 'signal-executor:sfx-4', confidence: 0.9, params: { sfxType: 'impact', beatFrame: 460 } }),
      decision({ type: 'sfx-trigger', frame: 580, source: 'signal-executor:sfx-5', confidence: 0.9, params: { sfxType: 'impact', beatFrame: 580 } }),
      decision({ type: 'sfx-trigger', frame: 700, source: 'signal-executor:sfx-6', confidence: 0.9, params: { sfxType: 'impact', beatFrame: 700 } }),
    ]));

    expect(merged.edl.decisions.filter((d) => d.type === 'sfx-trigger')).toHaveLength(1);
    expect(merged.evidence).toEqual(expect.objectContaining({
      addedSignalDecisionCount: 1,
      evidenceOnlySignalDecisionCount: 5,
    }));
    expect(merged.evidence.evidenceOnlySignalDecisions.map((d) => d.source)).toEqual([
      'signal-executor:sfx-2',
      'signal-executor:sfx-3',
      'signal-executor:sfx-4',
      'signal-executor:sfx-5',
      'signal-executor:sfx-6',
    ]);
    expect(merged.evidence.evidenceOnlySignalDecisions[0]).toEqual(expect.objectContaining({
      type: 'sfx-trigger',
      frame: 220,
      params: { beatFrame: 220, sfxType: 'impact' },
      reason: 'signal-rhythm-budget-exhausted',
    }));
    expect(merged.expectedSkipped).toBe(0);
  });

  it('keeps unified-planner authority after later signal batches add only evidence', () => {
    let bundle = planUnifiedDecisionBundle(null, {
      source: 'creative-brief',
      edl: edl([
        decision({ type: 'graphic', frame: 90, source: 'creative-brief:test' }),
      ]),
    });

    bundle = planUnifiedDecisionBundle(bundle, {
      source: 'signal-driven',
      edl: edl([
        decision({
          type: 'transition',
          frame: 180,
          source: 'signal-executor:licensed',
          confidence: 0.82,
          params: { transitionType: 'whip-pan', boundaryFrame: 180, topicDelta: 0.72 },
        }),
      ]),
    });

    bundle = planUnifiedDecisionBundle(bundle, {
      source: 'signal-driven',
      edl: edl([
        decision({
          type: 'zoom',
          frame: 196,
          source: 'signal-executor:duplicate',
          confidence: 0.86,
          params: { scale: 1.08 },
        }),
      ]),
    });

    expect(bundle.authority).toEqual({
      version: 'unified-decision-authority-v1',
      executableProducer: 'unified-planner',
      decisionMode: 'unified-planner',
      advisoryProducers: ['creative-brief', 'signal-driven'],
      signalDecisionRole: 'co-owner',
      signalDecisionsCanAddExecutable: true,
      creativeBriefRole: 'semantic-context',
      signalRole: 'candidate-source',
    });
    expect(bundle.evidence).toEqual(expect.objectContaining({
      addedSignalDecisionCount: 1,
      signalDecisionCount: 2,
    }));
  });

  it('requires transition-anchored SFX to carry real boundary evidence', () => {
    const pathE = createUnifiedDecisionBundle({
      source: 'creative-brief',
      edl: edl([
        decision({ type: 'graphic', frame: 30, source: 'creative-brief:test' }),
      ]),
    });

    const merged = mergeSignalDrivenBundle(pathE, edl([
      decision({
        type: 'sfx-trigger',
        frame: 220,
        source: 'signal-executor:loose-transition-sfx',
        confidence: 0.91,
        params: { sfxType: 'impact', sfxAnchor: 'transition', beatFrame: 220 },
      }),
      decision({
        type: 'sfx-trigger',
        frame: 420,
        source: 'signal-executor:boundary-transition-sfx',
        confidence: 0.91,
        params: {
          sfxType: 'impact',
          sfxAnchor: 'transition',
          boundaryFrame: 420,
          transitionJob: 'emphasize-turn',
          beatStrength: 0.78,
          silencePocketMs: 260,
          providerQuality: 0.82,
          providerConfidence: 0.84,
          assetQualityFloor: 0.64,
          musicEnergy: 0.24,
          activeOverlayDensity: 0.18,
          recentSfxDensity: 0.1,
        },
      }),
    ]));

    expect(merged.edl.decisions.filter((d) => d.type === 'sfx-trigger')).toHaveLength(1);
    expect(merged.edl.decisions.find((d) => d.type === 'sfx-trigger')?.frame).toBe(420);
    expect(merged.evidence.signalDecisionAudit.byReason).toEqual(expect.objectContaining({
      'missing-transition-sfx-boundary-atoms': expect.objectContaining({ count: 1 }),
      'licensed-by-sfx-family-plan': expect.objectContaining({ count: 1 }),
    }));
    const sfx = merged.edl.decisions.find((d) => d.type === 'sfx-trigger');
    expect(sfx?.params).toEqual(expect.objectContaining({
      sfxSyncPlan: expect.objectContaining({
        version: 'sfx-sync-plan-v1',
        placementAllowed: true,
        reasonKeys: expect.arrayContaining(['transition-boundary', 'impact', 'sync-confidence', 'exact-sync-window', 'provider-quality']),
        jobVector: expect.objectContaining({
          impact: expect.any(Number),
          glue: expect.any(Number),
          restraint: expect.any(Number),
        }),
        syncWindow: expect.objectContaining({
          anchorFrame: 420,
          requestedFrame: 420,
          distanceFrames: 0,
          toleranceFrames: 3,
          exactSyncPressure: 1,
          driftRisk: 0,
        }),
        mixSafety: expect.objectContaining({
          overmixRisk: expect.any(Number),
          recentSfxDensity: 0.1,
        }),
        providerGate: expect.objectContaining({
          providerQuality: 0.82,
          providerConfidence: 0.84,
          assetQualityFloor: 0.64,
          externalSourceRequired: true,
        }),
        crossFamily: expect.objectContaining({
          transitionAnchored: true,
        }),
        evidence: expect.objectContaining({
          transitionAnchored: true,
          exactSyncPressure: 1,
          driftRisk: 0,
          providerQuality: 0.82,
        }),
        calibrationStatus: 'invented-needs-calibration',
      }),
      unifiedDecisionMerge: expect.objectContaining({
        executionLicense: 'licensed-by-sfx-family-plan',
        familyPlanner: expect.objectContaining({
          version: 'sfx-family-planner-v1',
          family: 'audio',
          placementAllowed: true,
          syncWindow: expect.objectContaining({ distanceFrames: 0 }),
          providerGate: expect.objectContaining({ externalSourceRequired: true }),
          mixSafety: expect.objectContaining({ recentSfxDensity: 0.1 }),
        }),
      }),
    }));
    expect(sfx?.params.signals).toEqual(expect.objectContaining({
      sfx_anchor_distance_frames: 0,
      sfx_sync_tolerance_frames: 3,
      sfx_drift_risk: 0,
      sfx_provider_risk: 0,
      sfx_external_source_required: true,
    }));
    expect(sfx?.params).not.toHaveProperty('assetQuery');
    expect(sfx?.params).not.toHaveProperty('sfxAssetId');
    expect(sfx?.params).not.toHaveProperty('sfxSearchQuery');
    expect(sfx?.params).not.toHaveProperty('volume');
    expect(merged.evidence.signalDecisionAudit.candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        family: 'audio',
        role: 'audio-emphasis',
        timingAnchor: expect.objectContaining({ kind: 'boundary', frame: 220 }),
        riskFlags: expect.arrayContaining(['missing-transition-sfx-boundary-atoms']),
      }),
      expect.objectContaining({
        family: 'audio',
        role: 'audio-emphasis',
        timingAnchor: expect.objectContaining({ kind: 'boundary', frame: 420 }),
        riskFlags: [],
      }),
    ]));
  });

  it('keeps drifted overmixed or low-provider SFX evidence-only', () => {
    const pathE = createUnifiedDecisionBundle({
      source: 'creative-brief',
      edl: edl([
        decision({ type: 'graphic', frame: 30, source: 'creative-brief:test' }),
      ]),
    });

    const merged = mergeSignalDrivenBundle(pathE, edl([
      decision({
        type: 'sfx-trigger',
        frame: 200,
        source: 'signal-executor:bad-sfx',
        confidence: 0.93,
        params: {
          sfxType: 'impact',
          beatFrame: 260,
          beatStrength: 0.8,
          providerQuality: 0.2,
          providerConfidence: 0.44,
          assetQualityFloor: 0.75,
          speechEnergy: 0.94,
          recentSfxDensity: 0.92,
          activeOverlayDensity: 0.7,
          signals: {
            beatStrength: 0.8,
            beatFrame: 260,
            providerQuality: 0.2,
            providerConfidence: 0.44,
            assetQualityFloor: 0.75,
            speechEnergy: 0.94,
            recentSfxDensity: 0.92,
            activeOverlayDensity: 0.7,
          },
        },
      }),
    ]));

    expect(merged.edl.decisions.filter((d) => d.type === 'sfx-trigger')).toHaveLength(0);
    expect(merged.evidence).toEqual(expect.objectContaining({
      addedSignalDecisionCount: 0,
      evidenceOnlySignalDecisionCount: 1,
    }));
    expect(merged.evidence.signalDecisionAudit.byReason).toEqual(expect.objectContaining({
      'sfx-family-plan-kept-silent': expect.objectContaining({ count: 1 }),
    }));
    expect(merged.evidence.evidenceOnlySignalDecisions[0]).toEqual(expect.objectContaining({
      type: 'sfx-trigger',
      frame: 200,
      reason: 'sfx-family-plan-kept-silent',
    }));
    const candidate = merged.evidence.signalDecisionAudit.candidates.find((item) => item.family === 'audio');
    expect(candidate?.projectedAtoms).toEqual(expect.objectContaining({
      providerQuality: 0.2,
      recentSfxDensity: 0.92,
      beatFrame: 260,
    }));
  });

  it('keeps hard-cut signal transitions as evidence while executing licensed special transitions', () => {
    const pathE = createUnifiedDecisionBundle({
      source: 'creative-brief',
      edl: edl([
        decision({ type: 'graphic', frame: 30, source: 'creative-brief:test' }),
      ]),
    });

    const merged = mergeSignalDrivenBundle(pathE, edl([
      decision({ type: 'transition', frame: 180, source: 'signal-executor:hard-cut', confidence: 0.95, params: { transitionType: 'hard-cut' } }),
      decision({ type: 'transition', frame: 420, source: 'signal-executor:whip-pan', confidence: 0.82, params: { transitionType: 'whip-pan', boundaryFrame: 420, topicDelta: 0.72 } }),
    ]));

    expect(merged.edl.decisions.filter((d) => d.type === 'transition')).toHaveLength(1);
    expect(merged.evidence).toEqual(expect.objectContaining({
      addedSignalDecisionCount: 1,
      evidenceOnlySignalDecisionCount: 1,
    }));
    expect(merged.evidence.evidenceOnlySignalDecisions.map((d) => d.params)).toEqual([
      { transitionType: 'hard-cut' },
    ]);
    expect(merged.evidence.evidenceOnlySignalDecisions[0].reason).toBe('hard-cut-is-boundary-evidence');
    expect(merged.expectedSkipped).toBe(0);
  });

  it('lets boundary atoms promote hard-cut compatibility hints into planned transitions', () => {
    const pathE = createUnifiedDecisionBundle({
      source: 'creative-brief',
      edl: edl([
        decision({ type: 'graphic', frame: 30, source: 'creative-brief:test' }),
      ]),
    });

    const merged = mergeSignalDrivenBundle(pathE, edl([
      decision({
        type: 'transition',
        frame: 300,
        source: 'signal-executor:motion-boundary',
        confidence: 0.91,
        params: {
          transitionType: 'hard-cut',
          signals: {
            motionVectorX: 0.72,
            motionVectorY: 0.24,
            motion_intensity: 0.8,
            narrative_pressure: 0.64,
            music_energy: 0.78,
            silence_duration_ms: 260,
            subjectPositionJump: 0.68,
            shotScaleDelta: 0.58,
            semanticContrast: 0.62,
            musicHit: 0.72,
            audioTailMs: 220,
            recentTransitionSimilarity: 0.18,
          },
        },
      }),
    ]));

    const transition = merged.edl.decisions.find((decision) => decision.type === 'transition');
    expect(transition?.params).toEqual(expect.objectContaining({
      transitionType: 'hard-cut',
      signals: expect.objectContaining({
        motion_vector_x: 0.72,
        motion_intensity: 0.8,
        topic_shift: 0.64,
        beat_strength: 0.78,
      }),
      transitionBoundaryPlan: expect.objectContaining({
        version: 'transition-boundary-plan-v1',
        visualTransitionAllowed: true,
        reasonKeys: expect.arrayContaining([
          'motion-direction',
          'visual-motion',
          'topic-shift',
          'beat',
          'speech-gap',
          'subject-jump',
          'shot-scale-change',
          'semantic-contrast',
          'music-hit',
          'audio-tail',
        ]),
        jobVector: expect.objectContaining({
          impact: expect.any(Number),
          motionTransfer: expect.any(Number),
          jumpHide: expect.any(Number),
          contrastReveal: expect.any(Number),
          audioBridge: expect.any(Number),
        }),
        physicalFormInputs: expect.objectContaining({
          directionX: 0.72,
          directionY: 0.24,
          durationPressure: expect.any(Number),
          motionPressure: expect.any(Number),
          sfxEligibility: expect.any(Number),
          zoomBridgeNeed: expect.any(Number),
          screenSafetyPressure: expect.any(Number),
          repetitionPressure: expect.any(Number),
        }),
        crossFamily: expect.objectContaining({
          sfxAllowed: true,
          zoomBridgeAllowed: true,
          captionConflictRisk: expect.any(Number),
          mgConflictRisk: expect.any(Number),
        }),
        evidence: expect.objectContaining({
          directionMagnitude: 0.72,
          boundaryConfidence: 0.72,
        }),
        calibrationStatus: 'invented-needs-calibration',
      }),
      unifiedDecisionMerge: expect.objectContaining({
        executionLicense: 'licensed-by-transition-family-plan',
        familyPlanner: expect.objectContaining({
          version: 'transition-family-planner-v1',
          family: 'transition',
          visualTransitionAllowed: true,
          jobVector: expect.objectContaining({
            motionTransfer: expect.any(Number),
            jumpHide: expect.any(Number),
          }),
          physicalFormInputs: expect.objectContaining({
            sfxEligibility: expect.any(Number),
            zoomBridgeNeed: expect.any(Number),
          }),
          crossFamily: expect.objectContaining({
            sfxAllowed: true,
            zoomBridgeAllowed: true,
          }),
        }),
      }),
    }));
    expect(transition?.params).not.toHaveProperty('transitionJob');
    expect(transition?.params).not.toHaveProperty('transitionIntent');
    expect(merged.evidence.signalDecisionAudit.byReason).toEqual(expect.objectContaining({
      'licensed-by-transition-family-plan': expect.objectContaining({ count: 1 }),
    }));
    expect(merged.evidence.evidenceOnlySignalDecisionCount).toBe(0);
  });

  it('lets explicit hard-cut boundary intent execute even when visualTransitionAllowed is false', () => {
    const pathE = createUnifiedDecisionBundle({
      source: 'creative-brief',
      edl: edl([
        decision({ type: 'graphic', frame: 30, source: 'creative-brief:test' }),
      ]),
    });

    const merged = mergeSignalDrivenBundle(pathE, edl([
      decision({
        type: 'transition',
        frame: 280,
        source: 'signal-executor:hard-cut-intent',
        confidence: 0.89,
        params: {
          transitionType: 'hard-cut',
          transitionIntent: 'impact-transfer',
          boundaryFrame: 280,
          textOnScreen: 0.82,
          topicDelta: 0.26,
        },
      }),
    ]));

    expect(merged.edl.decisions.filter((d) => d.type === 'transition')).toHaveLength(1);
    expect(merged.evidence).toEqual(expect.objectContaining({
      addedSignalDecisionCount: 1,
      evidenceOnlySignalDecisionCount: 0,
      signalDecisionCount: 1,
    }));
    expect(merged.edl.decisions.find((d) => d.type === 'transition')?.params.unifiedDecisionMerge).toEqual(
      expect.objectContaining({
        executionLicense: 'licensed-by-transition-family-plan',
      }),
    );
    expect(merged.evidence.signalDecisionAudit.byReason).toEqual(expect.objectContaining({
      'licensed-by-transition-family-plan': expect.objectContaining({ count: 1 }),
    }));
    expect(merged.evidence.evidenceOnlySignalDecisions.map((d) => d.reason)).not.toContain('hard-cut-is-boundary-evidence');
  });

  it('requires transition signals to have both a boundary anchor and a boundary reason', () => {
    const pathE = createUnifiedDecisionBundle({
      source: 'creative-brief',
      edl: edl([
        decision({ type: 'graphic', frame: 30, source: 'creative-brief:test' }),
      ]),
    });

    const merged = mergeSignalDrivenBundle(pathE, edl([
      decision({ type: 'transition', frame: 120, source: 'signal-executor:anchor-only', confidence: 0.9, params: { transitionType: 'whip-pan', boundaryFrame: 120 } }),
      decision({ type: 'transition', frame: 240, source: 'signal-executor:reason-only', confidence: 0.9, params: { transitionType: 'whip-pan', topicDelta: 0.72 } }),
      decision({ type: 'transition', frame: 360, source: 'signal-executor:complete', confidence: 0.9, params: { transitionType: 'whip-pan', boundaryFrame: 360, topicDelta: 0.72 } }),
    ]));

    expect(merged.edl.decisions.filter((d) => d.type === 'transition')).toHaveLength(1);
    expect(merged.edl.decisions.find((d) => d.type === 'transition')?.frame).toBe(360);
    expect(merged.evidence).toEqual(expect.objectContaining({
      addedSignalDecisionCount: 1,
      evidenceOnlySignalDecisionCount: 2,
    }));
    expect(merged.evidence.signalDecisionAudit.byReason).toEqual(expect.objectContaining({
      'missing-transition-boundary-atoms': expect.objectContaining({ count: 2 }),
      'licensed-by-transition-boundary-atoms': expect.objectContaining({ count: 1 }),
    }));
  });

  it('splits moment importance from execution confidence and projects nested signal atoms', () => {
    const pathE = createUnifiedDecisionBundle({
      source: 'creative-brief',
      edl: edl([
        decision({ type: 'graphic', frame: 30, source: 'creative-brief:test' }),
      ]),
    });

    const merged = mergeSignalDrivenBundle(pathE, edl([
      decision({
        type: 'transition',
        frame: 300,
        source: 'signal-executor:nested-transition',
        confidence: 0.42,
        params: {
          transitionType: 'whip-pan',
          executionConfidence: 0.86,
          momentWeight: 0.42,
          signals: {
            narrative_pressure: 0.82,
            motionVectorX: 0.64,
            silence_duration_ms: 320,
          },
        },
      }),
      decision({
        type: 'zoom',
        frame: 520,
        source: 'signal-executor:weak-camera',
        confidence: 0.95,
        params: {
          executionConfidence: 0.4,
          momentWeight: 0.95,
          signals: {
            speech_energy: 0.88,
            shot_scale: 'close',
          },
        },
      }),
    ]));

    expect(merged.edl.decisions.map((d) => d.type)).toEqual(['graphic', 'transition']);
    expect(merged.evidence).toEqual(expect.objectContaining({
      signalDecisionCount: 2,
      addedSignalDecisionCount: 1,
      evidenceOnlySignalDecisionCount: 1,
    }));

    const transitionCandidate = merged.evidence.signalDecisionAudit.candidates.find(
      (candidate) => candidate.source === 'signal-executor:nested-transition',
    );
    expect(transitionCandidate).toEqual(expect.objectContaining({
      family: 'transition',
      job: 'transition-boundary',
      confidence: 0.86,
      momentImportance: 0.42,
      projectedAtoms: expect.objectContaining({
        boundaryFrame: 300,
        topicDelta: 0.82,
        motionVectorX: 0.64,
        speechGapMs: 320,
      }),
      sourcePacket: expect.objectContaining({
        hasSignals: true,
        signalKeys: ['motionVectorX', 'narrative_pressure', 'silence_duration_ms'],
      }),
    }));
    const transitionDecision = merged.edl.decisions.find(
      (decision) => decision.source === 'signal-executor:nested-transition',
    );
    expect(transitionDecision?.params).toEqual(expect.objectContaining({
      transitionBoundaryPlan: expect.objectContaining({
        version: 'transition-boundary-plan-v1',
        visualTransitionAllowed: true,
      }),
      signals: expect.objectContaining({
        motion_vector_x: 0.64,
        topic_shift: 0.82,
        silence_duration_ms: 320,
      }),
      unifiedDecisionMerge: expect.objectContaining({
        familyPlanner: expect.objectContaining({
          family: 'transition',
          visualTransitionAllowed: true,
        }),
      }),
    }));

    const weakZoom = merged.evidence.evidenceOnlySignalDecisions.find(
      (sample) => sample.source === 'signal-executor:weak-camera',
    );
    expect(weakZoom).toEqual(expect.objectContaining({
      family: 'camera',
      reason: 'below-signal-confidence-floor',
      confidence: 0.4,
      candidate: expect.objectContaining({
        confidence: 0.4,
        momentImportance: 0.95,
        projectedAtoms: expect.objectContaining({
          speechPeak: 0.88,
          shotScale: 'close',
        }),
      }),
    }));
  });

  it('builds a full signal-decision audit without changing executable decisions', () => {
    const pathE = createUnifiedDecisionBundle({
      source: 'creative-brief',
      edl: edl([
        decision({ type: 'graphic', frame: 30, source: 'creative-brief:test' }),
      ]),
    });

    const merged = mergeSignalDrivenBundle(pathE, edl([
      decision({
        type: 'caption-emphasis',
        frame: 50,
        source: 'signal-executor:caption',
        confidence: 0.91,
        params: {
          keyword: 'finally',
          phrase: 'finally the growth clicked',
          signals: {
            speaking_rate_wpm: 168,
            speech_energy: 0.72,
            word_importance: 0.81,
            visceral_impact: 0.68,
            visual_complexity: 0.18,
            text_on_screen: 0.12,
            negative_space_bottom: 0.7,
            formality: 0.36,
            caption_word_count: 4,
            display_duration_ms: 1400,
            active_mg_pressure: 0.08,
            active_overlay_density: 0.16,
          },
        },
      }),
      decision({ type: 'zoom', frame: 90, source: 'signal-executor:zoom', confidence: 0.4 }),
      decision({ type: 'transition', frame: 180, source: 'signal-executor:transition', confidence: 0.95, params: { transitionType: 'hard-cut' } }),
      decision({ type: 'sfx-trigger', frame: 360, source: 'signal-executor:sfx', confidence: 0.89, params: { sfxType: 'impact', beatFrame: 360 } }),
    ]));

    expect(merged.edl.decisions.map((d) => d.type)).toEqual(['graphic', 'caption-emphasis', 'sfx-trigger']);
    expect(merged.evidence.signalDecisionAudit).toEqual(expect.objectContaining({
      version: 'signal-decision-audit-v1',
      totalCount: 4,
      outcomes: {
        'added-executable': 2,
        'evidence-only': 2,
        'signal-primary': 0,
        'validated-primary': 0,
      },
    }));
    expect(merged.evidence.signalDecisionAudit.byFamily.caption).toEqual(expect.objectContaining({
      count: 1,
      frames: expect.objectContaining({ first: 50, last: 50, samples: [50] }),
      sources: { 'signal-executor:caption': 1 },
    }));
    expect(merged.evidence.signalDecisionAudit.byFamily.audio).toEqual(expect.objectContaining({
      count: 1,
      confidence: expect.objectContaining({ min: 0.89, max: 0.89, average: 0.89 }),
    }));
    expect(merged.evidence.signalDecisionAudit.byReason).toEqual(expect.objectContaining({
      'below-signal-confidence-floor': expect.objectContaining({ count: 1 }),
      'hard-cut-is-boundary-evidence': expect.objectContaining({ count: 1 }),
      'licensed-by-caption-family-plan': expect.objectContaining({ count: 1 }),
      'licensed-by-sfx-family-plan': expect.objectContaining({ count: 1 }),
    }));
    const captionDecision = merged.edl.decisions.find((d) => d.type === 'caption-emphasis');
    expect(captionDecision?.params).toEqual(expect.objectContaining({
      captionMomentPlan: expect.objectContaining({
        version: 'caption-moment-plan-v1',
        emphasisAllowed: true,
        reasonKeys: expect.arrayContaining(['text-anchor', 'salient-caption-moment', 'phrase-impact', 'speech-peak']),
        jobVector: expect.objectContaining({
          subtitleClarity: expect.any(Number),
          emphasisPunch: expect.any(Number),
          phraseGrouping: expect.any(Number),
          kinetic: expect.any(Number),
          restraint: expect.any(Number),
        }),
        grouping: expect.objectContaining({
          speechRateWpm: 168,
          phraseWordCount: 4,
          readableWindowFrames: expect.any(Number),
          minReadableDurationFrames: expect.any(Number),
          splitPressure: expect.any(Number),
        }),
        readability: expect.objectContaining({
          readabilityPressure: expect.any(Number),
          readingSpeedRisk: expect.any(Number),
          collisionRisk: expect.any(Number),
          negativeSpaceBottom: 0.7,
        }),
        styleIntent: expect.objectContaining({
          subtitleMode: expect.any(Number),
          phraseMode: expect.any(Number),
          wordByWord: expect.any(Number),
          emphasisScale: expect.any(Number),
          surfaceNeed: expect.any(Number),
        }),
        crossFamily: expect.objectContaining({
          mgConflictRisk: 0.08,
          sfxPairingAllowed: expect.any(Boolean),
        }),
        evidence: expect.objectContaining({
          hasTextAnchor: true,
          phraseImpact: 0.68,
          emphasisPunch: expect.any(Number),
          readingSpeedRisk: expect.any(Number),
          collisionRisk: expect.any(Number),
        }),
        calibrationStatus: 'invented-needs-calibration',
      }),
      unifiedDecisionMerge: expect.objectContaining({
        executionLicense: 'licensed-by-caption-family-plan',
        familyPlanner: expect.objectContaining({
          version: 'caption-family-planner-v1',
          family: 'caption',
          emphasisAllowed: true,
          jobVector: expect.objectContaining({
            emphasisPunch: expect.any(Number),
          }),
          grouping: expect.objectContaining({
            phraseWordCount: 4,
          }),
          readability: expect.objectContaining({
            readabilityPressure: expect.any(Number),
          }),
          styleIntent: expect.objectContaining({
            emphasisScale: expect.any(Number),
          }),
          crossFamily: expect.objectContaining({
            mgConflictRisk: 0.08,
          }),
        }),
      }),
    }));
    expect(captionDecision?.params).not.toHaveProperty('captionStyle');
    expect(captionDecision?.params).not.toHaveProperty('displayMode');
    expect(captionDecision?.params.signals).toEqual(expect.objectContaining({
      caption_salience: expect.any(Number),
      caption_readability_pressure: expect.any(Number),
      caption_reading_speed_risk: expect.any(Number),
      caption_style_word_by_word: expect.any(Number),
      caption_emphasis_scale: expect.any(Number),
      caption_mg_conflict_risk: 0.08,
    }));
    expect(captionDecision?.params.signals).not.toHaveProperty('captionStyle');
    expect(captionDecision?.params.signals).not.toHaveProperty('displayMode');

    const sfxDecision = merged.edl.decisions.find((d) => d.type === 'sfx-trigger');
    expect(sfxDecision?.params).toEqual(expect.objectContaining({
      sfxSyncPlan: expect.objectContaining({
        version: 'sfx-sync-plan-v1',
        placementAllowed: true,
        reasonKeys: expect.arrayContaining(['beat-anchor', 'impact', 'sync-confidence']),
      }),
      unifiedDecisionMerge: expect.objectContaining({
        executionLicense: 'licensed-by-sfx-family-plan',
        familyPlanner: expect.objectContaining({
          version: 'sfx-family-planner-v1',
          family: 'audio',
          placementAllowed: true,
        }),
      }),
    }));
    expect(sfxDecision?.params).not.toHaveProperty('assetQuery');
    expect(sfxDecision?.params).not.toHaveProperty('sfxAssetId');
    expect(merged.evidence.signalDecisionAudit.candidates.map((candidate) => ({
      family: candidate.family,
      role: candidate.role,
      timing: candidate.timingAnchor.kind,
      frame: candidate.timingAnchor.frame,
      evidenceStrength: candidate.evidenceStrength,
      completeness: candidate.completeness,
      riskFlags: candidate.riskFlags,
      calibrationStatus: candidate.calibrationStatus,
    }))).toEqual(expect.arrayContaining([
      {
        family: 'caption',
        role: 'caption-emphasis',
        timing: 'moment',
        frame: 50,
        evidenceStrength: 0.91,
        completeness: 1,
        riskFlags: [],
        calibrationStatus: 'invented-needs-calibration',
      },
      {
        family: 'camera',
        role: 'camera-motion',
        timing: 'moment',
        frame: 90,
        evidenceStrength: 0.4,
        completeness: 0.75,
        riskFlags: ['below-execution-confidence', 'incomplete-intent'],
        calibrationStatus: 'invented-needs-calibration',
      },
      {
        family: 'transition',
        role: 'transition-boundary',
        timing: 'boundary',
        frame: 180,
        evidenceStrength: 0.95,
        completeness: 1,
        riskFlags: ['hard-cut-boundary-evidence'],
        calibrationStatus: 'invented-needs-calibration',
      },
      {
        family: 'audio',
        role: 'audio-emphasis',
        timing: 'moment',
        frame: 360,
        evidenceStrength: 0.89,
        completeness: 1,
        riskFlags: [],
        calibrationStatus: 'invented-needs-calibration',
      },
    ]));
    expect(merged.evidence.signalDecisionAudit.samples.map((sample) => ({
      family: sample.family,
      outcome: sample.outcome,
      reason: sample.reason,
      frame: sample.frame,
      source: sample.source,
    }))).toEqual(expect.arrayContaining([
      {
        family: 'caption',
        outcome: 'added-executable',
        reason: 'licensed-by-caption-family-plan',
        frame: 50,
        source: 'signal-executor:caption',
      },
      {
        family: 'camera',
        outcome: 'evidence-only',
        reason: 'below-signal-confidence-floor',
        frame: 90,
        source: 'signal-executor:zoom',
      },
      {
        family: 'transition',
        outcome: 'evidence-only',
        reason: 'hard-cut-is-boundary-evidence',
        frame: 180,
        source: 'signal-executor:transition',
      },
      {
        family: 'audio',
        outcome: 'added-executable',
        reason: 'licensed-by-sfx-family-plan',
        frame: 360,
        source: 'signal-executor:sfx',
      },
    ]));
  });
});

function edl(decisions: EditDecision[]): EditDecisionList {
  return {
    projectId: 'unified-decision-bundle-test',
    generatedAt: new Date('2026-06-11T00:00:00.000Z'),
    totalDecisions: decisions.length,
    decisions,
    stats: {
      cutsPerMinute: 0,
      transitionCount: decisions.filter((d) => d.type === 'transition').length,
      graphicCount: decisions.filter((d) => d.type === 'graphic').length,
      zoomCount: decisions.filter((d) => d.type === 'zoom').length,
      speedChangeCount: decisions.filter((d) => d.type === 'speed-change').length,
      averageConfidence: decisions.length
        ? decisions.reduce((sum, d) => sum + d.confidence, 0) / decisions.length
        : 0,
    },
  };
}

function decision(overrides: Partial<EditDecision>): EditDecision {
  return {
    type: 'graphic',
    frame: 0,
    durationFrames: 12,
    priority: 3,
    source: 'test',
    signal: 'test_signal',
    reason: 'test decision',
    params: {},
    confidence: 0.9,
    ...overrides,
  };
}

