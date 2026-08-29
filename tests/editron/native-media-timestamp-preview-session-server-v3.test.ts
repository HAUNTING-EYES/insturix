import { describe, expect, it } from 'vitest';

import {
  NATIVE_MEDIA_TIMESTAMP_PREVIEW_MATERIALIZE_COMMAND_KIND_V2,
  NATIVE_MEDIA_TIMESTAMP_PREVIEW_MATERIALIZE_SESSION_COMMAND_KIND_V3,
  parseNativeMediaTimestampPreviewMaterializeSessionCommandV3,
} from '@/lib/editron/services/native-media-timestamp-preview-session-server-v1';

describe('native media timestamp paired-session server parser V3', () => {
  it('binds the authenticated user and explicit paired-delivery contract', () => {
    expect(parseNativeMediaTimestampPreviewMaterializeSessionCommandV3(
      command(),
      'user-1',
    )).toEqual({
      userId: 'user-1',
      projectId: 'project-1',
      sequenceId: 'main',
      overlayId: 'overlay-1',
      expectedProjectRevision: revision(),
      windowLocalStartFrame: 120,
      windowDurationInFrames: 120,
      deliveryContract: 'PAIRED_SESSION_V3',
    });
  });

  it('rejects a V2 envelope and invalid authenticated identity', () => {
    expect(() => parseNativeMediaTimestampPreviewMaterializeSessionCommandV3({
      ...command(),
      schemaVersion: 2,
      kind: NATIVE_MEDIA_TIMESTAMP_PREVIEW_MATERIALIZE_COMMAND_KIND_V2,
    }, 'user-1')).toThrow('NATIVE_MEDIA_PREVIEW_MATERIALIZE_SESSION_COMMAND_V3_INVALID');
    expect(() => parseNativeMediaTimestampPreviewMaterializeSessionCommandV3(
      command(),
      '\u0000user',
    )).toThrow('NATIVE_MEDIA_PREVIEW_SESSION_USER_INVALID');
  });
});

function command() {
  return {
    schemaVersion: 3 as const,
    kind: NATIVE_MEDIA_TIMESTAMP_PREVIEW_MATERIALIZE_SESSION_COMMAND_KIND_V3,
    projectId: 'project-1',
    sequenceId: 'main',
    overlayId: 'overlay-1',
    expectedProjectRevision: revision(),
    windowLocalStartFrame: 120,
    windowDurationInFrames: 120,
  };
}

function revision() {
  return {
    schemaVersion: 1 as const,
    value: 9,
    compatibilityUpdatedAt: '2026-08-29T15:00:00.000Z',
  };
}
