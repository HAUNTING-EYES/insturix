import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OverlayType } from '@/components/editron/editor/version-7.0.0/types';

const mocks = vi.hoisted(() => ({
  createAssetPorts: vi.fn(),
  createRuntime: vi.fn(),
  getProjectRevision: vi.fn(),
  loadProjectForMutation: vi.fn(),
}));

vi.mock('@/lib/editron/services/media-source-audio-artifact-asset-owner-v1', () => ({
  createMediaSourceAudioArtifactAssetMongoPortsV1: mocks.createAssetPorts,
  readMediaSourceAudioArtifactAssetStateV1: vi.fn(() => {
    throw new Error('UNEXPECTED_AUDIO_ARTIFACT_READ');
  }),
}));
vi.mock('@/lib/editron/services/media-source-pts-cadence-r2-runtime-v1', () => ({
  createMediaSourcePtsCadenceR2RuntimePortsV1: mocks.createRuntime,
}));
vi.mock('@/lib/editron/services/project-service', () => ({
  projectService: {
    getProjectRevision: mocks.getProjectRevision,
    loadProjectForMutation: mocks.loadProjectForMutation,
  },
}));

import {
  materializeNativeMediaTimestampPreviewWindowUsingRuntimeV1,
} from '@/lib/editron/services/native-media-timestamp-preview-materializer-v1';

const REVISION = Object.freeze({
  schemaVersion: 1 as const,
  value: 7,
  compatibilityUpdatedAt: '2026-08-29T00:00:00.000Z',
});

describe('native timestamp runtime classification V1', () => {
  beforeEach(() => {
    mocks.createRuntime.mockReset().mockImplementation(() => {
      throw new Error('PRIVATE_RUNTIME_MUST_NOT_BE_ACQUIRED');
    });
    mocks.createAssetPorts.mockReset().mockResolvedValue({
      load: vi.fn(async () => ({ assetId: 'asset-1', type: 'video' })),
    });
    mocks.getProjectRevision.mockReset().mockResolvedValue(REVISION);
    mocks.loadProjectForMutation.mockReset().mockResolvedValue({
      project: {
        projectId: 'project-1', userId: 'user-1', name: 'Ordinary media fixture',
        overlays: [{
          id: 42, type: OverlayType.VIDEO, content: 'video', assetId: 'asset-1',
          from: 0, durationInFrames: 60, sourceStartFrame: 0, sourceEndFrame: 60,
          width: 1920, height: 1080, left: 0, top: 0, row: 0, rotation: 0,
          isDragging: false, styles: {},
        }],
        aspectRatio: '16:9', playerDimensions: { width: 1920, height: 1080 }, fps: 30,
        durationInFrames: 60, createdAt: new Date(0), updatedAt: new Date(0),
        projectRevision: 7, visibility: 'private',
      },
      revision: REVISION,
    });
  });

  it('classifies ordinary analysis media without acquiring the private R2 runtime', async () => {
    const result = await materializeNativeMediaTimestampPreviewWindowUsingRuntimeV1({
      userId: 'user-1', projectId: 'project-1', sequenceId: 'main', overlayId: '42',
      expectedProjectRevision: REVISION,
      windowLocalStartFrame: 0, windowDurationInFrames: 60,
      deliveryContract: 'ANALYSIS_RECEIPT_V1',
    }, {
      environment: {},
      now: () => 1_000,
      analysisEngine: { analyze: vi.fn() },
    });

    expect(result).toMatchObject({
      disposition: 'NOT_APPLICABLE',
      reason: 'ASSET_NOT_TIMESTAMP_MANAGED',
      classificationLease: {
        decision: 'ASSET_NOT_TIMESTAMP_MANAGED',
        projectId: 'project-1', sequenceId: 'main', overlayId: '42', assetId: 'asset-1',
        projectRevision: REVISION,
      },
    });
    expect(mocks.createRuntime).not.toHaveBeenCalled();
    expect(mocks.getProjectRevision).not.toHaveBeenCalled();
  });
});
