import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createThinkForgeWriterContract } from '@/lib/thinkforge/schemas/document-contract';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  collection: vi.fn(),
  createProject: vi.fn(),
  createProjectLink: vi.fn(),
  deductCredits: vi.fn(),
  findLinkBySessionId: vi.fn(),
  findProjectBySessionId: vi.fn(),
  getScript: vi.fn(),
  getSession: vi.fn(),
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
vi.mock('@/lib/thinkforge/services/db', () => ({
  getScript: mocks.getScript,
  getSession: mocks.getSession,
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

    mocks.auth.mockResolvedValue({ userId: 'user_dry_run', orgId: 'org_dry_run' });
    mocks.getSession.mockImplementation(async (sessionId: string) => ({
      _id: sessionId,
      userId: 'user_dry_run',
      orgId: 'org_dry_run',
      projectMeta: {},
    }));
    mocks.getScript.mockImplementation(async (sessionId: string, scriptId: string) => ({
      _id: `stored_${scriptId}`,
      sessionId,
      scriptId,
      title: 'Authorized dry-run script',
      content: '',
      blocks: [],
      contentContract: createThinkForgeWriterContract('video_script'),
      metadata: {},
    }));
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

  it('exports scenes, preflights the existing source-session import, and never echoes raw script text', async () => {
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
    expect(mocks.getSession).toHaveBeenCalledWith(sourceSessionId, 'user_dry_run', 'org_dry_run');
    expect(mocks.getScript).toHaveBeenCalledWith(sourceSessionId, sourceScriptId);
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
        dryRun: true,
      },
    ) as never);
    const imported = await importResponse.json();

    expect(importResponse.status).toBe(200);
    expect(imported).toEqual(expect.objectContaining({
      success: true,
      dryRun: true,
      projectId: 'proj_from_tf_session',
      reusedProject: true,
      wouldReuseProject: true,
      overlayCount: 6,
      totalDurationFrames: 270,
      totalDurationSeconds: 9,
      creditsDeducted: 0,
      writeOperationsSkipped: true,
    }));
    expect(mocks.findProjectBySessionId).toHaveBeenCalledWith('user_dry_run', sourceSessionId);
    expect(mocks.deductCredits).not.toHaveBeenCalled();
    expect(mocks.createProject).not.toHaveBeenCalled();
    expect(mocks.updateOne).not.toHaveBeenCalled();
    expect(mocks.saveProject).not.toHaveBeenCalled();
    expect(mocks.findLinkBySessionId).not.toHaveBeenCalled();
    expect(mocks.createProjectLink).not.toHaveBeenCalled();
    expect(JSON.stringify(imported)).not.toContain('PRIVATE CUSTOMER BRIEF');
  });
});
