import {
  EDITORIAL_MEDIA_IDENTITY_CONTRACT_VERSION_V1,
  type EditorialMediaIdentityContractV1,
} from '../../contracts/editorial-media-identity-contract-v1';
import { hashEditronCanonicalJsonV1 }
  from '../../services/canonical-json-v1';
import type { EditorialPlanArtifactRefV1 }
  from '../../services/editorial-plan-v1';
import {
  createStage25LongFormEvidenceScaleProxyV1,
  stage25SourceRangeFromMediaIdentityV1,
  STAGE25_LONG_FORM_EVIDENCE_KINDS_V1,
  STAGE25_LONG_FORM_EVIDENCE_SCALE_PROXY_DURATION_US_V1,
  STAGE25_LONG_FORM_EVIDENCE_SCALE_PROXY_VERSION_V1,
  type Stage25LongFormEvidenceKindV1,
  type Stage25LongFormEvidenceScaleProxyV1,
} from './stage25-long-form-evidence-scale-proxy-v1';

type QualifiedIdentity = Extract<EditorialMediaIdentityContractV1, {
  identityStatus: 'QUALIFIED';
}>;
type SourceSpec = Readonly<{
  assetId: string;
  durationSeconds: number;
  reelId: string;
  startTimecode: string;
  rate: Readonly<{ numerator: string; denominator: string }>;
  cadence: 'CFR' | 'VFR';
}>;

const SOURCE_SPECS: readonly SourceSpec[] = Object.freeze([
  spec('source-camera-a', 1_001, 'A001', '01:00:00:00', '24000', '1001', 'CFR'),
  spec('source-camera-b', 1_001, 'A002', '02:00:00;00', '30000', '1001', 'CFR'),
  spec('source-camera-c', 1_001, 'A003', '03:00:00;00', '60000', '1001', 'CFR'),
  spec('source-keynote', 3_600, 'K001', '04:00:00:00', '24', '1', 'CFR'),
  spec('source-workshops', 3_600, 'W001', '05:00:00:00', '25', '1', 'CFR'),
  spec('source-broll', 3_000, 'B001', '06:00:00:00', '50', '1', 'CFR'),
  spec('source-phones-vfr', 2_997, 'P001', '07:00:00;00', '30000', '1001', 'VFR'),
]);

export function buildStage25LongFormEvidenceScaleProxyFixtureV1(): Readonly<
Stage25LongFormEvidenceScaleProxyV1> {
  const sources = SOURCE_SPECS.map(buildSource);
  return createStage25LongFormEvidenceScaleProxyV1({
    version: STAGE25_LONG_FORM_EVIDENCE_SCALE_PROXY_VERSION_V1,
    authority: 'RESEARCH_SCALE_PROXY_ONLY_NO_MEDIA_EVIDENCE_OR_PROJECT_AUTHORITY',
    evidenceClass: 'SCALE_PROXY_ONLY',
    projectId: 'project-longform-evidence-scale-proxy-01',
    declaredSourceCount: 7,
    declaredSourceDurationUs: STAGE25_LONG_FORM_EVIDENCE_SCALE_PROXY_DURATION_US_V1,
    sources,
    coverageLedger: sources.map((source) => {
      const identity = qualified(source.identity);
      return {
        sourceAssetId: identity.media.assetId,
        sourceVersionSha256: source.sourceVersionSha256,
        sourceRange: stage25SourceRangeFromMediaIdentityV1(identity),
        evidenceIds: source.evidenceReferences
          .map(({ evidenceId }) => evidenceId).sort(ascii),
        disposition: 'FULL_REFERENCE_SET_PRESENT' as const,
      };
    }),
    limitations: [
      'NO_MEDIA_BYTES_OR_PIXEL_AUDIO_OBSERVATIONS',
      'NO_SEMANTIC_RANGE_ACCURACY_OR_EDITORIAL_QUALITY_PROOF',
      'NO_STORAGE_INDEX_WORKER_OR_PRODUCT_INTEGRATION',
      'NO_PRODUCTION_LONG_FORM_SUPPORT_OR_CERTIFICATION',
    ],
    providerInferenceCalls: 0,
    networkCalls: 0,
    renderCalls: 0,
    canonicalProjectReads: 0,
    canonicalProjectMutations: 0,
    stateEffects: [],
  });
}

function buildSource(sourceSpec: SourceSpec) {
  const identity = buildIdentity(sourceSpec);
  const sourceVersionSha256 = hashEditronCanonicalJsonV1(identity);
  const sourceRange = stage25SourceRangeFromMediaIdentityV1(identity);
  return {
    sourceVersionSha256,
    identity,
    evidenceReferences: STAGE25_LONG_FORM_EVIDENCE_KINDS_V1.map((kind) => {
      const evidenceId = `scale-proxy:${sourceSpec.assetId}:${kind.toLowerCase()}`;
      const material = {
        evidenceId,
        kind,
        sourceAssetId: sourceSpec.assetId,
        sourceVersionSha256,
        sourceRange,
        producerRef: planRef('EVIDENCE', `scale-proxy-producer:${kind.toLowerCase()}`),
        summaryUnitCount: summaryUnits(kind, sourceSpec.durationSeconds),
        payloadDisposition: 'REFERENCE_ONLY_NO_PAYLOAD_BYTES' as const,
      };
      return {
        ...material,
        artifactRef: {
          ownerId: 'EVIDENCE',
          artifactId: evidenceId,
          artifactVersion: 'scale-proxy-v1',
          artifactSha256: hashEditronCanonicalJsonV1(material),
        },
      };
    }),
  };
}

function buildIdentity(sourceSpec: SourceSpec): QualifiedIdentity {
  const durationUs = String(sourceSpec.durationSeconds * 1_000_000);
  const cadence = sourceSpec.cadence === 'CFR' ? {
    kind: 'CFR' as const,
    frameRate: sourceSpec.rate,
    frameCount: String(
      BigInt(sourceSpec.durationSeconds) * BigInt(sourceSpec.rate.numerator)
        / BigInt(sourceSpec.rate.denominator),
    ),
  } : {
    kind: 'VFR' as const,
    nominalFrameRate: sourceSpec.rate,
    ptsMapping: mediaArtifact(`${sourceSpec.assetId}:vfr-pts-map`),
  };
  return {
    schemaVersion: 1,
    contractVersion: EDITORIAL_MEDIA_IDENTITY_CONTRACT_VERSION_V1,
    kind: 'editorial-media-identity',
    status: 'UNWIRED_CONTRACT_ONLY',
    identityStatus: 'QUALIFIED',
    operationEligibility: 'PRECISE_TIMELINE',
    media: {
      assetId: sourceSpec.assetId,
      version: 'scale-proxy-source-v1',
      contentDigest: {
        algorithm: 'sha-256',
        value: hashEditronCanonicalJsonV1(sourceSpec),
      },
      ingestReceipt: mediaArtifact(`${sourceSpec.assetId}:ingest`),
    },
    source: {
      timebase: {
        timebaseId: `${sourceSpec.assetId}:source-pts`,
        version: 'scale-proxy-probe-v1',
        coordinateDomain: 'SOURCE_PTS',
        ticksPerSecond: { numerator: '1000000', denominator: '1' },
      },
      range: { startTick: '0', endExclusiveTick: durationUs },
      cadence,
      reelTimecode: {
        reelId: sourceSpec.reelId,
        start: sourceSpec.startTimecode,
        rate: sourceSpec.rate,
        dropFrame: sourceSpec.startTimecode.includes(';'),
        evidence: mediaArtifact(`${sourceSpec.assetId}:reel-timecode`),
      },
      video: {
        codedWidth: 3_840,
        codedHeight: 2_160,
        pixelAspectRatio: { numerator: '1', denominator: '1' },
        codec: 'scale-proxy-codec',
        colorPrimaries: 'bt709',
        transfer: 'bt709',
        matrix: 'bt709',
        range: 'LIMITED',
      },
      audioStreams: [{
        streamId: `${sourceSpec.assetId}:audio-main`,
        sampleRate: '48000',
        sampleCount: String(BigInt(sourceSpec.durationSeconds) * BigInt(48_000)),
        channelCount: 2,
        channelLayout: 'stereo',
        codec: 'pcm-s24le',
      }],
    },
    sourceToProxyMappings: [{
      proxy: mediaArtifact(`${sourceSpec.assetId}:proxy`),
      mappingArtifact: mediaArtifact(`${sourceSpec.assetId}:source-pts-to-proxy`),
      coordinateMapping: 'SOURCE_PTS_TO_PROXY_TICK',
    }],
  };
}

function spec(
  assetId: string,
  durationSeconds: number,
  reelId: string,
  startTimecode: string,
  numerator: string,
  denominator: string,
  cadence: 'CFR' | 'VFR',
): SourceSpec {
  return {
    assetId, durationSeconds, reelId, startTimecode,
    rate: { numerator, denominator }, cadence,
  };
}

function summaryUnits(kind: Stage25LongFormEvidenceKindV1, seconds: number): string {
  const divisor = kind === 'TRANSCRIPT' ? 30
    : kind === 'SHOT' ? 6
      : kind === 'AUDIO' ? 10 : seconds;
  return String(Math.max(1, Math.ceil(seconds / divisor)));
}

function mediaArtifact(artifactId: string) {
  return {
    artifactId,
    version: 'scale-proxy-v1',
    digest: {
      algorithm: 'sha-256' as const,
      value: hashEditronCanonicalJsonV1({ artifactId }),
    },
  };
}

function planRef(ownerId: string, artifactId: string): EditorialPlanArtifactRefV1 {
  const artifactVersion = 'scale-proxy-v1';
  return {
    ownerId, artifactId, artifactVersion,
    artifactSha256: hashEditronCanonicalJsonV1({ ownerId, artifactId, artifactVersion }),
  };
}

function qualified(identity: EditorialMediaIdentityContractV1): QualifiedIdentity {
  if (identity.identityStatus !== 'QUALIFIED') {
    throw new Error('STAGE25_LONG_FORM_SCALE_PROXY_SOURCE_NOT_QUALIFIED');
  }
  return identity;
}

function ascii(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
