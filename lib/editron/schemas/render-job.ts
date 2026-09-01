import { z } from 'zod';

import {
  MAX_RENDER_FINALIZER_DURATION_MS,
  type RenderFinalizerProbeReceipt,
  type RenderFinalizerResult,
} from '@/lib/editron/services/render-finalizer-client';
import { RenderDeliveryManifestSchema } from '@/lib/editron/services/render-delivery-manifest';
import {
  ProjectArtifactBindingSchema,
  ProjectArtifactCleanupSchema,
  ProjectArtifactInvalidationLinkSchema,
  ProjectArtifactStateSchema,
  assertProjectArtifactBindingV1,
  type ProjectArtifactBindingV1,
} from '@/lib/editron/services/project-artifact-invalidation-v1';
import {
  ProjectRenderSnapshotBindingSchema,
  assertProjectRenderSnapshotBindingV1,
  type ProjectRenderSnapshotBindingV1,
} from '@/lib/editron/services/project-render-snapshot-binding-v1';

/**
 * Schema for Remotion Lambda render jobs stored in MongoDB
 * Collection: editron_render_jobs
 */

export const RenderExpectedDurationMsSchema = z.number()
  .int()
  .positive()
  .max(MAX_RENDER_FINALIZER_DURATION_MS);

export const RenderFinalizerProbeReceiptSchema: z.ZodType<RenderFinalizerProbeReceipt> = z.object({
  expectedDurationMs: RenderExpectedDurationMsSchema,
  formatDurationMs: z.number().nonnegative(),
  videoDurationMs: z.number().nonnegative(),
  audioDurationMs: z.number().nonnegative().nullable(),
  videoCodec: z.string().min(1),
  audioCodec: z.string().min(1).nullable(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  fps: z.number().positive().nullable(),
  sampleRate: z.number().int().positive().nullable(),
  channels: z.number().int().positive().nullable(),
  verificationToleranceMs: z.number().min(0).max(1),
});

export const RenderFinalizerResultSchema: z.ZodType<RenderFinalizerResult> = z.object({
  url: z.string().url().refine((value) => value.startsWith('https://'), 'Finalized URL must use HTTPS.'),
  sizeBytes: z.number().int().positive(),
  expectedDurationMs: RenderExpectedDurationMsSchema,
  receipt: RenderFinalizerProbeReceiptSchema,
}).superRefine((result, context) => {
  const receipt = result.receipt;
  if (receipt.expectedDurationMs !== result.expectedDurationMs) {
    context.addIssue({
      code: 'custom',
      path: ['receipt', 'expectedDurationMs'],
      message: 'Probe receipt belongs to a different duration contract.',
    });
  }
  const measuredDurations = [
    ['formatDurationMs', receipt.formatDurationMs],
    ['videoDurationMs', receipt.videoDurationMs],
    ...(receipt.audioDurationMs === null
      ? []
      : [['audioDurationMs', receipt.audioDurationMs] as const]),
  ] as const;
  for (const [field, measuredDurationMs] of measuredDurations) {
    if (Math.abs(measuredDurationMs - result.expectedDurationMs) > receipt.verificationToleranceMs) {
      context.addIssue({
        code: 'custom',
        path: ['receipt', field],
        message: `${field} exceeds the verified duration tolerance.`,
      });
    }
  }
});

/**
 * Authenticated actor recorded for strict project-snapshot render admissions.
 * It stays optional on the stored schema so legacy jobs can still be read.
 */
export const RenderJobRequesterUserIdSchema = z.string()
  .min(1)
  .max(200)
  .refine((value) => value.trim().length > 0, 'Requester user ID cannot be blank.')
  .refine(
    (value) => !/[\u0000-\u001F\u007F]/.test(value),
    'Requester user ID cannot contain control characters.',
  );

export const RenderJobFinalizationSchema = z.object({
  version: z.literal('editron-render-finalization-v1'),
  state: z.enum(['running', 'done', 'failed']),
  sourceOutputUrl: z.string().url(),
  sourceOutputSize: z.number().int().nonnegative(),
  attempts: z.number().int().nonnegative(),
  claimToken: z.string().min(1).optional(),
  claimedAt: z.date().optional(),
  leaseExpiresAt: z.date().optional(),
  outputUrl: z.string().url().optional(),
  outputSize: z.number().int().positive().optional(),
  receipt: RenderFinalizerProbeReceiptSchema.optional(),
  completedAt: z.date().optional(),
  error: z.string().min(1).optional(),
});

// Zod schema for validation
export const RenderJobSchema = z.object({
  _id: z.string(), // Editron-owned durable job ID (legacy rows use the Lambda render ID)
  userId: z.string(),
  /** Strict PROJECT_SNAPSHOT jobs require this; legacy rows may omit it. */
  requestedByUserId: RenderJobRequesterUserIdSchema.optional(),
  projectId: z.string(),
  providerRenderId: z.string().optional(),
  status: z.enum(['pending', 'queued', 'rendering', 'finalizing', 'done', 'error']),
  progress: z.number().min(0).max(1).default(0),
  expectedDurationMs: RenderExpectedDurationMsSchema.optional(),
  finalization: RenderJobFinalizationSchema.optional(),
  outputUrl: z.string().optional(),
  outputSize: z.number().optional(),
  deliveryManifest: RenderDeliveryManifestSchema.optional(),
  /** New jobs may opt into the exact current-artifact contract. */
  artifactBinding: ProjectArtifactBindingSchema.optional(),
  /** Whole-project render jobs may opt into the immutable project snapshot contract. */
  projectRenderSnapshotBinding: ProjectRenderSnapshotBindingSchema.optional(),
  artifactState: ProjectArtifactStateSchema.optional(),
  artifactCleanup: ProjectArtifactCleanupSchema.optional(),
  artifactInvalidation: ProjectArtifactInvalidationLinkSchema.optional(),
  artifactInvalidatedAt: z.date().optional(),
  startedAt: z.date(),
  completedAt: z.date().optional(),
  error: z.string().optional(),
  // For S3 cleanup tracking
  bucketName: z.string().optional(),
  region: z.string().default('us-east-1'),
  // TTL index field - MongoDB will auto-delete after this date
  expiresAt: z.date(),
}).superRefine((job, context) => {
  if (job.artifactBinding !== undefined && job.projectRenderSnapshotBinding !== undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['projectRenderSnapshotBinding'],
      message: 'A render job cannot carry both artifact binding scopes.',
      params: { code: 'RENDER_JOB_BINDING_SCOPES_AMBIGUOUS' },
    });
  }
});

export type RenderJob = z.infer<typeof RenderJobSchema>;

// Default expiration: 7 days after creation
export const DEFAULT_EXPIRATION_DAYS = 7;

export function createPendingRenderJob(
  jobId: string,
  userId: string,
  projectId: string,
  region: string,
  expectedDurationMs: number,
  artifactBinding?: ProjectArtifactBindingV1,
  projectRenderSnapshotBinding?: ProjectRenderSnapshotBindingV1,
  requestedByUserId?: string,
): RenderJob {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + DEFAULT_EXPIRATION_DAYS * 24 * 60 * 60 * 1000);
  const validatedDurationMs = RenderExpectedDurationMsSchema.parse(expectedDurationMs);
  const validatedArtifactBinding = artifactBinding === undefined
    ? undefined
    : (() => {
        assertProjectArtifactBindingV1(artifactBinding);
        return structuredClone(artifactBinding);
      })();
  const validatedProjectRenderSnapshotBinding = projectRenderSnapshotBinding === undefined
    ? undefined
    : (() => {
        assertProjectRenderSnapshotBindingV1(projectRenderSnapshotBinding);
        return structuredClone(projectRenderSnapshotBinding);
      })();
  const validatedRequestedByUserId = requestedByUserId === undefined
    ? undefined
    : RenderJobRequesterUserIdSchema.parse(requestedByUserId.trim());
  if (validatedArtifactBinding !== undefined && validatedProjectRenderSnapshotBinding !== undefined) {
    throw new Error('RENDER_JOB_BINDING_SCOPES_AMBIGUOUS');
  }

  return {
    _id: jobId,
    userId,
    projectId,
    ...(validatedRequestedByUserId
      ? { requestedByUserId: validatedRequestedByUserId }
      : {}),
    status: 'pending',
    progress: 0,
    expectedDurationMs: validatedDurationMs,
    startedAt: now,
    region,
    expiresAt,
    ...(validatedArtifactBinding
      ? {
          artifactBinding: structuredClone(validatedArtifactBinding),
          artifactState: 'ACTIVE' as const,
        }
      : validatedProjectRenderSnapshotBinding
        ? {
            projectRenderSnapshotBinding: structuredClone(validatedProjectRenderSnapshotBinding),
            artifactState: 'ACTIVE' as const,
          }
        : {}),
  };
}
