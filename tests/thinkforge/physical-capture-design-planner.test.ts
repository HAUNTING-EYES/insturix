import { describe, expect, it, vi } from 'vitest';

import type { GraphIndex } from '@/lib/editron/services/graph-query';
import {
  createCaptureAcquisitionDecisionSet,
  createCaptureAcquisitionSourceDocument,
} from '@/lib/thinkforge/production/capture-acquisition-decisions';
import {
  planPhysicalCaptureDesign,
  PhysicalCaptureDesignPlannerError,
  type PhysicalCaptureDesignGenerator,
} from '@/lib/thinkforge/production/physical-capture-design-planner';
import {
  PhysicalCaptureKnowledgeError,
  resolvePhysicalCaptureKnowledge,
} from '@/lib/thinkforge/production/physical-capture-knowledge';
import {
  abstractExplainerTreatment,
  mixedPresenterCutawayTreatment,
} from '@/tests/fixtures/thinkforge-video-treatment';
import { parseVideoTreatment } from '@/lib/thinkforge/schemas/video-treatment';

const sourceLedger = {
  ledgerVersion: 1 as const,
  entries: [{
    referenceId: 'src_brief',
    kind: 'user_brief' as const,
    title: 'Approved brief',
    summary: 'A source-bounded opening claim.',
    confidence: 1,
    provenance: { origin: 'test' as const },
  }],
};

function sourceDocument() {
  return createCaptureAcquisitionSourceDocument({
    version: 3,
    contentHash: 'a'.repeat(64),
    sidecarHash: 'b'.repeat(64),
    sourceLedger,
  });
}

function graphFixture(): GraphIndex {
  return {
    version: '3.0-capture-test',
    constraints: new Map([
      ['constraint:continuity.eye_line', {
        id: 'constraint:continuity.eye_line',
        type: 'Constraint',
        category: 'continuity',
        name: 'Eye-line continuity',
        summary: 'Preserve a coherent audience relationship across linked human coverage.',
        details: {
          rule: 'Maintain coherent eye-line intent when linked coverage returns to the same speaker.',
          detection: 'Compare linked coverage.',
          threshold: 'Narrative continuity must remain legible.',
          autoCorrection: 'Return to technical planning.',
          severity: 'warning',
          appliesTo: ['physical-capture'],
          rationale: 'Unmotivated viewpoint changes disrupt audience orientation.',
        },
        tags: ['continuity', 'viewpoint', 'speaker'],
        sourceLines: [10, 18],
      }],
      ['constraint:temporal.cut_mid_word', {
        id: 'constraint:temporal.cut_mid_word',
        type: 'Constraint',
        category: 'temporal',
        name: 'Cut mid-word',
        summary: 'Never cut within a spoken word.',
        details: {
          rule: 'Reject a destructive edit inside a word timestamp.',
          detection: 'Inspect cut points.',
          threshold: 'Any cut inside a word.',
          autoCorrection: 'Move the edit.',
          severity: 'blocker',
          appliesTo: ['cut_point', 'lip_sync'],
          rationale: 'This is a post-production edit constraint.',
        },
        tags: ['editing'],
        sourceLines: [20, 28],
      }],
      ['constraint:accessibility.missing_captions', {
        id: 'constraint:accessibility.missing_captions',
        type: 'Constraint',
        category: 'accessibility',
        name: 'Missing captions',
        summary: 'Speech requires captions on sound-off platforms.',
        details: {
          rule: 'Add captions during finishing.',
          detection: 'Inspect caption tracks.',
          threshold: 'Any uncaptained speech.',
          autoCorrection: 'Generate captions.',
          severity: 'blocker',
          appliesTo: ['captions', 'speech', 'sound_off_viewing'],
          rationale: 'This is a delivery constraint, not an on-set design input.',
        },
        tags: ['delivery'],
        sourceLines: [30, 38],
      }],
      ['constraint:sound.platypus_marmalade', {
        id: 'constraint:sound.platypus_marmalade',
        type: 'Constraint',
        category: 'sound',
        name: 'Platypus marmalade',
        summary: 'Quokka zephyr xylophone.',
        details: {
          rule: 'Quokka zephyr xylophone.',
          detection: 'Quokka zephyr xylophone.',
          threshold: 'Quokka zephyr xylophone.',
          autoCorrection: 'Quokka zephyr xylophone.',
          severity: 'warning',
          appliesTo: ['physical-capture'],
          rationale: 'Quokka zephyr xylophone.',
        },
        tags: ['quokka', 'zephyr', 'xylophone'],
        sourceLines: [39, 39],
      }],
    ]),
  } as unknown as GraphIndex;
}

function resolvedRequirementGraphFixture(): GraphIndex {
  return {
    version: '3.0-resolved-requirement-test',
    constraints: new Map([['constraint:capture.zebra_calibration', {
      id: 'constraint:capture.zebra_calibration',
      type: 'Constraint',
      category: 'visual',
      name: 'Zebra calibration evidence',
      summary: 'Preserve the zebracalibration evidence requested by the approved physical requirement.',
      details: {
        rule: 'Carry the approved zebracalibration objective into physical coverage.',
        detection: 'Inspect the resolved physical brief.',
        threshold: 'The approved objective must remain present.',
        autoCorrection: 'Regenerate from the resolved requirement.',
        severity: 'warning',
        appliesTo: ['physical-capture'],
        rationale: 'Acquisition decisions must influence the on-set design query.',
      },
      tags: ['zebracalibration'],
      sourceLines: [40, 48],
    }]]),
  } as unknown as GraphIndex;
}

function output() {
  return {
    globalCaptureStrategy: 'Keep the human claim visually stable while preserving room for its separate conceptual counterpoint.',
    coverageIntents: [{
      requirementId: 'capture_host_opening',
      linkedEventIds: ['event_host_claim'],
      narrativeObjective: 'Establish credible human connection for the opening claim.',
      subjectDescription: 'The selected spokesperson.',
      subjectAction: 'Deliver the approved opening claim.',
      compositionPurpose: 'Prioritize expression and a clear audience relationship.',
      viewpointPurpose: 'Support direct connection without overstating intimacy.',
      cameraBehaviorPurpose: 'Keep attention on the claim rather than camera motion.',
      focusPriority: 'Eyes and expression.',
      lightingPurpose: 'Keep expression readable within the confirmed environment.',
      soundPurpose: 'Capture intelligible synchronized speech with confirmed equipment.',
      performancePurpose: 'Deliver the claim with credible restraint.',
      continuityConstraints: ['Preserve audience relationship after the conceptual event.'],
      safetyConstraints: [],
      sourceRefs: [],
      creativeReferenceIds: [],
    }],
    continuityConstraints: ['Return to the same human relationship after the conceptual counterpoint.'],
    unresolvedQuestions: ['Which confirmed camera, space, lighting, and audio capabilities are available?'],
    knowledgeRefs: ['constraint:continuity.eye_line'],
  };
}

function lengthError() {
  return Object.assign(new Error('No object generated: could not parse the response.'), {
    name: 'AI_NoObjectGeneratedError',
    finishReason: 'length',
  });
}

describe('physical capture design planner', () => {
  it('plans from semantic treatment evidence without a named video-type decision', async () => {
    const generate = vi.fn<
      Parameters<PhysicalCaptureDesignGenerator>,
      ReturnType<PhysicalCaptureDesignGenerator>
    >().mockResolvedValue({
      result: output(),
      cacheStatus: 'hit',
      modelName: 'gemini-test',
    });

    const result = await planPhysicalCaptureDesign({
      treatment: mixedPresenterCutawayTreatment,
      sourceDocument: sourceDocument(),
    }, {
      generate,
      knowledge: { loadCreativeGraph: graphFixture },
    });

    expect(result.design.knowledge).toEqual({
      adapterVersion: 1,
      graphVersion: '3.0-capture-test',
      evidenceIds: ['constraint:continuity.eye_line'],
    });
    expect(result.design.coverageIntents[0]).not.toHaveProperty('videoType');
    expect(result.design.coverageIntents[0]).not.toHaveProperty('lens');
    const generationInput = generate.mock.calls[0]?.[0];
    expect(generationInput?.prompt).toContain('capture_host_opening');
    expect(generationInput?.prompt).toContain('event_host_claim');
    expect(generationInput?.systemInstruction).toContain('Do not classify the video');
    expect(generationInput?.systemInstruction).not.toContain('constraint:temporal.cut_mid_word');
    expect(generationInput?.systemInstruction).not.toContain('constraint:accessibility.missing_captions');
    expect(generationInput?.systemInstruction).not.toContain('constraint:sound.platypus_marmalade');
  });

  it('does not invoke a model when the treatment needs no physical capture', async () => {
    const generate = vi.fn<
      Parameters<PhysicalCaptureDesignGenerator>,
      ReturnType<PhysicalCaptureDesignGenerator>
    >();

    await expect(planPhysicalCaptureDesign({
      treatment: abstractExplainerTreatment,
      sourceDocument: sourceDocument(),
    }, {
      generate,
      knowledge: { loadCreativeGraph: graphFixture },
    })).rejects.toMatchObject({ code: 'no_physical_capture' });
    expect(generate).not.toHaveBeenCalled();
  });

  it('queries knowledge from the acquisition-resolved physical requirement', () => {
    const treatment = parseVideoTreatment({
      ...mixedPresenterCutawayTreatment,
      audiovisualIntent: {
        ...mixedPresenterCutawayTreatment.audiovisualIntent,
        physicalCapture: 'unspecified',
      },
      captureRequirements: mixedPresenterCutawayTreatment.captureRequirements.map((requirement) => ({
        ...requirement,
        captureKind: 'unspecified' as const,
        requiredCapabilities: [],
      })),
    });
    const physicalRequirements = treatment.captureRequirements.map((requirement) => ({
      ...requirement,
      objective: `${requirement.objective} Preserve zebracalibration evidence.`,
      captureKind: 'physical-camera' as const,
      requiredCapabilities: ['camera' as const],
      unresolvedCapabilityQuestions: [],
    }));

    const knowledge = resolvePhysicalCaptureKnowledge({
      treatment,
      physicalRequirements,
    }, { loadCreativeGraph: resolvedRequirementGraphFixture });

    expect(knowledge.evidence.map((entry) => entry.id)).toEqual([
      'constraint:capture.zebra_calibration',
    ]);
  });

  it('plans a physical path selected through the document-bound acquisition decision', async () => {
    const undecidedTreatment = parseVideoTreatment({
      ...mixedPresenterCutawayTreatment,
      audiovisualIntent: {
        ...mixedPresenterCutawayTreatment.audiovisualIntent,
        physicalCapture: 'unspecified',
      },
      captureRequirements: mixedPresenterCutawayTreatment.captureRequirements.map((requirement) => ({
        ...requirement,
        objective: `${requirement.objective} Preserve zebracalibration evidence.`,
        captureKind: 'unspecified',
        requiredCapabilities: [],
      })),
    });
    const acquisitionDecisions = createCaptureAcquisitionDecisionSet({
      treatment: undecidedTreatment,
      sourceDocument: sourceDocument(),
      sourceLedger,
      decidedBy: 'user_capture_design',
      decidedAt: new Date('2026-08-26T00:00:00.000Z'),
      decisions: [{
        requirementId: 'capture_host_opening',
        acquisitionKind: 'physical-camera',
        requiredCapabilities: ['performer', 'camera', 'space', 'audio', 'lighting'],
      }],
    });
    const generate = vi.fn<
      Parameters<PhysicalCaptureDesignGenerator>,
      ReturnType<PhysicalCaptureDesignGenerator>
    >().mockResolvedValue({
      result: {
        ...output(),
        knowledgeRefs: ['constraint:capture.zebra_calibration'],
      },
      cacheStatus: 'hit',
      modelName: 'gemini-test',
    });

    const result = await planPhysicalCaptureDesign({
      treatment: undecidedTreatment,
      sourceDocument: sourceDocument(),
      acquisitionDecisions,
    }, {
      generate,
      knowledge: { loadCreativeGraph: resolvedRequirementGraphFixture },
    });

    expect(result.design.acquisitionDecisionSetHash).toBe(acquisitionDecisions.decisionSetHash);
    expect(result.design.knowledge.evidenceIds).toEqual(['constraint:capture.zebra_calibration']);
    expect(generate.mock.calls[0]?.[0].systemInstruction).toContain('constraint:capture.zebra_calibration');
    expect(generate).toHaveBeenCalledOnce();
  });

  it('fails closed when the canonical creative graph is unavailable', async () => {
    await expect(planPhysicalCaptureDesign({
      treatment: mixedPresenterCutawayTreatment,
      sourceDocument: sourceDocument(),
    }, {
      knowledge: { loadCreativeGraph: () => null },
    })).rejects.toBeInstanceOf(PhysicalCaptureKnowledgeError);
  });

  it('performs one bounded recovery for a provider-truncated object', async () => {
    const generate = vi.fn<
      Parameters<PhysicalCaptureDesignGenerator>,
      ReturnType<PhysicalCaptureDesignGenerator>
    >()
      .mockRejectedValueOnce(lengthError())
      .mockResolvedValueOnce({ result: output(), cacheStatus: 'inline', modelName: 'gemini-test' });

    const result = await planPhysicalCaptureDesign({
      treatment: mixedPresenterCutawayTreatment,
      sourceDocument: sourceDocument(),
    }, {
      generate,
      knowledge: { loadCreativeGraph: graphFixture },
    });

    expect(result.recoveryAttempted).toBe(true);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1]?.[0].prompt).toContain('<length_recovery>');
  });

  it('surfaces repeated truncation instead of accepting partial coverage', async () => {
    const generate = vi.fn<
      Parameters<PhysicalCaptureDesignGenerator>,
      ReturnType<PhysicalCaptureDesignGenerator>
    >()
      .mockRejectedValueOnce(lengthError())
      .mockRejectedValueOnce(lengthError());

    await expect(planPhysicalCaptureDesign({
      treatment: mixedPresenterCutawayTreatment,
      sourceDocument: sourceDocument(),
    }, {
      generate,
      knowledge: { loadCreativeGraph: graphFixture },
    })).rejects.toEqual(expect.objectContaining<Partial<PhysicalCaptureDesignPlannerError>>({
      code: 'response_truncated',
    }));
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it('rejects model-authored event IDs that are outside the approved treatment', async () => {
    const generate = vi.fn<
      Parameters<PhysicalCaptureDesignGenerator>,
      ReturnType<PhysicalCaptureDesignGenerator>
    >().mockResolvedValue({
      result: {
        ...output(),
        coverageIntents: [{ ...output().coverageIntents[0], linkedEventIds: ['event_invented'] }],
      },
      cacheStatus: 'hit',
      modelName: 'gemini-test',
    });

    await expect(planPhysicalCaptureDesign({
      treatment: mixedPresenterCutawayTreatment,
      sourceDocument: sourceDocument(),
    }, {
      generate,
      knowledge: { loadCreativeGraph: graphFixture },
    })).rejects.toThrow('unknown_visual_event');
  });
});
