import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  resolvePipelineVideoProjectDeliveryTargetV1,
} from '@/lib/editron/services/pipeline-video-project-delivery-v1';

const revision = {
  schemaVersion: 1 as const,
  value: 7,
  compatibilityUpdatedAt: '2026-08-25T00:00:00.000Z',
};

function resolve(overlays: Array<Record<string, unknown>>, expectedAssetId?: string) {
  return resolvePipelineVideoProjectDeliveryTargetV1({
    projectId: 'proj_pipeline_video',
    expectedRevision: revision,
    expectedAssetId,
    overlays: overlays as any,
  });
}

describe('pipeline video project delivery target V1', () => {
  it('does not request a project delivery for an initial generation without a prior asset', () => {
    expect(resolve([{ id: 10, type: 'video', assetId: 'video-old' }]))
      .toEqual({ kind: 'NOT_REQUIRED' });
  });

  it('snapshots exactly one matching video overlay with the ProjectService revision', () => {
    const result = resolve([
      { id: 7, type: 'text', assetId: 'video-old' },
      { id: 10, type: 'video', assetId: 'video-old' },
    ], 'video-old');

    expect(result).toEqual({
      kind: 'RESOLVED',
      target: {
        projectId: 'proj_pipeline_video',
        expectedRevision: revision,
        target: { overlayId: 10, expectedAssetId: 'video-old' },
      },
    });
  });

  it('refuses missing, ambiguous, and non-numeric existing targets', () => {
    expect(resolve([], 'video-old')).toEqual({ kind: 'TARGET_NOT_FOUND' });
    expect(resolve([
      { id: 10, type: 'video', assetId: 'video-old' },
      { id: 11, type: 'video', assetId: 'video-old' },
    ], 'video-old')).toEqual({ kind: 'TARGET_AMBIGUOUS' });
    expect(resolve([
      { id: 'overlay-ten', type: 'video', assetId: 'video-old' },
    ], 'video-old')).toEqual({ kind: 'TARGET_INVALID_OVERLAY_ID' });
  });

  it('wires the producer snapshot to ProjectService and removes the raw overlay replacement', () => {
    const producer = readFileSync(
      'app/api/services/pipeline/storyboard/[id]/generate-videos/route.ts',
      'utf8',
    );
    const worker = readFileSync('app/api/internal/workers/pipeline/video/route.ts', 'utf8');

    expect(producer).toContain('resolvePipelineVideoProjectDeliveryTargetV1');
    expect(producer).toContain('admitPipelineVideoDeliveryInvalidationV1');
    expect(producer).toContain('ALREADY_PENDING');
    expect(producer).toContain('ADMITTED_ARTIFACT_CHAIN_PENDING');
    expect(producer).toContain('PROJECT_DELIVERY_INVALIDATION_UNAVAILABLE');
    expect(producer).toContain('linkedProjectTargetCount !== 1');
    expect(producer).toContain('PROJECT_DELIVERY_MULTIPLE_LINKED_TARGETS_UNSUPPORTED');
    expect(producer.indexOf('admitPipelineVideoDeliveryInvalidationV1'))
      .toBeLessThan(producer.indexOf("CreditsService.hasCredits"));
    expect(producer.indexOf('ADMITTED_ARTIFACT_CHAIN_PENDING'))
      .toBeLessThan(producer.indexOf("CreditsService.hasCredits"));
    expect(producer).toContain('projectDelivery: projectDeliveryForScene(scene)');
    expect(worker).toContain('commitPipelineVideoDeliveryV1');
    expect(worker).toContain("status: 'CONFLICT'");
    expect(worker).not.toMatch(/overlays\.\$\.(src|content|assetId|videoDurationMs|hasNativeAudio)/);
    expect(worker).not.toContain('storyboardBeforeVideoUpdate');
  });
});
