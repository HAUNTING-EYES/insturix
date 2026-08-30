import { describe, expect, it, vi } from 'vitest';

import type { MediaSourceAudioArtifactAssetStorePortsV1 }
  from '@/lib/editron/services/media-source-audio-artifact-asset-owner-v1';
import type { MediaSourceAudioProductMaterializationReceiptV1 }
  from '@/lib/editron/services/media-source-audio-product-materializer-v1';
import { runMediaSourceAudioProductRuntimeV1 }
  from '@/lib/editron/services/media-source-audio-product-runtime-v1';
import type { MediaSourceVersionEvidenceStorePortsV1 }
  from '@/lib/editron/services/media-source-version-evidence-owner-v1';

const input = {
  assetId: 'asset-runtime-audio',
  userId: 'user-runtime-audio',
  resourcePolicy: {
    policyVersion: 'runtime-audio-test-v1',
    maxSourceBytes: 1_000,
    maxCanonicalJsonBytes: 100_000,
    maxDecodedFrameEntries: 10,
    maxEpochEntries: 10,
    maxDecodedSampleFrames: 100,
    maxDecodedPcmBytes: 1_000,
    timeoutMs: 1_000,
  },
  publishedAt: new Date('2026-08-30T14:00:00.000Z'),
};

describe('MediaSourceAudioProductRuntimeV1', () => {
  it('composes dedicated private, asset, evidence and source-lease owners', async () => {
    const artifactWriter = { writeArtifactSetFromPcmStream: vi.fn() };
    const assetStorePorts = assetPorts();
    const evidenceStorePorts = evidencePorts();
    const createSourceLease = vi.fn();
    const materializeProduct = vi.fn(async () => receipt());

    const result = await runMediaSourceAudioProductRuntimeV1(input, {
      environment: {},
      createPrivateRuntime: vi.fn(() => ({ audioArtifact: artifactWriter })),
      createAssetStorePorts: vi.fn(async () => assetStorePorts),
      createEvidenceStorePorts: vi.fn(() => evidenceStorePorts),
      createSourceLease,
      materializeProduct,
    });

    expect(result).toEqual(receipt());
    expect(materializeProduct).toHaveBeenCalledWith(input, {
      assetStorePorts,
      evidenceStorePorts,
      artifactWriter,
      createSourceLease,
    });
  });

  it.each([
    ['private', 'PRIVATE_STORAGE_NOT_CONFIGURED'],
    ['asset', 'MEDIA_ASSET_OWNER_UNAVAILABLE'],
    ['evidence', 'SOURCE_VERSION_EVIDENCE_OWNER_UNAVAILABLE'],
  ] as const)('reports %s composition failure without running the product owner', async (
    failed,
    reason,
  ) => {
    const materializeProduct = vi.fn(async () => receipt());
    const result = await runMediaSourceAudioProductRuntimeV1(input, {
      environment: {},
      createPrivateRuntime: () => {
        if (failed === 'private') throw new Error('PRIVATE_OFFLINE');
        return { audioArtifact: { writeArtifactSetFromPcmStream: vi.fn() } };
      },
      createAssetStorePorts: async () => {
        if (failed === 'asset') throw new Error('ATLAS_OFFLINE');
        return assetPorts();
      },
      createEvidenceStorePorts: () => {
        if (failed === 'evidence') throw new Error('EVIDENCE_OFFLINE');
        return evidencePorts();
      },
      materializeProduct,
    });

    expect(result).toEqual({ kind: 'runtime_unavailable', reason });
    expect(materializeProduct).not.toHaveBeenCalled();
  });
});

function assetPorts(): MediaSourceAudioArtifactAssetStorePortsV1 {
  return {
    load: vi.fn(async () => null),
    replace: vi.fn(async () => false),
  };
}

function evidencePorts(): MediaSourceVersionEvidenceStorePortsV1 {
  return {
    load: vi.fn(async () => null),
    compareAndSet: vi.fn(async () => false),
  };
}

function receipt(): MediaSourceAudioProductMaterializationReceiptV1 {
  return {
    schemaVersion: 1,
    kind: 'EDITRON_MEDIA_SOURCE_AUDIO_PRODUCT_MATERIALIZATION_RECEIPT_V1',
    disposition: 'COMPLETED',
    assetId: input.assetId,
    userId: input.userId,
    sourceVersionSha256: '1'.repeat(64),
    observedAudioStreamIndexes: [0],
    materializedAudioStreamIndexes: [0],
    audioArtifactStateSha256: '2'.repeat(64),
    sourceVersionEvidenceSha256: '3'.repeat(64),
    completedAt: input.publishedAt.toISOString(),
    receiptSha256: '4'.repeat(64),
  };
}
