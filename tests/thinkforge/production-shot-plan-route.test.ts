import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createCaptureAcquisitionDecisionSet } from '@/lib/thinkforge/production/capture-acquisition-decisions';
import { productDemonstrationTreatment } from '@/tests/fixtures/thinkforge-video-treatment';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  buildScriptShotPlan: vi.fn(),
  getScript: vi.fn(),
  getSession: vi.fn(),
  requireCurrentPersistedScriptSidecar: vi.fn(),
  saveCaptureAcquisitionDecisionSet: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }));
vi.mock('@/lib/thinkforge/services/db', () => ({
  getScript: mocks.getScript,
  getSession: mocks.getSession,
  saveCaptureAcquisitionDecisionSet: mocks.saveCaptureAcquisitionDecisionSet,
}));
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
  });

  it('forwards only the persisted long-form chapter plan into Shoot Kit planning', async () => {
    const chapterPlan = { version: 1, acts: [{ id: 'act_1', chapters: [{ id: 'chapter_1' }] }] };
    mocks.getScript.mockResolvedValue({
      _id: 'script_1',
      content: 'Bound long-form script.',
      metadata: { writerOutput: { longForm: { plan: chapterPlan } } },
      version: 1,
    });
    const { GET } = await import('@/app/api/services/thinkforge/production/shot-plan/route');

    const response = await GET(new Request(
      'http://localhost/api/services/thinkforge/production/shot-plan?sessionId=session_alias&scriptId=script_1',
    ));

    expect(response.status).toBe(200);
    expect(mocks.getSession).toHaveBeenCalledWith('session_alias', 'user_1', 'org_1');
    expect(mocks.getScript).toHaveBeenCalledWith('session_canonical', 'script_1');
    expect(mocks.buildScriptShotPlan).toHaveBeenCalledWith(expect.objectContaining({
      sidecar: { sidecarVersion: 2 },
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
      metadata: { writerOutput: { videoTreatment: { treatmentId: 'treatment_1' } } },
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
      capturePlan: { kind: 'treatment-capture-plan', status: 'no-physical-capture' },
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
      capturePlan: { kind: 'treatment-capture-plan', status: 'no-physical-capture' },
    });
    expect(mocks.buildScriptShotPlan).toHaveBeenCalledWith(expect.objectContaining({
      sidecar: { sidecarVersion: 3 },
      videoTreatment: { treatmentId: 'treatment_1' },
      profile: null,
      aspectRatio: undefined,
    }));
  });

  it('fails closed when a V3 script is missing its persisted semantic treatment', async () => {
    mocks.getSession.mockResolvedValue({ _id: 'session_canonical', projectMeta: {} });
    mocks.getScript.mockResolvedValue({
      _id: 'script_1',
      content: 'Semantic script.',
      metadata: { writerOutput: {} },
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
      metadata: { writerOutput: { videoTreatment: productDemonstrationTreatment } },
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
      capturePlan: { kind: 'treatment-capture-plan', status: 'no-physical-capture' },
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
          decisions: [{
            requirementId: 'capture_real_workflow',
            acquisitionKind: 'screen-recording',
            requiredCapabilities: [],
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
      decisionSet: expect.objectContaining({
        sourceDocument: {
          version: 3,
          contentHash: 'a'.repeat(64),
          sidecarHash: 'b'.repeat(64),
        },
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
      acquisitionDecisionSourceDocument: {
        version: 3,
        contentHash: 'a'.repeat(64),
        sidecarHash: 'b'.repeat(64),
      },
    }));
  });

  it('replays the saved acquisition decision into a fresh V3 capture projection', async () => {
    const decisionSet = createCaptureAcquisitionDecisionSet({
      treatment: productDemonstrationTreatment,
      sourceDocument: {
        version: 3,
        contentHash: 'a'.repeat(64),
        sidecarHash: 'b'.repeat(64),
      },
      decisions: [{
        requirementId: 'capture_real_workflow',
        acquisitionKind: 'source-asset',
        requiredCapabilities: [],
      }],
      decidedBy: 'user_1',
      decidedAt: new Date('2026-08-22T00:00:00.000Z'),
    });
    mocks.getSession.mockResolvedValue({ _id: 'session_canonical', projectMeta: {} });
    mocks.getScript.mockResolvedValue({
      _id: 'script_1',
      content: 'Semantic product demonstration.',
      metadata: {
        writerOutput: { videoTreatment: productDemonstrationTreatment },
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
      capturePlan: { kind: 'treatment-capture-plan', status: 'no-physical-capture' },
      issues: [],
    });
    const { GET } = await import('@/app/api/services/thinkforge/production/shot-plan/route');

    const response = await GET(new Request(
      'http://localhost/api/services/thinkforge/production/shot-plan?sessionId=session_alias&scriptId=script_1',
    ));

    expect(response.status).toBe(200);
    expect(mocks.buildScriptShotPlan).toHaveBeenCalledWith(expect.objectContaining({
      acquisitionDecisions: decisionSet,
      acquisitionDecisionSourceDocument: {
        version: 3,
        contentHash: 'a'.repeat(64),
        sidecarHash: 'b'.repeat(64),
      },
    }));
  });

  it('rejects a stale acquisition request before persisting a choice', async () => {
    mocks.getScript.mockResolvedValue({
      _id: 'script_1',
      content: 'Semantic product demonstration.',
      metadata: { writerOutput: { videoTreatment: productDemonstrationTreatment } },
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
          decisions: [{
            requirementId: 'capture_real_workflow',
            acquisitionKind: 'source-asset',
            requiredCapabilities: [],
          }],
        }),
      },
    ));

    expect(response.status).toBe(409);
    expect(mocks.saveCaptureAcquisitionDecisionSet).not.toHaveBeenCalled();
  });
});
