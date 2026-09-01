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

export const RENDER_JOB_CHAPTER_ORCHESTRATION_CONTRACT_VERSION_V1 = 1 as const;
export const RENDER_JOB_CHAPTER_ORCHESTRATION_SCOPE_V1 = 'CHAPTER_ORCHESTRATION' as const;

export const RenderJobChapterOrchestrationStateSchema = z.enum([
  'NOT_STARTED',
  'STARTING',
  'RUNNING',
  'CONCATENATING',
  'READY_FOR_FINALIZATION',
  'FINALIZING',
  'COMPLETED',
  'FAILED',
  'STALE',
  'UNKNOWN',
]);
export type RenderJobChapterOrchestrationStateV1 = z.infer<
  typeof RenderJobChapterOrchestrationStateSchema
>;

const RenderJobChapterAggregateIdSchema = z.string()
  .regex(/^chr_[A-Za-z0-9_-]{12}$/);
const RenderJobChapterBindingHashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const RenderJobChapterRegionSchema = z.string()
  .regex(/^[a-z]{2}(?:-[a-z0-9]+)+-\d+$/);
const RenderJobChapterCountSchema = z.number().int().positive().max(100_000);
const RenderJobChapterProgressSchema = z.number().finite().min(0).max(1);
const RenderJobChapterManifestHashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const RenderJobChapterOutputSchema = z.object({
  url: z.string().url().refine(
    (value) => value.startsWith('https://'),
    'Chapter orchestration output must use HTTPS.',
  ),
  sizeBytes: z.number().int().positive().safe(),
}).strict();
const RenderJobChapterFailureSchema = z.object({
  code: z.string().min(1).max(200),
  message: z.string().min(1).max(10_000),
}).strict();

/**
 * Aggregate lifecycle identity for a long-form chapter render.
 *
 * This is deliberately not a provider dispatch record.  Child Remotion
 * identities live in their own child ledger; the parent admission keeps this
 * contract provider-free so a parent callback cannot be mistaken for a
 * provider acceptance.  The initial factory state is the only state allowed
 * to be inserted with the strict render admission.
 */
export const RenderJobChapterOrchestrationSchema = z.object({
  version: z.literal(RENDER_JOB_CHAPTER_ORCHESTRATION_CONTRACT_VERSION_V1),
  scope: z.literal(RENDER_JOB_CHAPTER_ORCHESTRATION_SCOPE_V1),
  aggregateJobId: RenderJobChapterAggregateIdSchema,
  bindingHash: RenderJobChapterBindingHashSchema,
  selectedRegion: RenderJobChapterRegionSchema,
  state: RenderJobChapterOrchestrationStateSchema,
  reservedAt: z.date(),
  startingAt: z.date().optional(),
  runningAt: z.date().optional(),
  concatenatingAt: z.date().optional(),
  readyForFinalizationAt: z.date().optional(),
  finalizingAt: z.date().optional(),
  completedAt: z.date().optional(),
  failedAt: z.date().optional(),
  staleAt: z.date().optional(),
  unknownAt: z.date().optional(),
  chapterCount: RenderJobChapterCountSchema.optional(),
  progress: RenderJobChapterProgressSchema.optional(),
  manifestHash: RenderJobChapterManifestHashSchema.optional(),
  output: RenderJobChapterOutputSchema.optional(),
  failure: RenderJobChapterFailureSchema.optional(),
}).strict().superRefine((orchestration, context) => {
  const successfulStateIndex: Partial<Record<RenderJobChapterOrchestrationStateV1, number>> = {
    NOT_STARTED: 0,
    STARTING: 1,
    RUNNING: 2,
    CONCATENATING: 3,
    READY_FOR_FINALIZATION: 4,
    FINALIZING: 5,
    COMPLETED: 6,
  };
  const healthyStates = new Set<RenderJobChapterOrchestrationStateV1>([
    'RUNNING',
    'CONCATENATING',
    'READY_FOR_FINALIZATION',
    'FINALIZING',
    'COMPLETED',
  ]);
  const terminalFailureStates = new Set<RenderJobChapterOrchestrationStateV1>([
    'FAILED',
    'STALE',
    'UNKNOWN',
  ]);
  const successfulTimestampFields: Array<[
    keyof typeof orchestration,
    Date | undefined,
    RenderJobChapterOrchestrationStateV1,
  ]> = [
    ['startingAt', orchestration.startingAt, 'STARTING'],
    ['runningAt', orchestration.runningAt, 'RUNNING'],
    ['concatenatingAt', orchestration.concatenatingAt, 'CONCATENATING'],
    ['readyForFinalizationAt', orchestration.readyForFinalizationAt, 'READY_FOR_FINALIZATION'],
    ['finalizingAt', orchestration.finalizingAt, 'FINALIZING'],
    ['completedAt', orchestration.completedAt, 'COMPLETED'],
  ];

  for (const [field, timestamp] of successfulTimestampFields) {
    if (timestamp && Number.isNaN(timestamp.getTime())) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field],
        message: 'Orchestration timestamps must be valid dates.',
        params: { code: 'CHAPTER_ORCHESTRATION_TIMESTAMP_INVALID' },
      });
    }
  }

  const successfulIndex = successfulStateIndex[orchestration.state];
  if (successfulIndex !== undefined) {
    for (const [field, timestamp, requiredState] of successfulTimestampFields) {
      const requiredIndex = successfulStateIndex[requiredState]!;
      if (successfulIndex >= requiredIndex && !timestamp) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: `${String(field)} is required once the orchestration reaches ${requiredState}.`,
          params: { code: 'CHAPTER_ORCHESTRATION_STATE_TIMESTAMP_REQUIRED' },
        });
      }
      if (successfulIndex < requiredIndex && timestamp) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: `${String(field)} cannot exist before the orchestration reaches ${requiredState}.`,
          params: { code: 'CHAPTER_ORCHESTRATION_STATE_TIMESTAMP_EARLY' },
        });
      }
    }
  }

  const failureTimestampFields: Array<[
    keyof typeof orchestration,
    Date | undefined,
    RenderJobChapterOrchestrationStateV1,
  ]> = [
    ['failedAt', orchestration.failedAt, 'FAILED'],
    ['staleAt', orchestration.staleAt, 'STALE'],
    ['unknownAt', orchestration.unknownAt, 'UNKNOWN'],
  ];
  const terminalFailureState = terminalFailureStates.has(orchestration.state);
  for (const [field, timestamp, timestampState] of failureTimestampFields) {
    if (timestamp && Number.isNaN(timestamp.getTime())) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field],
        message: 'Orchestration timestamps must be valid dates.',
        params: { code: 'CHAPTER_ORCHESTRATION_TIMESTAMP_INVALID' },
      });
    }
    if (terminalFailureState && orchestration.state === timestampState && !timestamp) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field],
        message: `${String(field)} is required for ${timestampState}.`,
        params: { code: 'CHAPTER_ORCHESTRATION_FAILURE_TIMESTAMP_REQUIRED' },
      });
    }
    if ((!terminalFailureState || orchestration.state !== timestampState) && timestamp) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field],
        message: `${String(field)} is not valid for orchestration state ${orchestration.state}.`,
        params: { code: 'CHAPTER_ORCHESTRATION_FAILURE_TIMESTAMP_INVALID' },
      });
    }
  }

  const healthyTimestampSequence = [
    ['reservedAt', orchestration.reservedAt],
    ['startingAt', orchestration.startingAt],
    ['runningAt', orchestration.runningAt],
    ['concatenatingAt', orchestration.concatenatingAt],
    ['readyForFinalizationAt', orchestration.readyForFinalizationAt],
    ['finalizingAt', orchestration.finalizingAt],
    ['completedAt', orchestration.completedAt],
  ] as const;
  for (let index = 1; index < healthyTimestampSequence.length; index += 1) {
    const [field, timestamp] = healthyTimestampSequence[index]!;
    const previous = healthyTimestampSequence[index - 1]![1];
    if (
      timestamp
      && previous
      && !Number.isNaN(timestamp.getTime())
      && !Number.isNaN(previous.getTime())
      && timestamp.getTime() < previous.getTime()
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field],
        message: 'Orchestration state timestamps must be monotonic.',
        params: { code: 'CHAPTER_ORCHESTRATION_TIMESTAMP_ORDER_INVALID' },
      });
    }
  }
  for (const [field, timestamp] of failureTimestampFields) {
    if (!timestamp || Number.isNaN(timestamp.getTime())) continue;
    const priorTimestamps = healthyTimestampSequence
      .map(([, value]) => value)
      .filter((value): value is Date => value !== undefined);
    const latestPrior = priorTimestamps.at(-1);
    if (latestPrior && !Number.isNaN(latestPrior.getTime()) && timestamp.getTime() < latestPrior.getTime()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field],
        message: 'Failure timestamps cannot precede the latest retained lifecycle timestamp.',
        params: { code: 'CHAPTER_ORCHESTRATION_FAILURE_TIMESTAMP_ORDER_INVALID' },
      });
    }
  }

  if (orchestration.state === 'NOT_STARTED') {
    for (const field of [
      'chapterCount',
      'progress',
      'manifestHash',
      'output',
      'failure',
    ] as const) {
      if (orchestration[field] !== undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: `${field} cannot exist before chapter orchestration starts.`,
          params: { code: 'CHAPTER_ORCHESTRATION_NOT_STARTED_HAS_PROGRESS' },
        });
      }
    }
  }

  if (orchestration.state === 'STARTING') {
    for (const field of [
      'chapterCount',
      'progress',
      'manifestHash',
      'output',
      'failure',
    ] as const) {
      if (orchestration[field] !== undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: `${field} requires the chapter manifest to be bound in RUNNING.`,
          params: { code: 'CHAPTER_ORCHESTRATION_STARTING_HAS_PROGRESS' },
        });
      }
    }
  }

  if (healthyStates.has(orchestration.state)) {
    if (orchestration.chapterCount === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['chapterCount'],
        message: `${orchestration.state} requires an exact chapter count.`,
        params: { code: 'CHAPTER_ORCHESTRATION_CHAPTER_COUNT_REQUIRED' },
      });
    }
    if (orchestration.progress === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['progress'],
        message: `${orchestration.state} requires bounded progress.`,
        params: { code: 'CHAPTER_ORCHESTRATION_PROGRESS_REQUIRED' },
      });
    }
    if (orchestration.manifestHash === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['manifestHash'],
        message: `${orchestration.state} requires an exact chapter manifest hash.`,
        params: { code: 'CHAPTER_ORCHESTRATION_MANIFEST_HASH_REQUIRED' },
      });
    }
    if (orchestration.failure !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['failure'],
        message: `${orchestration.state} cannot carry a failure record.`,
        params: { code: 'CHAPTER_ORCHESTRATION_HEALTHY_STATE_HAS_FAILURE' },
      });
    }
  }

  if (orchestration.state === 'READY_FOR_FINALIZATION'
    || orchestration.state === 'FINALIZING'
    || orchestration.state === 'COMPLETED') {
    if (orchestration.progress !== 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['progress'],
        message: `${orchestration.state} requires progress 1.`,
        params: { code: 'CHAPTER_ORCHESTRATION_FINAL_PROGRESS_REQUIRED' },
      });
    }
    if (orchestration.output === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['output'],
        message: `${orchestration.state} requires a materialized output.`,
        params: { code: 'CHAPTER_ORCHESTRATION_OUTPUT_REQUIRED' },
      });
    }
  }

  if (terminalFailureStates.has(orchestration.state)) {
    if (orchestration.failure === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['failure'],
        message: `${orchestration.state} requires a bounded failure record.`,
        params: { code: 'CHAPTER_ORCHESTRATION_FAILURE_REQUIRED' },
      });
    }
    if (orchestration.output !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['output'],
        message: `${orchestration.state} cannot claim a successful output.`,
        params: { code: 'CHAPTER_ORCHESTRATION_FAILURE_HAS_OUTPUT' },
      });
    }
    if ((orchestration.chapterCount === undefined) !== (orchestration.manifestHash === undefined)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['manifestHash'],
        message: 'Failure states must retain chapter count and manifest hash together when present.',
        params: { code: 'CHAPTER_ORCHESTRATION_FAILURE_MANIFEST_INCOMPLETE' },
      });
    }
  }

  if (orchestration.state === 'UNKNOWN' && orchestration.startingAt === undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['startingAt'],
      message: 'An unknown chapter orchestration must retain its durable start boundary.',
      params: { code: 'CHAPTER_ORCHESTRATION_UNKNOWN_START_REQUIRED' },
    });
  }

});

export type RenderJobChapterOrchestrationV1 = z.infer<
  typeof RenderJobChapterOrchestrationSchema
>;

export type RenderJobChapterOrchestrationFactoryInputV1 = {
  aggregateJobId: string;
  bindingHash: string;
  selectedRegion: string;
  reservedAt: Date;
};

/** Pure, provider-free constructor for the initial parent lifecycle record. */
export function createRenderJobChapterOrchestrationV1(
  input: RenderJobChapterOrchestrationFactoryInputV1,
): RenderJobChapterOrchestrationV1 {
  const orchestration = RenderJobChapterOrchestrationSchema.parse({
    version: RENDER_JOB_CHAPTER_ORCHESTRATION_CONTRACT_VERSION_V1,
    scope: RENDER_JOB_CHAPTER_ORCHESTRATION_SCOPE_V1,
    aggregateJobId: input.aggregateJobId.trim(),
    bindingHash: input.bindingHash.trim(),
    selectedRegion: input.selectedRegion.trim(),
    state: 'NOT_STARTED',
    reservedAt: new Date(input.reservedAt.getTime()),
  });
  return structuredClone(orchestration);
}

/** Clear assertion alias used by mutation owners and defensive readers. */
export function assertRenderJobChapterOrchestrationV1(
  input: unknown,
): asserts input is RenderJobChapterOrchestrationV1 {
  RenderJobChapterOrchestrationSchema.parse(input);
}

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
  /** Provider-free aggregate lifecycle; child provider ledgers remain separate. */
  chapterOrchestration: RenderJobChapterOrchestrationSchema.optional(),
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
  if (job.chapterOrchestration !== undefined) {
    if (
      job.projectRenderSnapshotBinding === undefined
      || job.artifactBinding !== undefined
      || job.chapterOrchestration.bindingHash
        !== job.projectRenderSnapshotBinding.bindingHash
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['chapterOrchestration', 'bindingHash'],
        message: 'A chapter orchestration parent requires its exact project snapshot binding.',
        params: { code: 'CHAPTER_ORCHESTRATION_BINDING_MISMATCH' },
      });
    }
    if (job.providerRenderId !== undefined || job.bucketName !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['chapterOrchestration'],
        message: 'A chapter orchestration parent cannot carry top-level provider identity.',
        params: { code: 'CHAPTER_ORCHESTRATION_PARENT_HAS_PROVIDER_IDENTITY' },
      });
    }
    if (
      job.dispatch === undefined
      || job.dispatch.phase !== 'NOT_ATTEMPTED'
      || job.dispatch.providerRenderId !== undefined
      || job.dispatch.providerBucketName !== undefined
      || job.dispatch.providerRegion !== undefined
      || job.dispatch.providerBoundAt !== undefined
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['chapterOrchestration'],
        message: 'A chapter orchestration parent cannot carry provider dispatch evidence.',
        params: { code: 'CHAPTER_ORCHESTRATION_PARENT_HAS_PROVIDER_DISPATCH' },
      });
    }
    if (job.chapterOrchestration.aggregateJobId !== job._id) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['chapterOrchestration', 'aggregateJobId'],
        message: 'Chapter orchestration aggregate ID must equal the render admission ID.',
        params: { code: 'CHAPTER_ORCHESTRATION_AGGREGATE_ID_MISMATCH' },
      });
    }
    if (job.chapterOrchestration.selectedRegion !== job.region) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['chapterOrchestration', 'selectedRegion'],
        message: 'Chapter orchestration region must equal the render admission region.',
        params: { code: 'CHAPTER_ORCHESTRATION_REGION_MISMATCH' },
      });
    }
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
  chapterOrchestration?: RenderJobChapterOrchestrationV1,
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
  const validatedChapterOrchestration = chapterOrchestration === undefined
    ? undefined
    : RenderJobChapterOrchestrationSchema.parse(structuredClone(chapterOrchestration));
  if (validatedArtifactBinding !== undefined && validatedProjectRenderSnapshotBinding !== undefined) {
    throw new Error('RENDER_JOB_BINDING_SCOPES_AMBIGUOUS');
  }
  if (
    validatedChapterOrchestration !== undefined
    && validatedChapterOrchestration.state !== 'NOT_STARTED'
  ) {
    throw new Error('CHAPTER_ORCHESTRATION_RESERVATION_STATE_INVALID');
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
    ...(validatedChapterOrchestration
      ? { chapterOrchestration: structuredClone(validatedChapterOrchestration) }
      : {}),
  };
}
