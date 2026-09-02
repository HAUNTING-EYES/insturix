import { z } from 'zod';

import {
  editorialMediaIdentityContractSchemaV1,
  verifyEditorialMediaIdentityContractV1,
  type EditorialMediaIdentityContractV1,
} from '../../contracts/editorial-media-identity-contract-v1';
import {
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from '../../services/canonical-json-v1';
import { EditorialPlanArtifactRefSchemaV1 }
  from '../../services/editorial-plan-v1';

export const STAGE25_LONG_FORM_EVIDENCE_SCALE_PROXY_VERSION_V1 =
  'EDITRON_STAGE25_LONG_FORM_EVIDENCE_SCALE_PROXY_V1_1' as const;
export const STAGE25_LONG_FORM_EVIDENCE_SCALE_PROXY_DURATION_US_V1 =
  '16200000000' as const;
export const STAGE25_LONG_FORM_EVIDENCE_KINDS_V1 = [
  'TRANSCRIPT', 'SHOT', 'AUDIO', 'RIGHTS',
] as const;

const ID = z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,239}$/);
const SHA256 = z.string().regex(/^[a-f0-9]{64}$/);
const POSITIVE_INTEGER = z.string().regex(/^[1-9]\d*$/);
const NON_NEGATIVE_INTEGER = z.string().regex(/^(0|[1-9]\d*)$/);
const RationalRate = z.object({
  numerator: POSITIVE_INTEGER,
  denominator: POSITIVE_INTEGER,
}).strict();
export const Stage25LongFormEvidenceSourceRangeSchemaV1 = z.object({
  coordinateDomain: z.literal('SOURCE_PTS'),
  timebaseId: ID,
  timebaseVersion: ID,
  ticksPerSecond: RationalRate,
  startPts: NON_NEGATIVE_INTEGER,
  endExclusivePts: POSITIVE_INTEGER,
}).strict();
const EvidenceMaterial = z.object({
  evidenceId: ID,
  kind: z.enum(STAGE25_LONG_FORM_EVIDENCE_KINDS_V1),
  sourceAssetId: ID,
  sourceVersionSha256: SHA256,
  sourceRange: Stage25LongFormEvidenceSourceRangeSchemaV1,
  producerRef: EditorialPlanArtifactRefSchemaV1,
  summaryUnitCount: POSITIVE_INTEGER,
  payloadDisposition: z.literal('REFERENCE_ONLY_NO_PAYLOAD_BYTES'),
}).strict();
export const Stage25LongFormEvidenceReferenceSchemaV1 = EvidenceMaterial.extend({
  artifactRef: EditorialPlanArtifactRefSchemaV1,
}).strict();
const Source = z.object({
  sourceVersionSha256: SHA256,
  identity: editorialMediaIdentityContractSchemaV1,
  evidenceReferences: z.array(Stage25LongFormEvidenceReferenceSchemaV1).length(
    STAGE25_LONG_FORM_EVIDENCE_KINDS_V1.length,
  ),
}).strict();
const Coverage = z.object({
  sourceAssetId: ID,
  sourceVersionSha256: SHA256,
  sourceRange: Stage25LongFormEvidenceSourceRangeSchemaV1,
  evidenceIds: z.array(ID).length(STAGE25_LONG_FORM_EVIDENCE_KINDS_V1.length),
  disposition: z.literal('FULL_REFERENCE_SET_PRESENT'),
}).strict();
const InventoryMaterial = z.object({
  version: z.literal(STAGE25_LONG_FORM_EVIDENCE_SCALE_PROXY_VERSION_V1),
  authority: z.literal(
    'RESEARCH_SCALE_PROXY_ONLY_NO_MEDIA_EVIDENCE_OR_PROJECT_AUTHORITY',
  ),
  evidenceClass: z.literal('SCALE_PROXY_ONLY'),
  projectId: ID,
  declaredSourceCount: z.literal(7),
  declaredSourceDurationUs: z.literal(
    STAGE25_LONG_FORM_EVIDENCE_SCALE_PROXY_DURATION_US_V1,
  ),
  sources: z.array(Source).length(7),
  coverageLedger: z.array(Coverage).length(7),
  limitations: z.tuple([
    z.literal('NO_MEDIA_BYTES_OR_PIXEL_AUDIO_OBSERVATIONS'),
    z.literal('NO_SEMANTIC_RANGE_ACCURACY_OR_EDITORIAL_QUALITY_PROOF'),
    z.literal('NO_STORAGE_INDEX_WORKER_OR_PRODUCT_INTEGRATION'),
    z.literal('NO_PRODUCTION_LONG_FORM_SUPPORT_OR_CERTIFICATION'),
  ]),
  providerInferenceCalls: z.literal(0),
  networkCalls: z.literal(0),
  renderCalls: z.literal(0),
  canonicalProjectReads: z.literal(0),
  canonicalProjectMutations: z.literal(0),
  stateEffects: z.tuple([]),
}).strict();
const Inventory = InventoryMaterial.extend({ inventorySha256: SHA256 }).strict();

export type Stage25LongFormEvidenceKindV1 =
  typeof STAGE25_LONG_FORM_EVIDENCE_KINDS_V1[number];
export type Stage25LongFormEvidenceSourceRangeV1 = z.infer<
  typeof Stage25LongFormEvidenceSourceRangeSchemaV1
>;
export type Stage25LongFormEvidenceReferenceV1 = z.infer<
  typeof Stage25LongFormEvidenceReferenceSchemaV1
>;
export type Stage25LongFormEvidenceScaleProxyV1 = z.infer<typeof Inventory>;
export type Stage25LongFormEvidenceScaleProxyMaterialV1 = z.infer<
  typeof InventoryMaterial
>;

export function createStage25LongFormEvidenceScaleProxyV1(
  material: Stage25LongFormEvidenceScaleProxyMaterialV1,
): Readonly<Stage25LongFormEvidenceScaleProxyV1> {
  const parsed = InventoryMaterial.parse(material);
  return assertStage25LongFormEvidenceScaleProxyV1({
    ...parsed,
    inventorySha256: hashEditronCanonicalJsonV1(parsed),
  });
}

export function assertStage25LongFormEvidenceScaleProxyV1(
  value: unknown,
): Readonly<Stage25LongFormEvidenceScaleProxyV1> {
  const inventory = Inventory.parse(value);
  const { inventorySha256, ...material } = inventory;
  if (hashEditronCanonicalJsonV1(material) !== inventorySha256) {
    fail('INVENTORY_HASH_INVALID');
  }
  validateInventory(inventory);
  return deepFreezeEditronJsonV1(inventory) as Readonly<
  Stage25LongFormEvidenceScaleProxyV1>;
}

export function stage25SourceRangeFromMediaIdentityV1(
  identity: Extract<EditorialMediaIdentityContractV1, { identityStatus: 'QUALIFIED' }>,
): Stage25LongFormEvidenceSourceRangeV1 {
  return {
    coordinateDomain: 'SOURCE_PTS',
    timebaseId: identity.source.timebase.timebaseId,
    timebaseVersion: identity.source.timebase.version,
    ticksPerSecond: identity.source.timebase.ticksPerSecond,
    startPts: identity.source.range.startTick,
    endExclusivePts: identity.source.range.endExclusiveTick,
  };
}

function validateInventory(inventory: Stage25LongFormEvidenceScaleProxyV1): void {
  const assets = new Set<string>();
  const versions = new Set<string>();
  const timebases = new Set<string>();
  const reels = new Set<string>();
  const evidenceIds = new Set<string>();
  const coverage = new Map(inventory.coverageLedger.map((entry) => [
    entry.sourceAssetId, entry,
  ]));
  let durationUs = BigInt(0);
  for (const source of inventory.sources) {
    const verified = verifyEditorialMediaIdentityContractV1(source.identity);
    if (verified.status !== 'PASS' || verified.value.identityStatus !== 'QUALIFIED') {
      fail('SOURCE_IDENTITY_INVALID');
    }
    const identity = verified.value;
    const assetId = identity.media.assetId;
    unique(assets, assetId, 'SOURCE_ASSET_DUPLICATED');
    unique(versions, source.sourceVersionSha256, 'SOURCE_VERSION_DUPLICATED');
    unique(timebases, identity.source.timebase.timebaseId, 'SOURCE_TIMEBASE_DUPLICATED');
    unique(reels, identity.source.reelTimecode.reelId, 'SOURCE_REEL_DUPLICATED');
    if (hashEditronCanonicalJsonV1(identity) !== source.sourceVersionSha256) {
      fail('SOURCE_VERSION_HASH_INVALID');
    }
    const range = stage25SourceRangeFromMediaIdentityV1(identity);
    durationUs += BigInt(range.endExclusivePts) - BigInt(range.startPts);
    const kinds = source.evidenceReferences.map(({ kind }) => kind).sort(ascii);
    if (kinds.join('|')
      !== [...STAGE25_LONG_FORM_EVIDENCE_KINDS_V1].sort(ascii).join('|')) {
      fail('SOURCE_EVIDENCE_KIND_SET_INCOMPLETE');
    }
    for (const evidence of source.evidenceReferences) {
      unique(evidenceIds, evidence.evidenceId, 'EVIDENCE_ID_DUPLICATED');
      const { artifactRef, ...evidenceMaterial } = evidence;
      if (evidence.sourceAssetId !== assetId
        || evidence.sourceVersionSha256 !== source.sourceVersionSha256
        || hashEditronCanonicalJsonV1(evidence.sourceRange)
          !== hashEditronCanonicalJsonV1(range)
        || artifactRef.ownerId !== 'EVIDENCE'
        || artifactRef.artifactId !== evidence.evidenceId
        || artifactRef.artifactVersion !== 'scale-proxy-v1'
        || artifactRef.artifactSha256 !== hashEditronCanonicalJsonV1(evidenceMaterial)) {
        fail('EVIDENCE_REFERENCE_BINDING_INVALID');
      }
    }
    const ledger = coverage.get(assetId);
    if (!ledger
      || ledger.sourceVersionSha256 !== source.sourceVersionSha256
      || hashEditronCanonicalJsonV1(ledger.sourceRange) !== hashEditronCanonicalJsonV1(range)
      || ledger.evidenceIds.join('|') !== source.evidenceReferences
        .map(({ evidenceId }) => evidenceId).sort(ascii).join('|')) {
      fail('COVERAGE_LEDGER_BINDING_INVALID');
    }
  }
  if (coverage.size !== inventory.sources.length) fail('COVERAGE_LEDGER_INCOMPLETE');
  if (durationUs !== BigInt(STAGE25_LONG_FORM_EVIDENCE_SCALE_PROXY_DURATION_US_V1)) {
    fail('DECLARED_DURATION_INVALID');
  }
}

function ascii(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function unique(values: Set<string>, value: string, code: string): void {
  if (values.has(value)) fail(code);
  values.add(value);
}

function fail(code: string): never {
  throw new Error(`STAGE25_LONG_FORM_EVIDENCE_SCALE_PROXY_${code}`);
}
