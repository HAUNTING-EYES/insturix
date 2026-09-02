import { describe, expect, it, vi } from 'vitest';

import type { Overlay } from '@/components/editron/editor/version-7.0.0/types';
import { createMediaSourceStorageVersionV1 } from '@/lib/editron/services/media-source-storage-version-v1';
import { createMediaSourceVersionV1 } from '@/lib/editron/services/media-source-version-v1';
import {
  assertProjectWholeStateMediaPrerequisiteReceiptV1,
} from '@/lib/editron/services/project-whole-state-media-prerequisite-contract-v1';
import {
  issueProjectWholeStateMediaPrerequisiteV1,
  type ProjectWholeStateMediaPrerequisitePortsV1,
} from '@/lib/editron/services/project-whole-state-media-prerequisite-owner-v1';

const NOW = new Date('2026-09-02T02:00:00.000Z');
const SCOPE = {
  operation: 'REPLACE_EDITOR_STATE' as const,
  tenantId: 'user_1',
  userId: 'user_1',
  projectOwnerId: 'user_1',
  orgId: null,
  projectId: 'proj_1',
  projectRevision: {
    schemaVersion: 1 as const,
    value: 4,
    compatibilityUpdatedAt: '2026-09-02T01:59:00.000Z',
  },
};

function source(assetId: string, mediaKind: 'video' | 'audio' | 'image') {
  const storageVersion = createMediaSourceStorageVersionV1({
    locator: { provider: 'R2', objectKey: `qualified/${assetId}` },
    byteLength: 10,
    providerVersion: { kind: 'R2_ETAG', value: `etag-${assetId}` },
  });
  return createMediaSourceVersionV1({
    owner: { kind: 'USER', userId: 'user_1' },
    assetId,
    mediaKind,
    byteLength: 10,
    contentSha256: 'a'.repeat(64),
    storageVersion,
  });
}

function video(overrides: Record<string, unknown> = {}): Overlay {
  return {
    id: 1, type: 'video', assetId: 'video_1', content: '', from: 0,
    durationInFrames: 30, row: 0, left: 0, top: 0, width: 1920,
    height: 1080, isDragging: false, rotation: 0, styles: {}, ...overrides,
  } as Overlay;
}

function ports(assets: Record<string, unknown>[]): ProjectWholeStateMediaPrerequisitePortsV1 {
  return {
    loadAssets: vi.fn(async () => assets as Array<Record<string, unknown> & { assetId: string }>),
    authorizeSourceRights: vi.fn(async () => ({
      disposition: 'AUTHORIZED' as const,
      receipt: { receiptSha256: 'b'.repeat(64) },
    })),
    verifyAudioRights: vi.fn(async () => undefined),
    now: () => NOW,
  };
}

describe('project whole-state media prerequisite V1', () => {
  it('issues a sealed empty-media prerequisite without fabricating rights', async () => {
    const dependencies = ports([]);
    const receipt = await issueProjectWholeStateMediaPrerequisiteV1({
      ...SCOPE,
      overlays: [],
    }, dependencies);
    expect(receipt.mediaEntries).toEqual([]);
    expect(dependencies.authorizeSourceRights).not.toHaveBeenCalled();
    expect(dependencies.verifyAudioRights).not.toHaveBeenCalled();
    expect(assertProjectWholeStateMediaPrerequisiteReceiptV1(receipt)).toEqual(receipt);
  });

  it('binds a qualified visual source and current project rights', async () => {
    const dependencies = ports([{
      assetId: 'video_1', userId: 'user_1', type: 'video', source: 'user-upload',
      sourceVersionV1: source('video_1', 'video'),
    }]);
    const receipt = await issueProjectWholeStateMediaPrerequisiteV1({
      ...SCOPE,
      overlays: [video()],
    }, dependencies);
    expect(receipt.mediaEntries[0]).toMatchObject({
      assetId: 'video_1',
      rights: { disposition: 'PROJECT_SOURCE_AUTHORIZED' },
      predecessor: { disposition: 'ORIGINAL_SOURCE', receiptSha256: null },
    });
  });

  it('supports stable string overlay identities and rejects cross-type duplicates', async () => {
    const assets = [{
      assetId: 'video_1', userId: 'user_1', type: 'video', source: 'user-upload',
      sourceVersionV1: source('video_1', 'video'),
    }];
    const stringIdentity = video({ id: 'server-video' }) as unknown as Overlay;
    const receipt = await issueProjectWholeStateMediaPrerequisiteV1({
      ...SCOPE,
      overlays: [stringIdentity],
    }, ports(assets));
    expect(receipt.mediaEntries[0]?.overlayId).toBe('server-video');

    await expect(issueProjectWholeStateMediaPrerequisiteV1({
      ...SCOPE,
      overlays: [video({ id: 1 }), video({ id: '1' }) as unknown as Overlay],
    }, ports(assets))).rejects.toThrow(
      'PROJECT_WHOLE_STATE_MEDIA_PREREQUISITE_OVERLAY_ID_DUPLICATE',
    );
  });

  it('rejects missing or cross-owner source assets', async () => {
    await expect(issueProjectWholeStateMediaPrerequisiteV1({
      ...SCOPE,
      overlays: [video()],
    }, ports([]))).rejects.toThrow('PROJECT_WHOLE_STATE_MEDIA_ASSET_MISSING');
    await expect(issueProjectWholeStateMediaPrerequisiteV1({
      ...SCOPE,
      overlays: [video()],
    }, ports([{
      assetId: 'video_1', userId: 'other', type: 'video', source: 'user-upload',
      sourceVersionV1: source('video_1', 'video'),
    }]))).rejects.toThrow('PROJECT_WHOLE_STATE_MEDIA_ASSET_SCOPE_INVALID');
  });

  it('rejects unqualified or rights-blocked media', async () => {
    await expect(issueProjectWholeStateMediaPrerequisiteV1({
      ...SCOPE,
      overlays: [video()],
    }, ports([{ assetId: 'video_1', userId: 'user_1', type: 'video', source: 'user-upload' }])))
      .rejects.toThrow('PROJECT_WHOLE_STATE_MEDIA_SOURCE_VERSION_INVALID');
    const dependencies = ports([{
      assetId: 'video_1', userId: 'user_1', type: 'video', source: 'user-upload',
      sourceVersionV1: source('video_1', 'video'),
    }]);
    dependencies.authorizeSourceRights = vi.fn(async () => ({
      disposition: 'BLOCKED' as const, diagnosticCode: 'SOURCE_MEDIA_RIGHTS_REVOKED',
    }));
    await expect(issueProjectWholeStateMediaPrerequisiteV1({
      ...SCOPE,
      overlays: [video()],
    }, dependencies)).rejects.toThrow('PROJECT_WHOLE_STATE_MEDIA_RIGHTS_SOURCE_MEDIA_RIGHTS_REVOKED');
  });

  it('requires generated-video predecessor equality', async () => {
    const dependencies = ports([{
      assetId: 'video_1', userId: 'user_1', type: 'video', source: 'public',
      sourceVersionV1: source('video_1', 'video'),
      generatedVideoReceipt: { id: 'stored' },
    }]);
    await expect(issueProjectWholeStateMediaPrerequisiteV1({
      ...SCOPE,
      overlays: [video({ generatedVideoReceipt: { id: 'forged' } })],
    }, dependencies)).rejects.toThrow('PROJECT_WHOLE_STATE_MEDIA_GENERATED_VIDEO_PREDECESSOR_INVALID');
  });

  it('runs the audio owner before issuing a sound receipt', async () => {
    const dependencies = ports([{
      assetId: 'audio_1', userId: 'user_1', type: 'audio', source: 'user-upload',
      sourceVersionV1: source('audio_1', 'audio'),
      audioRights: { licensed: true },
    }]);
    const overlay = {
      id: 2, type: 'sound', assetId: 'audio_1', content: '', from: 0,
      durationInFrames: 30, row: 1, left: 0, top: 0, width: 0,
      height: 0, isDragging: false, rotation: 0, styles: {},
      audioRights: { licensed: true },
    } as Overlay;
    const receipt = await issueProjectWholeStateMediaPrerequisiteV1({
      ...SCOPE,
      overlays: [overlay],
    }, dependencies);
    expect(dependencies.verifyAudioRights).toHaveBeenCalledOnce();
    expect(receipt.mediaEntries[0]?.audio.disposition).toBe('VERIFIED');
  });

  it('rejects a tampered sealed receipt', async () => {
    const receipt = await issueProjectWholeStateMediaPrerequisiteV1({
      ...SCOPE,
      overlays: [],
    }, ports([]));
    expect(() => assertProjectWholeStateMediaPrerequisiteReceiptV1({
      ...receipt,
      projectId: 'proj_forged',
    })).toThrow('PROJECT_WHOLE_STATE_MEDIA_PREREQUISITE_HASH_MISMATCH');
  });
});
