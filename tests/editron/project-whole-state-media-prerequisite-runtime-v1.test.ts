import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/editron/db/mongodb', () => ({ getDatabase: vi.fn() }));

import {
  createProjectWholeStateMediaPrerequisiteMongoPortsV1,
  loadProjectWholeStateMediaPrerequisiteByLinkV1,
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
    const updateOne = vi.fn(async (
      _filter,
      update: {
        $setOnInsert?: Record<string, unknown>;
        $set?: Record<string, unknown>;
      },
    ) => {
      if (!storedDocument && update.$setOnInsert) {
        storedDocument = structuredClone(update.$setOnInsert);
      }
      if (storedDocument && update.$set) {
        storedDocument = { ...storedDocument, ...structuredClone(update.$set) };
      }
      return { acknowledged: true, matchedCount: storedDocument ? 1 : 0 };
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
    expect(storedDocument).toMatchObject({
      retention: {
        schemaVersion: 1,
        status: 'PENDING_REFERENCE',
      },
    });
    await expect(ports.storeReceipt(receipt)).resolves.toBeUndefined();
    expect(updateOne).toHaveBeenCalledTimes(2);

    storedDocument = {
      ...(storedDocument ?? {}),
      retention: {
        schemaVersion: 1,
        status: 'QUARANTINED',
        checkedAt: new Date('2026-09-01T00:00:00.000Z'),
        nextCheckAt: new Date('2026-09-02T00:00:00.000Z'),
        expiresAt: new Date('2026-10-01T00:00:00.000Z'),
      },
    };
    await expect(ports.storeReceipt(receipt)).resolves.toBeUndefined();
    expect(storedDocument).toMatchObject({
      retention: { status: 'PENDING_REFERENCE' },
    });
    expect((storedDocument as { retention?: object }).retention).not.toHaveProperty('expiresAt');

    storedDocument = {
      ...(storedDocument ?? {}),
      receipt: { ...receipt, projectId: 'proj_tampered' },
    };
    await expect(ports.storeReceipt(receipt))
      .rejects.toThrow('PROJECT_WHOLE_STATE_MEDIA_RECEIPT_PERSISTED_MISMATCH');
  });

  it('loads only an authentic receipt whose compact link matches every sealed field', async () => {
    const receipt = await materializeProjectWholeStateMediaPrerequisiteV1(INPUT, {
      loadAssets: vi.fn(async () => []),
      authorizeSourceRights: vi.fn(async () => ({
        disposition: 'BLOCKED' as const,
        diagnosticCode: 'UNUSED',
      })),
      verifyAudioRights: vi.fn(async () => undefined),
      now: () => NOW,
      storeReceipt: vi.fn(async () => undefined),
    });
    const link = projectWholeStateMediaPrerequisiteLinkV1(receipt);
    let storedReceipt: {
      _id: string;
      receipt: typeof receipt;
      createdAt: Date;
    } | null = {
      _id: receipt.receiptSha256,
      receipt,
      createdAt: NOW,
    };
    const findOne = vi.fn(async () => storedReceipt);
    const db = { collection: vi.fn(() => ({ findOne })) } as never;

    await expect(loadProjectWholeStateMediaPrerequisiteByLinkV1(link, db))
      .resolves.toEqual(receipt);
    await expect(loadProjectWholeStateMediaPrerequisiteByLinkV1({
      ...link,
      candidateMediaContentSha256: 'f'.repeat(64),
    }, db)).rejects.toThrow('PROJECT_WHOLE_STATE_MEDIA_LINK_MISMATCH');

    storedReceipt = null;
    await expect(loadProjectWholeStateMediaPrerequisiteByLinkV1(link, db))
      .rejects.toThrow('PROJECT_WHOLE_STATE_MEDIA_RECEIPT_NOT_FOUND');
  });
});
