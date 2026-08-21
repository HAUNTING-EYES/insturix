import { describe, expect, it } from 'vitest';

import {
  buildTreatmentCapturePlan,
} from '@/lib/thinkforge/production/semantic-capture-plan';
import {
  buildScriptShotPlan,
} from '@/lib/thinkforge/production/build-script-shot-plan';
import {
  parseProductionCapabilityProfile,
} from '@/lib/thinkforge/production/production-capability-profile';
import {
  createApprovedShootKitSnapshot,
  verifyApprovedShootKitSnapshot,
} from '@/lib/thinkforge/production/shoot-kit-snapshot';
import {
  materializeScriptSidecarV3,
  ScriptWriterSidecarV3ModelSchema,
} from '@/lib/thinkforge/schemas/script-sidecar-v3';
import {
  abstractExplainerTreatment,
  mixedPresenterCutawayTreatment,
  productDemonstrationTreatment,
  unknownSetupTreatment,
} from '@/tests/fixtures/thinkforge-video-treatment';

function sidecarFor(treatment: typeof mixedPresenterCutawayTreatment, eventIds: string[]) {
  return materializeScriptSidecarV3({
    treatment,
    identityPolicy: { mode: 'ordinary' },
    modelSidecar: ScriptWriterSidecarV3ModelSchema.parse({
      sidecarVersion: 3,
      spokenTextSource: 'beat-lines',
      characters: [{ id: 'model_host', name: 'Host', role: 'host' }],
      acts: [{
        id: 'model_act',
        title: 'Opening',
        narrativePurpose: 'Connect the opening claim to the supporting evidence.',
        narrativeScenes: [{
          id: 'model_scene',
          title: 'Opening claim',
          narrativePurpose: 'Let the host establish the claim while evidence can appear alongside it.',
          durationIntentSeconds: 12,
          charactersPresent: ['model_host'],
          sourceRefs: ['src_brief'],
          beats: [{
            id: 'model_beat',
            kind: 'mixed',
            narrativePurpose: 'State the claim and reveal the useful evidence at the same narrative moment.',
            durationIntentSeconds: 12,
            lines: [{
              id: 'model_line',
              text: 'The visible delay starts before the handoff that caused it.',
              speakerId: 'model_host',
              languageCode: 'en',
              onCamera: true,
              delivery: 'sync-dialogue',
              sourceRefs: ['src_brief'],
            }],
            treatmentVisualEvents: eventIds.map((treatmentEventId) => ({ treatmentEventId })),
            sourceRefs: ['src_brief'],
          }],
        }],
      }],
      sourceRefs: ['src_brief'],
    }),
  });
}

function confirmedProfile() {
  return parseProductionCapabilityProfile({
    version: 1,
    profileId: 'profile_confirmed',
    spaces: [{ id: 'studio', label: 'Confirmed studio', noiseFloor: 'quiet' }],
    equipment: [
      {
        id: 'camera_phone', label: 'Phone camera', category: 'camera', kind: 'phone',
        availability: 'owned', preferred: true, orientations: ['landscape', 'portrait'], stabilization: ['tripod'],
      },
      {
        id: 'audio_lav', label: 'Wired lavalier', category: 'audio', kind: 'wired-lav',
        availability: 'owned', preferred: true,
      },
      {
        id: 'light_panel', label: 'LED panel', category: 'light', kind: 'led-panel', availability: 'owned',
      },
    ],
    people: { performersAvailable: 1, cameraOperatorsAvailable: 0, assistantsAvailable: 0, selfShoot: true },
    constraints: {
      currency: 'USD', maxIncrementalSpend: 0, rentalAllowed: false, purchaseAllowed: false,
      maxLocationChanges: 0, transportMode: 'none', accessibility: [], safety: [],
    },
    preferences: { defaultPlanTier: 'no-spend', prioritize: ['cost'], householdSubstitutionsAllowed: false },
    provenance: {},
  });
}

describe('semantic V3 capture projection', () => {
  it('returns no physical capture for a graphics-led treatment without reading a camera profile', () => {
    const sidecar = sidecarFor(abstractExplainerTreatment, ['event_system_map']);

    const plan = buildTreatmentCapturePlan({ sidecar, treatment: abstractExplainerTreatment });

    expect(plan.status).toBe('no-physical-capture');
    expect(plan.physicalCaptureRequirements).toEqual([]);
    expect(plan.nonPhysicalAcquisitionRequirements).toEqual([]);
    expect(JSON.stringify(plan)).not.toContain('coordinateSystem');
    expect(JSON.stringify(plan)).not.toContain('setupGroups');
    expect(JSON.stringify(plan)).not.toContain('totalIncrementalCost');
  });

  it('keeps only the host capture requirement for a presenter and cutaway moment', () => {
    const sidecar = sidecarFor(mixedPresenterCutawayTreatment, ['event_host_claim', 'event_process_cutaway']);

    const plan = buildTreatmentCapturePlan({ sidecar, treatment: mixedPresenterCutawayTreatment });

    expect(plan.status).toBe('needs-capture-calibration');
    expect(plan.physicalCaptureRequirements).toHaveLength(1);
    expect(plan.physicalCaptureRequirements[0]).toMatchObject({
      id: 'capture_host_opening',
      linkedNarrativeMoments: [expect.objectContaining({ eventId: 'event_host_claim' })],
    });
    expect(plan.physicalCaptureRequirements[0]?.linkedNarrativeMoments.map((moment) => moment.eventId))
      .not.toContain('event_process_cutaway');
    expect(plan.calibrationQuestions).toContain('Which device, room, and audio setup are available for the host?');
  });

  it('becomes a capture brief only after each declared capability is confirmed and no question remains', () => {
    const treatment = structuredClone(mixedPresenterCutawayTreatment);
    treatment.captureRequirements[0]!.unresolvedCapabilityQuestions = [];
    const sidecar = sidecarFor(treatment, ['event_host_claim', 'event_process_cutaway']);

    const plan = buildTreatmentCapturePlan({ sidecar, treatment, profile: confirmedProfile() });

    expect(plan.status).toBe('capture-brief-ready');
    expect(plan.calibrationQuestions).toEqual([]);
    expect(plan.physicalCaptureRequirements[0]?.capabilityEvidence.every((entry) => entry.status === 'confirmed')).toBe(true);
  });

  it('requires an explicit acquisition decision instead of treating ambiguous product evidence as a camera shoot', () => {
    const sidecar = sidecarFor(productDemonstrationTreatment, ['event_workflow_proof']);

    const plan = buildTreatmentCapturePlan({ sidecar, treatment: productDemonstrationTreatment });

    expect(plan.status).toBe('needs-acquisition-decision');
    expect(plan.physicalCaptureRequirements).toEqual([]);
    expect(plan.unclassifiedRequirements.map((requirement) => requirement.id)).toEqual(['capture_real_workflow']);
  });

  it('fails closed when a saved V3 sidecar no longer matches the treatment it claims to use', () => {
    const sidecar = sidecarFor(unknownSetupTreatment, ['event_unmeasured_host']);
    sidecar.treatment.inputFingerprint = 'tampered_fingerprint';

    expect(() => buildTreatmentCapturePlan({ sidecar, treatment: unknownSetupTreatment })).toThrow(
      /video_treatment_binding_mismatch/,
    );
  });

  it('routes V3 through semantic capture projection rather than the legacy camera resolver', () => {
    const sidecar = sidecarFor(abstractExplainerTreatment, ['event_system_map']);

    const result = buildScriptShotPlan({
      sidecar,
      videoTreatment: abstractExplainerTreatment,
      aspectRatio: '16:9',
    });

    expect(result).toMatchObject({ status: 'capture-projection', plan: null, issues: [] });
    if (result.status !== 'capture-projection') throw new Error('Expected a V3 capture projection');
    expect(result.capturePlan.status).toBe('no-physical-capture');
    expect(JSON.stringify(result.capturePlan)).not.toContain('coordinateSystem');
  });

  it('fails closed instead of treating a V3 script as a V2 shot plan when its treatment is unavailable', () => {
    const sidecar = sidecarFor(abstractExplainerTreatment, ['event_system_map']);

    expect(buildScriptShotPlan({ sidecar, aspectRatio: '16:9' })).toMatchObject({
      status: 'needs-user-input',
      plan: null,
      issues: [expect.objectContaining({ code: 'missing_video_treatment' })],
    });
  });

  it('keeps a semantic capture brief in the document-bound approval snapshot', () => {
    const treatment = structuredClone(mixedPresenterCutawayTreatment);
    treatment.captureRequirements[0]!.unresolvedCapabilityQuestions = [];
    const capturePlan = buildTreatmentCapturePlan({
      sidecar: sidecarFor(treatment, ['event_host_claim', 'event_process_cutaway']),
      treatment,
      profile: confirmedProfile(),
    });
    const snapshot = createApprovedShootKitSnapshot({
      sessionId: 'session_1',
      scriptId: 'script_1',
      sourceDocument: {
        version: 1,
        contentHash: 'a'.repeat(64),
        sidecarHash: 'b'.repeat(64),
      },
      profile: confirmedProfile(),
      settings: { aspectRatio: '16:9', tier: 'no-spend' },
      plan: capturePlan,
      approvedBy: 'user_1',
      approvedAt: new Date('2026-08-22T00:00:00.000Z'),
    });

    expect(snapshot.plan).toMatchObject({ kind: 'treatment-capture-plan', status: 'capture-brief-ready' });
    expect(verifyApprovedShootKitSnapshot({
      snapshot,
      sessionId: 'session_1',
      scriptId: 'script_1',
      documentVersion: 1,
      documentHash: 'a'.repeat(64),
      sidecarHash: 'b'.repeat(64),
    })).toMatchObject({ current: true });
  });
});
