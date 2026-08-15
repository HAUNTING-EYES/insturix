import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readPersistedScriptSidecar } from '@/lib/thinkforge/persistence/script-sidecar-reader';
import { SCRIPT_SIDECAR_VERSION } from '@/lib/thinkforge/schemas/script-sidecar';
import { SCRIPT_SIDECAR_V2_VERSION } from '@/lib/thinkforge/schemas/script-sidecar-v2';

const routeMocks = vi.hoisted(() => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
  getChatHistory: vi.fn(),
  getOrCreateSession: vi.fn(),
  getScript: vi.fn(),
  getSession: vi.fn(),
  getUserPreferences: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: routeMocks.auth,
  clerkClient: routeMocks.clerkClient,
}));

vi.mock('@/lib/thinkforge/services/db', () => ({
  getChatHistory: routeMocks.getChatHistory,
  getOrCreateSession: routeMocks.getOrCreateSession,
  getScript: routeMocks.getScript,
  getSession: routeMocks.getSession,
  getUserPreferences: routeMocks.getUserPreferences,
}));

vi.mock('@/lib/editron/services/project-service', () => ({
  projectService: { createScriptStageProject: vi.fn() },
}));

vi.mock('@/lib/shared/project-links', () => ({
  addProjectToLinkBySessionId: vi.fn(),
  createProjectLink: vi.fn(),
  findLinkBySessionId: vi.fn(),
}));

vi.mock('@/lib/shared/brand-scope', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/shared/brand-scope')>();
  return { ...actual, authorizeBrandScope: vi.fn() };
});

function v1Sidecar() {
  const narration = 'The stored V1 sentence remains the canonical historical narration.';
  return {
    sidecarVersion: SCRIPT_SIDECAR_VERSION,
    legacyMarker: { retained: true },
    characters: [{ id: 'narrator', name: 'Narrator', role: 'narrator' }],
    scenes: [{
      title: 'Historical scene',
      narration,
      visualDescription: 'A narrator reviews an archived production note.',
      videoMotionPrompt: 'Static frame.',
      audioDescription: 'Clean voiceover.',
      musicDescription: 'Restrained score.',
      sfxDescription: '',
      durationSeconds: 12,
      mood: 'serious',
      imageQualityTokens: 'natural detail',
      videoQualityTokens: 'stable footage',
      generationUnitId: 'historical_scene',
      primaryVisualForUnit: true,
      sceneType: 'continuous',
      assetRecommendation: 'ai-video',
      lines: [{
        text: narration,
        speakerId: 'narrator',
        onCamera: false,
        delivery: 'voiceover',
        sourceRefs: ['source_1'],
      }],
      sourceRefs: ['source_1'],
      charactersPresent: [],
      legacySceneMarker: 'retained',
    }],
    overallMusicPrompt: 'Restrained score.',
    characterDescriptions: { narrator: 'A clear voiceover narrator.' },
    colorPalette: ['#111111', '#F5F5F5'],
    environmentNotes: 'Archive room.',
    globalEditDirections: { pacing: 'measured' },
    suggestedProfileCategory: 'production-mode',
    sourceRefs: ['source_1'],
  };
}

function v2Sidecar() {
  return {
    sidecarVersion: SCRIPT_SIDECAR_V2_VERSION,
    spokenTextSource: 'beat-lines' as const,
    characters: [{ id: 'narrator', name: 'Narrator', role: 'narrator' as const }],
    acts: [{
      id: 'act_1',
      title: 'Act one',
      narrativePurpose: 'State the argument.',
      narrativeScenes: [{
        id: 'scene_1',
        title: 'The argument',
        narrativePurpose: 'Deliver the sourced claim.',
        durationIntentSeconds: 12,
        charactersPresent: [],
        sourceRefs: ['source_1'],
        beats: [{
          id: 'beat_1',
          kind: 'voiceover' as const,
          narrativePurpose: 'Explain the claim.',
          durationIntentSeconds: 12,
          lines: [{
            id: 'line_1',
            text: 'This V2 line is read directly from structured persistence.',
            speakerId: 'narrator',
            onCamera: false,
            delivery: 'voiceover' as const,
            sourceRefs: ['source_1'],
          }],
          sourceRefs: ['source_1'],
        }],
      }],
    }],
    sourceRefs: ['source_1'],
  };
}

describe('persisted ThinkForge script sidecars', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeMocks.auth.mockResolvedValue({ userId: 'user_1', orgId: null, has: vi.fn(() => false) });
    const session = {
      _id: 'session_1',
      userId: 'user_1',
      projectMeta: {},
      activeGeneration: null,
      createdAt: new Date('2026-08-16T00:00:00.000Z'),
      updatedAt: new Date('2026-08-16T00:00:00.000Z'),
    };
    routeMocks.getSession.mockResolvedValue(session);
    routeMocks.getOrCreateSession.mockResolvedValue(session);
    routeMocks.getChatHistory.mockResolvedValue([]);
    routeMocks.getUserPreferences.mockResolvedValue({});
  });

  it('keeps stored V1 metadata untouched while exposing the adapter read', () => {
    const sidecar = v1Sidecar();
    const metadata = {
      workflow: 'create',
      writerOutput: {
        writerType: 'script',
        sidecarVersion: SCRIPT_SIDECAR_VERSION,
        scriptSidecar: sidecar,
      },
    };
    const originalMetadata = structuredClone(metadata);

    const result = readPersistedScriptSidecar(metadata);

    expect(metadata).toEqual(originalMetadata);
    expect(result?.sourceVersion).toBe(SCRIPT_SIDECAR_VERSION);
    expect(result && 'legacyV1' in result ? result.legacyV1 : null).toMatchObject({
      legacyMarker: { retained: true },
      scenes: [{ legacySceneMarker: 'retained' }],
    });
    expect(result?.sidecar.acts[0]?.narrativeScenes).toHaveLength(1);
  });

  it('round-trips V2 structured data without reading rendered document text', () => {
    const sidecar = v2Sidecar();
    const result = readPersistedScriptSidecar({
      writerOutput: {
        sidecarVersion: SCRIPT_SIDECAR_V2_VERSION,
        scriptSidecar: sidecar,
      },
    });

    expect(result).toEqual({
      sourceVersion: SCRIPT_SIDECAR_V2_VERSION,
      sidecar,
    });
  });

  it('allows historical documents that have no sidecar property', () => {
    expect(readPersistedScriptSidecar({ writerOutput: { writerType: 'script' } })).toBeUndefined();
    expect(readPersistedScriptSidecar({ writerOutput: { writerType: 'post' } })).toBeUndefined();
  });

  it('fails loudly for unknown and inconsistent persisted versions', () => {
    expect(() => readPersistedScriptSidecar({
      writerOutput: {
        sidecarVersion: 3,
        scriptSidecar: { ...v1Sidecar(), sidecarVersion: 3 },
      },
    })).toThrow(/Unsupported script sidecar version: 3/);

    expect(() => readPersistedScriptSidecar({
      writerOutput: {
        sidecarVersion: SCRIPT_SIDECAR_VERSION,
        scriptSidecar: v2Sidecar(),
      },
    })).toThrow(/version mismatch: envelope 1, payload 2/);
  });

  it('hydrates the canonical sidecar read result through the session endpoint', async () => {
    const metadata = {
      writerOutput: {
        sidecarVersion: SCRIPT_SIDECAR_V2_VERSION,
        scriptSidecar: v2Sidecar(),
      },
    };
    const scriptSidecarRead = readPersistedScriptSidecar(metadata);
    routeMocks.getScript.mockResolvedValue({
      _id: 'document_1',
      sessionId: 'session_1',
      scriptId: 'script_1',
      title: 'V2 script',
      content: 'Rendered text is not a sidecar source.',
      blocks: [],
      richText: { type: 'doc', content: [] },
      metadata,
      scriptSidecarRead,
      version: 4,
      documentType: 'video_script',
      contentContract: {
        version: 1,
        documentKind: 'writer',
        outputKind: 'script',
        artifactType: 'video_script',
      },
    });

    vi.resetModules();
    const { POST } = await import('@/app/api/services/thinkforge/session/route');
    const response = await POST(new Request('http://localhost/api/services/thinkforge/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: 'session_1', scriptId: 'script_1' }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(routeMocks.getScript).toHaveBeenCalledWith('session_1', 'script_1');
    expect(body.script.metadata).toEqual(metadata);
    expect(body.script.scriptSidecarRead).toEqual(scriptSidecarRead);
  });
});
