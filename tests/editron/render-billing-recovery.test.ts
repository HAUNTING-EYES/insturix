import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Collection } from 'mongodb';

const mocks = vi.hoisted(() => ({
  connectToDatabase: vi.fn(async () => undefined),
  userFindOne: vi.fn(),
  organizationFindOne: vi.fn(),
  projectGetRevision: vi.fn(),
  getDatabase: vi.fn(),
}));

vi.mock('@/schemas/ConnectToDatabase', () => ({
  default: mocks.connectToDatabase,
}));
vi.mock('@/schemas/user', () => ({
  User: { findOne: mocks.userFindOne },
}));
vi.mock('@/schemas/Organization', () => ({
  Organization: { findOne: mocks.organizationFindOne },
}));
vi.mock('@/schemas/OrgCreditTransaction', () => ({
  OrgCreditTransaction: { create: vi.fn() },
}));
vi.mock('@/lib/editron/db/mongodb', () => ({
  getDatabase: mocks.getDatabase,
}));
vi.mock('@/lib/editron/services/project-service', () => ({
  projectService: { getProjectRevision: mocks.projectGetRevision },
}));

import {
  findUsageTransactionForWallet,
  type EditronRenderUsageLookupResultV1,
} from '@/lib/services/creditsService';
import {
  buildContainedVideoTargetsV1,
  buildProjectRenderSourceSnapshotV1,
  createProjectRenderSnapshotBindingV1,
  type ProjectRenderSnapshotBindingV1,
} from '@/lib/editron/services/project-render-snapshot-binding-v1';
import {
  createPendingRenderJob,
  RenderJobSchema,
  type RenderJob,
} from '@/lib/editron/schemas/render-job';
import {
  createProjectRenderDispatchIdentityV1,
  createProjectRenderJobAuthorizationV1,
  reconcileProjectRenderJobBillingV1,
} from '@/lib/editron/services/render-job-service';
import {
  sweepProjectRenderBillingRecoveryV1,
} from '@/lib/editron/services/render-billing-recovery-v1';
import {
  handleProjectRenderBillingRecoveryCronV1,
} from '@/app/api/cron/recover-editron-render-billing/route';

const OWNER_ID = 'billing-recovery-owner';
const REQUESTER_ID = 'billing-recovery-requester';
const PROJECT_ID = 'billing-recovery-project';
const JOB_ID = 'rnd_billing_recovery_1';
const REVISION = {
  schemaVersion: 1 as const,
  value: 7,
  compatibilityUpdatedAt: '2026-08-31T00:00:00.000Z',
};
const TRANSACTION_ID = 'txn-billing-recovery-1';
const CREDIT_KEY = createProjectRenderDispatchIdentityV1({
  jobId: JOB_ID,
  bindingHash: makeBinding().bindingHash,
}).creditIdempotencyKey;

function queryResult(value: unknown) {
  const query = {
    select: vi.fn(),
    lean: vi.fn(async () => value),
  };
  query.select.mockReturnValue(query);
  return query;
}

function usageTransaction(overrides: Record<string, unknown> = {}) {
  return {
    id: TRANSACTION_ID,
    type: 'usage' as const,
    amount: -12,
    service: 'editron',
    action: 'render_export',
    taskId: JOB_ID,
    timestamp: new Date('2026-08-31T00:03:00.000Z'),
    balanceAfter: 88,
    metadata: {
      idempotencyKey: CREDIT_KEY,
      taskId: JOB_ID,
    },
    ...overrides,
  };
}

function makeBinding(): ProjectRenderSnapshotBindingV1 {
  const project = {
    overlays: [],
    durationInFrames: 90,
    fps: 30,
    playerDimensions: { width: 1920, height: 1080 },
  };
  const source = buildProjectRenderSourceSnapshotV1({
    project,
    inputProps: { renderMode: 'preview' },
  });
  return createProjectRenderSnapshotBindingV1({
    artifactKind: 'RENDERED_PREVIEW',
    artifactId: JOB_ID,
    ownerId: OWNER_ID,
    projectId: PROJECT_ID,
    projectRevision: REVISION,
    sequenceId: 'main',
    compositionId: 'TestComponent',
    renderContract: {
      renderer: 'remotion-lambda',
      codec: 'h264',
      audioCodec: 'aac',
      framesPerLambda: 20,
    },
    durationInFrames: 90,
    fps: 30,
    width: 1920,
    height: 1080,
    projectRenderSource: source,
    containedVideoTargets: buildContainedVideoTargetsV1(project.overlays),
  });
}

function makeJob(overrides: Record<string, unknown> = {}): RenderJob {
  const binding = makeBinding();
  const identity = createProjectRenderDispatchIdentityV1({
    jobId: JOB_ID,
    bindingHash: binding.bindingHash,
  });
  return RenderJobSchema.parse({
    ...createPendingRenderJob(
      JOB_ID,
      OWNER_ID,
      PROJECT_ID,
      'us-east-1',
      3_000,
      undefined,
      binding,
      REQUESTER_ID,
      {
        version: 1,
        phase: 'NOT_ATTEMPTED',
        billingState: 'UNKNOWN',
        attemptToken: identity.attemptToken,
        creditIdempotencyKey: CREDIT_KEY,
        billingWallet: { type: 'user', clerkUserId: OWNER_ID },
        billingUnknownAt: new Date('2026-08-31T00:02:00.000Z'),
        unknownReason: 'credit response was ambiguous',
      },
    ),
    status: 'error',
    error: 'credit response was ambiguous',
    deliveryManifest: {
      version: 'editron-render-delivery-manifest-v1',
      mode: 'embedded',
      createdAt: '2026-08-31T00:00:00.000Z',
      completedAt: null,
      primaryArtifact: {
        kind: 'mixed-master',
        renderId: JOB_ID,
        status: 'rendering',
        url: null,
      },
      music: {
        embedded: true,
        removedOverlayIds: [],
        handoff: null,
      },
    },
    ...overrides,
  });
}

function authorizationFor(job: RenderJob) {
  return createProjectRenderJobAuthorizationV1({
    jobId: job._id,
    ownerId: job.userId,
    requestedByUserId: job.requestedByUserId!,
    projectId: job.projectId,
    projectRevision: job.projectRenderSnapshotBinding!.projectRevision,
    binding: job.projectRenderSnapshotBinding!,
  });
}

function collectionForJob(job: RenderJob, updateResult = { matchedCount: 1, modifiedCount: 1 }) {
  return {
    findOne: vi.fn(async () => job),
    updateOne: vi.fn(async () => updateResult),
  } as unknown as Collection<RenderJob> & {
    findOne: ReturnType<typeof vi.fn>;
    updateOne: ReturnType<typeof vi.fn>;
  };
}

function sweepCollection(rows: RenderJob[]) {
  const toArray = vi.fn(async () => rows);
  const limit = vi.fn(() => ({ toArray }));
  const sort = vi.fn(() => ({ limit }));
  return {
    find: vi.fn(() => ({ sort })),
  } as unknown as Collection<RenderJob> & {
    find: ReturnType<typeof vi.fn>;
  };
}

describe('Editron render billing recovery V1', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connectToDatabase.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('finds an exact user-wallet render charge without writing', async () => {
    const transaction = usageTransaction();
    mocks.userFindOne.mockReturnValue(queryResult({
      creditsBalance: { creditHistory: [transaction] },
    }));

    const result = await findUsageTransactionForWallet({
      wallet: { type: 'user', clerkUserId: OWNER_ID },
      creditIdempotencyKey: CREDIT_KEY,
      expectedTaskId: JOB_ID,
    });

    expect(result).toEqual({ status: 'FOUND', transaction });
    expect(mocks.userFindOne).toHaveBeenCalledWith({ clerkUserId: OWNER_ID });
    expect(mocks.organizationFindOne).not.toHaveBeenCalled();
  });

  it('requires the exact org actor and rejects wrong task or actor evidence', async () => {
    const transaction = usageTransaction({
      metadata: {
        idempotencyKey: CREDIT_KEY,
        taskId: JOB_ID,
        actorUserId: 'org-actor-1',
      },
    });
    mocks.organizationFindOne.mockReturnValue(queryResult({
      creditsBalance: { creditHistory: [transaction] },
    }));

    await expect(findUsageTransactionForWallet({
      wallet: { type: 'org', clerkOrgId: 'org-1', actorUserId: 'org-actor-1' },
      creditIdempotencyKey: CREDIT_KEY,
      expectedTaskId: JOB_ID,
      expectedActorUserId: 'org-actor-1',
    })).resolves.toEqual({ status: 'FOUND', transaction });

    await expect(findUsageTransactionForWallet({
      wallet: { type: 'org', clerkOrgId: 'org-1', actorUserId: 'other-actor' },
      creditIdempotencyKey: CREDIT_KEY,
      expectedTaskId: JOB_ID,
    })).resolves.toEqual({ status: 'INVALID', reason: 'MATCHING_TRANSACTION_MALFORMED' });

    await expect(findUsageTransactionForWallet({
      wallet: { type: 'org', clerkOrgId: 'org-1', actorUserId: 'org-actor-1' },
      creditIdempotencyKey: CREDIT_KEY,
      expectedTaskId: 'other-job',
    })).resolves.toEqual({ status: 'INVALID', reason: 'MATCHING_TRANSACTION_MALFORMED' });
  });

  it('keeps missing, evicted, duplicate and malformed history unprovable', async () => {
    const wallet = { type: 'user' as const, clerkUserId: OWNER_ID };
    const input = { wallet, creditIdempotencyKey: CREDIT_KEY, expectedTaskId: JOB_ID };

    mocks.userFindOne.mockReturnValue(queryResult({ creditsBalance: { creditHistory: [] } }));
    await expect(findUsageTransactionForWallet(input)).resolves.toEqual({ status: 'NOT_FOUND' });

    mocks.userFindOne.mockReturnValue(queryResult({ creditsBalance: { creditHistory: [
      usageTransaction(), usageTransaction({ id: 'txn-billing-recovery-duplicate' }),
    ] } }));
    await expect(findUsageTransactionForWallet(input)).resolves.toEqual({
      status: 'AMBIGUOUS',
      matchCount: 2,
    });

    mocks.userFindOne.mockReturnValue(queryResult({ creditsBalance: { creditHistory: [
      usageTransaction({ amount: 'not-a-number' }),
    ] } }));
    await expect(findUsageTransactionForWallet(input)).resolves.toEqual({
      status: 'INVALID',
      reason: 'MATCHING_TRANSACTION_MALFORMED',
    });
  });

  it('records only an exact current UNKNOWN admission and preserves pre-dispatch phase', async () => {
    const job = makeJob();
    const collection = collectionForJob(job);
    const result = await reconcileProjectRenderJobBillingV1({
      authorization: authorizationFor(job),
      currentProjectRevision: REVISION,
      billingWallet: job.dispatch!.billingWallet,
      creditTransactionId: TRANSACTION_ID,
      collection,
    });

    expect(result).toEqual({ ok: true, status: 'RECORDED' });
    expect(collection.updateOne).toHaveBeenCalledOnce();
    expect(collection.updateOne.mock.calls[0]![1]).toMatchObject({
      $set: {
        'dispatch.creditTransactionId': TRANSACTION_ID,
        'dispatch.billingState': 'RECORDED',
      },
    });
    expect(collection.updateOne.mock.calls[0]![0]).toMatchObject({
      $and: expect.arrayContaining([
        expect.objectContaining({
          'dispatch.phase': 'NOT_ATTEMPTED',
          'dispatch.billingState': 'UNKNOWN',
        }),
      ]),
    });
  });

  it('keeps UNKNOWN for stale, provider-bearing, mismatched and concurrent rows', async () => {
    const job = makeJob();
    const authorization = authorizationFor(job);
    const stale = await reconcileProjectRenderJobBillingV1({
      authorization,
      currentProjectRevision: { ...REVISION, value: REVISION.value + 1 },
      billingWallet: job.dispatch!.billingWallet,
      creditTransactionId: TRANSACTION_ID,
      collection: collectionForJob(job),
    });
    expect(stale).toEqual({
      ok: false,
      status: 'UNKNOWN_RETAINED',
      reason: 'PROJECT_REVISION_STALE',
    });

    const providerJob = makeJob({
      providerRenderId: 'provider-1',
      bucketName: 'bucket-1',
      region: 'us-east-1',
      dispatch: {
        ...job.dispatch,
        providerRenderId: 'provider-1',
        providerBucketName: 'bucket-1',
        providerRegion: 'us-east-1',
        attemptStartedAt: new Date('2026-08-31T00:02:30.000Z'),
        providerBoundAt: new Date('2026-08-31T00:02:45.000Z'),
        billingState: 'RECORDED',
        creditTransactionId: TRANSACTION_ID,
        phase: 'BOUND',
      },
      status: 'rendering',
    });
    const providerCollection = collectionForJob(providerJob);
    providerCollection.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(providerJob);
    await expect(reconcileProjectRenderJobBillingV1({
      authorization,
      currentProjectRevision: REVISION,
      billingWallet: job.dispatch!.billingWallet,
      creditTransactionId: TRANSACTION_ID,
      collection: providerCollection,
    })).resolves.toMatchObject({
      ok: false,
      status: 'UNKNOWN_RETAINED',
      reason: 'PROVIDER_IDENTITY_PRESENT',
    });
    expect(providerCollection.updateOne).not.toHaveBeenCalled();

    const mismatchJob = makeJob({
      dispatch: { ...job.dispatch, creditTransactionId: 'txn-other' },
    });
    const mismatchCollection = collectionForJob(mismatchJob);
    await expect(reconcileProjectRenderJobBillingV1({
      authorization,
      currentProjectRevision: REVISION,
      billingWallet: job.dispatch!.billingWallet,
      creditTransactionId: TRANSACTION_ID,
      collection: mismatchCollection,
    })).resolves.toMatchObject({
      ok: false,
      status: 'UNKNOWN_RETAINED',
      reason: 'BILLING_IDENTITY_MISMATCH',
    });
    expect(mismatchCollection.updateOne).not.toHaveBeenCalled();

    const conflictCollection = collectionForJob(job, { matchedCount: 1, modifiedCount: 0 });
    await expect(reconcileProjectRenderJobBillingV1({
      authorization,
      currentProjectRevision: REVISION,
      billingWallet: job.dispatch!.billingWallet,
      creditTransactionId: TRANSACTION_ID,
      collection: conflictCollection,
    })).resolves.toMatchObject({
      ok: false,
      status: 'UNKNOWN_RETAINED',
      reason: 'CAS_CONFLICT',
    });
  });

  it('replays an exact recorded transaction read-only', async () => {
    const job = makeJob({
      dispatch: {
        ...makeJob().dispatch,
        billingState: 'RECORDED',
        creditTransactionId: TRANSACTION_ID,
      },
    });
    const collection = collectionForJob(job);
    await expect(reconcileProjectRenderJobBillingV1({
      authorization: authorizationFor(job),
      currentProjectRevision: REVISION,
      billingWallet: job.dispatch!.billingWallet,
      creditTransactionId: TRANSACTION_ID,
      collection,
    })).resolves.toEqual({ ok: true, status: 'ALREADY_RECORDED' });
    expect(collection.updateOne).not.toHaveBeenCalled();

    const wrongWalletJob = makeJob({
      dispatch: {
        ...job.dispatch,
        billingWallet: { type: 'user', clerkUserId: 'different-wallet' },
      },
    });
    const wrongWalletCollection = collectionForJob(wrongWalletJob);
    wrongWalletCollection.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(wrongWalletJob);
    await expect(reconcileProjectRenderJobBillingV1({
      authorization: authorizationFor(job),
      currentProjectRevision: REVISION,
      billingWallet: job.dispatch!.billingWallet,
      creditTransactionId: TRANSACTION_ID,
      collection: wrongWalletCollection,
    })).resolves.toMatchObject({
      ok: false,
      status: 'UNKNOWN_RETAINED',
      reason: 'BILLING_IDENTITY_MISMATCH',
    });
  });

  it('recognizes an exact concurrent billing winner after a lost CAS race', async () => {
    const unknownJob = makeJob();
    const recordedJob = makeJob({
      dispatch: {
        ...unknownJob.dispatch,
        billingState: 'RECORDED',
        creditTransactionId: TRANSACTION_ID,
        billingUnknownAt: undefined,
        unknownReason: undefined,
      },
    });
    const collection = collectionForJob(unknownJob, { matchedCount: 1, modifiedCount: 0 });
    collection.findOne
      .mockResolvedValueOnce(unknownJob)
      .mockResolvedValueOnce(recordedJob);

    await expect(reconcileProjectRenderJobBillingV1({
      authorization: authorizationFor(unknownJob),
      currentProjectRevision: REVISION,
      billingWallet: unknownJob.dispatch!.billingWallet,
      creditTransactionId: TRANSACTION_ID,
      collection,
    })).resolves.toEqual({ ok: true, status: 'ALREADY_RECORDED' });
    expect(collection.updateOne).toHaveBeenCalledOnce();
  });

  it('sweeps a bounded strict row and leaves unresolved lookup outcomes untouched', async () => {
    const job = makeJob();
    const lookup = vi.fn(async () => ({
      status: 'FOUND',
      transaction: usageTransaction(),
    } satisfies EditronRenderUsageLookupResultV1));
    const reconcile = vi.fn(async () => ({ ok: true as const, status: 'RECORDED' as const }));
    const collection = sweepCollection([job]);

    const result = await sweepProjectRenderBillingRecoveryV1({
      limit: 1,
      collection,
      getCurrentProjectRevision: vi.fn(async () => REVISION),
      lookupUsageTransaction: lookup,
      reconcileBilling: reconcile,
    });

    expect(result).toMatchObject({ scanned: 1, reconciled: 1, errors: 0 });
    expect(lookup).toHaveBeenCalledWith({
      wallet: { type: 'user', clerkUserId: OWNER_ID },
      creditIdempotencyKey: CREDIT_KEY,
      expectedTaskId: JOB_ID,
    });
    expect(reconcile).toHaveBeenCalledWith(expect.objectContaining({
      creditTransactionId: TRANSACTION_ID,
      currentProjectRevision: REVISION,
    }));
  });

  it('does not query credits when live project revision is stale', async () => {
    const lookup = vi.fn();
    const result = await sweepProjectRenderBillingRecoveryV1({
      collection: sweepCollection([makeJob()]),
      getCurrentProjectRevision: vi.fn(async () => ({ ...REVISION, value: 8 })),
      lookupUsageTransaction: lookup,
    });
    expect(result).toMatchObject({ scanned: 1, stale: 1, reconciled: 0 });
    expect(lookup).not.toHaveBeenCalled();
  });

  it('protects the cron with a bearer secret and fixed bounded batch', async () => {
    vi.stubEnv('CRON_SECRET', 'billing-cron-secret');
    const runner = vi.fn(async (input: { limit: number }) => {
      expect(input).toEqual({ limit: 5 });
      return {
        scanned: 1,
        reconciled: 0,
        alreadyRecorded: 0,
        notFound: 1,
        ambiguous: 0,
        invalid: 0,
        stale: 0,
        conflicts: 0,
        skipped: 0,
        errors: 0,
        results: [],
      };
    });
    const request = (authorization?: string) => new Request(
      'https://app.example.test/api/cron/recover-editron-render-billing',
      { headers: authorization ? { authorization } : undefined },
    );

    await expect(handleProjectRenderBillingRecoveryCronV1(
      request('Bearer billing-cron-secret'),
      runner,
    )).resolves.toMatchObject({ status: 200 });
    await expect(handleProjectRenderBillingRecoveryCronV1(
      request('Bearer wrong'),
      runner,
    )).resolves.toMatchObject({ status: 401 });
    vi.stubEnv('CRON_SECRET', '');
    await expect(handleProjectRenderBillingRecoveryCronV1(
      request('Bearer billing-cron-secret'),
      runner,
    )).resolves.toMatchObject({ status: 503 });
  });

  it('registers the bounded cron schedule and billing-uncertainty index', () => {
    const vercel = JSON.parse(
      readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8'),
    ) as { crons: Array<{ path: string; schedule: string }> };
    expect(vercel.crons).toContainEqual({
      path: '/api/cron/recover-editron-render-billing',
      schedule: '*/5 * * * *',
    });

    const mongoSource = readFileSync(
      resolve(process.cwd(), 'lib/editron/db/mongodb.ts'),
      'utf8',
    );
    expect(mongoSource).toContain("name: 'billing_recovery_unknown_job_v1'");
    expect(mongoSource).toContain("'dispatch.billingState': 1");
    expect(mongoSource).toContain("'dispatch.billingUnknownAt': 1");
  });
});
