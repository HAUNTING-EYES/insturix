import { canonicalizeEditronJsonV1 } from './canonical-json-v1';
import {
  assertMediaSourceVersionEvidenceRecordV1,
  mediaSourceVersionEvidenceAssetViewV1,
  type MediaSourceVersionEvidenceStorePortsV1,
} from './media-source-version-evidence-owner-v1';
import type { MediaSourcePtsCadenceMapAssetStateInputV3 }
  from './media-source-pts-cadence-map-asset-owner-v3';
import {
  assertMediaSourceVersionV1,
  type MediaSourceVersionV1,
} from './media-source-version-v1';
import {
  createQualifiedAssetMediaSourceLeasePortV1,
  type VerifiedMediaSourceLeasePortV1,
} from './verified-media-source-local-file-v1';

type SelectedSourceLeaseAssetV1 = MediaSourcePtsCadenceMapAssetStateInputV3
  & Readonly<{ proxySourceVersionV1?: unknown }>;

type QualifiedLeaseFactoryV1 = typeof createQualifiedAssetMediaSourceLeasePortV1;
type ExpectedSourceV1 = Parameters<VerifiedMediaSourceLeasePortV1['open']>[0];

const ERRORS = Object.freeze({
  bindingStale: 'ASSET_TRANSCRIPTION_SOURCE_BINDING_STALE',
  versionStale: 'ASSET_TRANSCRIPTION_SOURCE_VERSION_STALE',
  sourceUnavailable: 'ASSET_TRANSCRIPTION_SOURCE_UNAVAILABLE',
});

/**
 * Produces a lease for only the exact current or retained-proxy source. A
 * historical proxy is reconstructed from its immutable evidence record so its
 * own qualification, not the master's current qualification, issues the URL.
 */
export function createProjectSelectedMediaSourceLeasePortV1(input: Readonly<{
  asset: SelectedSourceLeaseAssetV1;
  evidenceReader: Pick<MediaSourceVersionEvidenceStorePortsV1, 'load'>;
  createQualifiedLease?: QualifiedLeaseFactoryV1;
}>): Readonly<VerifiedMediaSourceLeasePortV1> {
  if (!input?.asset || typeof input.evidenceReader?.load !== 'function') {
    throw new Error('ASSET_TRANSCRIPTION_SOURCE_LEASE_PORT_INVALID');
  }
  const createQualifiedLease = input.createQualifiedLease
    ?? createQualifiedAssetMediaSourceLeasePortV1;
  return Object.freeze({
    async open(expectedValue: ExpectedSourceV1) {
      let expected: MediaSourceVersionV1;
      try {
        expected = assertMediaSourceVersionV1(expectedValue);
      } catch {
        throw new Error(ERRORS.bindingStale);
      }
      const current = sourceVersion(input.asset.sourceVersionV1);
      let sourceAsset: MediaSourcePtsCadenceMapAssetStateInputV3;
      if (current && sameSource(current, expected)) {
        sourceAsset = input.asset;
      } else {
        const retainedProxy = sourceVersion(input.asset.proxySourceVersionV1);
        if (!retainedProxy || !sameSource(retainedProxy, expected)) {
          throw new Error(ERRORS.bindingStale);
        }
        sourceAsset = await historicalSourceAsset(expected, input.evidenceReader);
      }
      return createQualifiedLease(sourceAsset, ERRORS).open(expected);
    },
  });
}

async function historicalSourceAsset(
  expected: MediaSourceVersionV1,
  evidenceReader: Pick<MediaSourceVersionEvidenceStorePortsV1, 'load'>,
): Promise<MediaSourcePtsCadenceMapAssetStateInputV3> {
  let stored: unknown | null;
  try {
    stored = await evidenceReader.load({
      owner: expected.owner,
      assetId: expected.assetId,
      sourceVersionSha256: expected.sourceVersionSha256,
    });
  } catch {
    throw new Error(ERRORS.bindingStale);
  }
  if (stored === null) throw new Error(ERRORS.bindingStale);
  try {
    const evidence = assertMediaSourceVersionEvidenceRecordV1(stored);
    if (!sameSource(evidence.sourceVersionV1, expected)) {
      throw new Error(ERRORS.bindingStale);
    }
    return mediaSourceVersionEvidenceAssetViewV1(evidence);
  } catch {
    throw new Error(ERRORS.bindingStale);
  }
}

function sourceVersion(value: unknown): MediaSourceVersionV1 | null {
  try {
    return assertMediaSourceVersionV1(value);
  } catch {
    return null;
  }
}

function sameSource(
  left: Readonly<MediaSourceVersionV1>,
  right: Readonly<MediaSourceVersionV1>,
): boolean {
  return canonicalizeEditronJsonV1(left) === canonicalizeEditronJsonV1(right);
}
