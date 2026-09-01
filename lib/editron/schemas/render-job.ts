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
import { ProjectRenderSourceCleanupOutboxIdSchemaV1 } from '@/lib/editron/services/project-render-source-cleanup-v1';

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

const RenderJobWalletUserIdSchema = RenderJobRequesterUserIdSchema;

/**
 * Server-owned billing target stamped on a strict render admission. The
 * requester and the wallet that pays can differ on shared projects.
 */
export const RenderJobBillingWalletSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('user'),
    clerkUserId: RenderJobWalletUserIdSchema,
  }).strict(),
  z.object({
    type: z.literal('org'),
    clerkOrgId: RenderJobWalletUserIdSchema,
    actorUserId: RenderJobWalletUserIdSchema,
  }).strict(),
]);

export type RenderJobBillingWalletV1 = z.infer<typeof RenderJobBillingWalletSchema>;

export const RenderJobDispatchPhaseSchema = z.enum([
  'NOT_ATTEMPTED',
  'ATTEMPTING',
  'UNKNOWN',
  'BOUND',
]);

export type RenderJobDispatchPhaseV1 = z.infer<typeof RenderJobDispatchPhaseSchema>;

export const RenderJobBillingStateSchema = z.enum([
  'PENDING',
  'RECORDED',
  'UNKNOWN',
]);

export type RenderJobBillingStateV1 = z.infer<typeof RenderJobBillingStateSchema>;

/**
 * Durable reserve → billing → provider dispatch ledger. It is optional only
 * for legacy and pre-ledger project-snapshot rows. UNKNOWN is deliberately
 * not retryable or refundable by automatic code because the provider may have
 * accepted the request.
 */
export const RenderJobDispatchSchema = z.object({
  version: z.literal(1),
  phase: RenderJobDispatchPhaseSchema,
  billingState: RenderJobBillingStateSchema,
  attemptToken: z.string().min(1).max(200),
  creditIdempotencyKey: z.string().min(1).max(200),
  billingWallet: RenderJobBillingWalletSchema,
  creditTransactionId: z.string().min(1).max(200).optional(),
  billingUnknownAt: z.date().optional(),
  attemptStartedAt: z.date().optional(),
  providerBoundAt: z.date().optional(),
  providerRenderId: z.string().min(1).max(500).optional(),
  providerBucketName: z.string().min(1).max(500).optional(),
  providerRegion: z.string().min(1).max(100).optional(),
  unknownReason: z.string().min(1).max(1_000).optional(),
}).strict().superRefine((dispatch, context) => {
  const hasProviderId = dispatch.providerRenderId !== undefined;
  const hasBucket = dispatch.providerBucketName !== undefined;
  const hasRegion = dispatch.providerRegion !== undefined;
  if (hasProviderId !== hasBucket || hasProviderId !== hasRegion) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['providerRenderId'],
      message: 'Provider identity must include render ID, bucket and region together.',
      params: { code: 'RENDER_DISPATCH_PROVIDER_IDENTITY_INCOMPLETE' },
    });
  }
  if (dispatch.phase === 'NOT_ATTEMPTED' && dispatch.attemptStartedAt !== undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['attemptStartedAt'],
      message: 'A not-attempted dispatch cannot have an attempt timestamp.',
      params: { code: 'RENDER_DISPATCH_NOT_ATTEMPTED_HAS_START' },
    });
  }
  if (dispatch.phase === 'NOT_ATTEMPTED' && (
    hasProviderId
    || dispatch.providerBoundAt !== undefined
  )) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['phase'],
      message: 'A not-attempted dispatch cannot carry provider-binding evidence.',
      params: { code: 'RENDER_DISPATCH_NOT_ATTEMPTED_HAS_PROVIDER' },
    });
  }
  if (dispatch.billingState === 'PENDING' && dispatch.creditTransactionId !== undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['creditTransactionId'],
      message: 'A pending billing state cannot carry a credit transaction receipt.',
      params: { code: 'RENDER_DISPATCH_PENDING_BILLING_HAS_RECEIPT' },
    });
  }
  if (dispatch.billingState === 'RECORDED' && dispatch.creditTransactionId === undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['creditTransactionId'],
      message: 'A recorded billing state must carry a credit transaction receipt.',
      params: { code: 'RENDER_DISPATCH_RECORDED_BILLING_RECEIPT_REQUIRED' },
    });
  }
  if (dispatch.billingState === 'UNKNOWN' && (
    dispatch.phase !== 'NOT_ATTEMPTED'
    || dispatch.billingUnknownAt === undefined
    || dispatch.unknownReason === undefined
  )) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['billingState'],
      message: 'Unknown billing must remain pre-dispatch and explain when recovery became required.',
      params: { code: 'RENDER_DISPATCH_UNKNOWN_BILLING_STATE_INVALID' },
    });
  }
  if (dispatch.phase !== 'NOT_ATTEMPTED' && dispatch.billingState !== 'RECORDED') {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['billingState'],
      message: 'Provider dispatch requires a recorded billing receipt.',
      params: { code: 'RENDER_DISPATCH_BILLING_NOT_RECORDED' },
    });
  }
  if (dispatch.phase !== 'NOT_ATTEMPTED' && dispatch.creditTransactionId === undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['creditTransactionId'],
      message: 'Provider dispatch requires a durable credit transaction receipt.',
      params: { code: 'RENDER_DISPATCH_BILLING_RECEIPT_REQUIRED' },
    });
  }
  if (dispatch.phase === 'ATTEMPTING' && dispatch.attemptStartedAt === undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['attemptStartedAt'],
      message: 'An attempting dispatch must carry an attempt timestamp.',
      params: { code: 'RENDER_DISPATCH_ATTEMPT_START_REQUIRED' },
    });
  }
  if (dispatch.phase === 'UNKNOWN' && dispatch.attemptStartedAt === undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['attemptStartedAt'],
      message: 'An unknown dispatch must carry the time its attempt began.',
      params: { code: 'RENDER_DISPATCH_UNKNOWN_START_REQUIRED' },
    });
  }
  if (dispatch.phase === 'BOUND' && (
    !dispatch.attemptStartedAt
    || !dispatch.providerBoundAt
    || !hasProviderId
  )) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['phase'],
      message: 'A bound dispatch must carry attempt, provider-binding and provider identity proof.',
      params: { code: 'RENDER_DISPATCH_BOUND_PROOF_INCOMPLETE' },
    });
  }
  if (dispatch.phase === 'UNKNOWN' && !dispatch.unknownReason) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['unknownReason'],
      message: 'An unknown dispatch must explain why recovery is required.',
      params: { code: 'RENDER_DISPATCH_UNKNOWN_REASON_REQUIRED' },
    });
  }
});

export type RenderJobDispatchV1 = z.infer<typeof RenderJobDispatchSchema>;

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
  projectRenderSourceCleanupOutboxId: ProjectRenderSourceCleanupOutboxIdSchemaV1.optional(),
  artifactInvalidation: ProjectArtifactInvalidationLinkSchema.optional(),
  artifactInvalidatedAt: z.date().optional(),
  /** Durable reserve → billing → provider dispatch ledger; absent on legacy and pre-ledger PROJECT_SNAPSHOT rows. */
  dispatch: RenderJobDispatchSchema.optional(),
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
  if (
    job.projectRenderSourceCleanupOutboxId !== undefined
    && (
      job.projectRenderSnapshotBinding === undefined
      || job.artifactBinding !== undefined
      || job.artifactState !== 'STALE'
      || job.artifactCleanup === undefined
      || job.artifactCleanup.state === 'NOT_REQUIRED'
    )
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['projectRenderSourceCleanupOutboxId'],
      message: 'A render source cleanup handoff requires one stale project-snapshot render.',
      params: { code: 'RENDER_SOURCE_CLEANUP_SCOPE_INVALID' },
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
  dispatch?: RenderJobDispatchV1,
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
  const validatedDispatch = dispatch === undefined
    ? undefined
    : RenderJobDispatchSchema.parse(structuredClone(dispatch));
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
    ...(validatedDispatch ? { dispatch: structuredClone(validatedDispatch) } : {}),
  };
}
