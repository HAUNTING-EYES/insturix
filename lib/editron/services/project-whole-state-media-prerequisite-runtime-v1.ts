import type { Db } from 'mongodb';

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
import type { ProjectRevisionV1 } from './project-revision-v1';
import { verifyRenderAudioRightsAuthority } from './render-audio-rights-authority';
import { authorizeCurrentSourceMediaRightsV1 } from './source-media-rights-authorization-v1';
import { createSourceMediaRightsLedgerMongoPortsV1 } from './source-media-rights-ledger-v1';

export const PROJECT_WHOLE_STATE_MEDIA_PREREQUISITES_COLLECTION_V1 =
  'editron_project_whole_state_media_prerequisites_v1' as const;

export interface ProjectWholeStateMediaPrerequisiteLinkV1 {
  status: 'MATERIALIZED';
  collection: typeof PROJECT_WHOLE_STATE_MEDIA_PREREQUISITES_COLLECTION_V1;
  receiptSha256: string;
  candidateMediaSetSha256: string;
  mediaEntryCount: number;
}

type StoredMediaAssetDocumentV1 = Record<string, unknown> & { assetId: string };
type StoredPrerequisiteReceiptDocumentV1 = {
  _id: string;
  receipt: ProjectWholeStateMediaPrerequisiteReceiptV1;
  createdAt: Date;
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
  return Object.freeze({
    status: 'MATERIALIZED',
    collection: PROJECT_WHOLE_STATE_MEDIA_PREREQUISITES_COLLECTION_V1,
    receiptSha256: receipt.receiptSha256,
    candidateMediaSetSha256: receipt.candidateMediaSetSha256,
    mediaEntryCount: receipt.mediaEntries.length,
  });
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
      const result = await receipts.updateOne(
        { _id: receipt.receiptSha256 },
        {
          $setOnInsert: {
            _id: receipt.receiptSha256,
            receipt,
            createdAt: new Date(receipt.issuedAt),
          },
        },
        { upsert: true },
      );
      if (!result.acknowledged) {
        throw new Error('PROJECT_WHOLE_STATE_MEDIA_RECEIPT_WRITE_UNACKNOWLEDGED');
      }
      const stored = await receipts.findOne({ _id: receipt.receiptSha256 });
      if (!stored || canonicalizeEditronJsonV1(stored.receipt)
        !== canonicalizeEditronJsonV1(receipt)) {
        throw new Error('PROJECT_WHOLE_STATE_MEDIA_RECEIPT_PERSISTED_MISMATCH');
      }
    },
  };
}
