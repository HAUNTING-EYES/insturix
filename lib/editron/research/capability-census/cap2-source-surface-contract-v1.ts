import { z } from 'zod';

const nonEmptyString = z.string().trim().min(1);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const sourceId = z.string().regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/);

export const CAP2_SOURCE_CATEGORIES_V1 = [
  'MANUAL_UI',
  'SHORTCUT',
  'STATE_TYPE',
  'RENDER_CONSUMER',
  'CHAT_DESCRIPTOR',
  'CHAT_EXECUTION_BUNDLE',
  'DIRECTOR_JOB',
  'API_ROUTE',
  'PERSISTENCE_SERVICE',
  'WORKER_JOB',
  'PROOF_RENDER_DELIVERY',
] as const;

export const CAP2_SOURCE_EXTRACTION_KINDS_V1 = [
  'TS_INTERFACE_FUNCTION_MEMBERS',
  'TS_CALL_STRING_ARGUMENTS',
  'TS_ENUM_STRING_VALUES',
  'TS_SWITCH_ENUM_CASES',
  'TS_OBJECT_KEYS',
  'TS_TOOL_RETURN_BUNDLE',
  'ROUTE_EXPORT_SCAN',
  'SYMBOL_TEXT_CALLERS',
  'TS_PUBLIC_CLASS_METHODS',
  'PATH_BASENAME_SCAN',
] as const;

function isSortedUnique(values: readonly string[]): boolean {
  return values.length === new Set(values).size
    && values.every((value, index) => index === 0 || values[index - 1] < value);
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

const extractionSchema = z.object({
  kind: z.enum(CAP2_SOURCE_EXTRACTION_KINDS_V1),
  symbol: nonEmptyString.optional(),
  pattern: nonEmptyString.optional(),
  roots: z.array(nonEmptyString).min(1),
}).strict();

export const cap2SourceSurfaceObservationSchemaV1 = z.object({
  sourceId,
  category: z.enum(CAP2_SOURCE_CATEGORIES_V1),
  authorityClaim: z.literal('NO_AUTHORITY_CLAIM'),
  extraction: extractionSchema,
  observedCount: z.number().int().nonnegative(),
  observedIds: z.array(nonEmptyString),
  evidencePaths: z.array(nonEmptyString).min(1),
  countingSemantics: nonEmptyString,
  notes: nonEmptyString,
}).strict().superRefine((observation, context) => {
  if (observation.observedCount !== observation.observedIds.length) {
    context.addIssue({
      code: 'custom',
      path: ['observedCount'],
      message: 'observedCount must equal observedIds.length',
    });
  }
  if (!isSortedUnique(observation.observedIds)) {
    context.addIssue({
      code: 'custom',
      path: ['observedIds'],
      message: 'observedIds must be sorted and unique',
    });
  }
  if (!isSortedUnique(observation.evidencePaths)) {
    context.addIssue({
      code: 'custom',
      path: ['evidencePaths'],
      message: 'evidencePaths must be sorted and unique',
    });
  }
});

export const cap2SourceSurfaceInventorySchemaV1 = z.object({
  artifactType: z.literal('EditronCapabilitySourceSurfaceInventoryV1'),
  schemaVersion: z.literal(1),
  authority: z.literal('RESEARCH_CENSUS_NO_RUNTIME_MUTATION'),
  status: z.literal('DRAFT_AWAITING_OWNER_RECONCILIATION'),
  catalogRelationship: z.literal('SOURCE_OBSERVATIONS_NOT_ATOMIC_OPERATIONS'),
  sourceBinding: z.object({
    worktree: nonEmptyString,
    branch: nonEmptyString,
    commit: z.string().regex(/^[a-f0-9]{40}$/),
    workingTreeDirty: z.boolean(),
    generatedAt: z.string().datetime({ offset: true }),
    snapshotAlgorithm: z.literal('sha256(sorted(path + NUL + sha256(rawFileBytes)).join(LF))'),
    sourceSnapshotHash: sha256,
    sourceSnapshotPaths: z.array(nonEmptyString).min(1),
  }).strict(),
  observationCount: z.number().int().positive(),
  observations: z.array(cap2SourceSurfaceObservationSchemaV1).min(1),
  unresolvedSourceIds: z.array(sourceId).min(1),
  countingWarning: z.literal('COUNTS_OVERLAP_AND_MUST_NOT_BE_SUMMED_AS_CAPABILITIES'),
}).strict().superRefine((inventory, context) => {
  const observedSourceIds = inventory.observations.map((observation) => observation.sourceId);
  if (inventory.observationCount !== inventory.observations.length) {
    context.addIssue({
      code: 'custom',
      path: ['observationCount'],
      message: 'observationCount must equal observations.length',
    });
  }
  if (!isSortedUnique(observedSourceIds)) {
    context.addIssue({
      code: 'custom',
      path: ['observations'],
      message: 'observations must be sorted by unique sourceId',
    });
  }

  const expectedSnapshotPaths = [...new Set(
    inventory.observations.flatMap((observation) => observation.evidencePaths),
  )].sort(compareCodeUnits);
  if (JSON.stringify(inventory.sourceBinding.sourceSnapshotPaths) !== JSON.stringify(expectedSnapshotPaths)) {
    context.addIssue({
      code: 'custom',
      path: ['sourceBinding', 'sourceSnapshotPaths'],
      message: 'sourceSnapshotPaths must equal the sorted union of observation evidencePaths',
    });
  }

  const expectedUnresolved = [...observedSourceIds].sort(compareCodeUnits);
  if (JSON.stringify(inventory.unresolvedSourceIds) !== JSON.stringify(expectedUnresolved)) {
    context.addIssue({
      code: 'custom',
      path: ['unresolvedSourceIds'],
      message: 'Phase 2 source observations must all remain unresolved for owner reconciliation',
    });
  }
});

export type Cap2SourceSurfaceObservationV1 = z.infer<typeof cap2SourceSurfaceObservationSchemaV1>;
export type Cap2SourceSurfaceInventoryV1 = z.infer<typeof cap2SourceSurfaceInventorySchemaV1>;

export function parseCap2SourceSurfaceInventoryV1(value: unknown): Cap2SourceSurfaceInventoryV1 {
  return cap2SourceSurfaceInventorySchemaV1.parse(value);
}
