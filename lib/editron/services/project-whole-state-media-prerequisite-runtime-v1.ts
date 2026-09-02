import type { Db } from 'mongodb';
import { z } from 'zod';

import type { Overlay } from '@/components/editron/editor/version-7.0.0/types';

import { canonicalizeEditronJsonV1 } from './canonical-json-v1';
import {
  assertProjectWholeStateMediaPrerequisiteReceiptV1,
  type ProjectWholeStateMediaPrerequisiteReceiptV1,
} from './project-whole-state-media-prerequisite-contract-v1';
import {
  issueProjectWholeStateMediaPrerequisiteV1,
  type ProjectWholeStateMediaPrerequisitePortsV1,
} from './project-whole-state-media-prerequisite-owner-v1';
import {
  assertProjectWholeStateMediaPrerequisiteRetentionStateV1,
  createProjectWholeStateMediaPrerequisitePendingRetentionV1,
  PROJECT_WHOLE_STATE_MEDIA_PREREQUISITES_COLLECTION_V1,
  type ProjectWholeStateMediaPrerequisiteRetentionStateV1,
} from './project-whole-state-media-prerequisite-retention-v1';
import type { ProjectRevisionV1 } from './project-revision-v1';
import { verifyRenderAudioRightsAuthority } from './render-audio-rights-authority';
import { authorizeCurrentSourceMediaRightsV1 } from './source-media-rights-authorization-v1';
import { createSourceMediaRightsLedgerMongoPortsV1 } from './source-media-rights-ledger-v1';

export { PROJECT_WHOLE_STATE_MEDIA_PREREQUISITES_COLLECTION_V1 } from
  './project-whole-state-media-prerequisite-retention-v1';

export interface ProjectWholeStateMediaPrerequisiteLinkV1 {
  status: 'MATERIALIZED';
  collection: typeof PROJECT_WHOLE_STATE_MEDIA_PREREQUISITES_COLLECTION_V1;
  receiptSha256: string;
  candidateMediaSetSha256: string;
  candidateMediaContentSha256: string;
  mediaEntryCount: number;
}

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const prerequisiteLinkSchema = z.object({
  status: z.literal('MATERIALIZED'),
  collection: z.literal(PROJECT_WHOLE_STATE_MEDIA_PREREQUISITES_COLLECTION_V1),
  receiptSha256: sha256,
  candidateMediaSetSha256: sha256,
  candidateMediaContentSha256: sha256,
  mediaEntryCount: z.number().int().nonnegative().max(100_000),
}).strict();

type StoredMediaAssetDocumentV1 = Record<string, unknown> & { assetId: string };
type StoredPrerequisiteReceiptDocumentV1 = {
  _id: string;
  receipt: ProjectWholeStateMediaPrerequisiteReceiptV1;
  createdAt: Date;
  retention?: ProjectWholeStateMediaPrerequisiteRetentionStateV1;
};

export type ProjectWholeStateMediaPrerequisiteRuntimeInputV1 = Readonly<{
  operation: ProjectWholeStateMediaPrerequisiteReceiptV1['operation'];
  tenantId: string;
  userId: string;
  projectOwnerId: string;
  orgId: string | null;
  projectId: string;
  projectRevision: ProjectRevisionV1;
  overlays: readonly Overlay[];
}>;

export interface ProjectWholeStateMediaPrerequisiteRuntimePortsV1
  extends ProjectWholeStateMediaPrerequisitePortsV1 {
  storeReceipt(receipt: ProjectWholeStateMediaPrerequisiteReceiptV1): Promise<void>;
}

export function projectWholeStateMediaPrerequisiteLinkV1(
  value: unknown,
): ProjectWholeStateMediaPrerequisiteLinkV1 {
  const receipt = assertProjectWholeStateMediaPrerequisiteReceiptV1(value);
  return assertProjectWholeStateMediaPrerequisiteLinkV1({
    status: 'MATERIALIZED',
    collection: PROJECT_WHOLE_STATE_MEDIA_PREREQUISITES_COLLECTION_V1,
    receiptSha256: receipt.receiptSha256,
    candidateMediaSetSha256: receipt.candidateMediaSetSha256,
    candidateMediaContentSha256: receipt.candidateMediaContentSha256,
    mediaEntryCount: receipt.mediaEntries.length,
  });
}

export function assertProjectWholeStateMediaPrerequisiteLinkV1(
  value: unknown,
): ProjectWholeStateMediaPrerequisiteLinkV1 {
  return Object.freeze(prerequisiteLinkSchema.parse(value));
}

export async function loadProjectWholeStateMediaPrerequisiteByLinkV1(
  value: unknown,
  db: Db,
): Promise<ProjectWholeStateMediaPrerequisiteReceiptV1> {
  if (!db || typeof db.collection !== 'function') {
    throw new Error('PROJECT_WHOLE_STATE_MEDIA_DATABASE_INVALID');
  }
  const link = assertProjectWholeStateMediaPrerequisiteLinkV1(value);
  const stored = await db.collection<StoredPrerequisiteReceiptDocumentV1>(
    PROJECT_WHOLE_STATE_MEDIA_PREREQUISITES_COLLECTION_V1,
  ).findOne({ _id: link.receiptSha256 });
  if (!stored) {
    throw new Error('PROJECT_WHOLE_STATE_MEDIA_RECEIPT_NOT_FOUND');
  }
  const receipt = assertProjectWholeStateMediaPrerequisiteReceiptV1(stored.receipt);
  if (canonicalizeEditronJsonV1(projectWholeStateMediaPrerequisiteLinkV1(receipt))
    !== canonicalizeEditronJsonV1(link)) {
    throw new Error('PROJECT_WHOLE_STATE_MEDIA_LINK_MISMATCH');
  }
  return receipt;
}

export async function materializeProjectWholeStateMediaPrerequisiteV1(
  input: ProjectWholeStateMediaPrerequisiteRuntimeInputV1,
  ports: Readonly<ProjectWholeStateMediaPrerequisiteRuntimePortsV1>,
): Promise<ProjectWholeStateMediaPrerequisiteReceiptV1> {
  if (typeof ports?.storeReceipt !== 'function') {
    throw new Error('PROJECT_WHOLE_STATE_MEDIA_RECEIPT_STORE_INVALID');
  }
  const receipt = await issueProjectWholeStateMediaPrerequisiteV1(input, ports);
  await ports.storeReceipt(receipt);
  return receipt;
}

export async function materializeProjectWholeStateMediaPrerequisiteInMongoV1(
  input: ProjectWholeStateMediaPrerequisiteRuntimeInputV1,
  db: Db,
  mediaAssetsCollectionName: string,
): Promise<ProjectWholeStateMediaPrerequisiteReceiptV1> {
  return materializeProjectWholeStateMediaPrerequisiteV1(
    input,
    createProjectWholeStateMediaPrerequisiteMongoPortsV1(db, mediaAssetsCollectionName),
  );
}

export function createProjectWholeStateMediaPrerequisiteMongoPortsV1(
  db: Db,
  mediaAssetsCollectionName: string,
): ProjectWholeStateMediaPrerequisiteRuntimePortsV1 {
  if (!db || typeof db.collection !== 'function') {
    throw new Error('PROJECT_WHOLE_STATE_MEDIA_DATABASE_INVALID');
  }
  if (typeof mediaAssetsCollectionName !== 'string'
    || !mediaAssetsCollectionName.trim()
    || mediaAssetsCollectionName.length > 200) {
    throw new Error('PROJECT_WHOLE_STATE_MEDIA_ASSET_COLLECTION_INVALID');
  }
  const mediaAssets = db.collection<StoredMediaAssetDocumentV1>(mediaAssetsCollectionName);
  const receipts = db.collection<StoredPrerequisiteReceiptDocumentV1>(
    PROJECT_WHOLE_STATE_MEDIA_PREREQUISITES_COLLECTION_V1,
  );
  let rightsReaderPromise: ReturnType<typeof createSourceMediaRightsLedgerMongoPortsV1> | null = null;
  const loadAssets = async (assetIds: readonly string[]) => {
    if (assetIds.length === 0) return [];
    return mediaAssets.find({ assetId: { $in: [...assetIds] } }).toArray();
  };
  return {
    loadAssets,
    async authorizeSourceRights(input) {
      rightsReaderPromise ??= createSourceMediaRightsLedgerMongoPortsV1();
      return authorizeCurrentSourceMediaRightsV1(input, {
        rightsReader: await rightsReaderPromise,
      });
    },
    async verifyAudioRights(input) {
      await verifyRenderAudioRightsAuthority({
        ...input,
        overlays: [...input.overlays],
      }, { loadAssets: async (assetIds) => loadAssets(assetIds) });
    },
    async storeReceipt(value) {
      const receipt = assertProjectWholeStateMediaPrerequisiteReceiptV1(value);
      const pendingRetention = createProjectWholeStateMediaPrerequisitePendingRetentionV1(
        new Date(),
      );
      const result = await receipts.updateOne(
        { _id: receipt.receiptSha256 },
        {
          $setOnInsert: {
            _id: receipt.receiptSha256,
            receipt,
            createdAt: new Date(receipt.issuedAt),
            retention: pendingRetention,
          },
        },
        { upsert: true },
      );
      if (!result.acknowledged) {
        throw new Error('PROJECT_WHOLE_STATE_MEDIA_RECEIPT_WRITE_UNACKNOWLEDGED');
      }
      let stored = await receipts.findOne({ _id: receipt.receiptSha256 });
      if (!stored || canonicalizeEditronJsonV1(stored.receipt)
        !== canonicalizeEditronJsonV1(receipt)) {
        throw new Error('PROJECT_WHOLE_STATE_MEDIA_RECEIPT_PERSISTED_MISMATCH');
      }
      if (!stored.retention || stored.retention.status === 'QUARANTINED') {
        const recovery = await receipts.updateOne(
          {
            _id: receipt.receiptSha256,
            $or: [
              { retention: { $exists: false } },
              { 'retention.status': 'QUARANTINED' },
            ],
          },
          { $set: { retention: pendingRetention } },
        );
        if (!recovery.acknowledged) {
          throw new Error('PROJECT_WHOLE_STATE_MEDIA_RETENTION_RECOVERY_UNACKNOWLEDGED');
        }
        stored = await receipts.findOne({ _id: receipt.receiptSha256 });
        if (!stored || canonicalizeEditronJsonV1(stored.receipt)
          !== canonicalizeEditronJsonV1(receipt)) {
          throw new Error('PROJECT_WHOLE_STATE_MEDIA_RECEIPT_PERSISTED_MISMATCH');
        }
      }
      assertProjectWholeStateMediaPrerequisiteRetentionStateV1(stored.retention);
      if (stored.retention.status === 'QUARANTINED') {
        throw new Error('PROJECT_WHOLE_STATE_MEDIA_RETENTION_RECOVERY_UNPROVED');
      }
    },
  };
}
