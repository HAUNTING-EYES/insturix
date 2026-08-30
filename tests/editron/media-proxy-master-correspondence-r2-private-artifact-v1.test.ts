import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { describe, expect, it } from 'vitest';

import {
  createMediaProxyMasterCorrespondenceBatchSidecarV1,
  serializeMediaProxyMasterCorrespondenceBatchV1,
} from '@/lib/editron/services/media-proxy-master-correspondence-batch-v1';
import {
  createMediaProxyMasterCorrespondenceIndexReferenceV1,
  createMediaProxyMasterCorrespondenceIndexV1,
} from '@/lib/editron/services/media-proxy-master-correspondence-index-v1';
import {
  createMediaProxyMasterCorrespondenceR2PrivateArtifactStoreV1,
} from '@/lib/editron/services/media-proxy-master-correspondence-r2-private-artifact-v1';

describe('MediaProxyMasterCorrespondenceR2PrivateArtifactV1', () => {
  it('writes batches before the index, rereads all bytes, verifies, and replays safely', async () => {
    const fixture = artifacts();
    const memory = memoryClient();
    const store = createMediaProxyMasterCorrespondenceR2PrivateArtifactStoreV1({
      privateStorage: privateStorage(),
      client: memory.client,
    });

    const first = await store.writeAndVerifyArtifactSet(fixture);
    const second = await store.writeAndVerifyArtifactSet(fixture);

    expect(first).toMatchObject({
      disposition: 'CORRESPONDENCE_ARTIFACT_SET_VERIFIED',
      verifiedBatchCount: 2,
      totalSpanCount: '4',
    });
    expect(second).toEqual(first);
    const puts = memory.commands.filter(
      (command): command is PutObjectCommand => command instanceof PutObjectCommand,
    );
    expect(puts).toHaveLength(6);
    expect(puts.slice(0, 3).map((command) => command.input.Key)).toEqual([
      fixture.batches[0]!.sidecar.objectKey,
      fixture.batches[1]!.sidecar.objectKey,
      fixture.indexReference.objectKey,
    ]);
    expect(puts[0]!.input).toMatchObject({
      Bucket: 'editron-media-pts-private',
      ContentType: 'application/json; charset=utf-8',
      CacheControl: 'no-store',
      IfNoneMatch: '*',
      Metadata: {
        'content-sha256': fixture.batches[0]!.sidecar.contentSha256,
        'artifact-family': 'batch',
      },
    });
    expect(memory.commands.filter((command) => command instanceof GetObjectCommand))
      .toHaveLength(12);
  });

  it('rejects forged batch or index evidence before object access', async () => {
    const fixture = artifacts();
    const memory = memoryClient();
    const store = createMediaProxyMasterCorrespondenceR2PrivateArtifactStoreV1({
      privateStorage: privateStorage(), client: memory.client,
    });

    await expect(store.writeAndVerifyArtifactSet({
      ...fixture,
      batches: [{
        ...fixture.batches[0]!,
        sidecar: { ...fixture.batches[0]!.sidecar, contentSha256: 'f'.repeat(64) },
      }, fixture.batches[1]!],
    })).rejects.toThrow('MEDIA_PROXY_MASTER_CORRESPONDENCE_R2_BATCH_SIDECAR_MISMATCH');
    await expect(store.writeAndVerifyArtifactSet({
      ...fixture,
      indexReference: { ...fixture.indexReference, contentSha256: 'e'.repeat(64) },
    })).rejects.toThrow('MEDIA_PROXY_MASTER_CORRESPONDENCE_R2_INDEX_REFERENCE_MISMATCH');
    expect(memory.commands).toHaveLength(0);
  });

  it('fails closed on a corrupt collision and a non-precondition write failure', async () => {
    const fixture = artifacts();
    const corrupt = memoryClient();
    corrupt.objects.set(
      fixture.batches[0]!.sidecar.objectKey,
      Buffer.from('corrupt', 'utf8'),
    );
    const corruptStore = createMediaProxyMasterCorrespondenceR2PrivateArtifactStoreV1({
      privateStorage: privateStorage(), client: corrupt.client,
    });
    await expect(corruptStore.writeAndVerifyArtifactSet(fixture))
      .rejects.toThrow('MEDIA_PROXY_MASTER_CORRESPONDENCE_R2_CONTENT_MISMATCH');

    const offlineStore = createMediaProxyMasterCorrespondenceR2PrivateArtifactStoreV1({
      privateStorage: privateStorage(),
      client: { send: async () => { throw new Error('offline'); } },
    });
    await expect(offlineStore.writeAndVerifyArtifactSet(fixture))
      .rejects.toThrow('MEDIA_PROXY_MASTER_CORRESPONDENCE_R2_BATCH_WRITE_FAILED');
  });

  it('rejects an unsafe storage scope and unrelated private-looking read keys', async () => {
    expect(() => createMediaProxyMasterCorrespondenceR2PrivateArtifactStoreV1({
      privateStorage: { ...privateStorage(), bucketName: 'editron-cdn' },
      client: memoryClient().client,
    })).toThrow('MEDIA_PROXY_MASTER_CORRESPONDENCE_R2_STORAGE_INVALID');

    const store = createMediaProxyMasterCorrespondenceR2PrivateArtifactStoreV1({
      privateStorage: privateStorage(), client: memoryClient().client,
    });
    await expect(store.read({
      objectKey: `private/editron/unrelated/${'a'.repeat(64)}.json`,
      byteLength: 1,
      contentSha256: 'b'.repeat(64),
    })).rejects.toThrow('MEDIA_PROXY_MASTER_CORRESPONDENCE_R2_OBJECT_KEY_INVALID');
  });
});

const BATCH_POLICY = 'proxy-master-correspondence-batch-policy-v1';

function artifacts() {
  const basis = {
    relationSha256: hash('relation'),
    proxyTimeMap: timeMap('proxy', 3),
    masterTimeMap: timeMap('master', 2),
  };
  const batches = [
    batch(basis, 0, '0', [
      span('0', '0', '1/30', '0', '0'),
      span('1', '1/30', '1/20', '1', '0'),
    ]),
    batch(basis, 1, '2', [
      span('2', '1/20', '1/15', '1', '1'),
      span('3', '1/15', '1/10', '2', '1'),
    ]),
  ];
  const indexSerialization = createMediaProxyMasterCorrespondenceIndexV1({
    basis,
    resourcePolicy: {
      policyVersion: 'proxy-master-correspondence-index-policy-v1',
      requiredBatchPolicyVersion: BATCH_POLICY,
      maxCanonicalJsonBytes: 64 * 1024,
      maxBatchEntries: 10,
    },
    batches,
  });
  return {
    basis,
    batches,
    indexSerialization,
    indexReference: createMediaProxyMasterCorrespondenceIndexReferenceV1({
      serialization: indexSerialization,
    }),
    verificationPolicy: {
      policyVersion: 'proxy-master-correspondence-artifact-verification-policy-v1',
      maxBatchReads: 10,
      maxTotalArtifactBytes: 1024 * 1024,
    },
  };
}

function batch(
  basis: ReturnType<typeof artifactsBasis>,
  batchSequence: number,
  firstSpanOrdinal: string,
  spans: readonly ReturnType<typeof span>[],
) {
  const serialization = serializeMediaProxyMasterCorrespondenceBatchV1({
    basis,
    resourcePolicy: {
      policyVersion: BATCH_POLICY,
      maxCanonicalJsonBytes: 64 * 1024,
      maxSpanRecords: 100,
    },
    batchSequence,
    firstSpanOrdinal,
    spans,
  });
  return {
    serialization,
    sidecar: createMediaProxyMasterCorrespondenceBatchSidecarV1({ serialization }),
  };
}

function artifactsBasis() {
  return {
    relationSha256: hash('relation'),
    proxyTimeMap: timeMap('proxy', 3),
    masterTimeMap: timeMap('master', 2),
  };
}

function timeMap(role: string, totalFrameCount: number) {
  return {
    sourceVersionSha256: hash(`${role}-source`),
    storageVersionSha256: hash(`${role}-storage`),
    sourceBindingSha256: hash(`${role}-source-binding`),
    technicalObservationSha256: hash(`${role}-observation`),
    sourcePtsCadenceMapStateSha256V3: hash(`${role}-state`),
    mapBindingSha256: hash(`${role}-map-binding`),
    terminalReceiptSha256: hash(`${role}-terminal`),
    verificationSha256: hash(`${role}-verification`),
    epochIndexContentSha256: hash(`${role}-epoch-index`),
    streamId: 'video-0',
    videoStreamIndex: 0,
    totalFrameCount: String(totalFrameCount),
  };
}

function span(
  spanOrdinal: string,
  start: string,
  end: string,
  proxyFrameOrdinal: string,
  masterFrameOrdinal: string,
) {
  return {
    spanOrdinal,
    canonicalStartTime: time(start),
    canonicalEndExclusiveTime: time(end),
    proxyFrameOrdinal,
    masterFrameOrdinal,
  };
}

function privateStorage() {
  return {
    bucketName: 'editron-media-pts-private',
    browserRouteExposure: 'NO_BROWSER_ROUTE' as const,
    storagePolicyVersion: 'private-pts-r2-v1',
  };
}

function memoryClient() {
  const objects = new Map<string, Uint8Array>();
  const commands: unknown[] = [];
  return {
    objects,
    commands,
    client: {
      async send(command: unknown): Promise<unknown> {
        commands.push(command);
        if (command instanceof PutObjectCommand) {
          const key = String(command.input.Key);
          if (objects.has(key)) {
            throw Object.assign(new Error('collision'), {
              name: 'PreconditionFailed', $metadata: { httpStatusCode: 412 },
            });
          }
          const body = command.input.Body;
          if (!(body instanceof Uint8Array)) throw new Error('TEST_BODY_INVALID');
          objects.set(key, Uint8Array.from(body));
          return {};
        }
        if (command instanceof GetObjectCommand) {
          const value = objects.get(String(command.input.Key));
          if (!value) throw new Error('TEST_OBJECT_MISSING');
          return { Body: Uint8Array.from(value) };
        }
        throw new Error('TEST_COMMAND_UNEXPECTED');
      },
    },
  };
}

function time(value: string) {
  const [ticks, timescale = '1'] = value.split('/');
  return { ticks: ticks!, timescale };
}

function hash(value: string): string {
  return Buffer.from(value).toString('hex').padEnd(64, '0').slice(0, 64);
}
