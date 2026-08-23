import { z } from 'zod';
import {
  canonicalizeEditronJsonV1,
  cloneCanonicalEditronJsonV1,
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import {
  EditorialPlanArtifactRefSchemaV1,
  type EditorialPlanArtifactRefV1,
} from './editorial-plan-v1';

export const EDITORIAL_PLAN_EXECUTION_DEFINITION_VERSION_V1 =
  'EDITRON_PLAN_EXECUTION_DEFINITION_V1_1' as const;
export const EDITORIAL_PLAN_EXECUTION_DEFINITION_COLLECTION_V1 =
  'editron_editorial_plan_execution_definitions' as const;
const MAX_ENVELOPE_BYTES = 256 * 1024;
const ID = z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/);
const SHA256 = z.string().regex(/^[a-f0-9]{64}$/);
const ActorSchema = z.object({
  actorId: ID,
  actorKind: z.enum(['USER', 'MODEL', 'SYSTEM']),
}).strict();
const PayloadSchema = z.record(z.string(), z.unknown()).superRefine((payload, context) => {
  try {
    if (Buffer.byteLength(canonicalizeEditronJsonV1(payload), 'utf8') > MAX_ENVELOPE_BYTES) {
      context.addIssue({ code: 'custom', message: 'PLAN_DEFINITION_ENVELOPE_TOO_LARGE' });
    }
  } catch {
    context.addIssue({ code: 'custom', message: 'PLAN_DEFINITION_ENVELOPE_NOT_JSON' });
  }
});
const SourceBindingSchema = z.object({
  planId: ID,
  planRevision: z.number().int().positive(),
  planRevisionSha256: SHA256,
  nodeId: ID,
  nodeVersion: z.number().int().positive(),
  nodeSha256: SHA256,
}).strict();
const unsignedShape = {
  version: z.literal(EDITORIAL_PLAN_EXECUTION_DEFINITION_VERSION_V1),
  tenantId: ID,
  userId: ID,
  projectId: ID,
  definitionId: ID,
  episodeId: ID,
  sourcePlanBinding: SourceBindingSchema,
  plannerEnvelopeSchemaRef: EditorialPlanArtifactRefSchemaV1,
  plannerEnvelope: PayloadSchema,
  eligibleOperationSetRef: EditorialPlanArtifactRefSchemaV1,
  privacyPolicyRef: EditorialPlanArtifactRefSchemaV1,
  proofPolicyRef: EditorialPlanArtifactRefSchemaV1,
  budgetReservationRefs: z.array(EditorialPlanArtifactRefSchemaV1).max(32),
  createdBy: ActorSchema,
  createdAt: z.string().datetime({ offset: true }),
};
const UnsignedSchema = z.object(unsignedShape).strict();
const SignedSchema = z.object({
  ...unsignedShape,
  plannerEnvelopeSha256: SHA256,
  definitionSha256: SHA256,
}).strict();

export type EditorialPlanExecutionDefinitionInputV1 = z.input<typeof UnsignedSchema>;
export type EditorialPlanExecutionDefinitionV1 = z.infer<typeof SignedSchema>;

export class EditorialPlanExecutionDefinitionErrorV1 extends Error {}

export function createEditorialPlanExecutionDefinitionV1(
  input: EditorialPlanExecutionDefinitionInputV1,
): Readonly<EditorialPlanExecutionDefinitionV1> {
  const unsigned = parse(UnsignedSchema, input);
  const material = {
    ...unsigned,
    plannerEnvelopeSha256: hashEditronCanonicalJsonV1(unsigned.plannerEnvelope),
  };
  return deepFreezeEditronJsonV1(cloneCanonicalEditronJsonV1({
    ...material,
    definitionSha256: hashEditronCanonicalJsonV1(material),
  })) as Readonly<EditorialPlanExecutionDefinitionV1>;
}

export function assertEditorialPlanExecutionDefinitionV1(
  value: unknown,
): Readonly<EditorialPlanExecutionDefinitionV1> {
  const definition = parse(SignedSchema, value);
  if (hashEditronCanonicalJsonV1(definition.plannerEnvelope)
    !== definition.plannerEnvelopeSha256) {
    throw new EditorialPlanExecutionDefinitionErrorV1('PLAN_DEFINITION_ENVELOPE_HASH_MISMATCH');
  }
  const { definitionSha256, ...material } = definition;
  if (hashEditronCanonicalJsonV1(material) !== definitionSha256) {
    throw new EditorialPlanExecutionDefinitionErrorV1('PLAN_DEFINITION_HASH_MISMATCH');
  }
  return deepFreezeEditronJsonV1(cloneCanonicalEditronJsonV1(definition));
}

export function executionDefinitionRefV1(
  definition: Readonly<EditorialPlanExecutionDefinitionV1>,
): EditorialPlanArtifactRefV1 {
  return {
    ownerId: 'PLAN_SERVICE',
    artifactId: definition.definitionId,
    artifactVersion: definition.version,
    artifactSha256: definition.definitionSha256,
  };
}

function parse<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new EditorialPlanExecutionDefinitionErrorV1(
      result.error.issues.map(({ message }) => message).join('|'),
    );
  }
  return result.data;
}
