import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Collection } from 'mongodb';

import {
  createPendingRenderJob,
  createRenderJobChapterOrchestrationV1,
  RenderJobChapterOrchestrationSchema,
  RenderJobDispatchSchema,
  RenderJobSchema,
  type RenderJob,
  type RenderJobChapterOrchestrationV1,
} from '@/lib/editron/schemas/render-job';
import {
  buildContainedVideoTargetsV1,
  buildProjectRenderSourceSnapshotV1,
  createProjectRenderSnapshotBindingV1,
  type ProjectRenderSnapshotBindingV1,
} from '@/lib/editron/services/project-render-snapshot-binding-v1';
import {
  createProjectRenderDispatchIdentityV1,
  createProjectRenderJobAuthorizationV1,
  reserveProjectRenderJobV1,
} from '@/lib/editron/services/render-job-service';
import {
  beginChapterParentOrchestrationRunningV1,
  beginChapterParentOrchestrationConcatenatingV1,
  beginChapterParentOrchestrationFinalizingV1,
  completeChapterParentOrchestrationV1,
  failChapterParentOrchestrationV1,
  markChapterParentOrchestrationReadyForFinalizationV1,
  quarantineChapterParentOrchestrationV1,
  reconcileStaleChapterParentOrchestrationV1,
  startChapterParentOrchestrationV1,
  updateChapterParentOrchestrationProgressV1,
} from '@/lib/editron/services/chapter-parent-orchestration-v1';
import type { ProjectArtifactProjectRevisionV1 } from '@/lib/editron/services/project-artifact-invalidation-v1';
import type { RenderDeliveryManifest } from '@/lib/editron/services/render-delivery-manifest';

const OWNER_ID = 'chapter-parent-owner';
const REQUESTER_ID = 'chapter-parent-requester';
const PROJECT_ID = 'chapter-parent-project';
const JOB_ID = 'chr_123456789012';
const REGION = 'us-east-1';
const REVISION: ProjectArtifactProjectRevisionV1 = {
  schemaVersion: 1,
  value: 4,
  compatibilityUpdatedAt: '2026-09-01T00:00:00.000Z',
};
const RESERVED_AT = new Date('2026-09-01T00:00:00.000Z');
const STARTED_AT = new Date('2026-09-01T00:01:00.000Z');
const RUNNING_AT = new Date('2026-09-01T00:02:00.000Z');
const UNKNOWN_AT = new Date('2026-09-01T00:03:00.000Z');
const CONCATENATING_AT = new Date('2026-09-01T00:04:00.000Z');
const READY_AT = new Date('2026-09-01T00:05:00.000Z');
const FINALIZING_AT = new Date('2026-09-01T00:06:00.000Z');
const COMPLETED_AT = new Date('2026-09-01T00:07:00.000Z');
const FAILED_AFTER_FINALIZING_AT = new Date('2026-09-01T00:08:00.000Z');
const CHAPTER_LAYOUT_MANIFEST_HASH = 'a'.repeat(64);
const CHAPTER_OUTPUT = {
  url: 'https://concat.example.test/chapter-parent.mp4',
  sizeBytes: 42_000,
};
const CHAPTER_FINALIZED_OUTPUT = {
  url: 'https://finalized.example.test/chapter-parent.mp4',
  sizeBytes: 41_000,
};

const DELIVERY_MANIFEST: RenderDeliveryManifest = {
  version: 'editron-render-delivery-manifest-v1',
  mode: 'embedded',
  createdAt: RESERVED_AT.toISOString(),
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
};

const databaseMocks = vi.hoisted(() => ({
  collection: vi.fn(),
}));

vi.mock('@/lib/editron/db/mongodb', () => ({
  getDatabase: vi.fn(async () => ({ collection: databaseMocks.collection })),
}));

const VIDEO_OVERLAY = {
  id: 1,
  type: 'video' as const,
  from: 0,
  durationInFrames: 180,
  assetId: 'asset-chapter-parent',
  src: 'https://signed.example.test/chapter-parent.mp4',
  content: 'https://signed.example.test/chapter-parent.mp4',
  opacity: 1,
};

function makeBinding(): ProjectRenderSnapshotBindingV1 {
  const project = {
    overlays: [VIDEO_OVERLAY],
    durationInFrames: 180,
    fps: 30,
    playerDimensions: { width: 1920, height: 1080 },
  };
  const source = buildProjectRenderSourceSnapshotV1({
    project,
    inputProps: { renderMode: 'chapter-parent-test' },
  });
  return createProjectRenderSnapshotBindingV1({
    artifactKind: 'RENDERED_PREVIEW',
    artifactId: JOB_ID,
    ownerId: OWNER_ID,
    projectId: PROJECT_ID,
    projectRevision: REVISION,
    sequenceId: 'chapter-parent-sequence',
    compositionId: 'chapter-parent-composition',
    renderContract: { renderer: 'remotion-lambda', fps: 30 },
    durationInFrames: 180,
    fps: 30,
    width: 1920,
    height: 1080,
    projectRenderSource: source,
    containedVideoTargets: buildContainedVideoTargetsV1(project.overlays),
  });
}

function makeInitialOrchestration(
  overrides: Partial<RenderJobChapterOrchestrationV1> = {},
): RenderJobChapterOrchestrationV1 {
  return {
    ...createRenderJobChapterOrchestrationV1({
      aggregateJobId: JOB_ID,
      bindingHash: makeBinding().bindingHash,
      selectedRegion: REGION,
      reservedAt: RESERVED_AT,
    }),
    ...overrides,
  } as RenderJobChapterOrchestrationV1;
}

function makeStartingOrchestration(): RenderJobChapterOrchestrationV1 {
  return RenderJobChapterOrchestrationSchema.parse({
    ...makeInitialOrchestration(),
    state: 'STARTING',
    startingAt: STARTED_AT,
  });
}

function makeRunningOrchestration(): RenderJobChapterOrchestrationV1 {
  return RenderJobChapterOrchestrationSchema.parse({
    ...makeStartingOrchestration(),
    state: 'RUNNING',
    runningAt: RUNNING_AT,
    chapterCount: 2,
    progress: 0,
    completedChapterCount: 0,
    chapterLayoutManifestHash: CHAPTER_LAYOUT_MANIFEST_HASH,
  });
}

function makeCompletedRunningOrchestration(): RenderJobChapterOrchestrationV1 {
  return RenderJobChapterOrchestrationSchema.parse({
    ...makeRunningOrchestration(),
    progress: 1,
    completedChapterCount: 2,
  });
}

function makeConcatenatingOrchestration(): RenderJobChapterOrchestrationV1 {
  return RenderJobChapterOrchestrationSchema.parse({
    ...makeCompletedRunningOrchestration(),
    state: 'CONCATENATING',
    concatenatingAt: CONCATENATING_AT,
  });
}

function makeReadyOrchestration(): RenderJobChapterOrchestrationV1 {
  return RenderJobChapterOrchestrationSchema.parse({
    ...makeConcatenatingOrchestration(),
    state: 'READY_FOR_FINALIZATION',
    readyForFinalizationAt: READY_AT,
    progress: 1,
    completedChapterCount: 2,
    aggregateOutput: CHAPTER_OUTPUT,
  });
}

function makeFinalizingOrchestration(): RenderJobChapterOrchestrationV1 {
  return RenderJobChapterOrchestrationSchema.parse({
    ...makeReadyOrchestration(),
    state: 'FINALIZING',
    finalizingAt: FINALIZING_AT,
  });
}

function makeCompletedOrchestration(): RenderJobChapterOrchestrationV1 {
  return RenderJobChapterOrchestrationSchema.parse({
    ...makeFinalizingOrchestration(),
    state: 'COMPLETED',
    completedAt: COMPLETED_AT,
  });
}

function makeFailedOrchestration(): RenderJobChapterOrchestrationV1 {
  return RenderJobChapterOrchestrationSchema.parse({
    ...makeRunningOrchestration(),
    state: 'FAILED',
    failedAt: UNKNOWN_AT,
    failure: {
      code: 'CHAPTER_ORCHESTRATION_FAILED',
      message: 'chapter provider became unavailable',
    },
  });
}

function makeFailedWithAggregateOutputOrchestration(): RenderJobChapterOrchestrationV1 {
  return RenderJobChapterOrchestrationSchema.parse({
    ...makeFinalizingOrchestration(),
    state: 'FAILED',
    failedAt: FAILED_AFTER_FINALIZING_AT,
    failure: {
      code: 'CHAPTER_ORCHESTRATION_FAILED',
      message: 'chapter provider became unavailable',
    },
    aggregateOutput: CHAPTER_OUTPUT,
  });
}

function makeStaleOrchestration(): RenderJobChapterOrchestrationV1 {
  return RenderJobChapterOrchestrationSchema.parse({
    ...makeFinalizingOrchestration(),
    state: 'STALE',
    staleAt: FAILED_AFTER_FINALIZING_AT,
    failure: {
      code: 'CHAPTER_ORCHESTRATION_STALE',
      message: 'project changed before publication',
    },
  });
}

function makeUnknownOrchestration(): RenderJobChapterOrchestrationV1 {
  return RenderJobChapterOrchestrationSchema.parse({
    ...makeStartingOrchestration(),
    state: 'UNKNOWN',
    unknownAt: UNKNOWN_AT,
    failure: {
      code: 'CHAPTER_ORCHESTRATION_UNKNOWN',
      message: 'callback boundary was lost',
    },
  });
}

function makePendingDispatch(binding: ProjectRenderSnapshotBindingV1) {
  const identity = createProjectRenderDispatchIdentityV1({
    jobId: JOB_ID,
    bindingHash: binding.bindingHash,
  });
  return RenderJobDispatchSchema.parse({
    version: 1,
    phase: 'NOT_ATTEMPTED',
    billingState: 'PENDING',
    attemptToken: identity.attemptToken,
    creditIdempotencyKey: identity.creditIdempotencyKey,
    billingWallet: { type: 'user', clerkUserId: OWNER_ID },
  });
}

function makeJob(
  orchestration: RenderJobChapterOrchestrationV1 = makeInitialOrchestration(),
  overrides: Partial<RenderJob> = {},
): RenderJob {
  const binding = makeBinding();
  const initialJob = createPendingRenderJob(
    JOB_ID,
    OWNER_ID,
    PROJECT_ID,
    REGION,
    5_000,
    undefined,
    binding,
    REQUESTER_ID,
    makePendingDispatch(binding),
    makeInitialOrchestration(),
  );
  return RenderJobSchema.parse({
    ...initialJob,
    chapterOrchestration: orchestration,
    deliveryManifest: DELIVERY_MANIFEST,
    ...overrides,
  });
}

function makeAuthorization(binding = makeBinding()) {
  return createProjectRenderJobAuthorizationV1({
    jobId: JOB_ID,
    ownerId: OWNER_ID,
    requestedByUserId: REQUESTER_ID,
    projectId: PROJECT_ID,
    projectRevision: REVISION,
    binding,
  });
}

function makeCollection(
  updateResult: { acknowledged?: boolean; matchedCount?: number; modifiedCount?: number },
  findResult: unknown = null,
): Collection<RenderJob> & {
  insertOne: ReturnType<typeof vi.fn>;
  updateOne: ReturnType<typeof vi.fn>;
  findOne: ReturnType<typeof vi.fn>;
} {
  return {
    insertOne: vi.fn(async () => ({ acknowledged: true })),
    updateOne: vi.fn(async () => updateResult),
    findOne: vi.fn(async () => findResult),
  } as unknown as Collection<RenderJob> & {
    insertOne: ReturnType<typeof vi.fn>;
    updateOne: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
  };
}

function commonInput(collection: Collection<RenderJob>) {
  return {
    authorization: makeAuthorization(),
    currentProjectRevision: REVISION,
    selectedRegion: REGION,
    now: STARTED_AT,
    collection,
  };
}

describe('chapter parent orchestration V1', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates the provider-free NOT_STARTED contract with stable identity', () => {
    const binding = makeBinding();
    const orchestration = createRenderJobChapterOrchestrationV1({
      aggregateJobId: JOB_ID,
      bindingHash: binding.bindingHash,
      selectedRegion: REGION,
      reservedAt: RESERVED_AT,
    });

    expect(orchestration).toEqual({
      version: 1,
      scope: 'CHAPTER_ORCHESTRATION',
      aggregateJobId: JOB_ID,
      bindingHash: binding.bindingHash,
      selectedRegion: REGION,
      state: 'NOT_STARTED',
      reservedAt: RESERVED_AT,
    });
    expect(orchestration).not.toHaveProperty('providerRenderId');
    expect(orchestration).not.toHaveProperty('chapterCount');
  });

  it('rejects extra fields and state-specific omissions', () => {
    expect(RenderJobChapterOrchestrationSchema.safeParse({
      ...makeInitialOrchestration(),
      extra: true,
    }).success).toBe(false);
    expect(RenderJobChapterOrchestrationSchema.safeParse({
      ...makeInitialOrchestration(),
      state: 'RUNNING',
      startingAt: STARTED_AT,
      runningAt: RUNNING_AT,
    }).success).toBe(false);
    expect(RenderJobChapterOrchestrationSchema.safeParse({
      ...makeInitialOrchestration(),
      completedChapterCount: 0,
    }).success).toBe(false);
    expect(RenderJobChapterOrchestrationSchema.safeParse({
      ...makeStartingOrchestration(),
      completedChapterCount: 0,
    }).success).toBe(false);
    expect(RenderJobChapterOrchestrationSchema.safeParse({
      ...makeInitialOrchestration(),
      aggregateOutput: CHAPTER_OUTPUT,
    }).success).toBe(false);
    expect(RenderJobChapterOrchestrationSchema.safeParse({
      ...makeStartingOrchestration(),
      aggregateOutput: CHAPTER_OUTPUT,
    }).success).toBe(false);
    expect(RenderJobChapterOrchestrationSchema.safeParse({
      ...makeFailedOrchestration(),
      chapterCount: undefined,
    }).success).toBe(false);
    expect(RenderJobChapterOrchestrationSchema.safeParse({
      ...makeFailedWithAggregateOutputOrchestration(),
      completedChapterCount: 1,
    }).success).toBe(false);
    expect(RenderJobChapterOrchestrationSchema.safeParse({
      ...makeFailedWithAggregateOutputOrchestration(),
      aggregateOutput: { url: 'http://insecure.example.test/video.mp4', sizeBytes: 1 },
    }).success).toBe(false);
    expect(RenderJobChapterOrchestrationSchema.safeParse({
      ...makeInitialOrchestration(),
      state: 'UNKNOWN',
      unknownAt: UNKNOWN_AT,
      failure: {
        code: 'CHAPTER_ORCHESTRATION_UNKNOWN',
        message: 'lost start boundary',
      },
    }).success).toBe(false);
    expect(makeUnknownOrchestration().state).toBe('UNKNOWN');
  });

  it('rejects provider identity on the parent row while allowing pre-dispatch billing', () => {
    const billingWallet = { type: 'user' as const, clerkUserId: OWNER_ID };
    const job = makeJob();
    const binding = makeBinding();
    const identity = createProjectRenderDispatchIdentityV1({
      jobId: JOB_ID,
      bindingHash: binding.bindingHash,
    });
    const parentWithProvider = {
      ...job,
      providerRenderId: 'provider-parent',
    };
    expect(RenderJobSchema.safeParse(parentWithProvider).success).toBe(false);
    const parentWithBoundDispatch = {
      ...job,
      dispatch: RenderJobDispatchSchema.parse({
        version: 1,
        phase: 'BOUND',
        billingState: 'RECORDED',
        attemptToken: identity.attemptToken,
        creditIdempotencyKey: identity.creditIdempotencyKey,
        billingWallet,
        creditTransactionId: 'txn-parent',
        attemptStartedAt: STARTED_AT,
        providerBoundAt: UNKNOWN_AT,
        providerRenderId: 'provider-parent',
        providerBucketName: 'editron-render-output',
        providerRegion: REGION,
      }),
    };
    expect(RenderJobSchema.safeParse(parentWithBoundDispatch).success).toBe(false);

    const missingDispatch = { ...job, dispatch: undefined };
    expect(RenderJobSchema.safeParse(missingDispatch).success).toBe(false);
    const missingBinding = { ...job, projectRenderSnapshotBinding: undefined };
    expect(RenderJobSchema.safeParse(missingBinding).success).toBe(false);
    const mismatchedBinding = {
      ...job,
      chapterOrchestration: {
        ...job.chapterOrchestration!,
        bindingHash: 'b'.repeat(64),
      },
    };
    expect(RenderJobSchema.safeParse(mismatchedBinding).success).toBe(false);
  });

  it('inserts chapter orchestration atomically with the strict admission', async () => {
    const collection = makeCollection({ acknowledged: true, matchedCount: 1, modifiedCount: 1 });
    const binding = makeBinding();
    const orchestration = createRenderJobChapterOrchestrationV1({
      aggregateJobId: JOB_ID,
      bindingHash: binding.bindingHash,
      selectedRegion: REGION,
      reservedAt: RESERVED_AT,
    });
    const reserved = await reserveProjectRenderJobV1({
      jobId: JOB_ID,
      ownerId: OWNER_ID,
      requestedByUserId: REQUESTER_ID,
      projectId: PROJECT_ID,
      currentProjectRevision: REVISION,
      region: REGION,
      expectedDurationMs: 5_000,
      deliveryManifest: DELIVERY_MANIFEST,
      binding,
      chapterOrchestration: orchestration,
      billingWallet: { type: 'user', clerkUserId: OWNER_ID },
      collection,
    });

    expect(reserved.chapterOrchestration).toEqual(orchestration);
    expect(reserved.dispatch?.phase).toBe('NOT_ATTEMPTED');
    expect(reserved.dispatch?.billingState).toBe('PENDING');
    expect(collection.insertOne).toHaveBeenCalledTimes(1);
    expect((collection.insertOne.mock.calls[0]![0] as RenderJob).chapterOrchestration).toEqual(orchestration);
  });

  it('rejects wrong aggregate, binding, region, or non-initial reservation state', async () => {
    const binding = makeBinding();
    const collection = makeCollection({ acknowledged: true });
    const wrongAggregate = createRenderJobChapterOrchestrationV1({
      aggregateJobId: 'chr_abcdefghijkl',
      bindingHash: binding.bindingHash,
      selectedRegion: REGION,
      reservedAt: RESERVED_AT,
    });
    await expect(reserveProjectRenderJobV1({
      jobId: JOB_ID,
      ownerId: OWNER_ID,
      requestedByUserId: REQUESTER_ID,
      projectId: PROJECT_ID,
      currentProjectRevision: REVISION,
      region: REGION,
      expectedDurationMs: 5_000,
      deliveryManifest: DELIVERY_MANIFEST,
      binding,
      chapterOrchestration: wrongAggregate,
      billingWallet: { type: 'user', clerkUserId: OWNER_ID },
      collection,
    })).rejects.toThrow('PROJECT_RENDER_CHAPTER_ORCHESTRATION_SCOPE_MISMATCH');

    const wrongRegion = createRenderJobChapterOrchestrationV1({
      aggregateJobId: JOB_ID,
      bindingHash: binding.bindingHash,
      selectedRegion: 'us-west-2',
      reservedAt: RESERVED_AT,
    });
    await expect(reserveProjectRenderJobV1({
      jobId: JOB_ID,
      ownerId: OWNER_ID,
      requestedByUserId: REQUESTER_ID,
      projectId: PROJECT_ID,
      currentProjectRevision: REVISION,
      region: REGION,
      expectedDurationMs: 5_000,
      deliveryManifest: DELIVERY_MANIFEST,
      binding,
      chapterOrchestration: wrongRegion,
      billingWallet: { type: 'user', clerkUserId: OWNER_ID },
      collection,
    })).rejects.toThrow('PROJECT_RENDER_CHAPTER_ORCHESTRATION_SCOPE_MISMATCH');

    const wrongState = makeStartingOrchestration();
    expect(() => createPendingRenderJob(
      JOB_ID,
      OWNER_ID,
      PROJECT_ID,
      REGION,
      5_000,
      undefined,
      binding,
      REQUESTER_ID,
      RenderJobDispatchSchema.parse({
        version: 1,
        phase: 'NOT_ATTEMPTED',
        billingState: 'PENDING',
        attemptToken: createProjectRenderDispatchIdentityV1({
          jobId: JOB_ID,
          bindingHash: binding.bindingHash,
        }).attemptToken,
        creditIdempotencyKey: createProjectRenderDispatchIdentityV1({
          jobId: JOB_ID,
          bindingHash: binding.bindingHash,
        }).creditIdempotencyKey,
        billingWallet: { type: 'user', clerkUserId: OWNER_ID },
      }),
      wrongState,
    )).toThrow('CHAPTER_ORCHESTRATION_RESERVATION_STATE_INVALID');
    await expect(reserveProjectRenderJobV1({
      jobId: JOB_ID,
      ownerId: OWNER_ID,
      requestedByUserId: REQUESTER_ID,
      projectId: PROJECT_ID,
      currentProjectRevision: REVISION,
      region: REGION,
      expectedDurationMs: 5_000,
      deliveryManifest: DELIVERY_MANIFEST,
      binding,
      chapterOrchestration: wrongState,
      billingWallet: { type: 'user', clerkUserId: OWNER_ID },
      collection,
    })).rejects.toThrow('PROJECT_RENDER_CHAPTER_ORCHESTRATION_SCOPE_MISMATCH');

    await expect(reserveProjectRenderJobV1({
      jobId: JOB_ID,
      ownerId: OWNER_ID,
      requestedByUserId: REQUESTER_ID,
      projectId: PROJECT_ID,
      currentProjectRevision: REVISION,
      region: REGION,
      expectedDurationMs: 5_000,
      deliveryManifest: DELIVERY_MANIFEST,
      binding,
      chapterOrchestration: makeInitialOrchestration(),
      collection,
    })).rejects.toThrow('PROJECT_RENDER_CHAPTER_BILLING_WALLET_REQUIRED');
    expect(collection.insertOne).not.toHaveBeenCalled();
  });

  it('CAS-transitions NOT_STARTED to STARTING and never writes on exact replay', async () => {
    const collection = makeCollection({ acknowledged: true, matchedCount: 1, modifiedCount: 1 });
    await expect(startChapterParentOrchestrationV1(commonInput(collection))).resolves.toMatchObject({
      ok: true,
      status: 'CURRENT',
      state: 'STARTING',
    });
    expect(collection.updateOne).toHaveBeenCalledTimes(1);
    expect(collection.updateOne.mock.calls[0]![1]).toEqual({
      $set: {
        'chapterOrchestration.state': 'STARTING',
        'chapterOrchestration.startingAt': STARTED_AT,
      },
    });

    const replayCollection = makeCollection(
      { acknowledged: true, matchedCount: 0, modifiedCount: 0 },
      makeJob(makeStartingOrchestration()),
    );
    await expect(startChapterParentOrchestrationV1(commonInput(replayCollection))).resolves.toMatchObject({
      ok: true,
      status: 'CURRENT',
      state: 'STARTING',
      replayed: true,
    });
    expect(replayCollection.updateOne).toHaveBeenCalledTimes(1);
    expect(replayCollection.findOne).toHaveBeenCalledTimes(1);
  });

  it('does not replay an early transition for a terminal top-level row', async () => {
    for (const status of ['done', 'error'] as const) {
      const collection = makeCollection(
        { acknowledged: true, matchedCount: 0, modifiedCount: 0 },
        makeJob(makeInitialOrchestration(), { status }),
      );

      await expect(startChapterParentOrchestrationV1(commonInput(collection))).resolves.toMatchObject({
        ok: false,
        reason: 'JOB_NOT_CURRENT',
      });
      const filter = collection.updateOne.mock.calls[0]![0];
      expect(JSON.stringify(filter)).toContain(
        '"status":{"$in":["pending","queued","rendering","finalizing"]}',
      );
      expect(JSON.stringify(filter)).not.toContain('"done"');
      expect(JSON.stringify(filter)).not.toContain('"error"');
    }
  });

  it('does not mutate a provider-free parent row when its dispatch ledger is missing', async () => {
    const collection = makeCollection(
      { acknowledged: true, matchedCount: 0, modifiedCount: 0 },
      { ...makeJob(makeInitialOrchestration()), dispatch: undefined },
    );

    await expect(startChapterParentOrchestrationV1(commonInput(collection))).resolves.toMatchObject({
      ok: false,
      status: 'NON_CURRENT',
      reason: 'JOB_NOT_CURRENT',
    });
    expect(collection.updateOne).toHaveBeenCalledTimes(1);
    expect(collection.updateOne.mock.results[0]!.value).toMatchObject({
      acknowledged: true,
      matchedCount: 0,
      modifiedCount: 0,
    });
    const filter = collection.updateOne.mock.calls[0]![0];
    expect(JSON.stringify(filter)).toContain('"dispatch.phase":"NOT_ATTEMPTED"');
  });

  it('CAS-transitions STARTING to RUNNING with an exact chapter layout manifest identity', async () => {
    const collection = makeCollection({ acknowledged: true, matchedCount: 1, modifiedCount: 1 });
    const input = {
      ...commonInput(collection),
      now: RUNNING_AT,
      chapterCount: 2,
      chapterLayoutManifestHash: CHAPTER_LAYOUT_MANIFEST_HASH,
    };
    await expect(beginChapterParentOrchestrationRunningV1(input)).resolves.toMatchObject({
      ok: true,
      status: 'CURRENT',
      state: 'RUNNING',
    });
    expect(collection.updateOne.mock.calls[0]![1]).toEqual({
      $set: {
        'chapterOrchestration.state': 'RUNNING',
        'chapterOrchestration.runningAt': RUNNING_AT,
        'chapterOrchestration.chapterCount': 2,
        'chapterOrchestration.progress': 0,
        'chapterOrchestration.completedChapterCount': 0,
        'chapterOrchestration.chapterLayoutManifestHash': CHAPTER_LAYOUT_MANIFEST_HASH,
      },
    });
  });

  it('allows only exact RUNNING replay and rejects a changed chapter layout manifest without mutation', async () => {
    const replayCollection = makeCollection(
      { acknowledged: true, matchedCount: 0, modifiedCount: 0 },
      makeJob(makeRunningOrchestration()),
    );
    await expect(beginChapterParentOrchestrationRunningV1({
      ...commonInput(replayCollection),
      now: new Date('2026-09-01T00:05:00.000Z'),
      chapterCount: 2,
      chapterLayoutManifestHash: CHAPTER_LAYOUT_MANIFEST_HASH,
    })).resolves.toMatchObject({ ok: true, state: 'RUNNING', replayed: true });

    const conflictCollection = makeCollection(
      { acknowledged: true, matchedCount: 0, modifiedCount: 0 },
      makeJob(makeRunningOrchestration()),
    );
    await expect(beginChapterParentOrchestrationRunningV1({
      ...commonInput(conflictCollection),
      now: RUNNING_AT,
      chapterCount: 3,
      chapterLayoutManifestHash: 'b'.repeat(64),
    })).resolves.toMatchObject({ ok: false, reason: 'ORCHESTRATION_NOT_READY' });
    expect(conflictCollection.updateOne).toHaveBeenCalledTimes(1);
  });

  it('quarantines STARTING to UNKNOWN and supports an exact read-only replay', async () => {
    const collection = makeCollection({ acknowledged: true, matchedCount: 1, modifiedCount: 1 });
    await expect(quarantineChapterParentOrchestrationV1({
      ...commonInput(collection),
      now: UNKNOWN_AT,
      error: 'callback boundary was lost',
    })).resolves.toMatchObject({ ok: true, status: 'CURRENT', state: 'UNKNOWN' });
    expect(collection.updateOne.mock.calls[0]![1]).toEqual({
      $set: {
        'chapterOrchestration.state': 'UNKNOWN',
        'chapterOrchestration.unknownAt': UNKNOWN_AT,
        'chapterOrchestration.failure': {
          code: 'CHAPTER_ORCHESTRATION_UNKNOWN',
          message: 'callback boundary was lost',
        },
      },
    });

    const replayCollection = makeCollection(
      { acknowledged: true, matchedCount: 0, modifiedCount: 0 },
      makeJob(makeUnknownOrchestration()),
    );
    await expect(quarantineChapterParentOrchestrationV1({
      ...commonInput(replayCollection),
      now: new Date('2026-09-01T00:04:00.000Z'),
      error: 'callback boundary was lost',
    })).resolves.toMatchObject({ ok: true, state: 'UNKNOWN', replayed: true });
  });

  it('advances RUNNING progress monotonically with immutable chapter identity', async () => {
    const collection = makeCollection({ acknowledged: true, matchedCount: 1, modifiedCount: 1 });
    await expect(updateChapterParentOrchestrationProgressV1({
      ...commonInput(collection),
      now: RUNNING_AT,
      chapterCount: 2,
      chapterLayoutManifestHash: CHAPTER_LAYOUT_MANIFEST_HASH,
      completedChapterCount: 1,
      progress: 0.5,
    })).resolves.toMatchObject({ ok: true, state: 'RUNNING' });
    expect(collection.updateOne.mock.calls[0]![1]).toEqual({
      $set: {
        'chapterOrchestration.progress': 0.5,
        'chapterOrchestration.completedChapterCount': 1,
      },
    });
    const filter = collection.updateOne.mock.calls[0]![0] as { $and?: unknown[] };
    expect(JSON.stringify(filter)).toContain(`"chapterOrchestration.chapterCount":2`);
    expect(JSON.stringify(filter)).toContain(`"chapterOrchestration.chapterLayoutManifestHash":"${CHAPTER_LAYOUT_MANIFEST_HASH}"`);
    expect(JSON.stringify(filter)).toContain('"$lte":0.5');
    expect(JSON.stringify(filter)).toContain('"$lte":1');

    const replayCollection = makeCollection(
      { acknowledged: true, matchedCount: 0, modifiedCount: 0 },
      makeJob(RenderJobChapterOrchestrationSchema.parse({
        ...makeRunningOrchestration(),
        progress: 0.5,
        completedChapterCount: 1,
      })),
    );
    await expect(updateChapterParentOrchestrationProgressV1({
      ...commonInput(replayCollection),
      chapterCount: 2,
      chapterLayoutManifestHash: CHAPTER_LAYOUT_MANIFEST_HASH,
      completedChapterCount: 1,
      progress: 0.5,
    })).resolves.toMatchObject({ ok: true, state: 'RUNNING', replayed: true });

    const decreasingCollection = makeCollection(
      { acknowledged: true, matchedCount: 0, modifiedCount: 0 },
      makeJob(RenderJobChapterOrchestrationSchema.parse({
        ...makeRunningOrchestration(),
        progress: 0.5,
        completedChapterCount: 1,
      })),
    );
    await expect(updateChapterParentOrchestrationProgressV1({
      ...commonInput(decreasingCollection),
      chapterCount: 2,
      chapterLayoutManifestHash: CHAPTER_LAYOUT_MANIFEST_HASH,
      completedChapterCount: 0,
      progress: 0.25,
    })).resolves.toMatchObject({ ok: false, reason: 'CAS_CONFLICT' });
  });

  it('requires complete RUNNING progress for concat and then reaches exact ready output', async () => {
    const incompleteCountCollection = makeCollection(
      { acknowledged: true, matchedCount: 0, modifiedCount: 0 },
      makeJob(RenderJobChapterOrchestrationSchema.parse({
        ...makeRunningOrchestration(),
        progress: 1,
      })),
    );
    await expect(beginChapterParentOrchestrationConcatenatingV1({
      ...commonInput(incompleteCountCollection),
      now: CONCATENATING_AT,
      chapterCount: 2,
      chapterLayoutManifestHash: CHAPTER_LAYOUT_MANIFEST_HASH,
    })).resolves.toMatchObject({ ok: false, reason: 'CAS_CONFLICT' });
    expect(JSON.stringify(incompleteCountCollection.updateOne.mock.calls[0]![0]))
      .toContain('"chapterOrchestration.completedChapterCount":2');

    const incompleteProgressCollection = makeCollection(
      { acknowledged: true, matchedCount: 0, modifiedCount: 0 },
      makeJob(RenderJobChapterOrchestrationSchema.parse({
        ...makeRunningOrchestration(),
        completedChapterCount: 2,
      })),
    );
    await expect(beginChapterParentOrchestrationConcatenatingV1({
      ...commonInput(incompleteProgressCollection),
      now: CONCATENATING_AT,
      chapterCount: 2,
      chapterLayoutManifestHash: CHAPTER_LAYOUT_MANIFEST_HASH,
    })).resolves.toMatchObject({ ok: false, reason: 'CAS_CONFLICT' });
    expect(JSON.stringify(incompleteProgressCollection.updateOne.mock.calls[0]![0]))
      .toContain('"chapterOrchestration.progress":1');

    const concatenatingCollection = makeCollection({ acknowledged: true, matchedCount: 1, modifiedCount: 1 });
    await expect(beginChapterParentOrchestrationConcatenatingV1({
      ...commonInput(concatenatingCollection),
      now: CONCATENATING_AT,
      chapterCount: 2,
      chapterLayoutManifestHash: CHAPTER_LAYOUT_MANIFEST_HASH,
    })).resolves.toMatchObject({ ok: true, state: 'CONCATENATING' });
    expect(concatenatingCollection.updateOne.mock.calls[0]![1]).toEqual({
      $set: {
        'chapterOrchestration.state': 'CONCATENATING',
        'chapterOrchestration.concatenatingAt': CONCATENATING_AT,
      },
    });

    const readyCollection = makeCollection({ acknowledged: true, matchedCount: 1, modifiedCount: 1 });
    await expect(markChapterParentOrchestrationReadyForFinalizationV1({
      ...commonInput(readyCollection),
      now: READY_AT,
      chapterCount: 2,
      chapterLayoutManifestHash: CHAPTER_LAYOUT_MANIFEST_HASH,
      completedChapterCount: 2,
      aggregateOutput: CHAPTER_OUTPUT,
    })).resolves.toMatchObject({ ok: true, state: 'READY_FOR_FINALIZATION' });
    expect(JSON.stringify(readyCollection.updateOne.mock.calls[0]![0]))
      .toContain('"chapterOrchestration.state":"CONCATENATING"');
    expect(readyCollection.updateOne.mock.calls[0]![1]).toEqual({
      $set: {
        'chapterOrchestration.state': 'READY_FOR_FINALIZATION',
        'chapterOrchestration.readyForFinalizationAt': READY_AT,
        'chapterOrchestration.progress': 1,
        'chapterOrchestration.completedChapterCount': 2,
        'chapterOrchestration.aggregateOutput': CHAPTER_OUTPUT,
      },
    });

    const invalidOutputCollection = makeCollection({ acknowledged: true, matchedCount: 1, modifiedCount: 1 });
    await expect(markChapterParentOrchestrationReadyForFinalizationV1({
      ...commonInput(invalidOutputCollection),
      chapterCount: 2,
      chapterLayoutManifestHash: CHAPTER_LAYOUT_MANIFEST_HASH,
      completedChapterCount: 2,
      aggregateOutput: { url: 'http://insecure.example.test/video.mp4', sizeBytes: 1 },
    })).resolves.toMatchObject({ ok: false, reason: 'ORCHESTRATION_NOT_READY' });
    expect(invalidOutputCollection.updateOne).not.toHaveBeenCalled();
  });

  it('fences finalization/completion and replays only the exact ready output', async () => {
    const finalizingCollection = makeCollection({ acknowledged: true, matchedCount: 1, modifiedCount: 1 });
    await expect(beginChapterParentOrchestrationFinalizingV1({
      ...commonInput(finalizingCollection),
      now: FINALIZING_AT,
      chapterCount: 2,
      chapterLayoutManifestHash: CHAPTER_LAYOUT_MANIFEST_HASH,
      aggregateOutput: CHAPTER_OUTPUT,
    })).resolves.toMatchObject({ ok: true, state: 'FINALIZING' });

    const completedCollection = makeCollection({ acknowledged: true, matchedCount: 1, modifiedCount: 1 });
    await expect(completeChapterParentOrchestrationV1({
      ...commonInput(completedCollection),
      now: COMPLETED_AT,
      chapterCount: 2,
      chapterLayoutManifestHash: CHAPTER_LAYOUT_MANIFEST_HASH,
      aggregateOutput: CHAPTER_OUTPUT,
      finalizedOutput: CHAPTER_FINALIZED_OUTPUT,
    })).resolves.toMatchObject({ ok: true, state: 'COMPLETED' });

    const finalizingReplayCollection = makeCollection(
      { acknowledged: true, matchedCount: 0, modifiedCount: 0 },
      makeJob(makeFinalizingOrchestration()),
    );
    await expect(beginChapterParentOrchestrationFinalizingV1({
      ...commonInput(finalizingReplayCollection),
      chapterCount: 2,
      chapterLayoutManifestHash: CHAPTER_LAYOUT_MANIFEST_HASH,
      aggregateOutput: CHAPTER_OUTPUT,
    })).resolves.toMatchObject({ ok: true, state: 'FINALIZING', replayed: true });

    const completedReplayCollection = makeCollection(
      { acknowledged: true, matchedCount: 0, modifiedCount: 0 },
      makeJob(makeCompletedOrchestration(), {
        status: 'done',
        outputUrl: CHAPTER_FINALIZED_OUTPUT.url,
        outputSize: CHAPTER_FINALIZED_OUTPUT.sizeBytes,
        finalization: {
          version: 'editron-render-finalization-v1',
          state: 'done',
          sourceOutputUrl: CHAPTER_OUTPUT.url,
          sourceOutputSize: CHAPTER_OUTPUT.sizeBytes,
          attempts: 1,
          outputUrl: CHAPTER_FINALIZED_OUTPUT.url,
          outputSize: CHAPTER_FINALIZED_OUTPUT.sizeBytes,
        },
      }),
    );
    await expect(completeChapterParentOrchestrationV1({
      ...commonInput(completedReplayCollection),
      chapterCount: 2,
      chapterLayoutManifestHash: CHAPTER_LAYOUT_MANIFEST_HASH,
      aggregateOutput: CHAPTER_OUTPUT,
      finalizedOutput: CHAPTER_FINALIZED_OUTPUT,
    })).resolves.toMatchObject({ ok: true, state: 'COMPLETED', replayed: true });

    const changedSourceReplayCollection = makeCollection(
      { acknowledged: true, matchedCount: 0, modifiedCount: 0 },
      makeJob(makeCompletedOrchestration(), {
        status: 'done',
        outputUrl: CHAPTER_FINALIZED_OUTPUT.url,
        outputSize: CHAPTER_FINALIZED_OUTPUT.sizeBytes,
        finalization: {
          version: 'editron-render-finalization-v1',
          state: 'done',
          sourceOutputUrl: 'https://chapter.example.test/changed-source.mp4',
          sourceOutputSize: CHAPTER_OUTPUT.sizeBytes,
          attempts: 1,
          outputUrl: CHAPTER_FINALIZED_OUTPUT.url,
          outputSize: CHAPTER_FINALIZED_OUTPUT.sizeBytes,
        },
      }),
    );
    await expect(completeChapterParentOrchestrationV1({
      ...commonInput(changedSourceReplayCollection),
      chapterCount: 2,
      chapterLayoutManifestHash: CHAPTER_LAYOUT_MANIFEST_HASH,
      aggregateOutput: CHAPTER_OUTPUT,
      finalizedOutput: CHAPTER_FINALIZED_OUTPUT,
    })).resolves.toMatchObject({ ok: false, reason: 'ORCHESTRATION_NOT_READY' });

    const changedOutputCollection = makeCollection(
      { acknowledged: true, matchedCount: 0, modifiedCount: 0 },
      makeJob(makeReadyOrchestration()),
    );
    await expect(markChapterParentOrchestrationReadyForFinalizationV1({
      ...commonInput(changedOutputCollection),
      chapterCount: 2,
      chapterLayoutManifestHash: CHAPTER_LAYOUT_MANIFEST_HASH,
      completedChapterCount: 2,
      aggregateOutput: { url: CHAPTER_OUTPUT.url, sizeBytes: CHAPTER_OUTPUT.sizeBytes + 1 },
    })).resolves.toMatchObject({ ok: false, reason: 'ORCHESTRATION_NOT_READY' });
  });

  it('quarantines active post-running states to FAILED and retains exact aggregate output', async () => {
    const collection = makeCollection({ acknowledged: true, matchedCount: 1, modifiedCount: 1 });
    await expect(failChapterParentOrchestrationV1({
      ...commonInput(collection),
      now: UNKNOWN_AT,
      chapterCount: 2,
      chapterLayoutManifestHash: CHAPTER_LAYOUT_MANIFEST_HASH,
      error: 'chapter provider became unavailable',
    })).resolves.toMatchObject({ ok: true, state: 'FAILED' });
    expect(collection.updateOne.mock.calls[0]![1]).toEqual({
      $set: {
        'chapterOrchestration.state': 'FAILED',
        'chapterOrchestration.failedAt': UNKNOWN_AT,
        'chapterOrchestration.failure': {
          code: 'CHAPTER_ORCHESTRATION_FAILED',
          message: 'chapter provider became unavailable',
        },
      },
    });

    const finalizingCollection = makeCollection({ acknowledged: true, matchedCount: 1, modifiedCount: 1 });
    await expect(failChapterParentOrchestrationV1({
      ...commonInput(finalizingCollection),
      now: FAILED_AFTER_FINALIZING_AT,
      chapterCount: 2,
      chapterLayoutManifestHash: CHAPTER_LAYOUT_MANIFEST_HASH,
      aggregateOutput: CHAPTER_OUTPUT,
      error: 'chapter provider became unavailable',
    })).resolves.toMatchObject({ ok: true, state: 'FAILED' });
    expect(finalizingCollection.updateOne.mock.calls[0]![1]).toEqual({
      $set: {
        'chapterOrchestration.state': 'FAILED',
        'chapterOrchestration.failedAt': FAILED_AFTER_FINALIZING_AT,
        'chapterOrchestration.failure': {
          code: 'CHAPTER_ORCHESTRATION_FAILED',
          message: 'chapter provider became unavailable',
        },
      },
    });
    expect(JSON.stringify(finalizingCollection.updateOne.mock.calls[0]![0])).toContain(CHAPTER_OUTPUT.url);

    const replayCollection = makeCollection(
      { acknowledged: true, matchedCount: 0, modifiedCount: 0 },
      makeJob(makeFailedWithAggregateOutputOrchestration()),
    );
    await expect(failChapterParentOrchestrationV1({
      ...commonInput(replayCollection),
      aggregateOutput: CHAPTER_OUTPUT,
      error: 'chapter provider became unavailable',
      chapterCount: 2,
      chapterLayoutManifestHash: CHAPTER_LAYOUT_MANIFEST_HASH,
    })).resolves.toMatchObject({ ok: true, state: 'FAILED', replayed: true });

    const malformedOutputCollection = makeCollection({ acknowledged: true, matchedCount: 1, modifiedCount: 1 });
    await expect(failChapterParentOrchestrationV1({
      ...commonInput(malformedOutputCollection),
      chapterCount: 2,
      chapterLayoutManifestHash: CHAPTER_LAYOUT_MANIFEST_HASH,
      aggregateOutput: { url: 'http://insecure.example.test/video.mp4', sizeBytes: 1 },
      error: 'chapter provider became unavailable',
    })).resolves.toMatchObject({ ok: false, reason: 'INPUT_INVALID' });
    expect(malformedOutputCollection.updateOne).not.toHaveBeenCalled();
  });

  it('reconciles STALE only from the exact persisted stale finalization boundary', async () => {
    const staleParent = makeJob(makeFinalizingOrchestration(), {
      status: 'error',
      artifactState: 'STALE',
      artifactCleanup: { state: 'PENDING', pendingArtifactIds: [JOB_ID] },
      artifactInvalidatedAt: FAILED_AFTER_FINALIZING_AT,
      completedAt: FAILED_AFTER_FINALIZING_AT,
      error: 'project changed before publication',
      finalization: {
        version: 'editron-render-finalization-v1',
        state: 'failed',
        sourceOutputUrl: CHAPTER_OUTPUT.url,
        sourceOutputSize: CHAPTER_OUTPUT.sizeBytes,
        attempts: 1,
        completedAt: FAILED_AFTER_FINALIZING_AT,
        error: 'project changed before publication',
      },
    });
    const collection = makeCollection(
      { acknowledged: true, matchedCount: 1, modifiedCount: 1 },
      staleParent,
    );
    await expect(reconcileStaleChapterParentOrchestrationV1({
      ...commonInput(collection),
      now: FAILED_AFTER_FINALIZING_AT,
      chapterCount: 2,
      chapterLayoutManifestHash: CHAPTER_LAYOUT_MANIFEST_HASH,
      aggregateOutput: CHAPTER_OUTPUT,
      error: 'project changed before publication',
    })).resolves.toMatchObject({ ok: true, state: 'STALE' });
    const filter = JSON.stringify(collection.updateOne.mock.calls[0]![0]);
    expect(filter).toContain('"artifactState":"STALE"');
    expect(filter).toContain('"artifactCleanup.state":"PENDING"');
    expect(filter).toContain(CHAPTER_OUTPUT.url);

    const replayCollection = makeCollection(
      { acknowledged: true, matchedCount: 0, modifiedCount: 0 },
      makeJob(makeStaleOrchestration(), {
        ...staleParent,
        chapterOrchestration: makeStaleOrchestration(),
      }),
    );
    await expect(reconcileStaleChapterParentOrchestrationV1({
      ...commonInput(replayCollection),
      now: FAILED_AFTER_FINALIZING_AT,
      chapterCount: 2,
      chapterLayoutManifestHash: CHAPTER_LAYOUT_MANIFEST_HASH,
      aggregateOutput: CHAPTER_OUTPUT,
      error: 'project changed before publication',
    })).resolves.toMatchObject({ ok: true, state: 'STALE', replayed: true });

    const activeCollection = makeCollection(
      { acknowledged: true, matchedCount: 0, modifiedCount: 0 },
      makeJob(makeFinalizingOrchestration()),
    );
    await expect(reconcileStaleChapterParentOrchestrationV1({
      ...commonInput(activeCollection),
      chapterCount: 2,
      chapterLayoutManifestHash: CHAPTER_LAYOUT_MANIFEST_HASH,
      aggregateOutput: CHAPTER_OUTPUT,
      error: 'project changed before publication',
    })).resolves.toMatchObject({ ok: false, reason: 'JOB_NOT_CURRENT' });
  });

  it('fails closed for stale revision, wrong source state, provider-bearing rows, and unproved writes', async () => {
    const staleCollection = makeCollection({ acknowledged: true, matchedCount: 1, modifiedCount: 1 });
    await expect(startChapterParentOrchestrationV1({
      ...commonInput(staleCollection),
      currentProjectRevision: { ...REVISION, value: REVISION.value + 1 },
    })).resolves.toMatchObject({ ok: false, reason: 'PROJECT_REVISION_STALE' });
    expect(staleCollection.updateOne).not.toHaveBeenCalled();

    const wrongStateCollection = makeCollection(
      { acknowledged: true, matchedCount: 0, modifiedCount: 0 },
      makeJob(),
    );
    await expect(beginChapterParentOrchestrationRunningV1({
      ...commonInput(wrongStateCollection),
      now: RUNNING_AT,
      chapterCount: 2,
      chapterLayoutManifestHash: CHAPTER_LAYOUT_MANIFEST_HASH,
    })).resolves.toMatchObject({ ok: false, reason: 'ORCHESTRATION_NOT_READY' });

    const providerRow = { ...makeJob(), providerRenderId: 'provider-parent' };
    const providerCollection = makeCollection(
      { acknowledged: true, matchedCount: 0, modifiedCount: 0 },
      providerRow,
    );
    await expect(startChapterParentOrchestrationV1(commonInput(providerCollection))).resolves.toMatchObject({
      ok: false,
      reason: 'JOB_NOT_CURRENT',
    });

    const unprovedCollection = makeCollection({ acknowledged: false, matchedCount: 1, modifiedCount: 1 });
    await expect(startChapterParentOrchestrationV1(commonInput(unprovedCollection)))
      .rejects.toThrow('CHAPTER_PARENT_ORCHESTRATION_WRITE_UNPROVED');

    const ambiguousCollection = makeCollection({ acknowledged: true, matchedCount: 1, modifiedCount: 2 });
    await expect(startChapterParentOrchestrationV1(commonInput(ambiguousCollection)))
      .rejects.toThrow('CHAPTER_PARENT_ORCHESTRATION_WRITE_CARDINALITY_UNPROVED');
  });
});
