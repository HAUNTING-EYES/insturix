import { describe, expect, it, vi } from 'vitest';

import type { GraphIndex } from '@/lib/editron/services/graph-query';
import { hashJsonArtifact } from '@/lib/thinkforge/persistence/script-sidecar-binding';
import { createCaptureAcquisitionSourceDocument } from '@/lib/thinkforge/production/capture-acquisition-decisions';
import { parseProductionCapabilityProfile } from '@/lib/thinkforge/production/production-capability-profile';
import {
  resolveTechnicalCapturePlan,
  type TechnicalCapturePlanGenerator,
} from '@/lib/thinkforge/production/technical-capture-plan-resolver';
import {
  createApprovedTechnicalCaptureSnapshot,
  verifyApprovedTechnicalCaptureSnapshot,
} from '@/lib/thinkforge/schemas/capture-calibration-approval';
import { materializePhysicalCaptureDesign } from '@/lib/thinkforge/schemas/physical-capture-design';
import {
  materializeTechnicalCapturePlan,
  TechnicalCapturePlanError,
  TechnicalCapturePlanModelOutputSchema,
  TechnicalCapturePlanSchema,
} from '@/lib/thinkforge/schemas/technical-capture-plan';
import { unknownSetupTreatment } from '@/tests/fixtures/thinkforge-video-treatment';

const sourceLedger = { ledgerVersion: 1 as const, entries: [] };
const sourceDocument = createCaptureAcquisitionSourceDocument({
  version: 3,
  contentHash: 'a'.repeat(64),
  sidecarHash: 'b'.repeat(64),
  sourceLedger,
});

const profile = parseProductionCapabilityProfile({
  version: 1,
  profileId: 'profile_confirmed',
  spaces: [{
    id: 'space_office',
    label: 'Confirmed office',
    backgrounds: [],
    naturalLightSources: [{ id: 'window_north', kind: 'window', direction: 'north', controllable: true }],
    powerAvailable: true,
    noiseFloor: 'quiet',
    constraints: [],
  }],
  equipment: [{
    id: 'camera_phone', label: 'Confirmed phone', quantity: 1, availability: 'owned', preferred: true,
    estimatedIncrementalCost: 0, costBasis: 'none', notes: [], category: 'camera', kind: 'phone',
    orientations: ['landscape', 'portrait'], stabilization: ['electronic', 'tripod'],
  }, {
    id: 'support_tripod', label: 'Confirmed tripod', quantity: 1, availability: 'owned', preferred: true,
    estimatedIncrementalCost: 0, costBasis: 'none', notes: [], category: 'support', kind: 'tripod',
  }, {
    id: 'light_panel', label: 'Confirmed LED panel', quantity: 1, availability: 'owned', preferred: true,
    estimatedIncrementalCost: 0, costBasis: 'none', notes: [], category: 'light', kind: 'led-panel',
    dimmable: true, batteryPowered: false,
  }, {
    id: 'audio_lav', label: 'Confirmed wired lav', quantity: 1, availability: 'owned', preferred: true,
    estimatedIncrementalCost: 0, costBasis: 'none', notes: [], category: 'audio', kind: 'wired-lav',
    wireless: false, maxSubjects: 1,
  }],
  people: { performersAvailable: 1, cameraOperatorsAvailable: 0, assistantsAvailable: 0, selfShoot: true },
  constraints: {
    currency: 'USD', maxIncrementalSpend: 0, rentalAllowed: false, purchaseAllowed: false,
    maxLocationChanges: 0, transportMode: 'none', accessibility: [], safety: [],
  },
  preferences: { defaultPlanTier: 'no-spend', prioritize: ['cost', 'setup-time'], householdSubstitutionsAllowed: false },
  provenance: {},
});

function captureIntent(overrides: Record<string, unknown> = {}) {
  return {
    requirementId: 'capture_unmeasured_host', linkedEventIds: ['event_unmeasured_host'],
    narrativeObjective: 'Create a credible direct opening.', subjectDescription: 'The selected host.',
    subjectAction: 'Deliver the approved opening.', compositionPurpose: 'Prioritize expression.',
    viewpointPurpose: 'Create direct audience connection.', cameraBehaviorPurpose: 'Keep attention on the claim.',
    focusPriority: 'Eyes and expression.', lightingPurpose: 'Keep expression readable.',
    soundPurpose: 'Capture intelligible synchronized speech.', performancePurpose: 'Use credible restraint.',
    continuityConstraints: ['Preserve the audience relationship.'], safetyConstraints: [],
    sourceRefs: [], creativeReferenceIds: [],
    ...overrides,
  };
}

function captureDesign(input: { intentCount?: number; unresolvedQuestions?: string[] } = {}) {
  return materializePhysicalCaptureDesign({
    treatment: unknownSetupTreatment,
    sourceDocument,
    knowledge: { adapterVersion: 1, graphVersion: '3.0-test', evidenceIds: [] },
    modelOutput: {
      globalCaptureStrategy: 'Use one confirmed human setup for the opening connection.',
      coverageIntents: Array.from({ length: input.intentCount ?? 1 }, (_, index) => captureIntent({
        narrativeObjective: `Create credible direct opening coverage ${index + 1}.`,
      })),
      continuityConstraints: ['Keep the opening visually coherent.'],
      unresolvedQuestions: input.unresolvedQuestions ?? [],
      knowledgeRefs: [],
    },
  });
}

const design = captureDesign();

function checks() {
  return ['framing', 'focus', 'stability', 'lighting', 'sound', 'performance', 'continuity', 'safety'].map(
    (category) => ({
      category,
      instruction: `Perform the ${category} check using live preview or playback.`,
      passCondition: `The ${category} requirement is visibly or audibly satisfied.`,
    }),
  );
}

function technicalSetup(overrides: Record<string, unknown> = {}) {
  return {
    coverageIntentIds: ['coverage_1'], cameraId: 'camera_phone', spaceId: 'space_office',
    supportIds: ['support_tripod'], lightIds: ['light_panel'], naturalLightSourceIds: [],
    modifierIds: [], audioId: 'audio_lav', accessoryIds: [], orientation: 'landscape',
    cameraOperation: 'fixed-support', framingInstruction: 'Adjust the live preview until expression is clear and the intended background context remains legible.',
    viewpointInstruction: 'Keep the confirmed camera aligned with the intended direct audience relationship.',
    cameraBehaviorInstruction: 'Lock the confirmed camera on the tripod for the opening.',
    focusInstruction: 'Confirm the host eyes remain sharp during a short rehearsal.',
    lightingInstruction: 'Adjust the confirmed panel while watching the face until expression is readable without harsh reflections.',
    soundInstruction: 'Record and play back a short lav test in the confirmed room.',
    performanceInstruction: 'Rehearse the opening with credible restraint and a stable eye line.',
    safetyInstructions: ['Confirm the tripod and cable do not obstruct the performer path.'],
    calibrationChecks: checks(),
    ...overrides,
  };
}

function technicalOutput(overrides: Record<string, unknown> = {}) {
  return {
    overallApproach: 'Use the confirmed no-spend setup and calibrate every observable condition before recording.',
    setups: [technicalSetup()],
    unresolvedQuestions: [],
    knowledgeRefs: ['constraint:continuity.eye_line'],
    ...overrides,
  };
}

function calibrationConfirmations(plan: ReturnType<typeof materializeTechnicalCapturePlan>) {
  return plan.setups.flatMap((setup) => setup.calibrationChecks.map((check) => ({
    setupId: setup.id, checkId: check.id, category: check.category, status: 'passed' as const,
    method: check.category === 'sound' ? 'test-recording' as const : 'live-preview' as const,
  })));
}

function graphFixture(): GraphIndex {
  return {
    version: '3.0-technical-test',
    techniques: new Map([['technique:camera-movement.static', {
      id: 'technique:camera-movement.static', type: 'Technique', category: 'camera-movement',
      name: 'Static observation', summary: 'Use stable coverage when movement would distract.',
      details: { what: '', feels: '', parameters: {}, edlDecisionType: '', neverUseWhen: ['The subject must leave frame.'], duration: '' },
      tags: ['stable'], sourceLines: [1, 2],
    }]]),
    constraints: new Map([['constraint:continuity.eye_line', {
      id: 'constraint:continuity.eye_line', type: 'Constraint', category: 'continuity',
      name: 'Eye-line continuity', summary: 'Preserve a coherent audience relationship.',
      details: { rule: 'Keep the audience relationship coherent.', detection: '', threshold: '', autoCorrection: '', severity: 'warning', appliesTo: [], rationale: 'Orientation supports comprehension.' },
      tags: ['continuity'], sourceLines: [3, 4],
    }]]),
  } as unknown as GraphIndex;
}

describe('technical capture planning and calibration', () => {
  it('materializes only confirmed resources and beginner-readable checks', () => {
    const plan = materializeTechnicalCapturePlan({
      design, profile, aspectRatio: '16:9',
      knowledge: { adapterVersion: 1, graphVersion: '3.0-test', evidenceIds: ['constraint:continuity.eye_line'] },
      modelOutput: technicalOutput(),
    });

    expect(plan.totalIncrementalCost).toBe(0);
    expect(plan).toMatchObject({
      version: 2,
      totalEstimatedSetupMinutes: 7,
      setupChangeCount: 0,
      locationChangeCount: 0,
    });
    expect(plan.setups[0].estimatedSetupMinutes).toBe(7);
    expect(plan.setups[0]).not.toHaveProperty('coordinates');
    expect(plan.setups[0].framingInstruction).toContain('live preview');
    expect(TechnicalCapturePlanSchema.safeParse({ ...plan, version: 999 }).success).toBe(false);
  });

  it('rejects invented resources and missing feasibility checks', () => {
    expect(() => materializeTechnicalCapturePlan({
      design, profile, aspectRatio: '16:9',
      knowledge: { adapterVersion: 1, graphVersion: '3.0-test', evidenceIds: ['constraint:continuity.eye_line'] },
      modelOutput: technicalOutput({
        setups: [{ ...technicalOutput().setups[0], cameraId: 'camera_invented', calibrationChecks: checks().filter((check) => check.category !== 'sound') }],
      }),
    })).toThrow(TechnicalCapturePlanError);
  });

  it('requires every live calibration and a playback-based sound confirmation before approval', () => {
    const plan = materializeTechnicalCapturePlan({
      design, profile, aspectRatio: '16:9',
      knowledge: { adapterVersion: 1, graphVersion: '3.0-test', evidenceIds: ['constraint:continuity.eye_line'] },
      modelOutput: technicalOutput(),
    });
    const confirmations = calibrationConfirmations(plan);
    const snapshot = createApprovedTechnicalCaptureSnapshot({
      sessionId: 'session_1', scriptId: 'default', sourceDocument, plan, confirmations,
      approvedBy: 'user_1', approvedAt: new Date('2026-08-26T00:00:00.000Z'),
    });
    expect(verifyApprovedTechnicalCaptureSnapshot({
      snapshot, sessionId: 'session_1', scriptId: 'default', sourceDocument, plan,
    })).toMatchObject({ current: true });
    expect(verifyApprovedTechnicalCaptureSnapshot({
      snapshot,
      sessionId: 'session_1',
      scriptId: 'default',
      sourceDocument,
      plan: { ...plan, overallApproach: 'Tampered after approval.' },
    })).toMatchObject({ current: false, reason: 'plan_mismatch' });
    expect(() => createApprovedTechnicalCaptureSnapshot({
      sessionId: 'session_1', scriptId: 'default', sourceDocument, plan,
      confirmations: confirmations.slice(1), approvedBy: 'user_1',
    })).toThrow('missing_confirmation');

    const { snapshotHash: _snapshotHash, ...snapshotBody } = snapshot;
    const invalidBody = {
      ...snapshotBody,
      confirmations: snapshot.confirmations.map((confirmation) => (
        confirmation.category === 'sound'
          ? { ...confirmation, method: 'live-preview' as const }
          : confirmation
      )),
    };
    const forgedInvalidApproval = {
      ...invalidBody,
      snapshotHash: hashJsonArtifact(invalidBody),
    };
    expect(verifyApprovedTechnicalCaptureSnapshot({
      snapshot: forgedInvalidApproval, sessionId: 'session_1', scriptId: 'default', sourceDocument, plan,
    })).toMatchObject({ current: false, reason: 'approval_invalid' });
  });

  it('inherits design questions and blocks calibration approval until they are resolved', () => {
    const unresolvedDesign = captureDesign({
      unresolvedQuestions: ['Confirm whether the selected room can remain quiet during recording.'],
    });
    const plan = materializeTechnicalCapturePlan({
      design: unresolvedDesign, profile, aspectRatio: '16:9',
      knowledge: { adapterVersion: 1, graphVersion: '3.0-test', evidenceIds: ['constraint:continuity.eye_line'] },
      modelOutput: technicalOutput(),
    });

    expect(plan.unresolvedQuestions).toContain('Confirm whether the selected room can remain quiet during recording.');
    expect(() => createApprovedTechnicalCaptureSnapshot({
      sessionId: 'session_1', scriptId: 'default', sourceDocument, plan,
      confirmations: calibrationConfirmations(plan), approvedBy: 'user_1',
    })).toThrow('unresolved_questions_remain');
  });

  it('enforces setup time, setup-change, and location-change ceilings at materialization', () => {
    const knowledge = { adapterVersion: 1, graphVersion: '3.0-test', evidenceIds: ['constraint:continuity.eye_line'] };
    const timeLimitedProfile = parseProductionCapabilityProfile({
      ...profile,
      constraints: { ...profile.constraints, maxSetupMinutes: 6 },
    });
    expect(() => materializeTechnicalCapturePlan({
      design, profile: timeLimitedProfile, aspectRatio: '16:9', knowledge,
      modelOutput: technicalOutput(),
    })).toThrow('setup:0:setup_time_limit_exceeded');

    const multiDesign = captureDesign({ intentCount: 2 });
    const secondSpace = {
      ...profile.spaces[0],
      id: 'space_studio',
      label: 'Confirmed studio',
      naturalLightSources: [{ id: 'window_studio', kind: 'window' as const, direction: 'south' as const, controllable: true }],
    };
    const setupLimitedProfile = parseProductionCapabilityProfile({
      ...profile,
      spaces: [...profile.spaces, secondSpace],
      constraints: { ...profile.constraints, maxSetupChanges: 0, maxLocationChanges: 1 },
    });
    const sameSpaceSetups = [
      technicalSetup({ coverageIntentIds: ['coverage_1'] }),
      technicalSetup({ coverageIntentIds: ['coverage_2'] }),
    ];
    expect(() => materializeTechnicalCapturePlan({
      design: multiDesign, profile: setupLimitedProfile, aspectRatio: '16:9', knowledge,
      modelOutput: technicalOutput({ setups: sameSpaceSetups }),
    })).toThrow('setup_change_limit_exceeded');

    const locationLimitedProfile = parseProductionCapabilityProfile({
      ...profile,
      spaces: [...profile.spaces, secondSpace],
      constraints: { ...profile.constraints, maxSetupChanges: 1, maxLocationChanges: 0 },
    });
    expect(() => materializeTechnicalCapturePlan({
      design: multiDesign, profile: locationLimitedProfile, aspectRatio: '16:9', knowledge,
      modelOutput: technicalOutput({
        setups: [sameSpaceSetups[0], technicalSetup({ coverageIntentIds: ['coverage_2'], spaceId: 'space_studio' })],
      }),
    })).toThrow('location_change_limit_exceeded');
  });

  it('resolves from the full evidence vocabulary without exposing a video-type field', async () => {
    const generate = vi.fn(async (_input: Parameters<TechnicalCapturePlanGenerator>[0]) => ({
      result: TechnicalCapturePlanModelOutputSchema.parse(technicalOutput()),
      cacheStatus: 'hit' as const,
      modelName: 'gemini-test',
    }));
    const result = await resolveTechnicalCapturePlan({ design, profile, aspectRatio: '16:9' }, {
      generate, loadCreativeGraph: graphFixture,
    });

    expect(result.plan.setups[0]).not.toHaveProperty('videoType');
    expect(generate.mock.calls[0]?.[0].systemInstruction).toContain('Never classify the video');
    expect(generate.mock.calls[0]?.[0].prompt).toContain('camera_phone');
  });

  it('rejects an incomplete capability profile before loading knowledge or calling the model', async () => {
    const generate = vi.fn(async (_input: Parameters<TechnicalCapturePlanGenerator>[0]) => ({
      result: TechnicalCapturePlanModelOutputSchema.parse(technicalOutput()),
      cacheStatus: 'hit' as const,
      modelName: 'gemini-test',
    }));
    const loadCreativeGraph = vi.fn(graphFixture);
    const emptyProfile = parseProductionCapabilityProfile({
      ...profile,
      profileId: 'profile_empty',
      spaces: [],
      equipment: [],
      people: { performersAvailable: 0, cameraOperatorsAvailable: 0, assistantsAvailable: 0, selfShoot: false },
    });

    await expect(resolveTechnicalCapturePlan({ design, profile: emptyProfile, aspectRatio: '16:9' }, {
      generate, loadCreativeGraph,
    })).rejects.toMatchObject({ code: 'capability_profile_incomplete' });
    expect(loadCreativeGraph).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });
});
