import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createCaptureAcquisitionDecisionSet,
  createCaptureAcquisitionSourceDocument,
} from '@/lib/thinkforge/production/capture-acquisition-decisions';
import { createThinkForgeWriterContract } from '@/lib/thinkforge/schemas/document-contract';
import { productDemonstrationTreatment } from '@/tests/fixtures/thinkforge-video-treatment';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  buildScriptShotPlan: vi.fn(),
  getScript: vi.fn(),
  getSession: vi.fn(),
  planPhysicalCaptureDesign: vi.fn(),
  requireCurrentPersistedScriptSidecar: vi.fn(),
  resolveTechnicalCapturePlan: vi.fn(),
  createApprovedTechnicalCaptureSnapshot: vi.fn(),
  saveCaptureAcquisitionDecisionSet: vi.fn(),
  saveApprovedShootKitSnapshot: vi.fn(),
  saveApprovedTechnicalCaptureSnapshot: vi.fn(),
  saveTechnicalCapturePlanningArtifacts: vi.fn(),
  setSessionProductionConfiguration: vi.fn(),
  verifyApprovedTechnicalCaptureSnapshot: vi.fn(),
  verifyCurrentTechnicalCapturePlan: vi.fn(),
  verifyPhysicalCaptureDesign: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }));
vi.mock('@/lib/thinkforge/services/db', () => ({
  getScript: mocks.getScript,
  getSession: mocks.getSession,
  saveCaptureAcquisitionDecisionSet: mocks.saveCaptureAcquisitionDecisionSet,
  saveApprovedShootKitSnapshot: mocks.saveApprovedShootKitSnapshot,
  saveApprovedTechnicalCaptureSnapshot: mocks.saveApprovedTechnicalCaptureSnapshot,
  saveTechnicalCapturePlanningArtifacts: mocks.saveTechnicalCapturePlanningArtifacts,
  setSessionProductionConfiguration: mocks.setSessionProductionConfiguration,
}));
vi.mock('@/lib/thinkforge/production/physical-capture-design-planner', () => ({
  planPhysicalCaptureDesign: mocks.planPhysicalCaptureDesign,
}));
vi.mock('@/lib/thinkforge/production/technical-capture-plan-resolver', () => ({
  resolveTechnicalCapturePlan: mocks.resolveTechnicalCapturePlan,
}));
vi.mock('@/lib/thinkforge/schemas/physical-capture-design', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/thinkforge/schemas/physical-capture-design')>();
  return { ...actual, verifyPhysicalCaptureDesign: mocks.verifyPhysicalCaptureDesign };
});
vi.mock('@/lib/thinkforge/schemas/technical-capture-plan', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/thinkforge/schemas/technical-capture-plan')>();
  return { ...actual, verifyCurrentTechnicalCapturePlan: mocks.verifyCurrentTechnicalCapturePlan };
});
vi.mock('@/lib/thinkforge/schemas/capture-calibration-approval', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/thinkforge/schemas/capture-calibration-approval')>();
  return {
    ...actual,
    createApprovedTechnicalCaptureSnapshot: mocks.createApprovedTechnicalCaptureSnapshot,
    verifyApprovedTechnicalCaptureSnapshot: mocks.verifyApprovedTechnicalCaptureSnapshot,
  };
});
vi.mock('@/lib/thinkforge/production/build-script-shot-plan', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/thinkforge/production/build-script-shot-plan')>();
  return {
    ...actual,
    buildScriptShotPlan: mocks.buildScriptShotPlan,
  };
});
vi.mock('@/lib/thinkforge/persistence/script-sidecar-reader', () => ({
  requireCurrentPersistedScriptSidecar: mocks.requireCurrentPersistedScriptSidecar,
  ThinkForgeScriptSidecarAuthorityError: class ThinkForgeScriptSidecarAuthorityError extends Error {},
}));

const profile = {
  version: 1,
  spaces: [],
  equipment: [],
  people: { performersAvailable: 1, cameraOperatorsAvailable: 0, assistantsAvailable: 0, selfShoot: true },
  constraints: {
    currency: 'USD', maxIncrementalSpend: 0, rentalAllowed: false, purchaseAllowed: false,
    maxLocationChanges: 0, transportMode: 'none', accessibility: [], safety: [],
  },
  preferences: { defaultPlanTier: 'no-spend', prioritize: ['cost', 'setup-time'], householdSubstitutionsAllowed: true },
  provenance: {},
};

const videoScriptContract = createThinkForgeWriterContract('video_script');

const sourceLedger = {
  ledgerVersion: 1 as const,
  entries: [{
    referenceId: 'src_brief',
    kind: 'upload' as const,
    title: 'Approved workflow recording',
    summary: 'Approved evidence for the workflow claim.',
    sourceId: 'asset_workflow_1',
    sourceUrl: 'https://assets.example.com/workflow.mp4',
    confidence: 1,
    provenance: { origin: 'user_upload', sessionId: 'session_canonical' },
  }],
};

function acquisitionSourceDocument() {
  return createCaptureAcquisitionSourceDocument({
    version: 3,
    contentHash: 'a'.repeat(64),
    sidecarHash: 'b'.repeat(64),
    sourceLedger,
  });
}

function twoRequirementTreatment() {
  const treatment = structuredClone(productDemonstrationTreatment);
  const originalRequirement = treatment.captureRequirements[0]!;
  const originalEvent = treatment.visualEvents[0]!;
  treatment.captureRequirements.push({
    ...originalRequirement,
    id: 'capture_secondary_workflow',
    objective: 'Capture the approved secondary product workflow.',
    unresolvedCapabilityQuestions: ['Which approved secondary environment can be shown?'],
  });
  treatment.visualEvents.push({
    ...originalEvent,
    id: 'event_secondary_workflow',
    momentId: 'moment_secondary_workflow',
    captureRequirementIds: ['capture_secondary_workflow'],
  });
  return treatment;
}

function noPhysicalCapturePlan() {
  return {
    kind: 'treatment-capture-plan',
    status: 'no-physical-capture',
    physicalCaptureRequirements: [],
    decisionRequests: [],
    calibrationQuestions: [],
  };
}

function physicalCapturePlan() {
  return {
    kind: 'treatment-capture-plan',
    status: 'capture-brief-ready',
    physicalCaptureRequirements: [{ id: 'capture_physical_evidence' }],
    decisionRequests: [],
    calibrationQuestions: [],
  };
}

describe('ThinkForge long-form Shoot Kit route', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.auth.mockResolvedValue({ userId: 'user_1', orgId: 'org_1' });
    mocks.getSession.mockResolvedValue({
      _id: 'session_canonical',
      projectMeta: {
        productionCapabilityProfile: profile,
        productionShotSettings: { aspectRatio: '16:9', tier: 'no-spend' },
      },
    });
    mocks.requireCurrentPersistedScriptSidecar.mockReturnValue({
      readResult: { sourceVersion: 2, sidecar: { sidecarVersion: 2 } },
      rawSidecar: { sidecarVersion: 2 },
      binding: { documentHash: 'a'.repeat(64), sidecarHash: 'b'.repeat(64) },
    });
    mocks.buildScriptShotPlan.mockReturnValue({ status: 'ready', plan: { version: 1 }, issues: [] });
    mocks.saveCaptureAcquisitionDecisionSet.mockResolvedValue({ ok: true, script: {} });
    mocks.saveApprovedTechnicalCaptureSnapshot.mockResolvedValue({ ok: true, script: {} });
    mocks.saveTechnicalCapturePlanningArtifacts.mockResolvedValue({ ok: true, script: {} });
    mocks.setSessionProductionConfiguration.mockResolvedValue({ _id: 'session_canonical' });
    mocks.planPhysicalCaptureDesign.mockResolvedValue({ design: { designId: 'design_1', designHash: 'd'.repeat(64) } });
    mocks.resolveTechnicalCapturePlan.mockResolvedValue({ plan: { planId: 'plan_1', planHash: 'e'.repeat(64) } });
    mocks.verifyPhysicalCaptureDesign.mockReturnValue({ current: false, reason: 'design_invalid' });
    mocks.verifyCurrentTechnicalCapturePlan.mockReturnValue({ current: false, reason: 'plan_invalid' });
    mocks.verifyApprovedTechnicalCaptureSnapshot.mockReturnValue({ current: false, reason: 'snapshot_invalid' });
    mocks.createApprovedTechnicalCaptureSnapshot.mockReturnValue({
      status: 'approved',
      snapshotHash: 'f'.repeat(64),
    });
  });

  it('forwards only the persisted long-form chapter plan into Shoot Kit planning', async () => {
    const chapterPlan = { version: 1, acts: [{ id: 'act_1', chapters: [{ id: 'chapter_1' }] }] };
    mocks.getScript.mockResolvedValue({
      _id: 'script_1',
      content: 'Bound long-form script.',
      contentContract: videoScriptContract,
      metadata: { writerOutput: { longForm: { plan: chapterPlan }, sourceLedger } },
      version: 1,
    });
    mocks.requireCurrentPersistedScriptSidecar.mockReturnValue({
      readResult: { sourceVersion: 3, sidecar: { sidecarVersion: 3 } },
      rawSidecar: { sidecarVersion: 3 },
      binding: { documentHash: 'a'.repeat(64), sidecarHash: 'b'.repeat(64) },
    });
    mocks.buildScriptShotPlan.mockReturnValue({
      status: 'capture-projection',
      plan: null,
      capturePlan: noPhysicalCapturePlan(),
      issues: [],
    });
    const { GET } = await import('@/app/api/services/thinkforge/production/shot-plan/route');

    const response = await GET(new Request(
      'http://localhost/api/services/thinkforge/production/shot-plan?sessionId=session_alias&scriptId=script_1',
    ));

    expect(response.status).toBe(200);
    expect(mocks.getSession).toHaveBeenCalledWith('session_alias', 'user_1', 'org_1');
    expect(mocks.getScript).toHaveBeenCalledWith('session_canonical', 'script_1');
    expect(mocks.buildScriptShotPlan).toHaveBeenCalledWith(expect.objectContaining({
      sidecar: { sidecarVersion: 3 },
      chapterPlan,
      aspectRatio: '16:9',
      tier: 'no-spend',
    }));
  });

  it('returns a V3 semantic capture projection before requiring a legacy physical profile', async () => {
    mocks.getSession.mockResolvedValue({ _id: 'session_canonical', projectMeta: {} });
    mocks.getScript.mockResolvedValue({
      _id: 'script_1',
      content: 'Semantic script.',
      contentContract: videoScriptContract,
      metadata: { writerOutput: { videoTreatment: { treatmentId: 'treatment_1' }, sourceLedger } },
      version: 1,
    });
    mocks.requireCurrentPersistedScriptSidecar.mockReturnValue({
      readResult: { sourceVersion: 3, sidecar: { sidecarVersion: 3 } },
      rawSidecar: { sidecarVersion: 3 },
      binding: { documentHash: 'a'.repeat(64), sidecarHash: 'b'.repeat(64) },
    });
    mocks.buildScriptShotPlan.mockReturnValue({
      status: 'capture-projection',
      plan: null,
      capturePlan: noPhysicalCapturePlan(),
      issues: [],
    });
    const { GET } = await import('@/app/api/services/thinkforge/production/shot-plan/route');

    const response = await GET(new Request(
      'http://localhost/api/services/thinkforge/production/shot-plan?sessionId=session_alias&scriptId=script_1',
    ));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: 'capture-projection',
      profile: null,
      settings: null,
      capturePlan: noPhysicalCapturePlan(),
    });
    expect(mocks.buildScriptShotPlan).toHaveBeenCalledWith(expect.objectContaining({
      sidecar: { sidecarVersion: 3 },
      videoTreatment: { treatmentId: 'treatment_1' },
      profile: null,
      aspectRatio: undefined,
    }));
  });

  it('never approves or snapshots a semantic capture brief as a finished Shoot Kit', async () => {
    mocks.getScript.mockResolvedValue({
      _id: 'script_1',
      content: 'Semantic script requiring physical capture.',
      contentContract: videoScriptContract,
      metadata: { writerOutput: { videoTreatment: { treatmentId: 'treatment_1' }, sourceLedger } },
      version: 1,
    });
    mocks.requireCurrentPersistedScriptSidecar.mockReturnValue({
      readResult: { sourceVersion: 3, sidecar: { sidecarVersion: 3 } },
      rawSidecar: { sidecarVersion: 3 },
      binding: { documentHash: 'a'.repeat(64), sidecarHash: 'b'.repeat(64) },
    });
    mocks.buildScriptShotPlan.mockReturnValue({
      status: 'capture-projection',
      plan: null,
      capturePlan: {
        kind: 'treatment-capture-plan',
        status: 'capture-brief-ready',
        physicalCaptureRequirements: [{ requirementId: 'capture_subject' }],
        decisionRequests: [],
        calibrationQuestions: [],
      },
      issues: [],
    });
    const { POST } = await import('@/app/api/services/thinkforge/production/shot-plan/route');

    const response = await POST(new Request(
      'http://localhost/api/services/thinkforge/production/shot-plan',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionId: 'session_alias',
          scriptId: 'script_1',
          expectedDocumentVersion: 1,
          profile,
          settings: { aspectRatio: '16:9', tier: 'no-spend' },
        }),
      },
    ));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: 'capture-projection',
      approval: { status: 'preview', reason: 'not_approved' },
      capturePlan: { status: 'capture-brief-ready' },
    });
    expect(mocks.setSessionProductionConfiguration).toHaveBeenCalledOnce();
    expect(mocks.saveApprovedShootKitSnapshot).not.toHaveBeenCalled();
  });

  it('fails closed when a V3 script is missing its persisted semantic treatment', async () => {
    mocks.getSession.mockResolvedValue({ _id: 'session_canonical', projectMeta: {} });
    mocks.getScript.mockResolvedValue({
      _id: 'script_1',
      content: 'Semantic script.',
      contentContract: videoScriptContract,
      metadata: { writerOutput: { sourceLedger } },
      version: 1,
    });
    mocks.requireCurrentPersistedScriptSidecar.mockReturnValue({
      readResult: { sourceVersion: 3, sidecar: { sidecarVersion: 3 } },
      rawSidecar: { sidecarVersion: 3 },
      binding: { documentHash: 'a'.repeat(64), sidecarHash: 'b'.repeat(64) },
    });
    mocks.buildScriptShotPlan.mockReturnValue({
      status: 'needs-user-input',
      plan: null,
      issues: [{
        code: 'missing_video_treatment',
        message: 'The saved V3 script is missing its video treatment.',
        questions: ['Regenerate this script.'],
      }],
    });
    const { GET } = await import('@/app/api/services/thinkforge/production/shot-plan/route');

    const response = await GET(new Request(
      'http://localhost/api/services/thinkforge/production/shot-plan?sessionId=session_alias&scriptId=script_1',
    ));

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      reason: 'missing_video_treatment',
      error: 'The saved V3 script is missing its video treatment.',
    });
  });

  it('saves a V3 acquisition choice against the exact current script before rebuilding its capture projection', async () => {
    mocks.getSession.mockResolvedValue({ _id: 'session_canonical', projectMeta: {} });
    mocks.getScript.mockResolvedValue({
      _id: 'script_1',
      content: 'Semantic product demonstration.',
      contentContract: videoScriptContract,
      metadata: { writerOutput: { videoTreatment: productDemonstrationTreatment, sourceLedger } },
      version: 3,
    });
    mocks.requireCurrentPersistedScriptSidecar.mockReturnValue({
      readResult: { sourceVersion: 3, sidecar: { sidecarVersion: 3 } },
      rawSidecar: { sidecarVersion: 3 },
      binding: { documentHash: 'a'.repeat(64), sidecarHash: 'b'.repeat(64) },
    });
    mocks.buildScriptShotPlan.mockReturnValue({
      status: 'capture-projection',
      plan: null,
      capturePlan: noPhysicalCapturePlan(),
      issues: [],
    });
    const { POST } = await import('@/app/api/services/thinkforge/production/shot-plan/route');

    const response = await POST(new Request(
      'http://localhost/api/services/thinkforge/production/shot-plan',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'save-capture-acquisition',
          sessionId: 'session_alias',
          scriptId: 'script_1',
          expectedDocumentVersion: 3,
          expectedAcquisitionDecisionSetHash: null,
          decisions: [{
            requirementId: 'capture_real_workflow',
            acquisitionKind: 'screen-recording',
            requiredCapabilities: [],
            screenTarget: {
              label: 'Approved Insturix workspace',
              captureScope: 'Record the approved import-to-publish workflow only.',
              authorizationConfirmed: true,
            },
          }],
        }),
      },
    ));

    expect(response.status).toBe(200);
    expect(mocks.saveCaptureAcquisitionDecisionSet).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'session_canonical',
      scriptId: 'script_1',
      expectedVersion: 3,
      expectedContent: 'Semantic product demonstration.',
      expectedSidecarHash: 'b'.repeat(64),
      expectedPreviousDecisionSetHash: null,
      decisionSet: expect.objectContaining({
        sourceDocument: acquisitionSourceDocument(),
        treatment: expect.objectContaining({ treatmentId: 'treatment_product_demo' }),
        decisions: [expect.objectContaining({
          requirementId: 'capture_real_workflow',
          acquisitionKind: 'screen-recording',
        })],
      }),
    }));
    const decisionSet = mocks.saveCaptureAcquisitionDecisionSet.mock.calls[0]![0].decisionSet;
    expect(mocks.buildScriptShotPlan).toHaveBeenCalledWith(expect.objectContaining({
      acquisitionDecisions: decisionSet,
      acquisitionDecisionSourceDocument: acquisitionSourceDocument(),
    }));
    expect(await response.json()).toMatchObject({
      acquisitionDecisionSetHash: decisionSet.decisionSetHash,
    });
  });

  it('merges a later acquisition answer with the exact prior verified decision set', async () => {
    const treatment = twoRequirementTreatment();
    const priorDecisionSet = createCaptureAcquisitionDecisionSet({
      treatment,
      sourceDocument: acquisitionSourceDocument(),
      decisions: [{
        requirementId: 'capture_real_workflow',
        acquisitionKind: 'screen-recording',
        requiredCapabilities: [],
        screenTarget: {
          label: 'Approved primary workspace',
          captureScope: 'Record the approved primary workflow only.',
          authorizationConfirmed: true,
        },
      }],
      sourceLedger,
      decidedBy: 'user_1',
      decidedAt: new Date('2026-08-22T00:00:00.000Z'),
    });
    mocks.getSession.mockResolvedValue({ _id: 'session_canonical', projectMeta: {} });
    mocks.getScript.mockResolvedValue({
      _id: 'script_1',
      content: 'Semantic product demonstration.',
      contentContract: videoScriptContract,
      metadata: {
        writerOutput: { videoTreatment: treatment, sourceLedger },
        captureAcquisitionDecisions: priorDecisionSet,
      },
      version: 3,
    });
    mocks.requireCurrentPersistedScriptSidecar.mockReturnValue({
      readResult: { sourceVersion: 3, sidecar: { sidecarVersion: 3 } },
      rawSidecar: { sidecarVersion: 3 },
      binding: { documentHash: 'a'.repeat(64), sidecarHash: 'b'.repeat(64) },
    });
    mocks.buildScriptShotPlan.mockReturnValue({
      status: 'capture-projection',
      plan: null,
      capturePlan: noPhysicalCapturePlan(),
      issues: [],
    });
    const { POST } = await import('@/app/api/services/thinkforge/production/shot-plan/route');

    const response = await POST(new Request(
      'http://localhost/api/services/thinkforge/production/shot-plan',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'save-capture-acquisition',
          sessionId: 'session_alias',
          scriptId: 'script_1',
          expectedDocumentVersion: 3,
          expectedAcquisitionDecisionSetHash: priorDecisionSet.decisionSetHash,
          decisions: [{
            requirementId: 'capture_secondary_workflow',
            acquisitionKind: 'screen-recording',
            requiredCapabilities: [],
            screenTarget: {
              label: 'Approved secondary workspace',
              captureScope: 'Record the approved secondary workflow only.',
              authorizationConfirmed: true,
            },
          }],
        }),
      },
    ));

    expect(response.status).toBe(200);
    const savedInput = mocks.saveCaptureAcquisitionDecisionSet.mock.calls[0]![0];
    expect(savedInput.expectedPreviousDecisionSetHash).toBe(priorDecisionSet.decisionSetHash);
    expect(savedInput.decisionSet.decisions.map((decision: { requirementId: string }) => decision.requirementId))
      .toEqual(['capture_real_workflow', 'capture_secondary_workflow']);
  });

  it('rejects a stale acquisition decision-set revision without rebuilding or persisting', async () => {
    const priorDecisionSet = createCaptureAcquisitionDecisionSet({
      treatment: productDemonstrationTreatment,
      sourceDocument: acquisitionSourceDocument(),
      decisions: [{
        requirementId: 'capture_real_workflow',
        acquisitionKind: 'screen-recording',
        requiredCapabilities: [],
        screenTarget: {
          label: 'Approved workspace',
          captureScope: 'Record the approved workflow only.',
          authorizationConfirmed: true,
        },
      }],
      sourceLedger,
      decidedBy: 'user_1',
    });
    mocks.getSession.mockResolvedValue({ _id: 'session_canonical', projectMeta: {} });
    mocks.getScript.mockResolvedValue({
      _id: 'script_1',
      content: 'Semantic product demonstration.',
      contentContract: videoScriptContract,
      metadata: {
        writerOutput: { videoTreatment: productDemonstrationTreatment, sourceLedger },
        captureAcquisitionDecisions: priorDecisionSet,
      },
      version: 3,
    });
    mocks.requireCurrentPersistedScriptSidecar.mockReturnValue({
      readResult: { sourceVersion: 3, sidecar: { sidecarVersion: 3 } },
      rawSidecar: { sidecarVersion: 3 },
      binding: { documentHash: 'a'.repeat(64), sidecarHash: 'b'.repeat(64) },
    });
    const { POST } = await import('@/app/api/services/thinkforge/production/shot-plan/route');

    const response = await POST(new Request(
      'http://localhost/api/services/thinkforge/production/shot-plan',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'save-capture-acquisition',
          sessionId: 'session_alias',
          scriptId: 'script_1',
          expectedDocumentVersion: 3,
          expectedAcquisitionDecisionSetHash: 'f'.repeat(64),
          decisions: [{
            requirementId: 'capture_real_workflow',
            acquisitionKind: 'screen-recording',
            requiredCapabilities: [],
            screenTarget: {
              label: 'Stale workspace',
              captureScope: 'This stale choice must not overwrite the current one.',
              authorizationConfirmed: true,
            },
          }],
        }),
      },
    ));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ reason: 'capture-acquisition-conflict' });
    expect(mocks.buildScriptShotPlan).not.toHaveBeenCalled();
    expect(mocks.saveCaptureAcquisitionDecisionSet).not.toHaveBeenCalled();
  });

  it('validates a rebuilt acquisition projection before persisting the decision set', async () => {
    mocks.getSession.mockResolvedValue({ _id: 'session_canonical', projectMeta: {} });
    mocks.getScript.mockResolvedValue({
      _id: 'script_1',
      content: 'Semantic product demonstration.',
      contentContract: videoScriptContract,
      metadata: { writerOutput: { videoTreatment: productDemonstrationTreatment, sourceLedger } },
      version: 3,
    });
    mocks.requireCurrentPersistedScriptSidecar.mockReturnValue({
      readResult: { sourceVersion: 3, sidecar: { sidecarVersion: 3 } },
      rawSidecar: { sidecarVersion: 3 },
      binding: { documentHash: 'a'.repeat(64), sidecarHash: 'b'.repeat(64) },
    });
    mocks.buildScriptShotPlan.mockReturnValue({
      status: 'needs-user-input',
      plan: null,
      issues: [{
        code: 'capture_projection_invalid',
        message: 'The rebuilt capture projection is invalid.',
        questions: ['Review the treatment.'],
      }],
    });
    const { POST } = await import('@/app/api/services/thinkforge/production/shot-plan/route');

    const response = await POST(new Request(
      'http://localhost/api/services/thinkforge/production/shot-plan',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'save-capture-acquisition',
          sessionId: 'session_alias',
          scriptId: 'script_1',
          expectedDocumentVersion: 3,
          expectedAcquisitionDecisionSetHash: null,
          decisions: [{
            requirementId: 'capture_real_workflow',
            acquisitionKind: 'screen-recording',
            requiredCapabilities: [],
            screenTarget: {
              label: 'Approved Insturix workspace',
              captureScope: 'Record the approved workflow only.',
              authorizationConfirmed: true,
            },
          }],
        }),
      },
    ));

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ reason: 'capture_projection_invalid' });
    expect(mocks.saveCaptureAcquisitionDecisionSet).not.toHaveBeenCalled();
  });

  it('replays the saved acquisition decision into a fresh V3 capture projection', async () => {
    const decisionSet = createCaptureAcquisitionDecisionSet({
      treatment: productDemonstrationTreatment,
      sourceDocument: acquisitionSourceDocument(),
      decisions: [{
        requirementId: 'capture_real_workflow',
        acquisitionKind: 'source-asset',
        requiredCapabilities: [],
        sourceSelections: [{ referenceId: 'src_brief', rightsBasis: 'user-provided' }],
      }],
      sourceLedger,
      decidedBy: 'user_1',
      decidedAt: new Date('2026-08-22T00:00:00.000Z'),
    });
    mocks.getSession.mockResolvedValue({ _id: 'session_canonical', projectMeta: {} });
    mocks.getScript.mockResolvedValue({
      _id: 'script_1',
      content: 'Semantic product demonstration.',
      contentContract: videoScriptContract,
      metadata: {
        writerOutput: { videoTreatment: productDemonstrationTreatment, sourceLedger },
        captureAcquisitionDecisions: decisionSet,
      },
      version: 3,
    });
    mocks.requireCurrentPersistedScriptSidecar.mockReturnValue({
      readResult: { sourceVersion: 3, sidecar: { sidecarVersion: 3 } },
      rawSidecar: { sidecarVersion: 3 },
      binding: { documentHash: 'a'.repeat(64), sidecarHash: 'b'.repeat(64) },
    });
    mocks.buildScriptShotPlan.mockReturnValue({
      status: 'capture-projection',
      plan: null,
      capturePlan: noPhysicalCapturePlan(),
      issues: [],
    });
    const { GET } = await import('@/app/api/services/thinkforge/production/shot-plan/route');

    const response = await GET(new Request(
      'http://localhost/api/services/thinkforge/production/shot-plan?sessionId=session_alias&scriptId=script_1',
    ));

    expect(response.status).toBe(200);
    expect(mocks.buildScriptShotPlan).toHaveBeenCalledWith(expect.objectContaining({
      acquisitionDecisions: decisionSet,
      acquisitionDecisionSourceDocument: acquisitionSourceDocument(),
    }));
  });

  it('builds and persists a technical setup only through the explicit generation action', async () => {
    mocks.getScript.mockResolvedValue({
      _id: 'script_1',
      content: 'Physical production script.',
      contentContract: videoScriptContract,
      metadata: { writerOutput: { videoTreatment: productDemonstrationTreatment, sourceLedger } },
      version: 3,
    });
    mocks.requireCurrentPersistedScriptSidecar.mockReturnValue({
      readResult: { sourceVersion: 3, sidecar: { sidecarVersion: 3 } },
      rawSidecar: { sidecarVersion: 3 },
      binding: { documentHash: 'a'.repeat(64), sidecarHash: 'b'.repeat(64) },
    });
    mocks.buildScriptShotPlan.mockReturnValue({
      status: 'capture-projection',
      plan: null,
      capturePlan: physicalCapturePlan(),
      issues: [],
    });
    const { POST } = await import('@/app/api/services/thinkforge/production/shot-plan/route');

    const response = await POST(new Request(
      'http://localhost/api/services/thinkforge/production/shot-plan',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'generate-technical-capture',
          sessionId: 'session_alias',
          scriptId: 'script_1',
          expectedDocumentVersion: 3,
        }),
      },
    ));

    expect(response.status).toBe(200);
    expect(mocks.planPhysicalCaptureDesign).toHaveBeenCalledWith(expect.objectContaining({
      treatment: productDemonstrationTreatment,
      sourceDocument: acquisitionSourceDocument(),
      abortSignal: expect.any(AbortSignal),
    }));
    expect(mocks.resolveTechnicalCapturePlan).toHaveBeenCalledWith(expect.objectContaining({
      design: { designId: 'design_1', designHash: 'd'.repeat(64) },
      profile,
      aspectRatio: '16:9',
      abortSignal: expect.any(AbortSignal),
    }));
    expect(mocks.saveTechnicalCapturePlanningArtifacts).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'session_canonical',
      scriptId: 'script_1',
      expectedVersion: 3,
      expectedContent: 'Physical production script.',
      expectedSidecarHash: 'b'.repeat(64),
      expectedAcquisitionDecisionSetHash: null,
    }));
    expect(await response.json()).toMatchObject({
      technicalCapture: { status: 'needs-calibration' },
    });
  });

  it('blocks technical generation while capture calibration inputs remain unresolved', async () => {
    mocks.getScript.mockResolvedValue({
      _id: 'script_1',
      content: 'Physical production script.',
      contentContract: videoScriptContract,
      metadata: { writerOutput: { videoTreatment: productDemonstrationTreatment, sourceLedger } },
      version: 3,
    });
    mocks.requireCurrentPersistedScriptSidecar.mockReturnValue({
      readResult: { sourceVersion: 3, sidecar: { sidecarVersion: 3 } },
      rawSidecar: { sidecarVersion: 3 },
      binding: { documentHash: 'a'.repeat(64), sidecarHash: 'b'.repeat(64) },
    });
    mocks.buildScriptShotPlan.mockReturnValue({
      status: 'capture-projection',
      plan: null,
      capturePlan: {
        ...physicalCapturePlan(),
        status: 'needs-capture-calibration',
        calibrationQuestions: ['Confirm one usable camera and one safe recording space.'],
      },
      issues: [],
    });
    const { POST } = await import('@/app/api/services/thinkforge/production/shot-plan/route');

    const response = await POST(new Request(
      'http://localhost/api/services/thinkforge/production/shot-plan',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'generate-technical-capture',
          sessionId: 'session_alias',
          scriptId: 'script_1',
          expectedDocumentVersion: 3,
        }),
      },
    ));

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ reason: 'capture-calibration-required' });
    expect(mocks.planPhysicalCaptureDesign).not.toHaveBeenCalled();
    expect(mocks.resolveTechnicalCapturePlan).not.toHaveBeenCalled();
    expect(mocks.saveTechnicalCapturePlanningArtifacts).not.toHaveBeenCalled();
  });

  it('persists approval only for the exact current technical plan', async () => {
    const design = { designId: 'design_1', designHash: 'd'.repeat(64) };
    const plan = { planId: 'plan_1', planHash: 'e'.repeat(64) };
    const snapshot = { status: 'approved', snapshotHash: 'f'.repeat(64) };
    mocks.getScript.mockResolvedValue({
      _id: 'script_1',
      content: 'Physical production script.',
      contentContract: videoScriptContract,
      metadata: {
        writerOutput: { videoTreatment: productDemonstrationTreatment, sourceLedger },
        physicalCaptureDesign: design,
        technicalCapturePlan: plan,
      },
      version: 3,
    });
    mocks.requireCurrentPersistedScriptSidecar.mockReturnValue({
      readResult: { sourceVersion: 3, sidecar: { sidecarVersion: 3 } },
      rawSidecar: { sidecarVersion: 3 },
      binding: { documentHash: 'a'.repeat(64), sidecarHash: 'b'.repeat(64) },
    });
    mocks.buildScriptShotPlan.mockReturnValue({
      status: 'capture-projection',
      plan: null,
      capturePlan: physicalCapturePlan(),
      issues: [],
    });
    mocks.verifyPhysicalCaptureDesign.mockReturnValue({ current: true, design });
    mocks.verifyCurrentTechnicalCapturePlan.mockReturnValue({ current: true, plan });
    mocks.createApprovedTechnicalCaptureSnapshot.mockReturnValue(snapshot);
    const { POST } = await import('@/app/api/services/thinkforge/production/shot-plan/route');

    const response = await POST(new Request(
      'http://localhost/api/services/thinkforge/production/shot-plan',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'approve-technical-capture',
          sessionId: 'session_alias',
          scriptId: 'script_1',
          expectedDocumentVersion: 3,
          confirmations: [{
            setupId: 'setup_1',
            checkId: 'setup_1_check_framing',
            category: 'framing',
            status: 'passed',
            method: 'live-preview',
          }],
        }),
      },
    ));

    expect(response.status).toBe(200);
    expect(mocks.saveApprovedTechnicalCaptureSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'session_canonical',
      scriptId: 'script_1',
      expectedPlanHash: 'e'.repeat(64),
      snapshot,
    }));
    expect(await response.json()).toMatchObject({
      technicalCapture: { status: 'approved', approval: snapshot },
    });
  });

  it('rejects a stale acquisition request before persisting a choice', async () => {
    mocks.getScript.mockResolvedValue({
      _id: 'script_1',
      content: 'Semantic product demonstration.',
      contentContract: videoScriptContract,
      metadata: { writerOutput: { videoTreatment: productDemonstrationTreatment, sourceLedger } },
      version: 4,
    });
    const { POST } = await import('@/app/api/services/thinkforge/production/shot-plan/route');

    const response = await POST(new Request(
      'http://localhost/api/services/thinkforge/production/shot-plan',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'save-capture-acquisition',
          sessionId: 'session_alias',
          scriptId: 'script_1',
          expectedDocumentVersion: 3,
          expectedAcquisitionDecisionSetHash: null,
          decisions: [{
            requirementId: 'capture_real_workflow',
            acquisitionKind: 'screen-recording',
            requiredCapabilities: [],
            screenTarget: {
              label: 'Approved Insturix workspace',
              captureScope: 'Record the approved workflow only.',
              authorizationConfirmed: true,
            },
          }],
        }),
      },
    ));

    expect(response.status).toBe(409);
    expect(mocks.saveCaptureAcquisitionDecisionSet).not.toHaveBeenCalled();
  });

  it('rejects Shoot Kit for a saved non-video document before reading a sidecar', async () => {
    mocks.getScript.mockResolvedValue({
      _id: 'post_1',
      content: 'Saved social post.',
      contentContract: createThinkForgeWriterContract('social_post'),
      metadata: {},
      version: 1,
    });
    const { GET } = await import('@/app/api/services/thinkforge/production/shot-plan/route');

    const response = await GET(new Request(
      'http://localhost/api/services/thinkforge/production/shot-plan?sessionId=session_alias&scriptId=post_1',
    ));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ reason: 'shoot_kit_not_applicable' });
    expect(mocks.requireCurrentPersistedScriptSidecar).not.toHaveBeenCalled();
    expect(mocks.buildScriptShotPlan).not.toHaveBeenCalled();
  });

  it('requires regeneration for a saved video script with a legacy sidecar', async () => {
    mocks.getScript.mockResolvedValue({
      _id: 'script_legacy',
      content: 'Legacy video script.',
      contentContract: videoScriptContract,
      metadata: {},
      version: 1,
    });
    const { GET } = await import('@/app/api/services/thinkforge/production/shot-plan/route');

    const response = await GET(new Request(
      'http://localhost/api/services/thinkforge/production/shot-plan?sessionId=session_alias&scriptId=script_legacy',
    ));

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ reason: 'shoot_kit_regeneration_required' });
    expect(mocks.buildScriptShotPlan).not.toHaveBeenCalled();
  });
});
