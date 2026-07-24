import { afterEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.MONGODB_URI ??= 'mongodb://localhost:27017/editron-test';
  process.env.MONGODB_DB_NAME ??= 'editron-test';
});

vi.mock('@/lib/editron/services/asset-resolver', () => ({
  assetResolver: {
    stripUrlsForLLM: <T>(overlays: T[]) => structuredClone(overlays),
    resolveProjectAssets: async <T>(overlays: T[]) => structuredClone(overlays),
    resolveAssetUrl: vi.fn(async () => 'https://cdn.example.com/resolved.mp4'),
  },
}));

import { createTools } from '@/lib/editron/agent/tools';
import { projectService } from '@/lib/editron/services/project-service';

type FixtureProject = {
  projectId: string;
  userId: string;
  name: string;
  aspectRatio: string;
  playerDimensions: { width: number; height: number };
  fps: number;
  durationInFrames: number;
  overlays: Array<Record<string, any>>;
  createdAt: Date;
  updatedAt: Date;
  visibility: string;
};

function makeProject(overlays: Array<Record<string, any>>, durationInFrames = 300): FixtureProject {
  return {
    projectId: 'proj_mechanical_tools',
    userId: 'user_mechanical_tools',
    name: 'Mechanical tool fixture',
    aspectRatio: '16:9',
    playerDimensions: { width: 1280, height: 720 },
    fps: 30,
    durationInFrames,
    overlays: structuredClone(overlays),
    createdAt: new Date('2026-07-18T00:00:00.000Z'),
    updatedAt: new Date('2026-07-18T00:00:00.000Z'),
    visibility: 'private',
  };
}

function installProjectStore(project: FixtureProject) {
  vi.spyOn(projectService, 'loadProject').mockImplementation(async () => structuredClone(project) as any);
  const updateOverlay = vi.spyOn(projectService, 'updateOverlay').mockImplementation(
    async (_userId, _projectId, overlayId, patch) => {
      const overlay = project.overlays.find((candidate) => candidate.id === overlayId);
      if (!overlay) throw new Error(`Overlay ${overlayId} not found`);
      Object.assign(overlay, structuredClone(patch));
    },
  );
  const addOverlay = vi.spyOn(projectService, 'addOverlay').mockImplementation(
    async (_userId, _projectId, overlay) => {
      project.overlays.push(structuredClone(overlay) as Record<string, any>);
    },
  );
  const updateProject = vi.spyOn(projectService, 'updateProject').mockImplementation(
    async (_userId, _projectId, patch) => {
      Object.assign(project, structuredClone(patch));
    },
  );
  const saveProject = vi.spyOn(projectService, 'saveProject').mockImplementation(
    async (_userId, _projectId, nextProject) => {
      Object.assign(project, structuredClone(nextProject));
    },
  );
  return { updateOverlay, addOverlay, updateProject, saveProject };
}

function toolNamed(name: string) {
  const candidate = createTools('user_mechanical_tools', 'proj_mechanical_tools')
    .find((tool) => tool.name === name);
  expect(candidate, `${name} should be registered`).toBeDefined();
  return candidate as unknown as {
    invoke: (input: Record<string, unknown>) => Promise<string>;
  };
}

function parseEnvelope(raw: string) {
  return JSON.parse(raw) as {
    status: 'success' | 'error';
    data: Record<string, any> | null;
    error: { code?: string; message: string; details?: Record<string, any> } | null;
  };
}

describe('chat mechanical tool contracts', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('splits a video while preserving source-time continuity and project duration truth', async () => {
    const project = makeProject([{
      id: 1,
      type: 'video',
      from: 30,
      durationInFrames: 90,
      videoStartTime: 12,
      row: 0,
      src: 'https://cdn.example.com/source.mp4',
    }], 999);
    const store = installProjectStore(project);

    const result = parseEnvelope(await toolNamed('split_overlay').invoke({ id: 1, atFrame: 70 }));

    expect(result).toMatchObject({
      status: 'success',
      data: {
        firstPart: { id: 1, from: 30, duration: 40 },
        secondPart: { from: 70, duration: 50 },
      },
    });
    expect(project.overlays).toHaveLength(2);
    expect(project.overlays.find((overlay) => overlay.id === 1)).toMatchObject({
      from: 30,
      durationInFrames: 40,
      videoStartTime: 12,
    });
    expect(project.overlays.find((overlay) => overlay.id !== 1)).toMatchObject({
      from: 70,
      durationInFrames: 50,
      videoStartTime: 52,
    });
    expect(project.durationInFrames).toBe(120);
    expect(store.addOverlay).toHaveBeenCalledTimes(1);
    expect(store.updateProject).toHaveBeenCalledWith(
      'user_mechanical_tools',
      'proj_mechanical_tools',
      { durationInFrames: 120 },
    );
  });

  it('rejects a split at an overlay boundary without mutating the project', async () => {
    const project = makeProject([{
      id: 2,
      type: 'sound',
      from: 100,
      durationInFrames: 60,
      startFromSound: 15,
    }]);
    const store = installProjectStore(project);

    const result = parseEnvelope(await toolNamed('split_overlay').invoke({ id: 2, atFrame: 160 }));

    expect(result).toMatchObject({
      status: 'error',
      error: { code: 'TOOL_HANDLER_ERROR', message: 'Split point must be within the overlay duration' },
    });
    expect(project.overlays).toHaveLength(1);
    expect(store.updateOverlay).not.toHaveBeenCalled();
    expect(store.addOverlay).not.toHaveBeenCalled();
    expect(store.updateProject).not.toHaveBeenCalled();
  });

  it('copies only requested style properties and reports missing targets', async () => {
    const project = makeProject([
      { id: 10, type: 'text', from: 0, durationInFrames: 90, styles: { color: '#FFD166', fontSize: 72 } },
      { id: 11, type: 'text', from: 90, durationInFrames: 90, styles: { color: '#FFFFFF', fontFamily: 'Inter' } },
    ]);
    const store = installProjectStore(project);

    const result = parseEnvelope(await toolNamed('sync_style').invoke({
      sourceId: 10,
      targetIds: [11, 999],
      properties: ['fontSize'],
    }));

    expect(result).toMatchObject({
      status: 'success',
      data: {
        results: [
          { id: 11, status: 'success' },
          { id: 999, status: 'error', message: 'Not found' },
        ],
      },
    });
    expect(project.overlays.find((overlay) => overlay.id === 11)?.styles).toEqual({
      color: '#FFFFFF',
      fontFamily: 'Inter',
      fontSize: 72,
    });
    expect(store.updateOverlay).toHaveBeenCalledTimes(1);
  });

  it('closes timeline gaps for every overlay family and recalculates duration', async () => {
    const project = makeProject([
      { id: 20, type: 'video', from: 30, durationInFrames: 60, row: 0 },
      { id: 21, type: 'video', from: 120, durationInFrames: 60, row: 0 },
      { id: 22, type: 'caption', sourceVideoId: 20, from: 40, durationInFrames: 40, row: 4 },
      { id: 23, type: 'text', from: 130, durationInFrames: 30, row: 3 },
      { id: 24, type: 'sound', from: 120, durationInFrames: 120, row: 2 },
    ], 300);
    const store = installProjectStore(project);

    const result = parseEnvelope(await toolNamed('close_gaps').invoke({ preserveCaptions: true }));

    expect(result).toMatchObject({
      status: 'success',
      data: { clipsMoved: 5, totalFramesClosed: 60, totalSecondsClosed: 2 },
    });
    expect(Object.fromEntries(project.overlays.map((overlay) => [overlay.id, overlay.from]))).toEqual({
      20: 0,
      21: 60,
      22: 10,
      23: 70,
      24: 60,
    });
    expect(project.durationInFrames).toBe(180);
    expect(store.updateOverlay).toHaveBeenCalledTimes(5);
    expect(store.updateProject).toHaveBeenCalledWith(
      'user_mechanical_tools',
      'proj_mechanical_tools',
      { durationInFrames: 180 },
    );
  });

  it('atomically removes a timeline range while preserving source continuity across overlay families', async () => {
    const project = makeProject([
      {
        id: 1,
        type: 'video',
        from: 0,
        durationInFrames: 120,
        sourceStartFrame: 30,
        videoStartTime: 30,
        row: 0,
      },
      {
        id: 2,
        type: 'sound',
        assetId: 'voiceover_source',
        metadata: { role: 'voiceover' },
        from: 0,
        durationInFrames: 120,
        startFromSound: 60,
        row: 4,
      },
      {
        id: 3,
        type: 'sound',
        assetId: 'bgm_track',
        metadata: { role: 'background_music' },
        from: 0,
        durationInFrames: 240,
        startFromSound: 0,
        row: 1,
      },
      {
        id: 4,
        type: 'caption',
        from: 0,
        durationInFrames: 240,
        row: 4,
        words: [
          { word: 'before', startMs: 0, endMs: 900 },
          { word: 'remove', startMs: 1100, endMs: 1900 },
          { word: 'after', startMs: 2100, endMs: 2900 },
        ],
      },
      { id: 5, type: 'text', from: 150, durationInFrames: 30, row: 3 },
      {
        id: 6,
        type: 'transition',
        from: 45,
        durationInFrames: 30,
        row: 0,
        clipAId: 1,
        clipBId: 5,
      },
    ], 240);
    const store = installProjectStore(project);

    const result = parseEnvelope(await toolNamed('cut_section').invoke({
      startFrame: 30,
      endFrame: 60,
    }));

    expect(result).toMatchObject({
      status: 'success',
      data: {
        deleted: 1,
        trimmed: 4,
        shifted: 1,
        split: 2,
        created: 2,
        framesCut: 30,
        affectedFrameRange: { startFrame: 30, endFrame: 31 },
      },
    });
    expect(project.durationInFrames).toBe(210);
    expect(project.overlays).toHaveLength(7);

    const videos = project.overlays
      .filter((overlay) => overlay.type === 'video')
      .sort((left, right) => left.from - right.from);
    expect(videos).toEqual([
      expect.objectContaining({
        id: 1,
        from: 0,
        durationInFrames: 30,
        sourceStartFrame: 30,
        videoStartTime: 30,
      }),
      expect.objectContaining({
        from: 30,
        durationInFrames: 60,
        sourceStartFrame: 90,
        videoStartTime: 90,
      }),
    ]);

    const voiceovers = project.overlays
      .filter((overlay) => overlay.type === 'sound' && overlay.assetId === 'voiceover_source')
      .sort((left, right) => left.from - right.from);
    expect(voiceovers).toEqual([
      expect.objectContaining({ from: 0, durationInFrames: 30, startFromSound: 60 }),
      expect.objectContaining({ from: 30, durationInFrames: 60, startFromSound: 120 }),
    ]);
    expect(project.overlays.find((overlay) => overlay.id === 3)).toMatchObject({
      from: 0,
      durationInFrames: 210,
      startFromSound: 0,
    });
    expect(project.overlays.find((overlay) => overlay.id === 4)).toMatchObject({
      from: 0,
      durationInFrames: 210,
      words: [
        { word: 'before', startMs: 0, endMs: 900 },
        { word: 'after', startMs: 1100, endMs: 1900 },
      ],
    });
    expect(project.overlays.find((overlay) => overlay.id === 5)).toMatchObject({ from: 120 });
    expect(project.overlays.some((overlay) => overlay.id === 6)).toBe(false);
    expect(store.updateOverlay).not.toHaveBeenCalled();
    expect(store.addOverlay).not.toHaveBeenCalled();
    expect(store.updateProject).not.toHaveBeenCalled();
    expect(store.saveProject).toHaveBeenCalledTimes(1);
  });
});
