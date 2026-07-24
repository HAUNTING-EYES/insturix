import { readFileSync } from 'fs';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  generateBackgroundMusic: vi.fn(),
  mediaAssetUpdateOne: vi.fn(),
  modelInvoke: vi.fn(),
}));

vi.hoisted(() => {
  process.env.MONGODB_URI ??= 'mongodb://localhost:27017/editron-test';
  process.env.MONGODB_DB_NAME ??= 'editron-test';
});

vi.mock('@langchain/google-genai', () => ({
  ChatGoogleGenerativeAI: class ChatGoogleGenerativeAIFixture {
    invoke(...args: unknown[]) {
      return mocks.modelInvoke(...args);
    }
  },
}));

vi.mock('@/lib/pipeline/bgm-service', () => ({
  generateBackgroundMusic: mocks.generateBackgroundMusic,
}));

vi.mock('@/lib/editron/db/mongodb', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/editron/db/mongodb')>();
  return {
    ...actual,
    getDatabase: vi.fn(async () => ({
      collection: vi.fn(() => ({ updateOne: mocks.mediaAssetUpdateOne })),
    })),
  };
});

vi.mock('@/lib/editron/services/asset-resolver', () => ({
  assetResolver: {
    stripUrlsForLLM: <T>(overlays: T[]) => structuredClone(overlays),
    resolveProjectAssets: async <T>(overlays: T[]) => structuredClone(overlays),
    resolveAssetUrl: vi.fn(async () => 'https://cdn.example.com/resolved.mp4'),
  },
}));

import { normalizeAgentToolArgs } from '@/lib/editron/agent/agent-graph';
import { CHAT_TOOL_REGISTRY } from '@/lib/editron/agent/chat-tool-registry';
import { createTools } from '@/lib/editron/agent/tools';
import { projectService } from '@/lib/editron/services/project-service';
import { ROW } from '@/lib/pipeline/scene-to-editron';

const BASE_PROJECT = {
  projectId: 'proj_phase3g',
  userId: 'user_1',
  name: 'Phase 3G fixture',
  aspectRatio: '16:9',
  playerDimensions: { width: 1920, height: 1080 },
  fps: 30,
  durationInFrames: 3600,
  overlays: [] as any[],
  createdAt: new Date('2026-07-17T00:00:00.000Z'),
  updatedAt: new Date('2026-07-17T00:00:00.000Z'),
  visibility: 'private',
};

function toolNamed(name: string) {
  const candidate = createTools('user_1', 'proj_phase3g').find((tool) => tool.name === name);
  expect(candidate, `${name} should be registered`).toBeDefined();
  return candidate as unknown as {
    name: string;
    invoke: (input: Record<string, unknown>) => Promise<string>;
  };
}

function parseEnvelope(raw: string) {
  return JSON.parse(raw) as {
    status: 'success' | 'error';
    data: Record<string, any> | null;
    error: { code?: string; message: string } | null;
  };
}

describe('chat Phase 3G operation contracts', () => {
  beforeEach(() => {
    mocks.generateBackgroundMusic.mockReset();
    mocks.mediaAssetUpdateOne.mockReset().mockResolvedValue({ acknowledged: true, upsertedCount: 1 });
    mocks.modelInvoke.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('normalizes only frame-valued time arguments with the live project FPS', () => {
    expect(normalizeAgentToolArgs('generate_html_scene', {
      start: '1.5s',
      duration: '2s',
      description: 'Hold for 3s, then reveal the title',
      videoStartTime: '2s',
      styles: 'fontSize: 72px; color: #FFF',
    }, { projectFps: 60 })).toEqual({
      start: 90,
      duration: 120,
      description: 'Hold for 3s, then reveal the title',
      videoStartTime: '2s',
      styles: { fontSize: 72, color: '#FFF' },
    });

    expect(normalizeAgentToolArgs('add_overlay', {
      styles: {
        fontSize: '72px',
        fontWeight: 'extra bold',
        opacity: '0.8',
        borderRadius: '8px',
        color: '#ffffff',
      },
    })).toEqual({
      styles: {
        fontSize: 72,
        fontWeight: 800,
        opacity: 0.8,
        borderRadius: '8px',
        color: '#ffffff',
      },
    });

    expect(normalizeAgentToolArgs('add_overlay', {
      text: 'Launch day',
    })).toEqual({
      text: 'Launch day',
      type: 'text',
    });
    expect(normalizeAgentToolArgs('add_overlay', {
      text: '   ',
    })).toEqual({
      text: '   ',
    });
    expect(normalizeAgentToolArgs('add_overlay', {
      type: 'image',
      text: 'Poster alt text',
    })).toEqual({
      type: 'image',
      text: 'Poster alt text',
    });

    const routeSource = readFileSync(join(
      process.cwd(),
      'app/api/services/editron/chat/stream/route.ts',
    ), 'utf8');
    expect(routeSource).toContain('projectFps: project.fps');
  });

  it('revises an existing HTML scene under the same overlay identity', async () => {
    const scene = {
      id: 41,
      type: 'html-scene',
      from: 120,
      durationInFrames: 180,
      row: 3,
      width: 1920,
      height: 1080,
      content: '<div style="color:#FFFFFF">Original headline</div>',
      prompt: 'Original scene',
      styles: { opacity: 0.9 },
    };
    const update = vi.spyOn(projectService, 'updateOverlay').mockResolvedValue();
    vi.spyOn(projectService, 'loadProject')
      .mockResolvedValueOnce({ ...BASE_PROJECT, overlays: [scene] } as any)
      .mockImplementationOnce(async () => ({
        ...BASE_PROJECT,
        overlays: [{ ...scene, content: (update.mock.calls[0]![3] as any).content }],
      }) as any);
    const add = vi.spyOn(projectService, 'addOverlay').mockResolvedValue();
    const remove = vi.spyOn(projectService, 'deleteOverlay').mockResolvedValue();
    mocks.modelInvoke.mockResolvedValue({
      content: '<div style="color:#FFD166;font-family:Inter">Revised headline</div>',
    });

    const result = parseEnvelope(await toolNamed('edit_html_scene').invoke({
      id: 41,
      instructions: 'Use the brand gold and change the headline to Revised headline.',
    }));

    expect(result, JSON.stringify(result)).toMatchObject({
      status: 'success',
      data: { id: 41, replacedInPlace: true },
    });
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith('user_1', 'proj_phase3g', 41, expect.objectContaining({
      content: expect.stringContaining('Revised headline'),
      prompt: expect.stringContaining('Revision:'),
    }));
    const updatePatch = update.mock.calls[0]![3] as Record<string, unknown>;
    expect(updatePatch).not.toHaveProperty('id');
    expect(updatePatch).not.toHaveProperty('from');
    expect(updatePatch).not.toHaveProperty('durationInFrames');
    expect(add).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(CHAT_TOOL_REGISTRY.edit_html_scene).toMatchObject({
      mutatesProject: true,
      executionType: 'generative',
    });
  });

  it('rejects HTML-scene revisions before generation when the target family is wrong', async () => {
    vi.spyOn(projectService, 'loadProject').mockResolvedValue({
      ...BASE_PROJECT,
      overlays: [{ id: 42, type: 'text', content: 'Not HTML', from: 0, durationInFrames: 30 }],
    } as any);
    const update = vi.spyOn(projectService, 'updateOverlay').mockResolvedValue();

    const result = parseEnvelope(await toolNamed('edit_html_scene').invoke({
      id: 42,
      instructions: 'Make it gold.',
    }));

    expect(result).toMatchObject({
      status: 'error',
      error: { code: 'HTML_SCENE_TYPE_MISMATCH' },
    });
    expect(mocks.modelInvoke).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('keeps current BGM and persistence untouched when generation fails', async () => {
    const currentBgm = {
      id: 70,
      type: 'sound',
      row: ROW.BGM,
      from: 0,
      durationInFrames: 3600,
      assetId: 'bgm_old',
      src: 'https://cdn.example.com/old.mp3',
      styles: { volume: 0.6 },
    };
    vi.spyOn(projectService, 'loadProject').mockResolvedValue({
      ...BASE_PROJECT,
      overlays: [currentBgm],
    } as any);
    const update = vi.spyOn(projectService, 'updateOverlay').mockResolvedValue();
    const add = vi.spyOn(projectService, 'addOverlay').mockResolvedValue();
    const remove = vi.spyOn(projectService, 'deleteOverlay').mockResolvedValue();
    mocks.generateBackgroundMusic.mockRejectedValue(new Error('provider unavailable'));

    const result = parseEnvelope(await toolNamed('regenerate_bgm').invoke({ mood: 'calm editorial' }));

    expect(result).toMatchObject({
      status: 'error',
      error: { code: 'BGM_REPLACEMENT_FAILED' },
    });
    expect(update).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(mocks.mediaAssetUpdateOne).not.toHaveBeenCalled();
  });

  it('registers a generated BGM before swapping it in place and then removes duplicates', async () => {
    const primary = {
      id: 70,
      type: 'sound',
      row: ROW.BGM,
      from: 0,
      durationInFrames: 3600,
      assetId: 'bgm_old',
      src: 'https://cdn.example.com/old.mp3',
      styles: { volume: 0.6 },
      metadata: { role: 'background-music' },
    };
    const duplicate = { ...primary, id: 71, assetId: 'bgm_duplicate' };
    const voice = {
      id: 10,
      type: 'video',
      from: 0,
      durationInFrames: 3600,
      hasNativeAudio: true,
      assetId: 'video_voice',
    };
    vi.spyOn(projectService, 'loadProject')
      .mockResolvedValueOnce({
        ...BASE_PROJECT,
        editorialPreferences: { musicPrompt: 'restrained documentary texture' },
        referenceEditDNA: { musicStyle: { genre: 'minimal electronic', tempo: 'medium' } },
        overlays: [voice, primary, duplicate],
      } as any)
      .mockResolvedValueOnce({
        ...BASE_PROJECT,
        overlays: [voice, { ...primary, assetId: 'bgm_new' }, duplicate],
      } as any);
    const update = vi.spyOn(projectService, 'updateOverlay').mockResolvedValue();
    const add = vi.spyOn(projectService, 'addOverlay').mockResolvedValue();
    const remove = vi.spyOn(projectService, 'deleteOverlay').mockResolvedValue();
    mocks.generateBackgroundMusic.mockResolvedValue({
      audioUrl: 'https://cdn.example.com/new.mp3',
      audioAssetId: 'bgm_new',
      gcsPath: 'users/user_1/bgm_new.mp3',
      durationMs: 120_000,
      buffer: Buffer.alloc(512),
    });

    const result = parseEnvelope(await toolNamed('regenerate_bgm').invoke({
      mood: 'hopeful and restrained',
      prompt: 'Warm analog pulse with a subtle lift near the ending',
    }));

    expect(result, JSON.stringify(result)).toMatchObject({
      status: 'success',
      data: {
        overlayId: 70,
        assetId: 'bgm_new',
        durationSec: 120,
        replacedInPlace: true,
        removedDuplicateCount: 1,
      },
    });
    expect(add).not.toHaveBeenCalled();
    expect(mocks.generateBackgroundMusic).toHaveBeenCalledWith(
      expect.stringMatching(/Warm analog pulse.*hopeful and restrained.*instrumental only, no vocals/i),
      'user_1',
      120,
    );
    expect(mocks.mediaAssetUpdateOne).toHaveBeenCalledWith(
      { assetId: 'bgm_new', userId: 'user_1' },
      expect.objectContaining({
        $setOnInsert: expect.objectContaining({ source: 'generated', projectId: 'proj_phase3g', size: 512 }),
      }),
      { upsert: true },
    );
    expect(update).toHaveBeenCalledWith('user_1', 'proj_phase3g', 70, expect.objectContaining({
      id: 70,
      assetId: 'bgm_new',
      styles: expect.objectContaining({ duckingConfig: expect.objectContaining({ enabled: true }) }),
      metadata: expect.objectContaining({
        audioPolicyEvidence: expect.objectContaining({
          mixOwner: 'applyAudioDuckingToProject',
          speechEvidenceCount: 1,
          voiceSourceOverlayIds: [10],
        }),
      }),
    }));
    expect(remove).toHaveBeenCalledWith('user_1', 'proj_phase3g', 71);
    expect(mocks.mediaAssetUpdateOne.mock.invocationCallOrder[0])
      .toBeLessThan(update.mock.invocationCallOrder[0]!);
    expect(update.mock.invocationCallOrder[0])
      .toBeLessThan(remove.mock.invocationCallOrder[0]!);
  });
});
