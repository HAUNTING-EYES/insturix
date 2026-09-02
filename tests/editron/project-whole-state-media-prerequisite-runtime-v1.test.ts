import { describe, expect, it, vi } from 'vitest';

import {
  createProjectWholeStateMediaPrerequisiteMongoPortsV1,
  materializeProjectWholeStateMediaPrerequisiteV1,
  projectWholeStateMediaPrerequisiteLinkV1,
  PROJECT_WHOLE_STATE_MEDIA_PREREQUISITES_COLLECTION_V1,
  type ProjectWholeStateMediaPrerequisiteRuntimePortsV1,
} from '@/lib/editron/services/project-whole-state-media-prerequisite-runtime-v1';

const NOW = new Date('2026-09-02T03:00:00.000Z');
const INPUT = {
  operation: 'REPLACE_EDITOR_STATE' as const,
  tenantId: 'user_1',
  userId: 'user_1',
  projectOwnerId: 'user_1',
  orgId: null,
  projectId: 'proj_1',
  projectRevision: {
    schemaVersion: 1 as const,
    value: 4,
    compatibilityUpdatedAt: '2026-09-02T02:59:00.000Z',
  },
  overlays: [],
};

describe('project whole-state media prerequisite runtime V1', () => {
  it('stores the sealed prerequisite before returning it', async () => {
    const events: string[] = [];
    const ports: ProjectWholeStateMediaPrerequisiteRuntimePortsV1 = {
      loadAssets: vi.fn(async () => []),
      authorizeSourceRights: vi.fn(async () => ({
        disposition: 'BLOCKED' as const,
        diagnosticCode: 'UNUSED',
      })),
      verifyAudioRights: vi.fn(async () => undefined),
      now: () => NOW,
      storeReceipt: vi.fn(async () => { events.push('stored'); }),
    };
    const receipt = await materializeProjectWholeStateMediaPrerequisiteV1(INPUT, ports);
    expect(events).toEqual(['stored']);
    expect(receipt.projectRevision).toEqual(INPUT.projectRevision);
    expect(receipt.mediaEntries).toEqual([]);
    expect(projectWholeStateMediaPrerequisiteLinkV1(receipt)).toEqual({
      status: 'MATERIALIZED',
      collection: PROJECT_WHOLE_STATE_MEDIA_PREREQUISITES_COLLECTION_V1,
      receiptSha256: receipt.receiptSha256,
      candidateMediaSetSha256: receipt.candidateMediaSetSha256,
      candidateMediaContentSha256: receipt.candidateMediaContentSha256,
      mediaEntryCount: 0,
    });
  });

  it('does not return success when durable storage fails', async () => {
    const ports: ProjectWholeStateMediaPrerequisiteRuntimePortsV1 = {
      loadAssets: vi.fn(async () => []),
      authorizeSourceRights: vi.fn(async () => ({
        disposition: 'BLOCKED' as const,
        diagnosticCode: 'UNUSED',
      })),
      verifyAudioRights: vi.fn(async () => undefined),
      now: () => NOW,
      storeReceipt: vi.fn(async () => { throw new Error('atlas unavailable'); }),
    };
    await expect(materializeProjectWholeStateMediaPrerequisiteV1(INPUT, ports))
      .rejects.toThrow('atlas unavailable');
  });

  it('persists idempotently and rejects content-address collisions', async () => {
    let storedDocument: Record<string, unknown> | null = null;
    const updateOne = vi.fn(async (_filter, update: { $setOnInsert: Record<string, unknown> }) => {
      storedDocument ??= structuredClone(update.$setOnInsert);
      return { acknowledged: true };
    });
    const findOne = vi.fn(async () => storedDocument);
    const collection = vi.fn((name: string) => {
      if (name === PROJECT_WHOLE_STATE_MEDIA_PREREQUISITES_COLLECTION_V1) {
        return { updateOne, findOne };
      }
      return { find: vi.fn(() => ({ toArray: vi.fn(async () => []) })) };
    });
    const ports = createProjectWholeStateMediaPrerequisiteMongoPortsV1(
      { collection } as never,
      'mediaAssets',
    );
    const receipt = await materializeProjectWholeStateMediaPrerequisiteV1(INPUT, {
      ...ports,
      now: () => NOW,
    });
    await expect(ports.storeReceipt(receipt)).resolves.toBeUndefined();
    expect(updateOne).toHaveBeenCalledTimes(2);

    storedDocument = {
      ...(storedDocument ?? {}),
      receipt: { ...receipt, projectId: 'proj_tampered' },
    };
    await expect(ports.storeReceipt(receipt))
      .rejects.toThrow('PROJECT_WHOLE_STATE_MEDIA_RECEIPT_PERSISTED_MISMATCH');
  });
});
