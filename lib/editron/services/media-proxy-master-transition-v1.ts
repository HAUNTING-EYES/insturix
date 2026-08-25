import {
  createMediaSourceQualificationV1,
  type MediaSourceQualificationRecordV1,
} from './media-source-qualification-v1';
import {
  inspectMediaSourceStorageVersionV1,
  type MediaSourceStorageVersionInspectionV1,
} from './media-source-storage-version-v1';
import {
  assertMediaSourceVersionV1,
  type MediaSourceOwnerV1,
  type MediaSourceVersionV1,
} from './media-source-version-v1';

export type MediaSourceQualificationDispatchMessageV1 = {
  assetId: string;
  userId: string;
  sourceBindingSha256: string;
};

/**
 * The media-owner transition from a low-resolution upload proxy to the
 * completed original. It changes only the existing MEDIA_ASSETS record; it
 * does not create a registry, source-time mapping, project mutation, or proof.
 */
export type MediaProxyMasterTransitionAssetV1 = {
  assetId?: unknown;
  userId?: unknown;
  orgId?: unknown;
  type?: unknown;
  source?: unknown;
  r2Key?: unknown;
  originalR2Key?: unknown;
  isProxy?: unknown;
  sourceVersionV1?: unknown;
};

export type CompletedMediaMultipartUploadV1 = {
  assetId?: unknown;
  userId?: unknown;
  status?: unknown;
  r2Key?: unknown;
};

export type MediaProxyMasterTransitionPortsV1 = {
  loadAsset(assetId: string, userId: string): Promise<MediaProxyMasterTransitionAssetV1 | null>;
  loadCompletedMultipartUpload(assetId: string, userId: string): Promise<CompletedMediaMultipartUploadV1 | null>;
  inspectMasterStorage(r2Key: string): Promise<MediaSourceStorageVersionInspectionV1>;
  replace(input: {
    assetId: string;
    userId: string;
    expectedProxyR2Key: string;
    next: {
      cachedUrl: string;
      originalR2Key: string;
      sourceQualificationV1: MediaSourceQualificationRecordV1;
      sourceVersionV1: null;
      proxySourceVersionV1: Readonly<MediaSourceVersionV1> | null;
      proxyMasterRelationV1: null;
      sourceInvalidationPlanV1: null;
    };
  }): Promise<boolean>;
  dispatch(message: MediaSourceQualificationDispatchMessageV1): Promise<{ dispatched: boolean }>;
  getPublicReadUrl(r2Key: string): string;
  now(): Date;
};

export type MediaProxyMasterTransitionResultV1 =
  | {
      disposition: 'TRANSITIONED';
      qualification: 'DISPATCHED' | 'PENDING';
      proxySourceVersion: 'PRESERVED' | 'UNAVAILABLE';
    }
  | { disposition: 'ALREADY_ACTIVE' }
  | {
      disposition: 'SKIPPED';
      reason:
        | 'ASSET_NOT_FOUND'
        | 'ASSET_OWNER_MISMATCH'
        | 'ASSET_NOT_PROXY'
        | 'ASSET_NOT_USER_UPLOAD'
        | 'ASSET_MEDIA_KIND_INVALID'
        | 'PROXY_STORAGE_KEY_INVALID'
        | 'COMPLETED_UPLOAD_NOT_FOUND'
        | 'COMPLETED_UPLOAD_MISMATCH'
        | 'MASTER_STORAGE_KEY_INVALID'
        | 'MASTER_EQUALS_PROXY'
        | 'MASTER_STORAGE_UNVERIFIABLE'
        | 'MASTER_PUBLIC_URL_INVALID'
        | 'MASTER_QUALIFICATION_UNAVAILABLE';
    }
  | { disposition: 'RACE_LOST' };

export type ActiveMediaR2StorageKeyInputV1 = {
  r2Key?: unknown;
  originalR2Key?: unknown;
  isProxy?: unknown;
};

/**
 * Returns the server-designated active R2 object. Legacy records still read
 * their original `r2Key`; a completed proxy promotion reads `originalR2Key`.
 */
export function resolveActiveMediaR2StorageKeyV1(
  asset: ActiveMediaR2StorageKeyInputV1,
): string | null {
  const proxyKey = storageKey(asset.r2Key);
  if (asset.isProxy === true) return proxyKey;
  return storageKey(asset.originalR2Key) ?? proxyKey;
}

/**
 * Core transition with injected storage and persistence ports for adversarial
 * testing. Its input has no URL or storage-key parameter, so callers cannot
 * nominate a master object.
 */
export async function transitionMediaProxyMasterV1(
  input: { assetId: string; userId: string },
  ports: MediaProxyMasterTransitionPortsV1,
): Promise<MediaProxyMasterTransitionResultV1> {
  const assetId = identifier(input.assetId);
  const userId = identifier(input.userId);
  if (!assetId || !userId) return { disposition: 'SKIPPED', reason: 'ASSET_NOT_FOUND' };

  const asset = await ports.loadAsset(assetId, userId);
  if (!asset) return { disposition: 'SKIPPED', reason: 'ASSET_NOT_FOUND' };
  if (asset.assetId !== assetId || asset.userId !== userId) {
    return { disposition: 'SKIPPED', reason: 'ASSET_OWNER_MISMATCH' };
  }
  if (asset.isProxy !== true) return { disposition: 'ALREADY_ACTIVE' };
  if (asset.source !== 'user-upload') {
    return { disposition: 'SKIPPED', reason: 'ASSET_NOT_USER_UPLOAD' };
  }
  const assetMediaKind = mediaKindForAsset(asset.type);
  if (!assetMediaKind) return { disposition: 'SKIPPED', reason: 'ASSET_MEDIA_KIND_INVALID' };
  const proxyR2Key = storageKey(asset.r2Key);
  if (!proxyR2Key) return { disposition: 'SKIPPED', reason: 'PROXY_STORAGE_KEY_INVALID' };

  const completedUpload = await ports.loadCompletedMultipartUpload(assetId, userId);
  if (!completedUpload) return { disposition: 'SKIPPED', reason: 'COMPLETED_UPLOAD_NOT_FOUND' };
  if (
    completedUpload.assetId !== assetId
    || completedUpload.userId !== userId
    || completedUpload.status !== 'completed'
  ) {
    return { disposition: 'SKIPPED', reason: 'COMPLETED_UPLOAD_MISMATCH' };
  }
  const masterR2Key = storageKey(completedUpload.r2Key);
  if (!masterR2Key) return { disposition: 'SKIPPED', reason: 'MASTER_STORAGE_KEY_INVALID' };
  if (masterR2Key === proxyR2Key) return { disposition: 'SKIPPED', reason: 'MASTER_EQUALS_PROXY' };

  const masterStorage = await ports.inspectMasterStorage(masterR2Key);
  if (masterStorage.disposition !== 'OBSERVED') {
    return { disposition: 'SKIPPED', reason: 'MASTER_STORAGE_UNVERIFIABLE' };
  }
  const publicReadUrl = safeHttpsUrl(ports.getPublicReadUrl(masterR2Key));
  if (!publicReadUrl) return { disposition: 'SKIPPED', reason: 'MASTER_PUBLIC_URL_INVALID' };

  const qualification = createMediaSourceQualificationV1({
    asset: { assetId, source: 'user-upload', r2Key: masterR2Key },
    now: ports.now(),
  });
  if (qualification.disposition !== 'CREATED') {
    return { disposition: 'SKIPPED', reason: 'MASTER_QUALIFICATION_UNAVAILABLE' };
  }

  const proxySourceVersionV1 = validProxySourceVersion({
    value: asset.sourceVersionV1,
    owner: ownerForAsset(userId, asset.orgId),
    assetId,
    mediaKind: assetMediaKind,
    proxyR2Key,
  });
  const replaced = await ports.replace({
    assetId,
    userId,
    expectedProxyR2Key: proxyR2Key,
    next: {
      cachedUrl: publicReadUrl,
      originalR2Key: masterR2Key,
      sourceQualificationV1: qualification.record,
      sourceVersionV1: null,
      proxySourceVersionV1,
      proxyMasterRelationV1: null,
      sourceInvalidationPlanV1: null,
    },
  });
  if (!replaced) return { disposition: 'RACE_LOST' };

  let dispatched = false;
  try {
    dispatched = (await ports.dispatch({
      assetId,
      userId,
      sourceBindingSha256: qualification.record.sourceBindingSha256,
    })).dispatched === true;
  } catch {
    dispatched = false;
  }
  return {
    disposition: 'TRANSITIONED',
    qualification: dispatched ? 'DISPATCHED' : 'PENDING',
    proxySourceVersion: proxySourceVersionV1 ? 'PRESERVED' : 'UNAVAILABLE',
  };
}

/** Runs the core transition against the existing media and multipart records. */
export async function runMediaProxyMasterTransitionV1(
  input: { assetId: string; userId: string },
): Promise<MediaProxyMasterTransitionResultV1> {
  const [
    { COLLECTIONS, getDatabase },
    { dispatchMediaSourceQualificationV1 },
    { getR2PublicUrl },
  ] = await Promise.all([
    import('../db/mongodb'),
    import('./media-source-qualification-runtime-v1'),
    import('./r2-service'),
  ]);
  const db = await getDatabase();
  return transitionMediaProxyMasterV1(input, {
    loadAsset: async (assetId, userId) => (
      await db.collection(COLLECTIONS.MEDIA_ASSETS).findOne(
        { assetId, userId },
        {
          projection: {
            assetId: 1,
            userId: 1,
            orgId: 1,
            type: 1,
            source: 1,
            r2Key: 1,
            originalR2Key: 1,
            isProxy: 1,
            sourceVersionV1: 1,
          },
        },
      ) as MediaProxyMasterTransitionAssetV1 | null
    ),
    loadCompletedMultipartUpload: async (assetId, userId) => (
      await db.collection(COLLECTIONS.MEDIA_UPLOADS).findOne(
        { assetId, userId, status: 'completed' },
        { projection: { assetId: 1, userId: 1, status: 1, r2Key: 1 } },
      ) as CompletedMediaMultipartUploadV1 | null
    ),
    inspectMasterStorage: (r2Key) => inspectMediaSourceStorageVersionV1({ provider: 'R2', objectKey: r2Key }),
    replace: async ({ assetId, userId, expectedProxyR2Key, next }) => {
      const result = await db.collection(COLLECTIONS.MEDIA_ASSETS).updateOne(
        { assetId, userId, isProxy: true, r2Key: expectedProxyR2Key },
        {
          $set: {
            cachedUrl: next.cachedUrl,
            originalR2Key: next.originalR2Key,
            isProxy: false,
            sourceQualificationV1: next.sourceQualificationV1,
            sourceVersionV1: null,
            proxySourceVersionV1: next.proxySourceVersionV1,
            proxyMasterRelationV1: null,
            sourceInvalidationPlanV1: null,
          },
        },
      );
      return result.matchedCount === 1;
    },
    dispatch: dispatchMediaSourceQualificationV1,
    getPublicReadUrl: getR2PublicUrl,
    now: () => new Date(),
  });
}

function validProxySourceVersion(input: {
  value: unknown;
  owner: MediaSourceOwnerV1 | null;
  assetId: string;
  mediaKind: MediaSourceVersionV1['mediaKind'];
  proxyR2Key: string;
}): Readonly<MediaSourceVersionV1> | null {
  if (!input.owner) return null;
  try {
    const sourceVersion = assertMediaSourceVersionV1(input.value);
    if (
      sourceVersion.assetId !== input.assetId
      || sourceVersion.mediaKind !== input.mediaKind
      || !sameOwner(sourceVersion.owner, input.owner)
      || sourceVersion.storageVersion.locator.provider !== 'R2'
      || sourceVersion.storageVersion.locator.objectKey !== input.proxyR2Key
    ) return null;
    return sourceVersion;
  } catch {
    return null;
  }
}

function ownerForAsset(userId: string, orgId: unknown): MediaSourceOwnerV1 | null {
  if (orgId === undefined || orgId === null) return { kind: 'USER', userId };
  const normalizedOrgId = identifier(orgId);
  return normalizedOrgId ? { kind: 'ORG', orgId: normalizedOrgId } : null;
}

function sameOwner(left: MediaSourceOwnerV1, right: MediaSourceOwnerV1): boolean {
  return left.kind === right.kind && (left.kind === 'USER'
    ? left.userId === (right as Extract<MediaSourceOwnerV1, { kind: 'USER' }>).userId
    : left.orgId === (right as Extract<MediaSourceOwnerV1, { kind: 'ORG' }>).orgId);
}

function mediaKindForAsset(value: unknown): MediaSourceVersionV1['mediaKind'] | null {
  return value === 'video' || value === 'audio' || value === 'image' ? value : null;
}

function storageKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized && normalized.length <= 512 && !/[\u0000-\u001F\u007F]/.test(normalized)
    ? normalized
    : null;
}

function identifier(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,239}$/.test(normalized) ? normalized : null;
}

function safeHttpsUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}
