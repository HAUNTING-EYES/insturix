import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  addProjectToLinkBySessionId: vi.fn(),
  auth: vi.fn(),
  collection: vi.fn(),
  createProject: vi.fn(),
  createProjectLink: vi.fn(),
  deductCredits: vi.fn(),
  findLinkBySessionId: vi.fn(),
  findProjectBySessionId: vi.fn(),
  saveProject: vi.fn(),
  scenesToOverlays: vi.fn(),
  scenesToTotalFrames: vi.fn(),
  updateOne: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }));
vi.mock('@/lib/services/creditsService', () => ({
  CreditsService: { deductCredits: mocks.deductCredits },
}));
vi.mock('@/lib/editron/services/project-service', () => ({
  projectService: {
    createProject: mocks.createProject,
    findProjectBySessionId: mocks.findProjectBySessionId,
    saveProject: mocks.saveProject,
  },
}));
vi.mock('@/lib/pipeline/scene-to-editron', () => ({
  scenesToOverlays: mocks.scenesToOverlays,
  scenesToTotalFrames: mocks.scenesToTotalFrames,
}));
vi.mock('@/lib/editron/db/mongodb', () => ({
  COLLECTIONS: { PROJECTS: 'projects' },
  getDatabase: vi.fn(async () => ({ collection: mocks.collection })),
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

describe('import-from-script route', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.auth.mockResolvedValue({ userId: 'user_1' });
    mocks.deductCredits.mockResolvedValue({ success: true });
    mocks.scenesToOverlays.mockReturnValue([{ id: 1, type: 'text' }]);
    mocks.scenesToTotalFrames.mockReturnValue(90);
    mocks.collection.mockReturnValue({ updateOne: mocks.updateOne });
    mocks.updateOne.mockResolvedValue({ matchedCount: 1 });
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
    expect(mocks.saveProject).toHaveBeenCalledWith('user_1', 'proj_existing', expect.objectContaining({ durationInFrames: 90 }));
    expect(mocks.updateOne).toHaveBeenCalledWith(
      { userId: 'user_1', projectId: 'proj_existing' },
      { $set: expect.objectContaining({ name: 'Imported Script', pipelineStage: 'edit', brandId: 'brand_1' }) },
    );
    expect(mocks.addProjectToLinkBySessionId).toHaveBeenCalledWith('user_1', 'tf_session_1', 'proj_existing');
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
});
