import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  addProjectToLinkBySessionId: vi.fn(),
  auth: vi.fn(),
  createProject: vi.fn(),
  createProjectLink: vi.fn(),
  deductCredits: vi.fn(),
  findLinkBySessionId: vi.fn(),
  findProjectBySessionId: vi.fn(),
  saveProjectWithReceipt: vi.fn(),
  scenesToOverlays: vi.fn(),
  scenesToTotalFrames: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }));
vi.mock('@/lib/services/creditsService', () => ({
  CreditsService: { deductCredits: mocks.deductCredits },
}));
vi.mock('@/lib/editron/services/project-service', () => ({
  projectService: {
    createProject: mocks.createProject,
    findProjectBySessionId: mocks.findProjectBySessionId,
    saveProjectWithReceipt: mocks.saveProjectWithReceipt,
  },
}));
vi.mock('@/lib/pipeline/scene-to-editron', () => ({
  scenesToOverlays: mocks.scenesToOverlays,
  scenesToTotalFrames: mocks.scenesToTotalFrames,
}));
vi.mock('@/lib/shared/project-links', () => ({
  addProjectToLinkBySessionId: mocks.addProjectToLinkBySessionId,
  createProjectLink: mocks.createProjectLink,
  findLinkBySessionId: mocks.findLinkBySessionId,
}));

const scene = { sceneIndex: 0, title: 'Hook', narration: 'Say the thing.', visualDescription: 'Hero shot', durationSeconds: 3, mood: 'focused' };

function request(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/services/editron/projects/import-from-script', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

function productionManifest(
  sourceSessionId: string,
  sourceScriptId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    version: 1,
    sourceService: 'thinkforge',
    sourceSessionId,
    sourceScriptId,
    targetDurationSeconds: 60,
    targetDurationSource: 'request',
    parsedDurationSeconds: 60,
    expectedSceneCount: 1,
    expectedStoryboardImages: 1,
    expectedVideoClips: 1,
    coveragePolicy: 'production-require-all-scenes',
    parser: {
      llmAvailable: true,
      fallbackUsed: false,
      inputLength: 500,
      maxInputChars: 24_000,
      source: 'stored-script',
      storedScriptRecovered: false,
      sidecarUsed: true,
      sidecarVersion: 2,
      sidecarSource: 'stored-script',
    },
    warnings: [],
    ...overrides,
  };
}

describe('import-from-script route', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.auth.mockResolvedValue({ userId: 'user_1' });
    mocks.deductCredits.mockResolvedValue({ success: true });
    mocks.scenesToOverlays.mockReturnValue([{ id: 1, type: 'text' }]);
    mocks.scenesToTotalFrames.mockReturnValue(90);
    mocks.saveProjectWithReceipt.mockResolvedValue({
      revision: { schemaVersion: 1, value: 1, compatibilityUpdatedAt: '2026-08-19T00:00:00.000Z' },
      committedAt: '2026-08-19T00:00:00.000Z',
    });
    mocks.addProjectToLinkBySessionId.mockResolvedValue(true);
    mocks.createProjectLink.mockResolvedValue({ universalId: 'plink_1' });
  });

  it('reuses the ThinkForge source-session project for direct imports', async () => {
    mocks.findProjectBySessionId.mockResolvedValue({ projectId: 'proj_existing', brandId: 'brand_old' });
    mocks.findLinkBySessionId.mockResolvedValue({ universalId: 'plink_existing', projectIds: ['proj_existing'] });

    const { POST } = await import('@/app/api/services/editron/projects/import-from-script/route');
    const response = await POST(request({
      scenes: [scene],
      title: 'Imported Script',
      sourceSessionId: 'tf_session_1',
      sourceScriptId: 'script_1',
      brandId: 'brand_1',
    }) as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.projectId).toBe('proj_existing');
    expect(payload.reusedProject).toBe(true);
    expect(mocks.createProject).not.toHaveBeenCalled();
    expect(mocks.saveProjectWithReceipt).toHaveBeenCalledWith(
      'user_1',
      'proj_existing',
      expect.objectContaining({ durationInFrames: 90 }),
      { projectUpdates: expect.objectContaining({
        name: 'Imported Script',
        pipelineStage: 'edit',
        brandId: 'brand_1',
        sourceSessionId: 'tf_session_1',
        sourceScriptId: 'script_1',
      }) },
    );
    expect(mocks.addProjectToLinkBySessionId).toHaveBeenCalledWith('user_1', 'tf_session_1', 'proj_existing');
  });

  it('dry-runs source-session imports without charging credits or writing project state', async () => {
    mocks.findProjectBySessionId.mockResolvedValue({ projectId: 'proj_existing', brandId: 'brand_old' });

    const { POST } = await import('@/app/api/services/editron/projects/import-from-script/route');
    const response = await POST(request({
      scenes: [scene],
      title: 'Dry Run Script',
      sourceSessionId: 'tf_session_dry',
      sourceScriptId: 'script_dry',
      brandId: 'brand_dry',
      dryRun: true,
    }) as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual(expect.objectContaining({
      success: true,
      dryRun: true,
      projectId: 'proj_existing',
      reusedProject: true,
      wouldReuseProject: true,
      overlayCount: 1,
      totalDurationFrames: 90,
      totalDurationSeconds: 3,
      creditsDeducted: 0,
      writeOperationsSkipped: true,
    }));
    expect(mocks.findProjectBySessionId).toHaveBeenCalledWith('user_1', 'tf_session_dry');
    expect(mocks.deductCredits).not.toHaveBeenCalled();
    expect(mocks.createProject).not.toHaveBeenCalled();
    expect(mocks.saveProjectWithReceipt).not.toHaveBeenCalled();
    expect(mocks.findLinkBySessionId).not.toHaveBeenCalled();
    expect(mocks.createProjectLink).not.toHaveBeenCalled();
    expect(mocks.addProjectToLinkBySessionId).not.toHaveBeenCalled();
  });

  it('tags new direct-import projects with source session identity and creates a link', async () => {
    mocks.findProjectBySessionId.mockResolvedValue(null);
    mocks.findLinkBySessionId.mockResolvedValue(null);
    mocks.createProject.mockResolvedValue({ projectId: 'proj_new' });

    const { POST } = await import('@/app/api/services/editron/projects/import-from-script/route');
    const response = await POST(request({
      scenes: [scene],
      sourceSessionId: 'tf_session_2',
      sourceScriptId: 'script_2',
      brandId: 'brand_2',
    }) as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.projectId).toBe('proj_new');
    expect(payload.reusedProject).toBe(false);
    expect(mocks.createProject).toHaveBeenCalledWith('user_1', 'Imported Script', {
      brandId: 'brand_2',
      sourceSessionId: 'tf_session_2',
    });
    expect(mocks.createProjectLink).toHaveBeenCalledWith('user_1', {
      sessionId: 'tf_session_2',
      sourceScriptId: 'script_2',
      projectId: 'proj_new',
      brandId: 'brand_2',
    });
  });

  it('rejects strict production manifest imports before charging credits', async () => {
    const { POST } = await import('@/app/api/services/editron/projects/import-from-script/route');
    const response = await POST(request({
      scenes: [scene],
      sourceSessionId: 'tf_session_3',
      sourceScriptId: 'script_3',
      productionManifest: productionManifest('tf_session_3', 'script_3'),
    }) as never);
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.reason).toBe('production-manifest-requires-storyboard-finalize');
    expect(mocks.deductCredits).not.toHaveBeenCalled();
    expect(mocks.createProject).not.toHaveBeenCalled();
    expect(mocks.saveProjectWithReceipt).not.toHaveBeenCalled();
  });

  it('persists a validated draft import manifest under its immutable content hash', async () => {
    mocks.findProjectBySessionId.mockResolvedValue(null);
    mocks.findLinkBySessionId.mockResolvedValue(null);
    mocks.createProject.mockResolvedValue({ projectId: 'proj_manifest' });
    const manifest = productionManifest('tf_session_manifest', 'script_manifest');

    const { POST } = await import('@/app/api/services/editron/projects/import-from-script/route');
    const response = await POST(request({
      scenes: [scene],
      sourceSessionId: 'tf_session_manifest',
      sourceScriptId: 'script_manifest',
      importMode: 'draft-script-import',
      productionManifest: manifest,
    }) as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.productionManifestHash).toMatch(/^[a-f0-9]{64}$/);
    expect(payload.projectRevision).toMatchObject({ schemaVersion: 1, value: 1 });
    const saveOptions = mocks.saveProjectWithReceipt.mock.calls[0][3];
    const contractKey = `thinkforgeImportContracts.${payload.productionManifestHash}`;
    expect(saveOptions.projectUpdates[contractKey]).toEqual({
      schemaVersion: 1,
      manifestSha256: payload.productionManifestHash,
      productionManifest: manifest,
    });
    expect(saveOptions.projectUpdates.latestThinkforgeImport).toMatchObject({
      schemaVersion: 1,
      manifestSha256: payload.productionManifestHash,
      sourceSessionId: 'tf_session_manifest',
      sourceScriptId: 'script_manifest',
      importMode: 'draft-script-import',
    });
  });

  it('rejects a manifest transplanted from another session before charging credits', async () => {
    const { POST } = await import('@/app/api/services/editron/projects/import-from-script/route');
    const response = await POST(request({
      scenes: [scene],
      sourceSessionId: 'tf_session_requested',
      sourceScriptId: 'script_requested',
      importMode: 'draft-script-import',
      productionManifest: productionManifest('tf_session_other', 'script_other'),
    }) as never);
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.reason).toBe('production-manifest-source-mismatch');
    expect(mocks.deductCredits).not.toHaveBeenCalled();
    expect(mocks.saveProjectWithReceipt).not.toHaveBeenCalled();
  });

  it('rejects malformed explicit manifests instead of downgrading to legacy import', async () => {
    const { POST } = await import('@/app/api/services/editron/projects/import-from-script/route');
    const response = await POST(request({
      scenes: [scene],
      sourceSessionId: 'tf_session_invalid',
      sourceScriptId: 'script_invalid',
      productionManifest: { coveragePolicy: 'draft-partial-allowed' },
    }) as never);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.reason).toBe('invalid-production-manifest');
    expect(mocks.deductCredits).not.toHaveBeenCalled();
    expect(mocks.saveProjectWithReceipt).not.toHaveBeenCalled();
  });
});
