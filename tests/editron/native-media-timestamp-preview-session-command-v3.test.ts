import { describe, expect, it } from 'vitest';

import {
  assertNativeMediaTimestampPreviewMaterializeSessionCommandV3,
  NATIVE_MEDIA_TIMESTAMP_PREVIEW_MATERIALIZE_SESSION_COMMAND_KIND_V3,
} from '@/components/editron/editor/version-7.0.0/remotion/native-media-timestamp-preview-session-contract-v1';

describe('native media timestamp paired-session materialize command V3', () => {
  it('parses an exact revision-bound command independent of key order', () => {
    expect(assertNativeMediaTimestampPreviewMaterializeSessionCommandV3({
      windowDurationInFrames: 120,
      overlayId: 'overlay-1',
      expectedProjectRevision: revision(),
      kind: NATIVE_MEDIA_TIMESTAMP_PREVIEW_MATERIALIZE_SESSION_COMMAND_KIND_V3,
      sequenceId: 'main',
      schemaVersion: 3,
      windowLocalStartFrame: 240,
      projectId: 'project-1',
    })).toEqual({
      schemaVersion: 3,
      kind: NATIVE_MEDIA_TIMESTAMP_PREVIEW_MATERIALIZE_SESSION_COMMAND_KIND_V3,
      projectId: 'project-1',
      sequenceId: 'main',
      overlayId: 'overlay-1',
      expectedProjectRevision: revision(),
      windowLocalStartFrame: 240,
      windowDurationInFrames: 120,
    });
  });

  it('rejects missing revision, wrong identity and extra fields', () => {
    const command = {
      schemaVersion: 3,
      kind: NATIVE_MEDIA_TIMESTAMP_PREVIEW_MATERIALIZE_SESSION_COMMAND_KIND_V3,
      projectId: 'project-1',
      sequenceId: 'main',
      overlayId: 'overlay-1',
      expectedProjectRevision: revision(),
      windowLocalStartFrame: 0,
      windowDurationInFrames: 120,
    } as const;
    const { expectedProjectRevision: _revision, ...withoutRevision } = command;
    for (const candidate of [
      withoutRevision,
      { ...command, schemaVersion: 2 },
      { ...command, kind: 'EDITRON_NATIVE_MEDIA_TIMESTAMP_PREVIEW_MATERIALIZE_COMMAND_V2' },
      { ...command, allowApproximateAudio: true },
    ]) {
      expect(() => assertNativeMediaTimestampPreviewMaterializeSessionCommandV3(candidate))
        .toThrow('NATIVE_MEDIA_PREVIEW_MATERIALIZE_SESSION_COMMAND_V3_INVALID');
    }
  });
});

function revision() {
  return {
    schemaVersion: 1 as const,
    value: 9,
    compatibilityUpdatedAt: '2026-08-29T15:00:00.000Z',
  };
}
