import historicalOperatorCatalogJson from '@/tests/fixtures/editron/open-ended-planner-v2/operator-specs-v2.json';

import { buildCap2aEnrichedCatalogV2R } from './cap2a-planner-dossier-v2r';
import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import type { HashedStagePacketV2 } from './staged-packet-v2';

type JsonRecord = Record<string, unknown>;

// The historical V2 JSON is immutable benchmark evidence. V2R derives its own
// explicitly identified contract from those bytes so later causal amendments do
// not rewrite, or silently masquerade as, the issued V2 catalog.
export const V2R_OPERATOR_CATALOG_REVISION = 'EDITRON_OPERATOR_SPECS_V2R_1' as const;

const historicalCatalog = cloneJsonV2R(historicalOperatorCatalogJson) as JsonRecord;
const catalogMaterial: JsonRecord = {
  ...historicalCatalog,
  catalogRevision: V2R_OPERATOR_CATALOG_REVISION,
  derivedFrom: {
    artifact: 'tests/fixtures/editron/open-ended-planner-v2/operator-specs-v2.json',
    version: text(historicalCatalog.version),
    sha256: hashCanonicalJsonV1(historicalOperatorCatalogJson),
  },
};

export const V2R_OPERATOR_CATALOG: Readonly<JsonRecord> = deepFreezeV1<JsonRecord>({
  ...catalogMaterial,
  catalogSha256: hashCanonicalJsonV1(catalogMaterial),
});

export interface V2ROperatorCatalogIdentity {
  version: string;
  catalogRevision: typeof V2R_OPERATOR_CATALOG_REVISION;
  catalogSha256: string;
}

export function v2rOperatorCatalogIdentity(): Readonly<V2ROperatorCatalogIdentity> {
  return deepFreezeV1({
    version: text(V2R_OPERATOR_CATALOG.version),
    catalogRevision: V2R_OPERATOR_CATALOG_REVISION,
    catalogSha256: text(V2R_OPERATOR_CATALOG.catalogSha256),
  });
}

export function v2rOperatorSpecRef(operatorId: string): string {
  if (!operatorByIdV2R().has(operatorId)) {
    throw new Error(`V2R_OPERATOR_CATALOG_UNKNOWN_OPERATOR:${operatorId}`);
  }
  return `${V2R_OPERATOR_CATALOG_REVISION}#${operatorId}`;
}

// Rebind a Stage 2-4 packet to the V2R catalog while preserving the exact
// operator subset selected by the existing stage builder. The packet and
// transport hashes are recomputed; there is no fallback to the historical view.
export function bindV2ROperatorCatalogToPacketV2R(
  source: HashedStagePacketV2,
): HashedStagePacketV2 {
  if (source.packet.stage < 2 || source.packet.stage > 4) {
    throw new Error(`V2R_OPERATOR_CATALOG_STAGE_UNSUPPORTED:${source.packet.stage}`);
  }
  const sourceCatalog = record(source.packet.modelInput.operatorCatalog);
  const requestedIds = records(sourceCatalog.operators).map((operator) => text(operator.operatorId));
  const operatorIds = requireUniqueKnownOperatorIdsV2R(requestedIds);
  const operatorRecords = operatorIds.map((operatorId) => operatorByIdV2R().get(operatorId) as JsonRecord);
  const operatorCatalog = publicCatalogV2R(operatorRecords, source.packet.stage === 4);
  const packet = deepFreezeV1({
    ...source.packet,
    modelInput: {
      ...source.packet.modelInput,
      operatorCatalog,
      capabilityDossier: buildCap2aEnrichedCatalogV2R(operatorRecords),
    },
  });
  const transportAttachments = deepFreezeV1([...source.transportAttachments]);
  return deepFreezeV1({
    packet,
    packetHash: hashCanonicalJsonV1(packet),
    transportAttachments,
    transportHash: hashCanonicalJsonV1(transportAttachments),
  });
}

function publicCatalogV2R(operatorRecords: readonly JsonRecord[], includeCompilationFields: boolean): JsonRecord {
  const identity = v2rOperatorCatalogIdentity();
  const operators = operatorRecords.map((operator) => {
    const base = {
      operatorId: text(operator.operatorId),
      kind: text(operator.kind),
      supportStatus: text(operator.supportStatus),
      compilerEligibility: text(operator.compilerEligibility),
      input: record(operator.input),
      output: record(operator.output),
      stateEffects: strings(operator.stateEffects),
      proof: strings(operator.proof),
    };
    return includeCompilationFields
      ? {
          ...base,
          operatorSpecRef: v2rOperatorSpecRef(base.operatorId),
          ownerRef: ownerRefV2R(operator),
        }
      : base;
  });
  return includeCompilationFields
    ? deepFreezeV1({
        ...identity,
        productionEligibility: V2R_OPERATOR_CATALOG.productionEligibility,
        schemaAssembly: V2R_OPERATOR_CATALOG.schemaAssembly,
        fieldSchemas: V2R_OPERATOR_CATALOG.fieldSchemas,
        operators,
      })
    : deepFreezeV1({ ...identity, operators });
}

function operatorByIdV2R(): ReadonlyMap<string, JsonRecord> {
  return new Map(
    records(V2R_OPERATOR_CATALOG.operators).map((operator) => [text(operator.operatorId), operator]),
  );
}

function requireUniqueKnownOperatorIdsV2R(operatorIds: readonly string[]): string[] {
  if (!operatorIds.length || operatorIds.some((operatorId) => !operatorId)) {
    throw new Error('V2R_OPERATOR_CATALOG_OPERATOR_SET_EMPTY_OR_INVALID');
  }
  if (new Set(operatorIds).size !== operatorIds.length) {
    throw new Error('V2R_OPERATOR_CATALOG_OPERATOR_SET_DUPLICATE');
  }
  const known = operatorByIdV2R();
  const missing = operatorIds.filter((operatorId) => !known.has(operatorId));
  if (missing.length) throw new Error(`V2R_OPERATOR_CATALOG_UNKNOWN_OPERATOR:${missing.join(',')}`);
  return [...operatorIds];
}

function ownerRefV2R(operator: JsonRecord): string {
  if (typeof operator.ownerRef === 'string' && operator.ownerRef) return operator.ownerRef;
  const owner = record(operator.owner);
  if (typeof owner.path === 'string' && typeof owner.symbol === 'string') {
    return `${owner.path}#${owner.symbol}`;
  }
  return `v1:${text(operator.operatorId)}`;
}

function cloneJsonV2R<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.map(record) : [];
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
