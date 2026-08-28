import { describe, expect, it } from 'vitest';

import {
  createCaptureAcquisitionDecisionSet,
  createCaptureAcquisitionSourceDocument,
} from '@/lib/thinkforge/production/capture-acquisition-decisions';
import {
  materializePhysicalCaptureDesign,
  PhysicalCaptureDesignError,
  verifyPhysicalCaptureDesign,
} from '@/lib/thinkforge/schemas/physical-capture-design';
import { parseVideoTreatment } from '@/lib/thinkforge/schemas/video-treatment';
import { mixedPresenterCutawayTreatment } from '@/tests/fixtures/thinkforge-video-treatment';

const sourceLedger = {
  ledgerVersion: 1 as const,
  entries: [{
    referenceId: 'src_brief',
    kind: 'user_brief' as const,
    title: 'Approved creative brief',
    summary: 'Show the physical object without a visible person.',
    sourceId: 'brief_user',
    confidence: 1,
    provenance: { origin: 'user_prompt' as const, sessionId: 'session_capture_design' },
  }],
};

const captureKnowledge = {
  adapterVersion: 1,
  graphVersion: '3.0-test',
  evidenceIds: ['signal:shot_scale', 'technique.camera.static-observation'],
};

function sourceDocument() {
  return createCaptureAcquisitionSourceDocument({
    version: 3,
    contentHash: 'a'.repeat(64),
    sidecarHash: 'b'.repeat(64),
    sourceLedger,
  });
}

const silentObjectTreatment = parseVideoTreatment({
  ...mixedPresenterCutawayTreatment,
  treatmentId: 'treatment_silent_object',
  audiovisualIntent: {
    version: 1,
    audibleSpeech: 'forbidden',
    onCameraSpeech: 'forbidden',
    visiblePerson: 'forbidden',
    physicalCapture: 'required',
  },
  captureRequirements: [{
    id: 'capture_object_motion',
    objective: 'Record the approved physical object changing state.',
    whyRequired: 'The audience must see the real mechanism rather than a simulated claim.',
    subjectOrEvidence: 'The approved physical object.',
    captureKind: 'physical-camera',
    requiredCapabilities: ['camera', 'space', 'lighting'],
    sourceRefs: ['src_brief'],
    creativeReferenceIds: [],
    constraints: ['No visible person and no invented product behavior.'],
    unresolvedCapabilityQuestions: ['Which camera, surface, and controllable light are available?'],
  }],
  visualEvents: [{
    id: 'event_object_motion',
    momentId: 'moment_object_proof',
    audienceJob: 'Let the viewer verify the physical change.',
    visualThesis: 'Keep attention on the state change and the evidence that proves it.',
    visiblePerson: 'forbidden',
    audioRelationship: 'replace',
    timingNote: 'The change begins only after the initial state is visually legible.',
    continuityNotes: ['Preserve the object orientation across the state change.'],
    sourceRefs: ['src_brief'],
    creativeReferenceIds: [],
    brandConstraints: ['Use the accepted brand treatment without obscuring the proof.'],
    accessibilityRequirements: ['The state change must remain understandable without sound.'],
    captureRequirementIds: ['capture_object_motion'],
  }],
  decisionTrace: {
    ...mixedPresenterCutawayTreatment.decisionTrace,
    inputFingerprint: 'silent_object_fingerprint',
  },
});

function silentObjectOutput() {
  return {
    globalCaptureStrategy: 'Preserve a readable before-and-after state while keeping the real object as the only visual subject.',
    coverageIntents: [{
      requirementId: 'capture_object_motion',
      linkedEventIds: ['event_object_motion'],
      narrativeObjective: 'Prove the physical change without relying on narration or a presenter.',
      subjectDescription: 'The approved object and its visible state indicators.',
      subjectAction: 'The object changes from its approved initial state to its approved result state.',
      compositionPurpose: 'Keep the initial state, change, and result visually comparable.',
      viewpointPurpose: 'Reveal the mechanism and result without hiding the decisive evidence.',
      cameraBehaviorPurpose: 'Maintain spatial continuity so the state change can be verified.',
      focusPriority: 'The mechanism first, then the resulting state indicator.',
      lightingPurpose: 'Separate the mechanism from the surface while preserving true material appearance.',
      soundPurpose: 'Capture usable natural mechanism sound only if the available environment permits it.',
      continuityConstraints: ['Do not rotate or replace the object between states.'],
      safetyConstraints: ['Do not require unsupported camera movement or unsafe object handling.'],
      sourceRefs: ['src_brief'],
      creativeReferenceIds: [],
    }],
    continuityConstraints: ['The object identity and orientation remain stable.'],
    unresolvedQuestions: ['Which approved object state can be demonstrated safely?'],
    knowledgeRefs: ['signal:shot_scale', 'technique.camera.static-observation'],
  };
}

describe('physical capture design', () => {
  it('supports person-free physical coverage without a named video-type preset', () => {
    const design = materializePhysicalCaptureDesign({
      treatment: silentObjectTreatment,
      sourceDocument: sourceDocument(),
      modelOutput: silentObjectOutput(),
      knowledge: captureKnowledge,
    });

    expect(design.coverageIntents).toHaveLength(1);
    expect(design.coverageIntents[0]).not.toHaveProperty('lens');
    expect(design.coverageIntents[0]).not.toHaveProperty('coordinates');
    expect(design.coverageIntents[0].performancePurpose).toBeUndefined();
    expect(verifyPhysicalCaptureDesign({
      design,
      treatment: silentObjectTreatment,
      sourceDocument: sourceDocument(),
    })).toMatchObject({ current: true });
  });

  it('binds a user-resolved physical acquisition choice and invalidates a changed choice', () => {
    const undecidedTreatment = parseVideoTreatment({
      ...silentObjectTreatment,
      audiovisualIntent: {
        ...silentObjectTreatment.audiovisualIntent,
        physicalCapture: 'unspecified',
      },
      captureRequirements: silentObjectTreatment.captureRequirements.map((requirement) => ({
        ...requirement,
        captureKind: 'unspecified',
        requiredCapabilities: [],
      })),
    });
    const physicalDecision = createCaptureAcquisitionDecisionSet({
      treatment: undecidedTreatment,
      sourceDocument: sourceDocument(),
      sourceLedger,
      decidedBy: 'user_capture_design',
      decidedAt: new Date('2026-08-26T00:00:00.000Z'),
      decisions: [{
        requirementId: 'capture_object_motion',
        acquisitionKind: 'physical-camera',
        requiredCapabilities: ['camera', 'space', 'lighting'],
      }],
    });
    const design = materializePhysicalCaptureDesign({
      treatment: undecidedTreatment,
      sourceDocument: sourceDocument(),
      acquisitionDecisions: physicalDecision,
      modelOutput: silentObjectOutput(),
      knowledge: captureKnowledge,
    });

    expect(design.acquisitionDecisionSetHash).toBe(physicalDecision.decisionSetHash);
    expect(verifyPhysicalCaptureDesign({
      design,
      treatment: undecidedTreatment,
      sourceDocument: sourceDocument(),
      acquisitionDecisions: physicalDecision,
    })).toMatchObject({ current: true });
    expect(verifyPhysicalCaptureDesign({
      design,
      treatment: undecidedTreatment,
      sourceDocument: sourceDocument(),
    })).toMatchObject({ current: false, reason: 'acquisition_decision_mismatch' });
  });

  it('supports human performance only when the treatment actually requires it', () => {
    const design = materializePhysicalCaptureDesign({
      treatment: mixedPresenterCutawayTreatment,
      sourceDocument: sourceDocument(),
      modelOutput: {
        globalCaptureStrategy: 'Hold a credible human connection while the separate conceptual event remains non-physical.',
        coverageIntents: [{
          requirementId: 'capture_host_opening',
          linkedEventIds: ['event_host_claim'],
          narrativeObjective: 'Let the opening claim land with direct human credibility.',
          subjectDescription: 'The selected spokesperson.',
          subjectAction: 'Deliver the approved opening claim to the audience.',
          compositionPurpose: 'Prioritize expression and a stable eye line.',
          viewpointPurpose: 'Create direct audience connection without overstating intimacy.',
          cameraBehaviorPurpose: 'Avoid movement that distracts from the claim.',
          focusPriority: 'Eyes and facial expression.',
          lightingPurpose: 'Keep expression readable within the confirmed available setup.',
          soundPurpose: 'Record intelligible sync speech using confirmed available audio equipment.',
          performancePurpose: 'Deliver the claim with credible restraint.',
          continuityConstraints: ['Preserve eye line when returning from the conceptual counterpoint.'],
          safetyConstraints: [],
          sourceRefs: [],
          creativeReferenceIds: [],
        }],
        continuityConstraints: ['Return to the same human relationship after the cutaway.'],
        unresolvedQuestions: ['Which confirmed capture setup is available?'],
        knowledgeRefs: [],
      },
      knowledge: { adapterVersion: 1, graphVersion: '3.0-test', evidenceIds: [] },
    });

    expect(design.coverageIntents[0].performancePurpose).toContain('credible restraint');
  });

  it('rejects omitted or mismatched treatment coverage', () => {
    const output = silentObjectOutput();

    expect(() => materializePhysicalCaptureDesign({
      treatment: silentObjectTreatment,
      sourceDocument: sourceDocument(),
      modelOutput: { ...output, coverageIntents: [] },
      knowledge: captureKnowledge,
    })).toThrow();
    expect(() => materializePhysicalCaptureDesign({
      treatment: silentObjectTreatment,
      sourceDocument: sourceDocument(),
      modelOutput: {
        ...output,
        coverageIntents: [{ ...output.coverageIntents[0], linkedEventIds: ['event_process_cutaway'] }],
      },
      knowledge: captureKnowledge,
    })).toThrow(PhysicalCaptureDesignError);
  });

  it('rejects invented provenance and invalidates stale or tampered artifacts', () => {
    const output = silentObjectOutput();
    expect(() => materializePhysicalCaptureDesign({
      treatment: silentObjectTreatment,
      sourceDocument: sourceDocument(),
      modelOutput: {
        ...output,
        coverageIntents: [{ ...output.coverageIntents[0], sourceRefs: ['src_invented'] }],
      },
      knowledge: captureKnowledge,
    })).toThrow(PhysicalCaptureDesignError);
    expect(() => materializePhysicalCaptureDesign({
      treatment: silentObjectTreatment,
      sourceDocument: sourceDocument(),
      modelOutput: { ...output, knowledgeRefs: ['technique:invented'] },
      knowledge: captureKnowledge,
    })).toThrow(PhysicalCaptureDesignError);

    const design = materializePhysicalCaptureDesign({
      treatment: silentObjectTreatment,
      sourceDocument: sourceDocument(),
      modelOutput: output,
      knowledge: captureKnowledge,
    });
    expect(verifyPhysicalCaptureDesign({
      design: { ...design, globalCaptureStrategy: 'Tampered strategy.' },
      treatment: silentObjectTreatment,
      sourceDocument: sourceDocument(),
    })).toMatchObject({ current: false, reason: 'design_hash_mismatch' });
    expect(verifyPhysicalCaptureDesign({
      design,
      treatment: silentObjectTreatment,
      sourceDocument: { ...sourceDocument(), contentHash: 'c'.repeat(64) },
    })).toMatchObject({ current: false, reason: 'source_document_mismatch' });
  });
});
