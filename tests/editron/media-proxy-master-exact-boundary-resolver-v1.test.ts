import { beforeAll, describe, expect, it, vi } from 'vitest';

import {
  assertMediaProxyMasterExactBoundaryResolutionReceiptV1,
  resolveMediaProxyMasterExactBoundariesV1,
  type MediaProxyMasterExactBoundaryResolutionPolicyV1,
} from '@/lib/editron/services/media-proxy-master-exact-boundary-resolver-v1';
import type { MediaProxyMasterCorrespondenceArtifactReaderV1 }
  from '@/lib/editron/services/media-proxy-master-correspondence-artifact-verifier-v1';
import {
  buildMediaProxyMasterExactBoundaryFixtureV1,
  type MediaProxyMasterExactBoundaryFixtureV1,
} from './helpers/media-proxy-master-exact-boundary-fixture';

describe('MediaProxyMasterExactBoundaryResolverV1', () => {
  let equal: MediaProxyMasterExactBoundaryFixtureV1;
  let variable: MediaProxyMasterExactBoundaryFixtureV1;

  beforeAll(async () => {
    [equal, variable] = await Promise.all([
      buildMediaProxyMasterExactBoundaryFixtureV1({
        tag: 'exact-boundary-equal',
        cadence: 'EQUAL',
      }),
      buildMediaProxyMasterExactBoundaryFixtureV1({
        tag: 'exact-boundary-variable',
        cadence: 'VARIABLE',
      }),
    ]);
  });

  it('resolves initial, cross-batch, and terminal boundaries exactly', async () => {
    const memory = reader(equal);
    const result = await resolveMediaProxyMasterExactBoundariesV1({
      activeMappingState: equal.activeMappingState,
      proxyBoundaryOrdinals: ['0', '150', equal.proxyFrameCount],
      resolutionPolicy: policy(),
      reader: memory.reader,
      resolvedAt: new Date('2026-08-31T10:06:00.000Z'),
    });

    expect(result).toMatchObject({
      disposition: 'EXACT_PROXY_BOUNDARIES_RESOLVED',
      relationSha256:
        equal.qualification.relation.relationSha256,
      activeMappingStateSha256:
        equal.activeMappingState.proxyMasterActiveMappingStateSha256V1,
      requestedProxyBoundaryOrdinals: ['0', '150', '300'],
      resolvedBoundaries: [
        {
          proxyBoundaryOrdinal: '0',
          masterBoundaryOrdinal: '0',
          evidenceBatchSequences: [0],
        },
        {
          proxyBoundaryOrdinal: '150',
          masterBoundaryOrdinal: '150',
          evidenceBatchSequences: [49, 50],
        },
        {
          proxyBoundaryOrdinal: '300',
          masterBoundaryOrdinal: '300',
          evidenceBatchSequences: [99],
        },
      ],
      selectedBatches: [
        { batchSequence: 0 },
        { batchSequence: 49 },
        { batchSequence: 50 },
        { batchSequence: 99 },
      ],
    });
    if (result.disposition !== 'EXACT_PROXY_BOUNDARIES_RESOLVED') {
      throw new Error('TEST_EXPECTED_EXACT_BOUNDARY_RECEIPT');
    }
    expect(assertMediaProxyMasterExactBoundaryResolutionReceiptV1(
      result,
      equal.activeMappingState,
    )).toEqual(result);
    expect(Object.isFrozen(result)).toBe(true);
    expect(memory.read).toHaveBeenCalledTimes(5);
    expect(memory.keys).toEqual([
      equal.indexObjectKey,
      equal.batchObjectKeys[0],
      equal.batchObjectKeys[49],
      equal.batchObjectKeys[50],
      equal.batchObjectKeys[99],
    ]);
  });

  it('proves a shared variable-cadence boundary across two batches', async () => {
    const memory = reader(variable);
    const result = await resolveMediaProxyMasterExactBoundariesV1({
      activeMappingState: variable.activeMappingState,
      proxyBoundaryOrdinals: ['2'],
      resolutionPolicy: policy(),
      reader: memory.reader,
      resolvedAt: new Date('2026-08-31T10:06:00.000Z'),
    });

    expect(result).toMatchObject({
      disposition: 'EXACT_PROXY_BOUNDARIES_RESOLVED',
      resolvedBoundaries: [{
        proxyBoundaryOrdinal: '2',
        masterBoundaryOrdinal: '2',
        evidenceBatchSequences: [0, 1],
      }],
      selectedBatches: [
        { batchSequence: 0 },
        { batchSequence: 1 },
      ],
    });
    expect(memory.keys).toEqual([
      variable.indexObjectKey,
      variable.batchObjectKeys[0],
      variable.batchObjectKeys[1],
    ]);
  });

  it('blocks a proxy boundary that falls inside a master frame', async () => {
    const memory = reader(variable);
    await expect(resolveMediaProxyMasterExactBoundariesV1({
      activeMappingState: variable.activeMappingState,
      proxyBoundaryOrdinals: ['1'],
      resolutionPolicy: policy(),
      reader: memory.reader,
      resolvedAt: new Date('2026-08-31T10:06:00.000Z'),
    })).resolves.toEqual({
      disposition: 'UNVERIFIABLE',
      reason: 'PROXY_BOUNDARY_NOT_EXACT',
      failedObjectKey: variable.batchObjectKeys[0],
      failedBatchSequence: 0,
      failedProxyBoundaryOrdinal: '1',
      diagnostic: null,
    });
    expect(memory.read).toHaveBeenCalledTimes(2);
  });

  it('reads only selected batches and ignores an unselected corrupt object', async () => {
    const corruptLast = corruptedObject(
      requiredObject(equal, equal.batchObjectKeys.at(-1)!),
    );
    const memory = reader(equal, {
      overrides: new Map([[equal.batchObjectKeys.at(-1)!, corruptLast]]),
    });
    const result = await resolveMediaProxyMasterExactBoundariesV1({
      activeMappingState: equal.activeMappingState,
      proxyBoundaryOrdinals: ['0'],
      resolutionPolicy: policy(),
      reader: memory.reader,
      resolvedAt: new Date('2026-08-31T10:06:00.000Z'),
    });

    expect(result).toMatchObject({
      disposition: 'EXACT_PROXY_BOUNDARIES_RESOLVED',
      selectedBatches: [{ batchSequence: 0 }],
    });
    expect(memory.keys).toEqual([
      equal.indexObjectKey,
      equal.batchObjectKeys[0],
    ]);
  });

  it('rejects corrupt index and selected-batch bytes', async () => {
    const corruptIndex = reader(equal, {
      overrides: new Map([[
        equal.indexObjectKey,
        corruptedObject(requiredObject(equal, equal.indexObjectKey)),
      ]]),
    });
    await expect(resolve(equal, ['0'], policy(), corruptIndex.reader))
      .resolves.toMatchObject({
        disposition: 'UNVERIFIABLE',
        reason: 'INDEX_CONTENT_HASH_MISMATCH',
        failedObjectKey: equal.indexObjectKey,
      });

    const corruptBatch = reader(equal, {
      overrides: new Map([[
        equal.batchObjectKeys[0]!,
        corruptedObject(requiredObject(equal, equal.batchObjectKeys[0]!)),
      ]]),
    });
    await expect(resolve(equal, ['0'], policy(), corruptBatch.reader))
      .resolves.toMatchObject({
        disposition: 'UNVERIFIABLE',
        reason: 'BATCH_CONTENT_HASH_MISMATCH',
        failedObjectKey: equal.batchObjectKeys[0],
        failedBatchSequence: 0,
      });
  });

  it('distinguishes retryable index and batch storage failures', async () => {
    const indexUnavailable = reader(equal, {
      failures: new Set([equal.indexObjectKey]),
    });
    await expect(resolve(equal, ['0'], policy(), indexUnavailable.reader))
      .resolves.toEqual({
        disposition: 'UNAVAILABLE',
        reason: 'INDEX_READ_FAILED',
        retryable: true,
        failedObjectKey: equal.indexObjectKey,
        failedBatchSequence: null,
        diagnostic: 'TEST_PRIVATE_OBJECT_UNAVAILABLE',
      });

    const batchUnavailable = reader(equal, {
      failures: new Set([equal.batchObjectKeys[0]!]),
    });
    await expect(resolve(equal, ['0'], policy(), batchUnavailable.reader))
      .resolves.toEqual({
        disposition: 'UNAVAILABLE',
        reason: 'BATCH_READ_FAILED',
        retryable: true,
        failedObjectKey: equal.batchObjectKeys[0],
        failedBatchSequence: 0,
        diagnostic: 'TEST_PRIVATE_OBJECT_UNAVAILABLE',
      });
  });

  it('enforces query, batch, byte, and causal-time limits before mutation', async () => {
    const invalidOrder = reader(equal);
    await expect(resolve(
      equal,
      ['2', '1'],
      policy(),
      invalidOrder.reader,
    )).resolves.toMatchObject({
      disposition: 'UNVERIFIABLE',
      reason: 'REQUEST_INVALID',
    });
    expect(invalidOrder.read).not.toHaveBeenCalled();

    const batchBudget = reader(equal);
    await expect(resolve(
      equal,
      ['150'],
      { ...policy(), maxBatchReads: 1 },
      batchBudget.reader,
    )).resolves.toMatchObject({
      disposition: 'UNVERIFIABLE',
      reason: 'RESOURCE_LIMIT_EXCEEDED',
    });
    expect(batchBudget.keys).toEqual([equal.indexObjectKey]);

    const byteBudget = reader(equal);
    await expect(resolve(
      equal,
      ['0'],
      {
        ...policy(),
        maxTotalArtifactBytes:
          equal.qualification.mapping.frameCorrespondenceIndex.byteLength,
      },
      byteBudget.reader,
    )).resolves.toMatchObject({
      disposition: 'UNVERIFIABLE',
      reason: 'RESOURCE_LIMIT_EXCEEDED',
    });
    expect(byteBudget.keys).toEqual([equal.indexObjectKey]);

    const early = reader(equal);
    await expect(resolve(
      equal,
      ['0'],
      policy(),
      early.reader,
      new Date('2026-08-31T10:04:59.999Z'),
    )).resolves.toMatchObject({
      disposition: 'UNVERIFIABLE',
      reason: 'RESOLUTION_TIME_INCONSISTENT',
    });
    expect(early.read).not.toHaveBeenCalled();
  });

  it('rejects a tampered active state before reading private artifacts', async () => {
    const memory = reader(equal);
    const tampered = {
      ...equal.activeMappingState,
      proxyMasterActiveMappingStateSha256V1: '0'.repeat(64),
    };
    await expect(resolveMediaProxyMasterExactBoundariesV1({
      activeMappingState: tampered,
      proxyBoundaryOrdinals: ['0'],
      resolutionPolicy: policy(),
      reader: memory.reader,
      resolvedAt: new Date('2026-08-31T10:06:00.000Z'),
    })).resolves.toMatchObject({
      disposition: 'UNVERIFIABLE',
      reason: 'ACTIVE_MAPPING_INVALID',
    });
    expect(memory.read).not.toHaveBeenCalled();
  });

  it('rejects tampered resolution receipts against the current active state', async () => {
    const result = await resolve(
      equal,
      ['0'],
      policy(),
      reader(equal).reader,
    );
    if (result.disposition !== 'EXACT_PROXY_BOUNDARIES_RESOLVED') {
      throw new Error('TEST_EXPECTED_RESOLUTION_RECEIPT');
    }
    const tampered = {
      ...structuredClone(result),
      resolvedBoundaries: [{
        ...structuredClone(result.resolvedBoundaries[0]!),
        masterBoundaryOrdinal: '1',
      }],
    };
    expect(() => assertMediaProxyMasterExactBoundaryResolutionReceiptV1(
      tampered,
      equal.activeMappingState,
    )).toThrow(/RECEIPT_RESULT_SCOPE_INVALID/);
  });
});

function policy(): MediaProxyMasterExactBoundaryResolutionPolicyV1 {
  return {
    policyVersion: 'test-exact-boundary-resolution-v1',
    maxBoundaryQueries: 20,
    maxBatchReads: 10,
    maxTotalArtifactBytes: 16 * 1024 * 1024,
  };
}

function resolve(
  fixture: MediaProxyMasterExactBoundaryFixtureV1,
  proxyBoundaryOrdinals: readonly string[],
  resolutionPolicy: MediaProxyMasterExactBoundaryResolutionPolicyV1,
  artifactReader: MediaProxyMasterCorrespondenceArtifactReaderV1,
  resolvedAt = new Date('2026-08-31T10:06:00.000Z'),
) {
  return resolveMediaProxyMasterExactBoundariesV1({
    activeMappingState: fixture.activeMappingState,
    proxyBoundaryOrdinals,
    resolutionPolicy,
    reader: artifactReader,
    resolvedAt,
  });
}

function reader(
  fixture: MediaProxyMasterExactBoundaryFixtureV1,
  options: Readonly<{
    overrides?: ReadonlyMap<string, Readonly<{
      canonicalJson: string;
      byteLength: number;
      contentSha256: string;
    }>>;
    failures?: ReadonlySet<string>;
  }> = {},
) {
  const keys: string[] = [];
  const read = vi.fn(async (reference: Readonly<{
    objectKey: string;
    byteLength: number;
    contentSha256: string;
  }>) => {
    keys.push(reference.objectKey);
    if (options.failures?.has(reference.objectKey)) {
      throw new Error('TEST_PRIVATE_OBJECT_UNAVAILABLE');
    }
    const stored = options.overrides?.get(reference.objectKey)
      ?? fixture.objects.get(reference.objectKey);
    if (!stored) throw new Error('TEST_PRIVATE_OBJECT_MISSING');
    return structuredClone(stored);
  });
  return {
    keys,
    read,
    reader: { read } satisfies MediaProxyMasterCorrespondenceArtifactReaderV1,
  };
}

function requiredObject(
  fixture: MediaProxyMasterExactBoundaryFixtureV1,
  objectKey: string,
) {
  const stored = fixture.objects.get(objectKey);
  if (!stored) throw new Error('TEST_REQUIRED_PRIVATE_OBJECT_MISSING');
  return stored;
}

function corruptedObject(stored: Readonly<{
  canonicalJson: string;
  byteLength: number;
  contentSha256: string;
}>) {
  const first = stored.canonicalJson[0];
  if (first !== '{') throw new Error('TEST_EXPECTED_CANONICAL_JSON_OBJECT');
  return {
    ...stored,
    canonicalJson: `[${stored.canonicalJson.slice(1)}`,
  };
}
