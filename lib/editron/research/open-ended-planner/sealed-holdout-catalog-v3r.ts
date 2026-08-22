import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  V2R_OPERATOR_CATALOG,
  v2rOperatorCatalogIdentity,
} from './operator-catalog-v2r';
import type { SealedHoldoutOwnerSemanticPolicyV2R }
  from './sealed-holdout-owner-session-v2r';

type JsonRecord = Record<string, unknown>;

export const SEALED_HOLDOUT_OPERATOR_CATALOG_VERSION_V3R =
  'EDITRON_OE_SEALED_HOLDOUT_OPERATOR_CATALOG_V3R_1' as const;
export const SEALED_HOLDOUT_OWNER_SEMANTIC_POLICY_VERSION_V3R =
  'EDITRON_OE_SEALED_HOLDOUT_OWNER_SEMANTIC_POLICY_V3R_1' as const;

const v2 = structuredClone(V2R_OPERATOR_CATALOG) as JsonRecord;
delete v2.catalogSha256;

const operators = records(v2.operators).map((operator) => {
  if (operator.operatorId === 'resolve_visual_edit') {
    return {
      ...operator,
      ownerRef:
        'lib/editron/research/open-ended-planner/sealed-holdout-owner-session-v2r.ts#SealedHoldoutOwnerSemanticPolicyV2R',
      proof: ['resolved visual intent, exact source handles, evidence-bound target and source ranges'],
    };
  }
  if (operator.operatorId === 'reframe_project') {
    return {
      ...operator,
      ownerRef: 'lib/editron/services/subject-reframe-plan.ts#buildSubjectAwareReframePlan',
    };
  }
  return operator;
});

const catalogMaterial: JsonRecord = {
  ...v2,
  version: SEALED_HOLDOUT_OPERATOR_CATALOG_VERSION_V3R,
  catalogRevision: SEALED_HOLDOUT_OPERATOR_CATALOG_VERSION_V3R,
  derivedFrom: {
    ...v2rOperatorCatalogIdentity(),
    correctionScope: [
      'resolve_visual_edit matching-source-range semantics',
      'generated_composition_program closed nested input schemas',
      'reframe_project closed nested input schema',
      'resolver-specific proposedOperation output schema',
    ],
  },
  operatorFieldSchemas: {
    ...record(v2.operatorFieldSchemas),
    resolve_visual_edit: { intent: visualEditIntentSchema() },
    generated_composition_program: {
      layoutSpec: generatedLayoutSchema(),
      motionSpec: generatedMotionSchema(),
      typographySpec: generatedTypographySchema(),
      constraints: generatedConstraintsSchema(),
    },
    reframe_project: {
      reframePlan: reframePlanSchema(),
      constraints: reframeConstraintsSchema(),
    },
  },
  operatorOutputFieldSchemas: {
    resolve_visual_edit: { proposedOperation: visualProposedOperationSchema() },
  },
  operators,
};

export const SEALED_HOLDOUT_OPERATOR_CATALOG_V3R: Readonly<JsonRecord> =
  deepFreezeV1({
    ...catalogMaterial,
    catalogSha256: hashCanonicalJsonV1(catalogMaterial),
  });

export function sealedHoldoutOperatorCatalogIdentityV3R(): Readonly<JsonRecord> {
  return deepFreezeV1({
    version: SEALED_HOLDOUT_OPERATOR_CATALOG_VERSION_V3R,
    catalogRevision: SEALED_HOLDOUT_OPERATOR_CATALOG_VERSION_V3R,
    catalogSha256: text(SEALED_HOLDOUT_OPERATOR_CATALOG_V3R.catalogSha256),
    derivedFromCatalogSha256: v2rOperatorCatalogIdentity().catalogSha256,
  });
}

export const SEALED_HOLDOUT_OWNER_SEMANTIC_POLICY_V3R:
Readonly<SealedHoldoutOwnerSemanticPolicyV2R> = deepFreezeV1({
  version: SEALED_HOLDOUT_OWNER_SEMANTIC_POLICY_VERSION_V3R,
  operatorCatalog: SEALED_HOLDOUT_OPERATOR_CATALOG_V3R,
  resolveVisualEdit: resolveVisualEditV3R,
});

function resolveVisualEditV3R(input: Readonly<{
  arguments: Readonly<JsonRecord>;
  observations: readonly Readonly<JsonRecord>[];
  evidenceRefs: readonly string[];
  project: Readonly<JsonRecord>;
  media: readonly Readonly<JsonRecord>[];
  currentProjectRevision: string;
}>): Readonly<JsonRecord> {
  const intent = record(input.arguments.intent);
  const common = {
    projectId: input.arguments.projectId,
    expectedProjectRevision: input.currentProjectRevision,
    evidenceIds: input.evidenceRefs,
  };
  if (intent.action === 'inspect') {
    return {
      targetOperatorId: 'find_visual_moment',
      arguments: {
        projectId: input.arguments.projectId,
        query: intent.query,
        evidenceIds: input.evidenceRefs,
      },
    };
  }
  if (intent.action === 'cut_range') {
    return {
      targetOperatorId: 'cut_section',
      arguments: { ...common, targetRange: requireFirstRange(input.observations) },
    };
  }
  if (intent.action !== 'replace_with_matching_source_range') {
    fail('SEALED_V3_VISUAL_RESOLVER_ACTION_UNSUPPORTED');
  }
  const visual = observationValue(input.observations, 'VISUAL_WINDOWS');
  const timeline = observationValue(input.observations, 'TIMELINE');
  const incoming = record(visual.incoming);
  const sourceStartWindow = integerPair(incoming.validStartFrameWindow);
  const assetId = text(incoming.assetId);
  const boundaryFrame = safeInteger(timeline.boundaryFrame);
  const projectDurationFrames = safeInteger(input.project.durationFrames);
  const sourceDurationFrames = safeInteger(
    input.media.find((entry) => entry.assetId === assetId)?.durationFrames,
  );
  if (!assetId || !sourceStartWindow || boundaryFrame < 0
    || projectDurationFrames <= boundaryFrame || sourceDurationFrames < 1) {
    fail('SEALED_V3_VISUAL_MATCH_EVIDENCE_UNVERIFIABLE');
  }
  const targetDuration = projectDurationFrames - boundaryFrame;
  const sourceStartFrame = sourceStartWindow[0];
  const sourceEndFrame = sourceStartFrame + targetDuration;
  if (sourceEndFrame > sourceDurationFrames) {
    fail('SEALED_V3_VISUAL_MATCH_SOURCE_HANDLES_UNVERIFIABLE');
  }
  return {
    targetOperatorId: 'use_matching_footage',
    arguments: {
      ...common,
      assetId,
      targetRange: { startFrame: boundaryFrame, endFrame: projectDurationFrames },
      sourceRange: { startFrame: sourceStartFrame, endFrame: sourceEndFrame },
      ...(input.arguments.constraints
        ? { constraints: input.arguments.constraints }
        : {}),
    },
  };
}

function visualEditIntentSchema(): JsonRecord {
  return closed(['query', 'action'], {
    query: { type: 'string', minLength: 1, maxLength: 1000 },
    action: { enum: ['inspect', 'cut_range', 'replace_with_matching_source_range'] },
  });
}

function visualProposedOperationSchema(): JsonRecord {
  return { anyOf: [
    proposed('find_visual_moment', closed(['projectId', 'query', 'evidenceIds'], {
      projectId: nonEmptyString(), query: nonEmptyString(), evidenceIds: evidenceIdsSchema(),
    })),
    proposed('cut_section', closed(
      ['projectId', 'expectedProjectRevision', 'targetRange', 'evidenceIds'],
      mutationFields({ targetRange: frameRangeSchema() }),
    )),
    proposed('use_matching_footage', closed(
      ['projectId', 'expectedProjectRevision', 'assetId', 'targetRange', 'sourceRange',
        'evidenceIds'],
      mutationFields({
        assetId: nonEmptyString(), targetRange: frameRangeSchema(),
        sourceRange: frameRangeSchema(), constraints: matchingConstraintsSchema(),
      }),
    )),
  ] };
}

function generatedLayoutSchema(): JsonRecord {
  return closed(['panelCount', 'geometry', 'gutters', 'titleSafeBand'], {
    panelCount: { type: 'integer', minimum: 1, maximum: 16 },
    geometry: { enum: ['ASYMMETRIC_NORMALIZED_BOUNDS', 'SYMMETRIC_GRID', 'FREEFORM_NORMALIZED_BOUNDS'] },
    gutters: { enum: [true, false] },
    titleSafeBand: normalizedBoundsSchema(),
  });
}

function generatedMotionSchema(): JsonRecord {
  return closed(['entryFrames', 'stableFrames', 'exitFrames', 'relationship'], {
    entryFrames: framePairSchema(), stableFrames: framePairSchema(),
    exitFrames: framePairSchema(),
    relationship: { enum: [
      'OPPOSED_HORIZONTAL_SIDES_AND_VERTICAL_CENTRE',
      'SHARED_DIRECTION', 'INDEPENDENT_BOUNDED_MOTION',
    ] },
  });
}

function generatedTypographySchema(): JsonRecord {
  return closed(['text', 'alignment', 'fontAssetId'], {
    text: nonEmptyString(), alignment: { enum: ['LEFT', 'CENTER', 'RIGHT'] },
    fontAssetId: nonEmptyString(),
  });
}

function generatedConstraintsSchema(): JsonRecord {
  return closed(
    ['referencePixelsForbidden', 'preserveOutsideRange', 'returnBinding',
      'titleFaceOverlapMaximumPixels'],
    {
      referencePixelsForbidden: { enum: [true] },
      preserveOutsideRange: { enum: [true] },
      returnBinding: closed(['overlayId', 'assetId', 'sourceFrame'], {
        overlayId: nonEmptyString(), assetId: nonEmptyString(),
        sourceFrame: { type: 'integer', minimum: 0 },
      }),
      titleFaceOverlapMaximumPixels: { type: 'integer', minimum: 0 },
    },
  );
}

function reframePlanSchema(): JsonRecord {
  return closed(['targetAspectRatio', 'trackingMode', 'preserveAuthoredLayout'], {
    targetAspectRatio: { enum: ['16:9', '9:16', '1:1', '4:5'] },
    trackingMode: { enum: ['FOLLOW_SPATIAL_EVIDENCE'] },
    preserveAuthoredLayout: { enum: [true] },
  });
}

function reframeConstraintsSchema(): JsonRecord {
  return closed(['noStaticCenterCrop', 'preserveDuration'], {
    noStaticCenterCrop: { enum: [true] }, preserveDuration: { enum: [true] },
  });
}

function matchingConstraintsSchema(): JsonRecord {
  return closed(['noDissolve', 'noFlashyEffect', 'preserveContinuity'], {
    noDissolve: { enum: [true] }, noFlashyEffect: { enum: [true] },
    preserveContinuity: { enum: [true] },
  });
}

function proposed(targetOperatorId: string, args: JsonRecord): JsonRecord {
  return closed(['targetOperatorId', 'arguments'], {
    targetOperatorId: { const: targetOperatorId }, arguments: args,
  });
}
function mutationFields(extra: JsonRecord): JsonRecord {
  return {
    projectId: nonEmptyString(), expectedProjectRevision: nonEmptyString(),
    evidenceIds: evidenceIdsSchema(), ...extra,
  };
}
function normalizedBoundsSchema(): JsonRecord {
  return closed(['left', 'top', 'width', 'height'], {
    left: unitNumber(), top: unitNumber(), width: unitNumber(), height: unitNumber(),
  });
}
function frameRangeSchema(): JsonRecord {
  return closed(['startFrame', 'endFrame'], {
    startFrame: { type: 'integer', minimum: 0 },
    endFrame: { type: 'integer', minimum: 1 },
  });
}
function framePairSchema(): JsonRecord {
  return { type: 'array', items: { type: 'integer', minimum: 0 }, minItems: 2, maxItems: 2 };
}
function evidenceIdsSchema(): JsonRecord {
  return { type: 'array', items: nonEmptyString(), minItems: 1, uniqueItems: true };
}
function nonEmptyString(): JsonRecord { return { type: 'string', minLength: 1 }; }
function unitNumber(): JsonRecord { return { type: 'number', minimum: 0, maximum: 1 }; }
function closed(required: readonly string[], properties: JsonRecord): JsonRecord {
  return { type: 'object', required: [...required], properties, additionalProperties: false };
}
function observationValue(observations: readonly Readonly<JsonRecord>[], kind: string): JsonRecord {
  return record(observations.find((entry) => entry.kind === kind)?.value);
}
function requireFirstRange(value: unknown): JsonRecord {
  const found = findPair(value);
  if (!found) fail('SEALED_V3_VISUAL_RANGE_EVIDENCE_UNVERIFIABLE');
  return { startFrame: found[0], endFrame: found[1] };
}
function findPair(value: unknown): [number, number] | null {
  const pair = integerPair(value); if (pair) return pair;
  for (const child of Array.isArray(value) ? value : isRecord(value) ? Object.values(value) : []) {
    const found = findPair(child); if (found) return found;
  }
  return null;
}
function integerPair(value: unknown): [number, number] | null {
  return Array.isArray(value) && value.length === 2
    && value.every(Number.isSafeInteger) && value[1] > value[0]
    ? [Number(value[0]), Number(value[1])] : null;
}
function safeInteger(value: unknown): number {
  return Number.isSafeInteger(value) ? Number(value) : -1;
}
function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}
function record(value: unknown): JsonRecord { return isRecord(value) ? value : {}; }
function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function fail(code: string): never { throw new Error(code); }
