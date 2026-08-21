import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  buildScriptShotPlan: vi.fn(),
  getScript: vi.fn(),
  getSession: vi.fn(),
  requireCurrentPersistedScriptSidecar: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }));
vi.mock('@/lib/thinkforge/services/db', () => ({
  getScript: mocks.getScript,
  getSession: mocks.getSession,
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
});
