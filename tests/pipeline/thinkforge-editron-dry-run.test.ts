import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  collection: vi.fn(),
  createProject: vi.fn(),
  createProjectLink: vi.fn(),
  deductCredits: vi.fn(),
  findLinkBySessionId: vi.fn(),
  findProjectBySessionId: vi.fn(),
  isLLMParserAvailable: vi.fn(),
  parseScriptWithLLM: vi.fn(),
  saveProject: vi.fn(),
  updateOne: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }));
vi.mock('@/lib/pipeline/llm-scene-parser', () => ({
  isLLMParserAvailable: mocks.isLLMParserAvailable,
  parseScriptWithLLM: mocks.parseScriptWithLLM,
}));
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
vi.mock('@/lib/editron/db/mongodb', () => ({
  COLLECTIONS: { PROJECTS: 'projects' },
  getDatabase: vi.fn(async () => ({ collection: mocks.collection })),
}));
vi.mock('@/lib/shared/project-links', () => ({
  addProjectToLinkBySessionId: vi.fn(),
  createProjectLink: mocks.createProjectLink,
  findLinkBySessionId: mocks.findLinkBySessionId,
}));

function request(url: string, body: Record<string, unknown>): Request {
  return new Request(url, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('ThinkForge to Editron no-credit dry run', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();

    mocks.auth.mockResolvedValue({ userId: 'user_dry_run' });
    mocks.isLLMParserAvailable.mockReturnValue(true);
    mocks.parseScriptWithLLM.mockResolvedValue({
      scenes: [
        {
          title: 'Proof Hook',
          narration: 'Ship the proof without leaking the private brief.',
          visualDescription: 'A founder reviews the launch board in a bright studio.',
          videoMotionPrompt: 'slow push-in toward the board',
          durationSeconds: 4,
          mood: 'focused',
          editDirections: { pacing: 'medium' },
        },
        {
          title: 'Product Moment',
          narration: 'Show the product doing the work.',
          visualDescription: 'The app turns a rough script into an edit timeline.',
          videoMotionPrompt: 'screen capture with crisp cursor motion',
          durationSeconds: 5,
          mood: 'confident',
          editDirections: { pacing: 'fast' },
        },
      ],
      overallMusicPrompt: 'clean pulse, restrained build',
      characterDescriptions: {},
      colorPalette: ['#101820', '#f2aa4c'],
      environmentNotes: 'studio desk',
      globalEditDirections: { pacing: 'medium' },
      suggestedProfileCategory: 'brand-ad',
    });
    mocks.deductCredits.mockResolvedValue({ success: true });
    mocks.findProjectBySessionId.mockResolvedValue({ projectId: 'proj_from_tf_session' });
    mocks.collection.mockReturnValue({ updateOne: mocks.updateOne });
    mocks.updateOne.mockResolvedValue({ matchedCount: 1 });
    mocks.findLinkBySessionId.mockResolvedValue({ universalId: 'plink_existing' });
    mocks.saveProject.mockResolvedValue(undefined);
    mocks.createProjectLink.mockResolvedValue({ universalId: 'plink_created' });
  });

  it('exports scenes, imports them into the existing source-session project, and never echoes raw script text', async () => {
    const { POST: exportForEditron } = await import('@/app/api/services/thinkforge/script/export-for-editron/route');
    const { POST: importFromScript } = await import('@/app/api/services/editron/projects/import-from-script/route');

    const sourceSessionId = 'tf_session_dry_run';
    const sourceScriptId = 'tf_script_dry_run';
    const brandId = 'brand_dry_run';
    const privateBrief = 'PRIVATE CUSTOMER BRIEF: unreleased launch angle and audience notes.';

    const exportResponse = await exportForEditron(request(
      'http://localhost/api/services/thinkforge/script/export-for-editron',
      {
        plainText: privateBrief,
        sessionId: sourceSessionId,
        scriptId: sourceScriptId,
        brandId,
        aspectRatio: '16:9',
        artStyle: 'cinematic',
      },
    ) as never);
    const exported = await exportResponse.json();

    expect(exportResponse.status).toBe(200);
    expect(exported.success).toBe(true);
    expect(exported.sceneCount).toBe(2);
    expect(exported.scenes).toHaveLength(2);
    expect(JSON.stringify(exported)).not.toContain('PRIVATE CUSTOMER BRIEF');
    expect(mocks.parseScriptWithLLM).toHaveBeenCalledWith(
      privateBrief,
      expect.objectContaining({ brandId, userId: 'user_dry_run' }),
    );

    const importResponse = await importFromScript(request(
      'http://localhost/api/services/editron/projects/import-from-script',
      {
        scenes: exported.scenes,
        title: exported.title,
        aspectRatio: '16:9',
        sourceSessionId,
        sourceScriptId,
        brandId,
      },
    ) as never);
    const imported = await importResponse.json();

    expect(importResponse.status).toBe(200);
    expect(imported).toEqual(expect.objectContaining({
      success: true,
      projectId: 'proj_from_tf_session',
      reusedProject: true,
      overlayCount: 6,
      totalDurationFrames: 270,
      totalDurationSeconds: 9,
      creditsDeducted: 1,
    }));
    expect(mocks.findProjectBySessionId).toHaveBeenCalledWith('user_dry_run', sourceSessionId);
    expect(mocks.createProject).not.toHaveBeenCalled();
    expect(mocks.updateOne).toHaveBeenCalledWith(
      { userId: 'user_dry_run', projectId: 'proj_from_tf_session' },
      { $set: expect.objectContaining({ pipelineStage: 'edit', brandId }) },
    );
    expect(mocks.saveProject).toHaveBeenCalledWith(
      'user_dry_run',
      'proj_from_tf_session',
      expect.objectContaining({
        aspectRatio: '16:9',
        durationInFrames: 270,
        fps: 30,
        playerDimensions: { width: 1920, height: 1080 },
      }),
    );
    expect(mocks.findLinkBySessionId).toHaveBeenCalledWith('user_dry_run', sourceSessionId);

    const savedPayload = mocks.saveProject.mock.calls[0]?.[2];
    expect(savedPayload.overlays).toEqual(expect.arrayContaining([
      expect.objectContaining({ row: 2, type: 'html-scene' }),
      expect.objectContaining({ row: 3, type: 'sound' }),
      expect.objectContaining({ row: 4, type: 'text' }),
    ]));
    expect(JSON.stringify(savedPayload)).not.toContain('PRIVATE CUSTOMER BRIEF');
  });
});
