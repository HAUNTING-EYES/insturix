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
import { buildChatEditRenderVerificationRequest } from '@/lib/editron/agent/chat-ai-edit-transaction-runtime';
import { enforceChatToolPostcondition } from '@/lib/editron/agent/chat-edit-postconditions';
import { EDITRON_TEXT_SHADOW_FLOOR } from '@/lib/editron/agent/chat-overlay-safe-placement';
import { createChatVisualTools } from '@/lib/editron/agent/chat-visual-tools';
import {
  projectService,
  ProjectMutationConflictError,
} from '@/lib/editron/services/project-service';
import { cutTimelineRange } from '@/lib/editron/services/timeline-range-cut';

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
  projectRevision?: number;
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
    projectRevision: 1,
    visibility: 'private',
  };
}

function installProjectStore(project: FixtureProject) {
  vi.spyOn(projectService, 'loadProject').mockImplementation(async () => structuredClone(project) as any);
  const cutTimelineRangeV1 = vi.spyOn(projectService, 'cutTimelineRangeV1')
    .mockImplementation(async (_userId, projectId, command) => {
      const beforeDurationInFrames = project.durationInFrames;
      const beforeRevision = {
        schemaVersion: 1 as const,
        value: project.projectRevision ?? 1,
        compatibilityUpdatedAt: project.updatedAt.toISOString(),
      };
      const cut = cutTimelineRange({
        overlays: project.overlays,
        startFrame: command.startFrame,
        endFrame: command.endFrame,
        fps: project.fps,
        durationInFrames: beforeDurationInFrames,
      });
      const committedAt = '2026-07-18T00:00:01.000Z';
      const afterRevision = {
        schemaVersion: 1 as const,
        value: beforeRevision.value + 1,
        compatibilityUpdatedAt: committedAt,
      };
      const removedRange = cut.timelineCoordinateTransform.removedRange;
      const affectedFrameRangesAfter = removedRange.endFrame < beforeDurationInFrames
        ? [{ startFrame: removedRange.startFrame, endFrame: cut.newDurationInFrames }]
        : [];
      Object.assign(project, {
        overlays: structuredClone(cut.overlays),
        durationInFrames: cut.newDurationInFrames,
        projectRevision: afterRevision.value,
        updatedAt: new Date(committedAt),
      });
      return {
        cut,
        mutationReceipt: {
          schemaVersion: 1 as const,
          projectId,
          revision: afterRevision,
          committedAt,
        },
        timelineChangeReceipt: {
          schemaVersion: 1 as const,
          receiptId: 'timeline-cut_chat-tool-test',
          projectId,
          operation: 'CUT_TIMELINE_RANGE',
          actorKind: command.actorKind,
          coordinateDomain: 'PROJECT_TIMELINE_FRAME_V1',
          fps: project.fps,
          beforeProjectRevision: beforeRevision,
          afterProjectRevision: afterRevision,
          committedAt,
          readFrameRangesBefore: [{ startFrame: 0, endFrame: beforeDurationInFrames }],
          writeFrameRangesBefore: [{ startFrame: removedRange.startFrame, endFrame: beforeDurationInFrames }],
          affectedFrameRangesAfter,
        },
      } as any;
    });
  const updateOverlay = vi.spyOn(projectService, 'updateOverlayAtRevisionV1').mockImplementation(
    async (_userId, projectId, command) => {
      const currentRevision = project.projectRevision ?? 0;
      if (command.expectedRevision.value !== currentRevision
        || command.expectedRevision.compatibilityUpdatedAt !== project.updatedAt.toISOString()) {
        throw new Error('PROJECT_MUTATION_CONFLICT');
      }
      const overlay = project.overlays.find((candidate) => candidate.id === command.overlayId);
      if (!overlay) throw new Error(`Overlay ${command.overlayId} not found`);
      const committedAt = new Date(project.updatedAt.getTime() + 1_000).toISOString();
      const afterRevision = {
        schemaVersion: 1 as const,
        value: currentRevision + 1,
        compatibilityUpdatedAt: committedAt,
      };
      Object.assign(overlay, structuredClone(command.updates));
      project.projectRevision = afterRevision.value;
      project.updatedAt = new Date(committedAt);
      return {
        mutationReceipt: {
          schemaVersion: 1 as const,
          projectId,
          revision: afterRevision,
          committedAt,
        },
        timelineChangeReceipt: {},
      } as any;
    },
  );
  const addOverlay = vi.spyOn(projectService, 'addOverlayAtRevisionV1').mockImplementation(
    async (_userId, projectId, command) => {
      const currentRevision = project.projectRevision ?? 0;
      if (command.expectedRevision.value !== currentRevision
        || command.expectedRevision.compatibilityUpdatedAt !== project.updatedAt.toISOString()) {
        throw new Error('PROJECT_MUTATION_CONFLICT');
      }
      const committedAt = new Date(project.updatedAt.getTime() + 1_000).toISOString();
      const afterRevision = {
        schemaVersion: 1 as const,
        value: currentRevision + 1,
        compatibilityUpdatedAt: committedAt,
      };
      project.overlays.push(structuredClone(command.overlay) as Record<string, any>);
      project.projectRevision = afterRevision.value;
      project.updatedAt = new Date(committedAt);
      return {
        mutationReceipt: {
          schemaVersion: 1 as const,
          projectId,
          revision: afterRevision,
          committedAt,
        },
        timelineChangeReceipt: {},
      } as any;
    },
  );
  const deleteOverlay = vi.spyOn(projectService, 'deleteOverlayAtRevisionV1').mockImplementation(
    async (_userId, projectId, command) => {
      const currentRevision = project.projectRevision ?? 0;
      if (command.expectedRevision.value !== currentRevision
        || command.expectedRevision.compatibilityUpdatedAt !== project.updatedAt.toISOString()) {
        throw new Error('PROJECT_MUTATION_CONFLICT');
      }
      const committedAt = new Date(project.updatedAt.getTime() + 1_000).toISOString();
      const afterRevision = {
        schemaVersion: 1 as const,
        value: currentRevision + 1,
        compatibilityUpdatedAt: committedAt,
      };
      project.overlays = project.overlays.filter((candidate) => candidate.id !== command.overlayId);
      project.projectRevision = afterRevision.value;
      project.updatedAt = new Date(committedAt);
      return {
        mutationReceipt: {
          schemaVersion: 1 as const,
          projectId,
          revision: afterRevision,
          committedAt,
        },
        timelineChangeReceipt: {},
      } as any;
    },
  );
  const reconcileProjectDuration = vi.spyOn(
    projectService,
    'reconcileProjectDurationFromOverlaysV1',
  ).mockImplementation(
    async (_userId, projectId, command) => {
      const durationInFrames = project.overlays.reduce(
        (maximum, overlay) => Math.max(
          maximum,
          Number(overlay.from) + Number(overlay.durationInFrames),
        ),
        0,
      );
      if (durationInFrames === project.durationInFrames) {
        return {
          disposition: 'ALREADY_CURRENT',
          durationInFrames,
          currentRevision: {
            schemaVersion: 1,
            value: project.projectRevision ?? 0,
            compatibilityUpdatedAt: project.updatedAt.toISOString(),
          },
        } as any;
      }
      const committedAt = new Date(project.updatedAt.getTime() + 1_000).toISOString();
      const beforeRevision = {
        schemaVersion: 1 as const,
        value: project.projectRevision ?? 0,
        compatibilityUpdatedAt: project.updatedAt.toISOString(),
      };
      const afterRevision = {
        schemaVersion: 1 as const,
        value: beforeRevision.value + 1,
        compatibilityUpdatedAt: committedAt,
      };
      project.durationInFrames = durationInFrames;
      project.projectRevision = afterRevision.value;
      project.updatedAt = new Date(committedAt);
      return {
        disposition: 'APPLIED',
        durationInFrames,
        mutationReceipt: {
          schemaVersion: 1,
          projectId,
          revision: afterRevision,
          committedAt,
        },
        timelineChangeReceipt: {
          actorKind: command.actorKind,
          beforeProjectRevision: beforeRevision,
          afterProjectRevision: afterRevision,
        },
      } as any;
    },
  );
  const saveProject = vi.fn();
  return {
    updateOverlay,
    addOverlay,
    deleteOverlay,
    reconcileProjectDuration,
    saveProject,
    cutTimelineRangeV1,
  };
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
    status: 'success' | 'error' | 'no-op';
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
        affectedFrameRanges: [{ startFrame: 69, endFrame: 72 }],
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
    expect(store.reconcileProjectDuration).toHaveBeenCalledWith(
      'user_mechanical_tools',
      'proj_mechanical_tools',
      { actorKind: 'AGENT' },
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
    expect(store.reconcileProjectDuration).not.toHaveBeenCalled();
  });

  it('carries a visual producer mutation window through postconditions into render verification', async () => {
    const project = makeProject([{
      id: 3,
      type: 'video',
      assetId: 'asset-video-3',
      from: 0,
      durationInFrames: 180,
      sourceStartFrame: 0,
      sourceEndFrame: 180,
      row: 0,
      src: 'https://cdn.example.com/source.mp4',
    }], 180);
    const store = installProjectStore(project);
    const beforeProject = structuredClone(project);
    const beforeRevision = {
      schemaVersion: 1 as const,
      value: 1,
      compatibilityUpdatedAt: project.updatedAt.toISOString(),
    };
    const committedAt = '2026-07-18T00:00:01.000Z';
    const afterRevision = {
      schemaVersion: 1 as const,
      value: 2,
      compatibilityUpdatedAt: committedAt,
    };
    const sourceTimeTransform = {
      schemaVersion: 1 as const,
      rendererMappingVersion: 'EDITRON_STEP_SPEED_SEGMENTS_SOURCE_SPAN_V2',
      projectId: project.projectId,
      overlayId: '3',
      assetId: 'asset-video-3',
      beforeProjectRevision: beforeRevision,
      afterProjectRevision: afterRevision,
      timelineStartFrame: 0,
      sourceStartFrame: 0,
      sourceEndFrameExclusive: 180,
      durationInFrames: 90,
      transformSha256: 'a'.repeat(64),
    };
    const loadForMutation = vi.spyOn(projectService, 'loadProjectForMutation')
      .mockResolvedValue({ project: structuredClone(project), revision: beforeRevision } as any);
    const applyRetime = vi.spyOn(projectService, 'applyVideoSourceRangeRetimeV1')
      .mockImplementation(async (_userId, projectId, command) => {
        expect(command).toEqual({
          expectedRevision: beforeRevision,
          actorKind: 'AGENT',
          overlayId: 3,
          playbackRate: 2,
        });
        Object.assign(project.overlays[0], {
          durationInFrames: 90,
          sourceStartFrame: 0,
          sourceEndFrame: 180,
          speedCurve: [{ frame: 0, value: 2 }, { frame: 89, value: 2 }],
        });
        Object.assign(project, {
          durationInFrames: 90,
          projectRevision: 2,
          updatedAt: new Date(committedAt),
        });
        const sourceRangeRetimeEffect = {
          beforeTimelineRange: { startFrame: 0, endFrame: 180 },
          afterTimelineRange: { startFrame: 0, endFrame: 90 },
          beforeProjectDurationInFrames: 180,
          afterProjectDurationInFrames: 90,
          shiftedBeforeRange: { startFrame: 180, endFrame: 180 },
          shiftedAfterRange: { startFrame: 90, endFrame: 90 },
          deltaFrames: -90,
          affectedOverlayIds: [3],
        };
        const timelineChangeReceipt = {
          schemaVersion: 1 as const,
          receiptId: 'timeline-video-source-retime_chat-tool-test',
          projectId,
          operation: 'RETIME_VIDEO_SOURCE_RANGE' as const,
          actorKind: 'AGENT' as const,
          beforeProjectRevision: beforeRevision,
          afterProjectRevision: afterRevision,
          committedAt,
          affectedFrameRangesAfter: [{ startFrame: 0, endFrame: 90 }],
          sourceTimeTransform,
        };
        return {
          disposition: 'APPLIED' as const,
          mutationReceipt: {
            schemaVersion: 1 as const,
            projectId,
            revision: afterRevision,
            committedAt,
          },
          timelineChangeReceipt,
          sourceRangeRetimeEffect,
          sourceTimeTransform,
        } as any;
      });
    const args = {
      videoOverlayId: 3,
      startFrame: 0,
      endFrame: 180,
      targetSpeed: 2,
      allowDialogueSpeedRamp: false,
    };

    const rawOutput = await toolNamed('apply_speed_ramp').invoke(args);
    const result = parseEnvelope(rawOutput);

    expect(result).toMatchObject({
      status: 'success',
      data: {
        disposition: 'APPLIED',
        affectedFrameRanges: [{ startFrame: 0, endFrame: 90 }],
        sourceTimeTransform,
      },
    });
    expect(loadForMutation).toHaveBeenCalledWith(project.userId, project.projectId);
    expect(applyRetime).toHaveBeenCalledTimes(1);
    expect(store.updateOverlay).not.toHaveBeenCalled();

    const enforced = enforceChatToolPostcondition({
      toolName: 'apply_speed_ramp',
      args,
      output: rawOutput,
      beforeProject,
      afterProject: project,
    });
    expect(enforced.verification?.status).toBe('pass');

    const request = buildChatEditRenderVerificationRequest({
      transaction: {
        operationId: 'op_visual_mutation_window',
        sessionId: 'session_visual_mutation_window',
        projectId: project.projectId,
        userId: project.userId,
        beforeCheckpointId: 'checkpoint_before_visual_mutation',
      },
      afterCheckpointId: 'checkpoint_after_visual_mutation',
      project,
      successfulCalls: [{
        call: { name: 'apply_speed_ramp', args },
        result: {
          toolName: 'apply_speed_ramp',
          result: enforced.output,
        },
      }],
      requestedAt: '2026-07-28T00:00:00.000Z',
    });

    expect(request.mutationRanges).toEqual([{
      startFrame: 0,
      endFrame: 90,
      toolName: 'apply_speed_ramp',
    }]);
    expect(request.sampleFrames).toEqual([0, 45, 89]);
  });

  it('safe-stops unsupported partial slow motion before calling any writer', async () => {
    const project = makeProject([{
      id: 4,
      type: 'video',
      assetId: 'asset-video-4',
      from: 0,
      durationInFrames: 180,
      sourceStartFrame: 0,
      sourceEndFrame: 180,
      row: 0,
      src: 'https://cdn.example.com/source.mp4',
    }], 180);
    const store = installProjectStore(project);
    vi.spyOn(projectService, 'loadProjectForMutation').mockResolvedValue({
      project: structuredClone(project),
      revision: {
        schemaVersion: 1,
        value: 1,
        compatibilityUpdatedAt: project.updatedAt.toISOString(),
      },
    } as any);
    const applyRetime = vi.spyOn(projectService, 'applyVideoSourceRangeRetimeV1');

    const result = parseEnvelope(await toolNamed('apply_speed_ramp').invoke({
      videoOverlayId: 4,
      startFrame: 30,
      endFrame: 90,
      targetSpeed: 0.5,
    }));

    expect(result).toMatchObject({
      status: 'error',
      error: {
        code: 'TOOL_HANDLER_ERROR',
        details: { raw: { data: {
          disposition: 'SAFE_STOP',
          reason: 'UNSUPPORTED_PUBLIC_RETIME_FORM',
        } } },
      },
    });
    expect(applyRetime).not.toHaveBeenCalled();
    expect(store.updateOverlay).not.toHaveBeenCalled();
    expect(project).toEqual(makeProject([{
      id: 4,
      type: 'video',
      assetId: 'asset-video-4',
      from: 0,
      durationInFrames: 180,
      sourceStartFrame: 0,
      sourceEndFrame: 180,
      row: 0,
      src: 'https://cdn.example.com/source.mp4',
    }], 180));
  });

  it('reports exact affected windows from every visual mutation producer', async () => {
    const project = makeProject([
      {
        id: 30,
        type: 'video',
        assetId: 'asset_video_30',
        from: 0,
        durationInFrames: 180,
        row: 0,
        left: 0,
        top: 0,
        width: 1280,
        height: 720,
        styles: {},
      },
      {
        id: 31,
        type: 'text',
        from: 20,
        durationInFrames: 60,
        row: 0,
        content: 'Target title',
      },
      {
        id: 32,
        type: 'image',
        from: 30,
        durationInFrames: 70,
        row: 1,
        left: 100,
        top: 100,
        width: 300,
        height: 200,
      },
      {
        id: 33,
        type: 'text',
        from: 100,
        durationInFrames: 30,
        row: 4,
        content: 'Move me',
      },
    ], 180);
    installProjectStore(project);

    const shake = parseEnvelope(await toolNamed('apply_camera_shake').invoke({
      videoOverlayId: 30,
      targetFrame: 40,
      durationFrames: 10,
    }));
    expect(shake.data?.affectedFrameRanges).toEqual([{ startFrame: 40, endFrame: 52 }]);

    const fade = parseEnvelope(await toolNamed('apply_fade').invoke({
      overlayId: 31,
      startFrame: 60,
      endFrame: 75,
      direction: 'out',
    }));
    expect(fade.data?.affectedFrameRanges).toEqual([{ startFrame: 60, endFrame: 75 }]);

    const reorder = parseEnvelope(await toolNamed('reorder_layer').invoke({
      overlayId: 31,
      referenceOverlayId: 32,
      relation: 'behind',
    }));
    expect(reorder.data?.affectedFrameRanges).toEqual([{ startFrame: 30, endFrame: 80 }]);

    const retime = parseEnvelope(await toolNamed('move_retime_overlay').invoke({
      overlayId: 33,
      startFrame: 140,
    }));
    expect(retime.data?.affectedFrameRanges).toEqual([
      { startFrame: 100, endFrame: 130 },
      { startFrame: 140, endFrame: 170 },
    ]);

    const filter = parseEnvelope(await toolNamed('apply_filter').invoke({
      overlayId: 30,
      filterIntent: 'warmer',
    }));
    expect(filter.data?.affectedFrameRanges).toEqual([{ startFrame: 0, endFrame: 180 }]);

    const reframeDependencies = {
      loadProjectForMutation: vi.fn(async () => ({
        project: structuredClone(project) as Record<string, any>,
        revision: {
          schemaVersion: 1 as const,
          value: 5,
          compatibilityUpdatedAt: '2026-08-25T12:00:00.000Z',
        },
      })),
      loadAnalyses: vi.fn(async () => []),
      loadSourceRasters: vi.fn(async () => ({})),
      saveProjectWithReceipt: vi.fn(async (input: { project: Record<string, any> }) => {
        Object.assign(project, structuredClone(input.project));
      }),
    };
    const reframeTool = createChatVisualTools({
      userId: project.userId,
      projectId: project.projectId,
      subjectReframeDependencies: reframeDependencies,
    }).find((candidate) => candidate.name === 'reframe_project');
    expect(reframeTool).toBeDefined();
    const reframe = JSON.parse(await reframeTool!.invoke({ targetAspectRatio: '9:16' })) as {
      status: string;
      data?: Record<string, any>;
    };
    expect(reframe.status).toBe('success');
    expect(reframe.data?.affectedFrameRanges).toEqual([{ startFrame: 0, endFrame: 180 }]);
    expect(reframeDependencies.saveProjectWithReceipt).toHaveBeenCalledTimes(1);
    expect(reframeDependencies.saveProjectWithReceipt).toHaveBeenCalledWith(expect.objectContaining({
      expectedRevision: {
        schemaVersion: 1,
        value: 5,
        compatibilityUpdatedAt: '2026-08-25T12:00:00.000Z',
      },
      projectUpdates: expect.objectContaining({
        'intelligence.lastSubjectReframe': expect.any(Object),
      }),
    }));
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
        affectedFrameRanges: [{ startFrame: 90, endFrame: 180 }],
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
      data: {
        clipsMoved: 5,
        totalFramesClosed: 60,
        totalSecondsClosed: 2,
        affectedFrameRanges: expect.arrayContaining([
          { startFrame: 0, endFrame: 60 },
          { startFrame: 30, endFrame: 90 },
          { startFrame: 60, endFrame: 180 },
          { startFrame: 120, endFrame: 240 },
        ]),
      },
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
    expect(store.reconcileProjectDuration).toHaveBeenCalledWith(
      'user_mechanical_tools',
      'proj_mechanical_tools',
      { actorKind: 'AGENT' },
    );
  });

  it('reports old and new windows for canonical retime, trim, batch, and delete mutations', async () => {
    const project = makeProject([
      { id: 40, type: 'text', from: 10, durationInFrames: 30, row: 2, content: 'Move' },
      {
        id: 41,
        type: 'video',
        from: 0,
        durationInFrames: 100,
        row: 0,
        videoStartTime: 12,
      },
      { id: 42, type: 'image', from: 120, durationInFrames: 30, row: 2 },
      { id: 43, type: 'text', from: 150, durationInFrames: 30, row: 3, styles: { color: '#fff' } },
    ], 240);
    installProjectStore(project);

    const update = parseEnvelope(await toolNamed('move_retime_overlay').invoke({
      overlayId: 40,
      startFrame: 50,
    }));
    expect(update.data?.affectedFrameRanges).toEqual([
      { startFrame: 10, endFrame: 40 },
      { startFrame: 50, endFrame: 80 },
    ]);

    const shadowTimingAttempt = parseEnvelope(await toolNamed('update_overlay').invoke({
      id: 40,
      start: 70,
    }));
    expect(shadowTimingAttempt).toMatchObject({
      status: 'error',
      error: {
        code: 'TOOL_INVOKE_EXCEPTION',
        message: expect.stringContaining('Unrecognized key: "start"'),
      },
    });

    const trim = parseEnvelope(await toolNamed('trim_overlay').invoke({
      id: 41,
      trimStart: 10,
      trimEnd: 20,
    }));
    expect(trim.data?.affectedFrameRanges).toEqual([
      { startFrame: 0, endFrame: 10 },
      { startFrame: 80, endFrame: 100 },
    ]);

    const batch = parseEnvelope(await toolNamed('batch_update_overlays').invoke({
      updates: [{
        id: 43,
        start: 180,
        styles: { color: '#ffd166' },
      }],
    }));
    expect(batch.data?.affectedFrameRanges).toEqual([
      { startFrame: 150, endFrame: 180 },
      { startFrame: 180, endFrame: 210 },
    ]);

    const deletion = parseEnvelope(await toolNamed('delete_overlay').invoke({ id: 42 }));
    expect(deletion.data?.affectedFrameRanges).toEqual([{ startFrame: 120, endFrame: 150 }]);
  });

  it('reports already-applied audio ducking as a no-op instead of a successful mutation', async () => {
    const project = makeProject([
      {
        id: 90,
        type: 'sound',
        row: 1,
        assetId: 'bgm_main',
        styles: {
          volume: 0.18,
          duckingConfig: {
            enabled: true,
            duckLevel: 0.18,
            rampDownMs: 300,
            rampUpMs: 600,
            lookAheadMs: 200,
          },
        },
      },
      { id: 91, type: 'video', row: 0, assetId: 'voice_video', styles: { volume: 1 } },
    ]);
    const store = installProjectStore(project);

    const result = parseEnvelope(await toolNamed('apply_audio_ducking').invoke({
      enabled: true,
      duckLevel: 0.18,
      rampDownMs: 300,
      rampUpMs: 600,
      lookAheadMs: 200,
    }));

    expect(result).toMatchObject({
      status: 'no-op',
      nextAction: 'stop',
      data: { status: 'unchanged', updates: [] },
    });
    expect(store.updateOverlay).not.toHaveBeenCalled();
  });

  it('preserves an exact delete target instead of coercing or substituting another overlay id', async () => {
    const project = makeProject([
      { id: 71, type: 'video', from: 0, durationInFrames: 90, row: 0 },
      { id: 72, type: 'caption', sourceVideoId: 71, from: 0, durationInFrames: 90, row: 4 },
    ], 90);
    const store = installProjectStore(project);

    const missing = parseEnvelope(await toolNamed('delete_overlay').invoke({
      id: 'battle_missing_overlay',
    }));

    expect(missing.status).toBe('error');
    expect(project.overlays.map((overlay) => overlay.id)).toEqual([71, 72]);
    expect(store.deleteOverlay).not.toHaveBeenCalled();

    const deleted = parseEnvelope(await toolNamed('delete_overlay').invoke({ id: '71' }));
    expect(deleted.status).toBe('success');
    expect(project.overlays).toEqual([]);
    expect(store.deleteOverlay).toHaveBeenLastCalledWith(
      'user_mechanical_tools',
      'proj_mechanical_tools',
      expect.objectContaining({
        actorKind: 'AGENT',
        overlayId: 71,
        expectedRevision: expect.objectContaining({ value: 2 }),
      }),
    );
  });

  it('preserves text legibility when a layer reorder moves transparent text toward the front', async () => {
    const project = makeProject([
      {
        id: 80,
        type: 'text',
        from: 0,
        durationInFrames: 90,
        row: 3,
        content: 'Foreground title',
        styles: {
          color: '#ffffff',
          backgroundColor: 'transparent',
        },
      },
      {
        id: 81,
        type: 'image',
        from: 0,
        durationInFrames: 90,
        row: 2,
      },
    ], 90);
    installProjectStore(project);

    const reordered = parseEnvelope(await toolNamed('reorder_layer').invoke({
      overlayId: 80,
      referenceOverlayId: 81,
      relation: 'in-front-of',
    }));

    expect(reordered.status).toBe('success');
    expect(reordered.data?.updates).toEqual([
      expect.objectContaining({
        overlayId: 80,
        previousRow: 3,
        nextRow: 1,
        nextStyles: expect.objectContaining({
          textShadow: EDITRON_TEXT_SHADOW_FLOOR,
        }),
      }),
    ]);
    expect(project.overlays.find((overlay) => overlay.id === 80)).toMatchObject({
      row: 1,
      styles: {
        color: '#ffffff',
        backgroundColor: 'transparent',
        textShadow: EDITRON_TEXT_SHADOW_FLOOR,
      },
    });
  });

  it('normalizes editor-style text fill without dropping batch style mutations', async () => {
    const project = makeProject([
      {
        id: 44,
        type: 'text',
        from: 20,
        durationInFrames: 90,
        row: 2,
        content: 'Keep this wording',
        styles: { color: '#111111', fontSize: 42 },
      },
      {
        id: 45,
        type: 'shape',
        from: 20,
        durationInFrames: 90,
        row: 3,
        styles: { fill: '#222222' },
      },
    ], 180);
    installProjectStore(project);

    const batch = parseEnvelope(await toolNamed('batch_update_overlays').invoke({
      updates: [
        { id: 44, styles: { fill: '#FFFFFF' } },
        { id: 45, styles: { fill: '#FFCC00' } },
      ],
    }));

    expect(batch.status).toBe('success');
    expect(project.overlays[0]).toMatchObject({
      id: 44,
      from: 20,
      durationInFrames: 90,
      content: 'Keep this wording',
      styles: {
        color: '#FFFFFF',
        fontSize: 42,
      },
    });
    expect(project.overlays[0]?.styles).not.toHaveProperty('fill');
    expect(project.overlays[1]?.styles).toMatchObject({ fill: '#FFCC00' });
  });

  it('rejects unknown batch style properties instead of silently stripping them', async () => {
    const project = makeProject([
      { id: 46, type: 'text', from: 0, durationInFrames: 60, row: 2, content: 'Text' },
    ]);
    installProjectStore(project);

    const result = parseEnvelope(await toolNamed('batch_update_overlays').invoke({
      updates: [{ id: 46, styles: { colour: '#FFFFFF' } }],
    }));

    expect(result.status).toBe('error');
    expect(result.error).toMatchObject({
      code: 'TOOL_INVOKE_EXCEPTION',
    });
    expect(result.error?.message).toContain('Unrecognized key: "colour"');
    expect(project.overlays[0]?.styles).toBeUndefined();
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
        affectedFrameRangesBefore: [{ startFrame: 30, endFrame: 240 }],
        affectedFrameRanges: [{ startFrame: 30, endFrame: 210 }],
        timelineChangeReceipt: {
          operation: 'CUT_TIMELINE_RANGE',
          actorKind: 'AGENT',
          writeFrameRangesBefore: [{ startFrame: 30, endFrame: 240 }],
          affectedFrameRangesAfter: [{ startFrame: 30, endFrame: 210 }],
        },
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
    expect(store.reconcileProjectDuration).not.toHaveBeenCalled();
    expect(store.saveProject).not.toHaveBeenCalled();
    expect(store.cutTimelineRangeV1).toHaveBeenCalledWith(
      'user_mechanical_tools',
      'proj_mechanical_tools',
      { actorKind: 'AGENT', startFrame: 30, endFrame: 60 },
    );
    expect(result.data?.mutationReceipt).toMatchObject({
      projectId: 'proj_mechanical_tools',
      revision: { schemaVersion: 1, value: 2 },
    });
  });

  it('rejects a stale chat cut without overwriting the newer project state', async () => {
    const project = makeProject([{
      id: 7,
      type: 'video',
      from: 0,
      durationInFrames: 180,
      content: 'original-source',
      row: 0,
    }], 180);
    const store = installProjectStore(project);
    const currentRevision = {
      schemaVersion: 1 as const,
      value: 8,
      compatibilityUpdatedAt: '2026-07-18T00:00:08.000Z',
    };
    store.cutTimelineRangeV1.mockImplementationOnce(async () => {
      project.overlays[0].content = 'newer-user-source';
      project.projectRevision = currentRevision.value;
      project.updatedAt = new Date(currentRevision.compatibilityUpdatedAt);
      throw new ProjectMutationConflictError(currentRevision);
    });

    const result = parseEnvelope(await toolNamed('cut_section').invoke({
      startFrame: 30,
      endFrame: 60,
    }));

    expect(result).toMatchObject({
      status: 'error',
      data: null,
      error: {
        code: 'PROJECT_REVISION_CONFLICT',
        details: { currentRevision },
      },
    });
    expect(project).toMatchObject({
      durationInFrames: 180,
      projectRevision: 8,
      overlays: [{
        id: 7,
        content: 'newer-user-source',
        from: 0,
        durationInFrames: 180,
      }],
    });
    expect(store.cutTimelineRangeV1).toHaveBeenCalledWith(
      'user_mechanical_tools',
      'proj_mechanical_tools',
      { actorKind: 'AGENT', startFrame: 30, endFrame: 60 },
    );
    expect(store.saveProject).not.toHaveBeenCalled();
  });
});
