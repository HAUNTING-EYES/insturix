import { z } from 'zod';

const nonEmptyString = z.string().trim().min(1);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const stableOperatorId = z.string().regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/);
const semanticVersion = z.string().regex(/^\d+\.\d+\.\d+$/);

export const CAP2_PROJECT_CLASSES_V1 = [
  'SHORT_FORM',
  'AGENCY',
  'LONG_FORM',
  'FILM_POST',
] as const;

export const CAP2_PROOF_DISPOSITIONS_V1 = [
  'PASS',
  'FAIL',
  'UNVERIFIABLE',
] as const;

const codeRefSchema = z.object({
  path: nonEmptyString,
  symbol: nonEmptyString,
  role: z.enum([
    'ENTRYPOINT',
    'DECISION_OWNER',
    'FORM_OWNER',
    'MUTATION_OWNER',
    'PERSISTENCE_OWNER',
    'VALIDATOR',
    'PROOF_OWNER',
    'CONSUMER',
    'EVIDENCE',
  ]),
}).strict();

const closedObjectSchema = z.object({
  type: z.literal('object'),
  additionalProperties: z.literal(false),
  properties: z.record(z.string(), z.record(z.string(), z.unknown())),
  required: z.array(z.string()),
}).strict().superRefine((schema, context) => {
  const propertyNames = new Set(Object.keys(schema.properties));
  const requiredNames = new Set(schema.required);
  if (requiredNames.size !== schema.required.length) {
    context.addIssue({ code: 'custom', message: 'required fields must be unique' });
  }
  for (const requiredName of requiredNames) {
    if (!propertyNames.has(requiredName)) {
      context.addIssue({
        code: 'custom',
        message: `required field ${requiredName} is absent from properties`,
      });
    }
  }
});

const dataRefSchema = z.object({
  refType: z.enum([
    'PROJECT_PATH',
    'TIMELINE_RANGE',
    'SOURCE_RANGE',
    'COMPOSITION_RANGE',
    'AUDIO_RANGE',
    'EVIDENCE',
    'ARTIFACT',
    'POLICY',
    'PROOF',
  ]),
  selector: nonEmptyString,
  coordinateDomain: z.enum([
    'NONE',
    'PROJECT_TIMEBASE',
    'SOURCE_PTS',
    'SOURCE_FRAME',
    'COMPOSITION_LOCAL',
    'AUDIO_SAMPLE',
    'DELIVERY_PACKAGE',
  ]),
}).strict();

const projectClassCertificationSchema = z.object({
  projectClass: z.enum(CAP2_PROJECT_CLASSES_V1),
  status: z.enum(['CERTIFIED', 'UNCERTIFIED', 'NOT_APPLICABLE']),
  evidenceRefs: z.array(codeRefSchema),
}).strict().superRefine((entry, context) => {
  if (entry.status === 'CERTIFIED' && entry.evidenceRefs.length === 0) {
    context.addIssue({ code: 'custom', message: 'certification requires evidence' });
  }
});

const operationSchemaBase = z.object({
  operatorId: stableOperatorId,
  version: semanticVersion,
  family: nonEmptyString,
  kind: z.enum([
    'READ',
    'ANALYZE',
    'RESOLVE',
    'MUTATE',
    'GENERATE',
    'RENDER',
    'REVIEW',
    'DELIVER',
    'WORKFLOW',
    'MISSING',
  ]),
  aliases: z.object({
    usage: z.literal('RETRIEVAL_ONLY'),
    values: z.array(nonEmptyString),
  }).strict(),
  support: z.object({
    implementationStatus: z.enum([
      'LIVE',
      'PARTIAL',
      'RESEARCH_ONLY',
      'MISSING',
      'FORBIDDEN',
    ]),
    certificationStatus: z.enum(['CERTIFIED', 'UNCERTIFIED', 'NOT_APPLICABLE']),
    plannerEligibility: z.enum([
      'PRODUCTION_ELIGIBLE',
      'READ_ONLY',
      'ISOLATED_PROPOSAL_ONLY',
      'EXCLUDED',
    ]),
    reason: nonEmptyString,
    projectClasses: z.array(projectClassCertificationSchema),
  }).strict(),
  surfaces: z.object({
    manualUi: z.boolean(),
    chat: z.boolean(),
    director: z.boolean(),
    worker: z.boolean(),
    api: z.boolean(),
    entrypoints: z.array(codeRefSchema),
    parityStatus: z.enum([
      'SHARED_OWNER',
      'MANUAL_ONLY',
      'AGENT_ONLY',
      'SEMANTICALLY_DIVERGENT',
      'NOT_APPLICABLE',
    ]),
    parityReason: nonEmptyString,
  }).strict(),
  owners: z.object({
    ownerDisposition: z.enum(['VERIFIED', 'MISSING', 'DUPLICATED_UNRESOLVED']),
    decisionOwner: codeRefSchema.optional(),
    formOwner: codeRefSchema.optional(),
    mutationOwner: codeRefSchema.optional(),
    persistenceOwner: codeRefSchema.optional(),
    proofOwner: codeRefSchema.optional(),
    finalConsumers: z.array(codeRefSchema),
  }).strict(),
  contract: z.object({
    inputSchema: closedObjectSchema,
    outputSchema: closedObjectSchema,
    coordinateDomains: z.array(dataRefSchema.shape.coordinateDomain).min(1),
    resolverHandoff: z.object({
      disposition: z.enum(['NOT_REQUIRED', 'VERIFIED', 'MISSING', 'DIVERGENT']),
      owner: codeRefSchema.optional(),
      inputBinding: nonEmptyString,
      outputBinding: nonEmptyString,
    }).strict(),
  }).strict(),
  effects: z.object({
    reads: z.array(dataRefSchema),
    writes: z.array(dataRefSchema),
    requires: z.array(dataRefSchema),
    produces: z.array(dataRefSchema),
    invalidates: z.array(dataRefSchema),
    stateEffects: z.array(nonEmptyString),
  }).strict(),
  execution: z.object({
    mutationPath: z.array(codeRefSchema),
    revisionSemantics: z.enum([
      'NONE',
      'READ_PINNED',
      'PROJECT_CAS',
      'PROPOSAL_ONLY',
      'EXTERNAL_JOB',
    ]),
    concurrencySemantics: z.enum([
      'READ_ONLY',
      'SERIAL_PROJECT',
      'RANGE_DISJOINT',
      'JOB_IDEMPOTENT',
      'NOT_APPLICABLE',
    ]),
    idempotencySemantics: z.enum([
      'REQUIRED',
      'SUPPORTED',
      'UNAVAILABLE',
      'NOT_APPLICABLE',
    ]),
    failClosed: z.boolean(),
    failureDispositions: z.array(z.enum([
      'RETRY_SAME_COMMAND',
      'RETRY_AFTER_REFRESH',
      'ASK_USER',
      'CAPABILITY_GAP',
      'CONFLICT',
      'REJECTED',
      'UNVERIFIABLE',
      'NEVER_RETRY',
      'BUDGET_EXHAUSTED',
    ])).min(1),
  }).strict(),
  verification: z.object({
    deterministicValidators: z.array(codeRefSchema),
    proofObligations: z.array(z.object({
      kind: z.enum([
        'state',
        'reload',
        'render',
        'visual',
        'audio',
        'semantic',
        'undo',
        'replay',
        'delivery',
      ]),
      version: semanticVersion,
      requirement: nonEmptyString,
    }).strict()),
    proofDispositions: z.array(z.enum(CAP2_PROOF_DISPOSITIONS_V1)),
    scorecardThresholds: z.array(nonEmptyString),
  }).strict(),
  recovery: z.object({
    undo: z.enum(['SUPPORTED', 'UNSAFE', 'UNAVAILABLE', 'NOT_APPLICABLE']),
    redo: z.enum(['SUPPORTED', 'UNSAFE', 'UNAVAILABLE', 'NOT_APPLICABLE']),
    replay: z.enum(['SUPPORTED', 'UNSAFE', 'UNAVAILABLE', 'NOT_APPLICABLE']),
    reproducibilityBindings: z.array(nonEmptyString).min(1),
  }).strict(),
  policy: z.object({
    rights: nonEmptyString,
    privacy: nonEmptyString,
    egress: nonEmptyString,
    promptInjection: nonEmptyString,
    network: nonEmptyString,
  }).strict(),
  resources: z.object({
    latencyClass: z.enum(['INTERACTIVE', 'BACKGROUND', 'OFFLINE', 'NOT_APPLICABLE']),
    computeClass: z.enum(['CLIENT', 'SERVER_CPU', 'SERVER_GPU', 'RENDER_FARM', 'EXTERNAL', 'NOT_APPLICABLE']),
    limits: z.record(z.string(), z.union([z.string(), z.number()])),
  }).strict(),
  evidenceRefs: z.array(codeRefSchema).min(1),
}).strict();

export const cap2AtomicOperationSchemaV1 = operationSchemaBase.superRefine((operation, context) => {
  if (new Set(operation.aliases.values).size !== operation.aliases.values.length) {
    context.addIssue({ code: 'custom', path: ['aliases', 'values'], message: 'aliases must be unique' });
  }
  if (operation.aliases.values.includes(operation.operatorId)) {
    context.addIssue({ code: 'custom', path: ['aliases', 'values'], message: 'an alias cannot duplicate operatorId' });
  }

  const projectClasses = operation.support.projectClasses.map(({ projectClass }) => projectClass);
  if (new Set(projectClasses).size !== CAP2_PROJECT_CLASSES_V1.length
    || CAP2_PROJECT_CLASSES_V1.some((projectClass) => !projectClasses.includes(projectClass))) {
    context.addIssue({ code: 'custom', path: ['support', 'projectClasses'], message: 'all project classes must appear exactly once' });
  }

  const proofDispositions = new Set(operation.verification.proofDispositions);
  if (proofDispositions.size !== CAP2_PROOF_DISPOSITIONS_V1.length
    || CAP2_PROOF_DISPOSITIONS_V1.some((disposition) => !proofDispositions.has(disposition))) {
    context.addIssue({ code: 'custom', path: ['verification', 'proofDispositions'], message: 'PASS, FAIL and UNVERIFIABLE must appear exactly once' });
  }

  const isMissing = operation.support.implementationStatus === 'MISSING';
  const isMutation = ['MUTATE', 'GENERATE', 'DELIVER'].includes(operation.kind);
  if (isMissing) {
    if (operation.support.plannerEligibility !== 'EXCLUDED' || operation.owners.ownerDisposition !== 'MISSING') {
      context.addIssue({ code: 'custom', message: 'missing operations must have missing ownership and be excluded' });
    }
    if (operation.execution.mutationPath.length > 0) {
      context.addIssue({ code: 'custom', path: ['execution', 'mutationPath'], message: 'missing operations cannot declare an executable mutation path' });
    }
  } else if (operation.owners.ownerDisposition === 'MISSING' || !operation.owners.decisionOwner) {
    context.addIssue({ code: 'custom', path: ['owners'], message: 'implemented operations require a decision owner' });
  }

  if (operation.owners.ownerDisposition === 'DUPLICATED_UNRESOLVED'
    && operation.support.plannerEligibility !== 'EXCLUDED') {
    context.addIssue({ code: 'custom', path: ['support', 'plannerEligibility'], message: 'unresolved duplicate owners must be excluded' });
  }

  if (operation.support.plannerEligibility === 'PRODUCTION_ELIGIBLE'
    && (operation.support.implementationStatus !== 'LIVE'
      || operation.support.certificationStatus !== 'CERTIFIED'
      || operation.owners.ownerDisposition !== 'VERIFIED'
      || operation.surfaces.parityStatus === 'SEMANTICALLY_DIVERGENT')) {
    context.addIssue({ code: 'custom', path: ['support'], message: 'production eligibility requires live, certified, single-owner, non-divergent execution' });
  }

  if (isMutation && !isMissing) {
    if (!operation.owners.mutationOwner || !operation.owners.persistenceOwner
      || operation.execution.mutationPath.length === 0 || operation.effects.writes.length === 0
      || operation.execution.revisionSemantics === 'NONE') {
      context.addIssue({ code: 'custom', message: 'mutating operations require mutation/persistence owners, writes, a mutation path and revision semantics' });
    }
  }
});

const sourceCountSchema = z.object({
  sourceId: nonEmptyString,
  observedCount: z.number().int().nonnegative(),
  evidenceRefs: z.array(codeRefSchema).min(1),
}).strict();

export const cap2CatalogSchemaV1 = z.object({
  artifactType: z.literal('EditronAtomicCapabilityCatalogV1'),
  schemaVersion: z.literal(1),
  authority: z.literal('RESEARCH_CENSUS_NO_RUNTIME_MUTATION'),
  catalogStatus: z.enum(['DRAFT_INCOMPLETE', 'FROZEN_CURRENT_TRUTH']),
  sourceBinding: z.object({
    branch: nonEmptyString,
    commit: z.string().regex(/^[a-f0-9]{40}$/),
    sourceSnapshotHash: sha256,
    generatedAt: z.string().datetime({ offset: true }),
  }).strict(),
  declaredOperationCount: z.number().int().nonnegative(),
  sourceCounts: z.array(sourceCountSchema).min(1),
  unresolvedSourceIds: z.array(nonEmptyString),
  operations: z.array(cap2AtomicOperationSchemaV1),
}).strict().superRefine((catalog, context) => {
  const operationKeys = catalog.operations.map(({ operatorId, version }) => `${operatorId}@${version}`);
  if (new Set(operationKeys).size !== operationKeys.length) {
    context.addIssue({ code: 'custom', path: ['operations'], message: 'operatorId and version pairs must be unique' });
  }
  const sourceIds = catalog.sourceCounts.map(({ sourceId }) => sourceId);
  if (new Set(sourceIds).size !== sourceIds.length) {
    context.addIssue({ code: 'custom', path: ['sourceCounts'], message: 'source IDs must be unique' });
  }
  if (catalog.declaredOperationCount !== catalog.operations.length) {
    context.addIssue({ code: 'custom', path: ['declaredOperationCount'], message: 'declared operation count does not match rows' });
  }
  if (catalog.catalogStatus === 'FROZEN_CURRENT_TRUTH' && catalog.unresolvedSourceIds.length > 0) {
    context.addIssue({ code: 'custom', path: ['unresolvedSourceIds'], message: 'a frozen catalog cannot retain unresolved source surfaces' });
  }
});

export type Cap2AtomicOperationV1 = z.infer<typeof cap2AtomicOperationSchemaV1>;
export type Cap2CatalogV1 = z.infer<typeof cap2CatalogSchemaV1>;

export function parseCap2AtomicOperationV1(value: unknown): Cap2AtomicOperationV1 {
  return cap2AtomicOperationSchemaV1.parse(value);
}

export function parseCap2CatalogV1(value: unknown): Cap2CatalogV1 {
  return cap2CatalogSchemaV1.parse(value);
}
