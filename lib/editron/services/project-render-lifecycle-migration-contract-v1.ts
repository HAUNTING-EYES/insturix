import { z } from "zod";

export const ProjectRenderLifecycleMigrationDispositionSchemaV1 = z.enum([
  "MIGRATED_ACTIVE",
  "BLOCKED_UNBOUND_LEGACY",
  "BLOCKED_CONTRACT_INVALID",
  "BLOCKED_PROJECT_REVISION_STALE",
]);

export type ProjectRenderLifecycleMigrationDispositionV1 = z.infer<
  typeof ProjectRenderLifecycleMigrationDispositionSchemaV1
>;

export const ProjectRenderLifecycleMigrationAssessmentSchemaV1 = z.object({
  schemaVersion: z.literal(1),
  disposition: ProjectRenderLifecycleMigrationDispositionSchemaV1,
  assessedAt: z.date(),
  assessmentHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export type ProjectRenderLifecycleMigrationAssessmentV1 = z.infer<
  typeof ProjectRenderLifecycleMigrationAssessmentSchemaV1
>;
