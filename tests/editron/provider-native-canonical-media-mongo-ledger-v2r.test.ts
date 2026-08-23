import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { hashEditronCanonicalJsonV1 }
  from '@/lib/editron/services/canonical-json-v1';
import {
  createProviderNativeCanonicalMediaIssuanceOwnerV2R,
  createProviderNativeCanonicalMediaSourceVersionV2R,
  type ProviderNativeCanonicalMediaPolicyDecisionOwnerV2R,
} from '@/lib/editron/services/provider-native-canonical-media-issuance-v2r';
import {
  createProviderNativeCanonicalMediaMongoLedgerV2R,
  type ProviderNativeCanonicalMediaMongoCollectionV2R,
  type ProviderNativeCanonicalMediaMongoRuntimeV2R,
} from '@/lib/editron/services/provider-native-canonical-media-mongo-ledger-v2r';
import {
  createProviderNativeCanonicalMediaArtifactBindingV2R,
  createProviderNativeCanonicalMediaBindingRecordV2R,
  createProviderNativeCanonicalMediaPolicyGrantV2R,
} from '@/lib/editron/services/provider-native-canonical-media-product-records-v2r';
import { createProviderNativeCanonicalMediaReferenceBindingV2R }
  from '@/lib/editron/services/provider-native-canonical-media-reference-v2r';
import type { ProviderNativeRouteV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-tool-codecs-v2r';

type MongoRow = Record<string, unknown>;
type CollectionName = 'sourceVersions' | 'bindings' | 'policyGrants'
  | 'artifactBindings' | 'mediaAssets';
type MutableState = Record<CollectionName, MongoRow[]>;

const H = (value: string) => value.repeat(64);
const NOW = '2026-08-23T10:00:00.000Z';
const SCOPE = {
  tenantId: 'tenant-a',
  userId: 'user-a',
  projectId: 'project-a',
  episodeId: 'episode-a',
} as const;
const ROUTE: ProviderNativeRouteV2R = {
  routeId: 'OPENAI_LUNA',
  provider: 'openai',
  model: 'gpt-5.6-luna',
  claimedModelIdentity: 'gpt-5.6-luna',
  reasoningMode: 'low',
};
const RIGHTS = ref('RIGHTS_POLICY', 'rights-a', H('1'));
const PRIVACY = ref('PRIVACY_POLICY', 'privacy-a', H('2'));
const DECISION = ref('MEDIA_POLICY_OWNER', 'decision-a', H('3'));

describe('provider-native canonical-media Mongo ledger V2R', () => {
  it('atomically issues and idempotently replays native-video metadata', async () => {
    const fixture = buildFixture('NATIVE_VIDEO');
    const mongo = new MemoryMongo(fixture.mediaRows);
    const policyDecision = vi.fn(async () => { mongo.events.push('policy'); });
    const owner = createOwner(mongo, policyDecision);

    const first = await owner.issue(fixture.issuance);
    const second = await owner.issue(fixture.issuance);

    expect(second).toEqual(first);
    expect(first.issuanceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(mongo.metadataCounts()).toEqual({
      sourceVersions: 1,
      bindings: 1,
      policyGrants: 1,
      artifactBindings: 1,
    });
    expect(mongo.events).toEqual(['policy', 'transaction', 'policy', 'transaction']);
    expect(mongo.transactionOptions).toEqual({
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
      readPreference: 'primary',
    });
    expect(mongo.indexes).toContain('uniq_provider_media_source_version_v2r');
    expect(mongo.endedSessions).toBe(2);
  });

  it('issues org-owned ordered images across R2 and GCS without copying bytes', async () => {
    const owner = { type: 'ORG', orgId: 'org-a' } as const;
    const fixture = buildFixture('ORDERED_TIMESTAMPED_IMAGES', owner);
    const mongo = new MemoryMongo(fixture.mediaRows);

    await createOwner(mongo).issue(fixture.issuance);

    expect(mongo.metadataCounts()).toEqual({
      sourceVersions: 1,
      bindings: 1,
      policyGrants: 1,
      artifactBindings: 2,
    });
    expect(mongo.rows('artifactBindings').map((row) =>
      (row.storage as MongoRow).backend)).toEqual(['R2', 'GCS']);
    expect(mongo.rows('mediaAssets')).toHaveLength(3);
  });

  it('rejects a missing source row and commits no metadata', async () => {
    const fixture = buildFixture('NATIVE_VIDEO');
    const mongo = new MemoryMongo(fixture.mediaRows.slice(1));

    await expect(createOwner(mongo).issue(fixture.issuance))
      .rejects.toThrow('PROVIDER_NATIVE_CANONICAL_MEDIA_MONGO_SOURCE_MEDIA_NOT_FOUND');
    expect(mongo.metadataCounts()).toEqual(emptyMetadataCounts());
    expect(mongo.endedSessions).toBe(1);
  });

  it('rejects source-envelope drift before creating metadata', async () => {
    const fixture = buildFixture('NATIVE_VIDEO');
    const rows = structuredClone(fixture.mediaRows) as MongoRow[];
    (rows[0].referenceEnvelope as MongoRow).audioUsageMode = 'export-attested';
    const mongo = new MemoryMongo(rows);

    await expect(createOwner(mongo).issue(fixture.issuance))
      .rejects.toThrow('PROVIDER_NATIVE_CANONICAL_MEDIA_MONGO_SOURCE_MEDIA_IDENTITY_MISMATCH');
    expect(mongo.metadataCounts()).toEqual(emptyMetadataCounts());
  });

  it('rejects artifact byte or storage drift before creating metadata', async () => {
    const fixture = buildFixture('ORDERED_TIMESTAMPED_IMAGES');
    const rows = structuredClone(fixture.mediaRows) as MongoRow[];
    rows[1].contentHash = H('f');
    rows[2].gcsPath = 'gcs/wrong-frame.png';
    const mongo = new MemoryMongo(rows);

    await expect(createOwner(mongo).issue(fixture.issuance))
      .rejects.toThrow('PROVIDER_NATIVE_CANONICAL_MEDIA_MONGO_ARTIFACT_MEDIA_IDENTITY_MISMATCH');
    expect(mongo.metadataCounts()).toEqual(emptyMetadataCounts());
  });

  it('rolls back earlier creates when the final artifact write fails', async () => {
    const fixture = buildFixture('NATIVE_VIDEO');
    const mongo = new MemoryMongo(fixture.mediaRows);
    mongo.failWriteCollection = 'artifactBindings';

    await expect(createOwner(mongo).issue(fixture.issuance))
      .rejects.toThrow('INJECTED_artifactBindings_WRITE_FAILURE');
    expect(mongo.metadataCounts()).toEqual(emptyMetadataCounts());
    expect(mongo.endedSessions).toBe(1);
  });

  it('rejects conflicting immutable binding metadata and preserves prior state', async () => {
    const fixture = buildFixture('NATIVE_VIDEO');
    const mongo = new MemoryMongo(fixture.mediaRows);
    const owner = createOwner(mongo);
    await owner.issue(fixture.issuance);
    const before = mongo.snapshot();
    const bindingRecord = createProviderNativeCanonicalMediaBindingRecordV2R({
      binding: fixture.issuance.bindingRecord.binding,
      createdAt: '2026-08-23T10:00:01.000Z',
    });

    await expect(owner.issue({ ...fixture.issuance, bindingRecord }))
      .rejects.toThrow('PROVIDER_NATIVE_CANONICAL_MEDIA_MONGO_BINDING_RECORD_CONFLICT');
    expect(mongo.snapshot()).toEqual(before);
  });

  it('fails closed when the transaction callback is never committed', async () => {
    const fixture = buildFixture('NATIVE_VIDEO');
    const mongo = new MemoryMongo(fixture.mediaRows);
    mongo.skipTransaction = true;

    await expect(createOwner(mongo).issue(fixture.issuance))
      .rejects.toThrow('PROVIDER_NATIVE_CANONICAL_MEDIA_MONGO_TRANSACTION_NOT_COMMITTED');
    expect(mongo.metadataCounts()).toEqual(emptyMetadataCounts());
    expect(mongo.endedSessions).toBe(1);
  });

  it('rechecks authorization time even when the ledger is invoked directly', async () => {
    const fixture = buildFixture('NATIVE_VIDEO', undefined, { expiresAt: NOW });
    const mongo = new MemoryMongo(fixture.mediaRows);
    const ledger = createProviderNativeCanonicalMediaMongoLedgerV2R({
      now: () => NOW,
      loadRuntime: async () => mongo.runtime,
    });

    await expect(ledger.issueExact(fixture.issuance))
      .rejects.toThrow('PROVIDER_NATIVE_CANONICAL_MEDIA_MONGO_POLICY_EXPIRED');
    expect(mongo.events).toEqual([]);
    expect(mongo.metadataCounts()).toEqual(emptyMetadataCounts());
  });
});

function createOwner(
  mongo: MemoryMongo,
  policyDecision: ProviderNativeCanonicalMediaPolicyDecisionOwnerV2R['assertIssuable'] =
    vi.fn(async (): Promise<void> => undefined),
) {
  return createProviderNativeCanonicalMediaIssuanceOwnerV2R({
    now: () => NOW,
    policyDecision: { assertIssuable: policyDecision },
    ledger: createProviderNativeCanonicalMediaMongoLedgerV2R({
      now: () => NOW,
      loadRuntime: async () => mongo.runtime,
    }),
  });
}

function buildFixture(
  arm: 'NATIVE_VIDEO' | 'ORDERED_TIMESTAMPED_IMAGES',
  mediaOwner: Readonly<
    { type: 'USER'; userId: string } | { type: 'ORG'; orgId: string }
  > = { type: 'USER', userId: SCOPE.userId },
  policyTimes: Readonly<{
    issuedAt?: string;
    expiresAt?: string;
  }> = {},
) {
  const media = arm === 'NATIVE_VIDEO' ? nativeVideo() : orderedImages();
  const envelope = {
    version: 'EDITRON_REFERENCE_CANONICAL_ENVELOPE_V1',
    contentHash: media.sourceContentSha256,
    audioUsageMode: 'preview-waveform-only',
    demux: null,
  } as const;
  const sourceVersion = createProviderNativeCanonicalMediaSourceVersionV2R({
    mediaOwner,
    assetId: 'asset-source-a',
    mediaKind: 'video',
    byteLength: media.sourceByteLength,
    contentSha256: media.sourceContentSha256,
    referenceEnvelopeSha256: hashEditronCanonicalJsonV1(envelope),
  });
  const policyGrant = createProviderNativeCanonicalMediaPolicyGrantV2R({
    scope: SCOPE,
    routeSha256: hashEditronCanonicalJsonV1(ROUTE),
    sourceAssetId: sourceVersion.assetId,
    sourceContentSha256: sourceVersion.contentSha256,
    rightsPolicyRef: RIGHTS,
    privacyEgressPolicyRef: PRIVACY,
    authorizationDecisionRef: DECISION,
    issuedAt: policyTimes.issuedAt ?? '2026-08-23T08:00:00.000Z',
    expiresAt: policyTimes.expiresAt ?? '2026-08-24T10:00:00.000Z',
  });
  const binding = createProviderNativeCanonicalMediaReferenceBindingV2R({
    scope: SCOPE,
    route: ROUTE,
    source: {
      assetId: sourceVersion.assetId,
      assetVersionSha256: sourceVersion.sourceVersionSha256,
      contentSha256: sourceVersion.contentSha256,
      referenceEnvelopeSha256: sourceVersion.referenceEnvelopeSha256,
    },
    materializer: {
      ownerId: 'CANONICAL_MEDIA_SERVICE',
      ownerVersion: 'REFERENCE_MATERIALIZER_V1',
      parametersSha256: H('6'),
    },
    policy: {
      rightsPolicyRef: RIGHTS,
      privacyEgressPolicyRef: PRIVACY,
      authorizationSha256: policyGrant.authorizationSha256,
    },
    referenceInput: media.referenceInput,
    artifactMap: media.artifactMap,
  });
  const bindingRecord = createProviderNativeCanonicalMediaBindingRecordV2R({
    binding,
    createdAt: NOW,
  });
  const artifactBindings = binding.materialization.artifacts.map((artifact, index) =>
    createProviderNativeCanonicalMediaArtifactBindingV2R({
      scope: SCOPE,
      sourceAssetId: sourceVersion.assetId,
      sourceAssetVersionSha256: sourceVersion.sourceVersionSha256,
      referenceEnvelopeSha256: sourceVersion.referenceEnvelopeSha256,
      artifactId: artifact.artifactId,
      artifactVersionSha256: artifact.artifactVersionSha256,
      bytesSha256: artifact.bytesSha256,
      byteLength: artifact.byteLength,
      mediaOwner,
      storage: media.storage[index],
      createdAt: NOW,
    }));
  const ownerFields = mediaOwner.type === 'ORG'
    ? { userId: 'asset-creator', orgId: mediaOwner.orgId }
    : { userId: mediaOwner.userId };
  const sourceRow = {
    assetId: sourceVersion.assetId,
    ...ownerFields,
    type: sourceVersion.mediaKind,
    size: sourceVersion.byteLength,
    contentHash: sourceVersion.contentSha256,
    referenceEnvelope: envelope,
    r2Key: 'r2/source.mp4',
  };
  const artifactRows = artifactBindings.map((artifact) => ({
    assetId: artifact.artifactId,
    ...ownerFields,
    type: arm === 'NATIVE_VIDEO' ? 'video' : 'image',
    size: artifact.byteLength,
    contentHash: artifact.bytesSha256,
    ...(artifact.storage.backend === 'R2'
      ? { r2Key: artifact.storage.key }
      : { gcsPath: artifact.storage.key }),
  }));
  return {
    issuance: { sourceVersion, bindingRecord, policyGrant, artifactBindings },
    mediaRows: [sourceRow, ...artifactRows],
  };
}

function nativeVideo() {
  const bytes = Buffer.alloc(16);
  bytes.writeUInt32BE(16, 0);
  bytes.write('ftyp', 4, 'ascii');
  const digest = sha(bytes);
  return {
    sourceContentSha256: digest,
    sourceByteLength: bytes.length,
    referenceInput: {
      version: 'EDITRON_PROVIDER_NATIVE_VIDEO_REFERENCE_INPUT_V2R_1',
      arm: 'NATIVE_VIDEO',
      referenceId: 'ref_native_a',
      referenceAssetSha256: digest,
      mimeType: 'video/mp4',
      bytesBase64: bytes.toString('base64'),
      bytesSha256: digest,
      byteLength: bytes.length,
      durationUs: '1000000',
      sourceRate: { numerator: '30', denominator: '1' },
      resolution: 'high',
    } as const,
    artifactMap: {
      arm: 'NATIVE_VIDEO',
      artifactId: 'artifact-video',
      artifactVersionSha256: H('7'),
    } as const,
    storage: [{ backend: 'R2', key: 'r2/reference-video.mp4' }] as const,
  };
}

function orderedImages() {
  const frameA = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const frameB = Buffer.from([...frameA, 0x01]);
  return {
    sourceContentSha256: H('8'),
    sourceByteLength: 1_024,
    referenceInput: {
      version: 'EDITRON_PROVIDER_NATIVE_REFERENCE_INPUT_V2R_1',
      arm: 'ORDERED_TIMESTAMPED_IMAGES',
      referenceId: 'ref_frames_a',
      referenceAssetSha256: H('8'),
      resolution: 'high',
      frames: [
        { frameId: 'frame_a', timestampUs: '0', mimeType: 'image/png', bytesBase64: frameA.toString('base64'), bytesSha256: sha(frameA) },
        { frameId: 'frame_b', timestampUs: '500000', mimeType: 'image/png', bytesBase64: frameB.toString('base64'), bytesSha256: sha(frameB) },
      ],
    } as const,
    artifactMap: {
      arm: 'ORDERED_TIMESTAMPED_IMAGES',
      frames: [
        { frameId: 'frame_a', artifactId: 'artifact-frame-a', artifactVersionSha256: H('9') },
        { frameId: 'frame_b', artifactId: 'artifact-frame-b', artifactVersionSha256: H('a') },
      ],
    } as const,
    storage: [
      { backend: 'R2', key: 'r2/frame-a.png' },
      { backend: 'GCS', key: 'gcs/frame-b.png' },
    ] as const,
  };
}

class MemoryMongo {
  readonly indexes: string[] = [];
  readonly events: string[] = [];
  endedSessions = 0;
  failWriteCollection: CollectionName | null = null;
  skipTransaction = false;
  transactionOptions: unknown = null;
  private committed: MutableState;
  private draft: MutableState | null = null;

  readonly runtime: Readonly<ProviderNativeCanonicalMediaMongoRuntimeV2R>;

  constructor(mediaRows: MongoRow[]) {
    this.committed = {
      sourceVersions: [],
      bindings: [],
      policyGrants: [],
      artifactBindings: [],
      mediaAssets: structuredClone(mediaRows),
    };
    this.runtime = {
      startSession: async () => ({
        driverSession: { id: 'memory-session' },
        withTransaction: async (operation, options) => {
          this.transactionOptions = options;
          if (this.skipTransaction) return undefined;
          this.events.push('transaction');
          this.draft = structuredClone(this.committed);
          try {
            const result = await operation();
            this.committed = this.draft;
            return result;
          } finally {
            this.draft = null;
          }
        },
        endSession: async () => { this.endedSessions += 1; },
      }),
      sourceVersions: this.collection('sourceVersions'),
      bindings: this.collection('bindings'),
      policyGrants: this.collection('policyGrants'),
      artifactBindings: this.collection('artifactBindings'),
      mediaAssets: this.collection('mediaAssets'),
    };
  }

  rows(name: CollectionName): MongoRow[] {
    return structuredClone(this.committed[name]);
  }

  snapshot(): MutableState {
    return structuredClone(this.committed);
  }

  metadataCounts() {
    return {
      sourceVersions: this.committed.sourceVersions.length,
      bindings: this.committed.bindings.length,
      policyGrants: this.committed.policyGrants.length,
      artifactBindings: this.committed.artifactBindings.length,
    };
  }

  private collection(name: CollectionName): ProviderNativeCanonicalMediaMongoCollectionV2R {
    return {
      createIndex: async (_keys, options) => {
        this.indexes.push(options.name);
        return options.name;
      },
      findOne: async (filter) => {
        const row = this.current()[name].find((candidate) => matches(candidate, filter));
        return row ? structuredClone(row) : null;
      },
      findOneAndUpdate: async (filter, update) => {
        if (this.failWriteCollection === name) {
          throw new Error(`INJECTED_${name}_WRITE_FAILURE`);
        }
        const rows = this.current()[name];
        const existing = rows.find((candidate) => matches(candidate, filter));
        if (existing) return structuredClone(existing);
        const inserted = { _id: filter._id, ...structuredClone(update.$setOnInsert) };
        rows.push(inserted);
        return structuredClone(inserted);
      },
    };
  }

  private current(): MutableState {
    return this.draft ?? this.committed;
  }
}

function matches(row: Readonly<MongoRow>, filter: Readonly<MongoRow>): boolean {
  return Object.entries(filter).every(([path, expected]) => getPath(row, path) === expected);
}

function getPath(value: Readonly<MongoRow>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) =>
    current && typeof current === 'object'
      ? (current as Readonly<MongoRow>)[key]
      : undefined, value);
}

function emptyMetadataCounts() {
  return { sourceVersions: 0, bindings: 0, policyGrants: 0, artifactBindings: 0 };
}

function ref(ownerId: string, artifactId: string, artifactSha256: string) {
  return { ownerId, artifactId, artifactVersion: 'V1', artifactSha256 };
}

function sha(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
