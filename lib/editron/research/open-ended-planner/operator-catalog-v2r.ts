import historicalOperatorCatalogJson from '@/tests/fixtures/editron/open-ended-planner-v2/operator-specs-v2.json';

import { buildCap2aEnrichedCatalogV2R } from './cap2a-planner-dossier-v2r';
import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import type { HashedStagePacketV2 } from './staged-packet-v2';

type JsonRecord = Record<string, unknown>;

// The historical V2 JSON is immutable benchmark evidence. V2R derives its own
// explicitly identified contract from those bytes so later causal amendments do
// not rewrite, or silently masquerade as, the issued V2 catalog.
export const V2R_OPERATOR_CATALOG_REVISION = 'EDITRON_OPERATOR_SPECS_V2R_2' as const;

const historicalCatalog = cloneJsonV2R(historicalOperatorCatalogJson) as JsonRecord;
const amendedCatalog = amendCausalOwnerContractsV2R(historicalCatalog);
const catalogMaterial: JsonRecord = {
  ...amendedCatalog,
  catalogRevision: V2R_OPERATOR_CATALOG_REVISION,
  derivedFrom: {
    artifact: 'tests/fixtures/editron/open-ended-planner-v2/operator-specs-v2.json',
    version: text(historicalCatalog.version),
    sha256: hashCanonicalJsonV1(historicalOperatorCatalogJson),
  },
};

function amendCausalOwnerContractsV2R(source: JsonRecord): JsonRecord {
  const amendments = new Map<string, JsonRecord>([
    ['resolve_transcript_edit', {
      ownerRef: 'lib/editron/agent/chat-transcript-tools.ts#resolveTranscriptEditRange',
      input: operatorIoV2R(
        ['projectId', 'expectedProjectRevision', 'query', 'intent', 'evidenceIds', 'constraints'],
        ['projectId', 'expectedProjectRevision', 'query', 'intent', 'evidenceIds'],
      ),
    }],
    ['cut_section', {
      ownerRef: 'lib/editron/services/timeline-range-cut.ts#cutTimelineRange',
      output: operatorIoV2R(
        ['receipt', 'timelineCoordinateTransform', 'splitChildren'],
        ['receipt', 'timelineCoordinateTransform', 'splitChildren'],
      ),
    }],
    ['find_visual_moment', {
      ownerRef: 'lib/editron/agent/chat-visual-tools.ts#findVisualMomentCandidates',
      input: operatorIoV2R(
        ['projectId', 'query', 'evidenceIds', 'timelineCoordinateTransform', 'splitChildren'],
        ['projectId', 'query'],
      ),
      output: operatorIoV2R(
        ['result', 'evidence', 'overlayId', 'targetFrame', 'focalPoint', 'evidenceStrength'],
        ['result', 'evidence', 'overlayId', 'targetFrame', 'focalPoint', 'evidenceStrength'],
      ),
    }],
    ['resolve_keyframe_edit', {
      ownerRef: 'lib/editron/agent/chat-visual-tools.ts#resolveKeyframeEditParams',
      input: operatorIoV2R(
        ['projectId', 'expectedProjectRevision', 'overlayId', 'targetFrame', 'focalPoint',
          'evidenceStrength', 'intent', 'evidenceIds', 'constraints'],
        ['projectId', 'expectedProjectRevision', 'intent'],
      ),
    }],
    ['set_keyframes', {
      ownerRef: 'lib/editron/services/keyframe-mutation.ts#buildKeyframeMutationPatch',
      input: operatorIoV2R(
        ['projectId', 'expectedProjectRevision', 'overlayId', 'keyframes', 'focalPoint', 'evidenceIds'],
        ['projectId', 'expectedProjectRevision', 'overlayId', 'keyframes'],
      ),
    }],
    ['apply_audio_ducking', {
      ownerRef: 'lib/editron/agent/chat-audio-tools.ts#applyAudioDuckingToProject',
      input: operatorIoV2R(
        ['projectId', 'expectedProjectRevision', 'audioPlan', 'evidenceIds'],
        ['projectId', 'expectedProjectRevision', 'audioPlan', 'evidenceIds'],
      ),
      stateEffects: ['BGM overlay styles.duckingConfig and optional default BGM volume'],
    }],
  ]);
  const operators = records(source.operators).map((operator) => ({
    ...operator,
    ...record(amendments.get(text(operator.operatorId))),
  }));
  return {
    ...source,
    fieldSchemas: {
      ...record(source.fieldSchemas),
      overlayId: { type: 'integer', minimum: 0 },
      targetFrame: { type: 'integer', minimum: 0 },
      focalPoint: focalPointSchemaV2R(),
      evidenceStrength: { type: 'number', minimum: 0, maximum: 1 },
      timelineCoordinateTransform: timelineCoordinateTransformSchemaV2R(),
      splitChildren: splitChildrenSchemaV2R(),
      audioPlan: {
        type: 'object',
        required: ['enabled'],
        properties: {
          enabled: { enum: [true, false] },
          duckLevel: { type: 'number', minimum: 0.02, maximum: 0.8 },
          rampDownMs: { type: 'integer', minimum: 50, maximum: 2000 },
          rampUpMs: { type: 'integer', minimum: 50, maximum: 3000 },
          lookAheadMs: { type: 'integer', minimum: 0, maximum: 1000 },
        },
        additionalProperties: false,
      },
    },
    operators,
  };
}

function operatorIoV2R(fields: readonly string[], required: readonly string[]): JsonRecord {
  return { fields: [...fields], required: [...required] };
}

function frameRangeSchemaV2R(): JsonRecord {
  return {
    type: 'object', required: ['startFrame', 'endFrame'],
    properties: {
      startFrame: { type: 'integer', minimum: 0 },
      endFrame: { type: 'integer', minimum: 1 },
    },
    additionalProperties: false,
  };
}

function focalPointSchemaV2R(): JsonRecord {
  return {
    type: 'object', required: ['x', 'y'],
    properties: {
      x: { type: 'number', minimum: 0, maximum: 1 },
      y: { type: 'number', minimum: 0, maximum: 1 },
    },
    additionalProperties: false,
  };
}

function timelineCoordinateTransformSchemaV2R(): JsonRecord {
  return {
    type: 'object',
    required: ['schemaVersion', 'beforeDurationInFrames', 'afterDurationInFrames',
      'removedRange', 'shiftAfterRemovedRangeFrames', 'mapRule'],
    properties: {
      schemaVersion: { const: 'EDITRON_TIMELINE_RANGE_CUT_COORDINATE_TRANSFORM_V1' },
      beforeDurationInFrames: { type: 'integer', minimum: 1 },
      afterDurationInFrames: { type: 'integer', minimum: 0 },
      removedRange: frameRangeSchemaV2R(),
      shiftAfterRemovedRangeFrames: { type: 'integer' },
      mapRule: { const: 'HALF_OPEN_REMOVE_AND_SHIFT_LEFT_V1' },
    },
    additionalProperties: false,
  };
}

function splitChildrenSchemaV2R(): JsonRecord {
  return {
    type: 'array',
    items: {
      type: 'object',
      required: ['beforeOverlayId', 'leftOverlayId', 'rightOverlayId', 'overlayType',
        'leftBeforeTimelineRange', 'leftAfterTimelineRange', 'rightBeforeTimelineRange',
        'rightAfterTimelineRange', 'rightTimelineStartFrame', 'rightSourceCoordinateField',
        'rightSourceStartFrame'],
      properties: {
        beforeOverlayId: { type: 'integer', minimum: 0 },
        leftOverlayId: { type: 'integer', minimum: 0 },
        rightOverlayId: { type: 'integer', minimum: 0 },
        overlayType: { enum: ['video', 'sound'] },
        assetId: { type: 'string', minLength: 1 },
        leftBeforeTimelineRange: frameRangeSchemaV2R(),
        leftAfterTimelineRange: frameRangeSchemaV2R(),
        rightBeforeTimelineRange: frameRangeSchemaV2R(),
        rightAfterTimelineRange: frameRangeSchemaV2R(),
        rightTimelineStartFrame: { type: 'integer', minimum: 0 },
        rightSourceCoordinateField: { enum: ['sourceStartFrame', 'startFromSound'] },
        rightSourceStartFrame: { type: 'integer', minimum: 0 },
      },
      additionalProperties: false,
    },
  };
}

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
