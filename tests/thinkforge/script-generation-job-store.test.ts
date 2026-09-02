import { BSON, type Collection } from 'mongodb';
import { describe, expect, it, vi } from 'vitest';
import { materializeScriptChapterPlan, type ScriptChapterPlan } from '@/lib/thinkforge/schemas/script-chapter-plan';
import { hashScriptDocumentContent } from '@/lib/thinkforge/persistence/script-sidecar-binding';
import {
  LONG_FORM_SCRIPT_JOB_INDEXES,
  LONG_FORM_SCRIPT_JOB_TTL_MS,
  LongFormScriptGenerationJobStore,
  LongFormScriptJobCheckpointConflictError,
  LongFormScriptJobLeaseLostError,
  LongFormScriptJobTransitionError,
  createLongFormScriptJobDedupeKey,
  hashLongFormScriptJobValue,
  type LongFormScriptGenerationJobInput,
  type LongFormScriptGenerationJobRecord,
} from '@/lib/thinkforge/long-form/script-generation-job-store';

const NOW = new Date('2026-08-20T10:00:00.000Z');
const SHA = 'b'.repeat(64);

const input = {
  userId: 'user_1',
  orgId: 'org_1',
  sessionId: 'session_1',
  generationId: 'generation_1',
  scriptId: 'default',
  baseVersion: 3,
  authoringContext: {},
  authoringInput: {},
  signalTrace: {},
} as unknown as LongFormScriptGenerationJobInput;

function plan(): ScriptChapterPlan {
  return materializeScriptChapterPlan({
    title: 'A complete story',
    narrativeThesis: 'Specific knowledge creates durable value.',
    targetDurationSeconds: 180,
    audienceJourney: { openingState: 'Unaware', closingState: 'Informed' },
    continuityBible: {
      pointOfView: 'Close observation',
      temporalFrame: 'One day',
      toneProgression: ['curiosity', 'clarity'],
      recurringMotifs: [],
      terminologyInvariants: [],
    },
    characters: [],
    continuityThreads: [],
    acts: [{
      id: 'act_one',
      title: 'Discovery',
      narrativePurpose: 'Reveal the central truth.',
      chapters: [{
        id: 'chapter_one',
        title: 'Evidence',
        narrativePurpose: 'Make the evidence concrete.',
        audienceStateBefore: 'Unaware',
        audienceStateAfter: 'Informed',
        sceneBlueprints: [{
          id: 'scene_one',
          title: 'Observed work',
          narrativePurpose: 'Show the proof.',
          openingState: 'Question',
          development: ['Observe', 'Explain'],
          closingState: 'Answer',
          durationIntentSeconds: 180,
          requiredSourceRefs: [],
          requiredCharacterIds: [],
          continuityThreadIds: [],
        }],
      }],
    }],
  });
}

function record(overrides: Partial<LongFormScriptGenerationJobRecord> = {}): LongFormScriptGenerationJobRecord {
  return {
    _id: 'longscript_123',
    id: 'longscript_123',
    version: 1,
    dedupeKey: createLongFormScriptJobDedupeKey(input),
    activeDedupeKey: createLongFormScriptJobDedupeKey(input),
    userId: input.userId,
    orgId: input.orgId,
    sessionId: input.sessionId,
    generationId: input.generationId,
    input: structuredClone(input),
    status: 'queued',
    stage: 'planning',
    dispatchCount: 0,
    stageFailureCount: 0,
    maxStageFailures: 3,
    leaseExpiresAt: null,
    queueMessageId: null,
    plan: null,
    planHash: null,
    chapterArtifacts: {},
    chapterArtifactHashes: {},
    assembledResult: null,
    assembledResultHash: null,
    commitReceipt: null,
    error: null,
    createdAt: NOW,
    updatedAt: NOW,
    expiresAt: new Date(NOW.getTime() + LONG_FORM_SCRIPT_JOB_TTL_MS),
    ...overrides,
  };
}

function collectionMock() {
  return {
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    insertOne: vi.fn(),
    updateOne: vi.fn(),
    find: vi.fn(),
  } as unknown as Collection<LongFormScriptGenerationJobRecord>;
}

function successfulUpdate() {
  return { acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedCount: 0, upsertedId: null };
}

describe('LongFormScriptGenerationJobStore', () => {
  it('keeps immutable input hashes stable across a BSON round trip', () => {
    const inputWithOptionalValues = {
      ...input,
      authoringInput: {
        ...input.authoringInput,
        generationMode: undefined,
        generationIdentity: undefined,
      },
      contextMetadata: {
        trendContext: {
          omitted: undefined,
          orderedValues: ['preserved', undefined, { omitted: undefined, preserved: true }],
        },
      },
    } as unknown as LongFormScriptGenerationJobInput;
    const persistedInput = BSON.deserialize(
      BSON.serialize(inputWithOptionalValues),
    ) as unknown as LongFormScriptGenerationJobInput;

    expect(persistedInput.authoringInput).not.toHaveProperty('generationMode');
    expect(persistedInput.contextMetadata?.trendContext?.orderedValues)
      .toEqual(['preserved', null, { preserved: true }]);
    expect(createLongFormScriptJobDedupeKey(persistedInput))
      .toBe(createLongFormScriptJobDedupeKey(inputWithOptionalValues));
  });

  it('creates a deduplicated TTL job with exact authoring input and no visible partial result', async () => {
    const collection = collectionMock();
    vi.mocked(collection.findOne).mockResolvedValue(null);
    vi.mocked(collection.insertOne).mockResolvedValue({ acknowledged: true, insertedId: 'longscript_123' });
    const store = new LongFormScriptGenerationJobStore(async () => collection);

    const created = await store.createOrGet(input, NOW);
    const inserted = vi.mocked(collection.insertOne).mock.calls[0][0];

    expect(created.created).toBe(true);
    expect(inserted.input).toEqual(input);
    expect(inserted.plan).toBeNull();
    expect(inserted.chapterArtifacts).toEqual({});
    expect(inserted.assembledResult).toBeNull();
    expect(inserted.createdAt).toBeInstanceOf(Date);
    expect(inserted.expiresAt).toEqual(new Date(NOW.getTime() + LONG_FORM_SCRIPT_JOB_TTL_MS));
    expect(LONG_FORM_SCRIPT_JOB_INDEXES).toContainEqual(expect.objectContaining({
      key: { expiresAt: 1 },
      expireAfterSeconds: 0,
    }));
  });

  it('claims with a fenced lease without treating healthy dispatches as failures', async () => {
    const collection = collectionMock();
    vi.mocked(collection.findOneAndUpdate).mockImplementation(async (_filter, update) => {
      const set = (update as { $set: { leaseToken: string; leaseExpiresAt: Date } }).$set;
      return record({
        status: 'running',
        dispatchCount: 21,
        stageFailureCount: 0,
        leaseToken: set.leaseToken,
        leaseExpiresAt: set.leaseExpiresAt,
      });
    });
    vi.mocked(collection.updateOne).mockResolvedValueOnce({
      acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0, upsertedId: null,
    });
    const store = new LongFormScriptGenerationJobStore(async () => collection);

    const claim = await store.claim('longscript_123', NOW);
    expect(claim.kind).toBe('claimed');
    if (claim.kind !== 'claimed') throw new Error('Expected a claimed job.');
    expect(claim.job.dispatchCount).toBe(21);
    expect(claim.job.stageFailureCount).toBe(0);
    expect(claim.job).not.toHaveProperty('leaseToken');
    await expect(store.heartbeat('longscript_123', 'stale', NOW))
      .rejects.toBeInstanceOf(LongFormScriptJobLeaseLostError);
  });

  it('accepts identical master-plan replay and rejects plan drift', async () => {
    const masterPlan = plan();
    const planHash = hashLongFormScriptJobValue(masterPlan);
    const collection = collectionMock();
    vi.mocked(collection.updateOne)
      .mockResolvedValueOnce(successfulUpdate())
      .mockResolvedValue({ acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0, upsertedId: null });
    const store = new LongFormScriptGenerationJobStore(async () => collection);

    await store.savePlan('longscript_123', 'lease_1', masterPlan, NOW);
    expect(collection.updateOne).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ planHash: null }),
      expect.objectContaining({
        $set: expect.objectContaining({ stage: 'writing', stageFailureCount: 0, error: null }),
      }),
    );
    vi.mocked(collection.findOne).mockResolvedValueOnce(record({
      status: 'running', leaseToken: 'lease_1', plan: masterPlan, planHash,
    }));
    await expect(store.savePlan('longscript_123', 'lease_1', structuredClone(masterPlan), NOW))
      .resolves.toBeUndefined();

    vi.mocked(collection.findOne).mockResolvedValueOnce(record({
      status: 'running', leaseToken: 'lease_1', plan: masterPlan, planHash: 'different',
    }));
    await expect(store.savePlan('longscript_123', 'lease_1', masterPlan, NOW))
      .rejects.toBeInstanceOf(LongFormScriptJobCheckpointConflictError);
  });

  it('does not assemble or complete before all durable prerequisites exist', async () => {
    const masterPlan = plan();
    const collection = collectionMock();
    vi.mocked(collection.findOne)
      .mockResolvedValueOnce(record({
        status: 'running', leaseToken: 'lease_1', plan: masterPlan, planHash: hashLongFormScriptJobValue(masterPlan),
      }))
      .mockResolvedValueOnce(record({
        status: 'running', leaseToken: 'lease_1', plan: masterPlan, planHash: hashLongFormScriptJobValue(masterPlan),
      }));
    const store = new LongFormScriptGenerationJobStore(async () => collection);
    const invalidResult = {} as never;

    await expect(store.saveAssembledResult('longscript_123', 'lease_1', invalidResult, NOW)).rejects.toThrow();
    await expect(store.complete('longscript_123', 'lease_1', NOW))
      .rejects.toBeInstanceOf(LongFormScriptJobTransitionError);
  });

  it('binds the commit receipt to the exact assembled document content', async () => {
    const collection = collectionMock();
    vi.mocked(collection.findOne).mockResolvedValue(record({
      status: 'running',
      stage: 'committing',
      leaseToken: 'lease_1',
      assembledResult: { content: 'durable script' } as never,
      assembledResultHash: SHA,
    }));
    const store = new LongFormScriptGenerationJobStore(async () => collection);

    await expect(store.saveCommitReceipt('longscript_123', 'lease_1', {
      documentVersion: 4,
      contentHash: hashScriptDocumentContent('different script'),
      committedAt: NOW.toISOString(),
    }, NOW)).rejects.toThrow(/does not match the assembled script/);
    expect(collection.updateOne).not.toHaveBeenCalled();
  });

  it('resets stage failures after progress and keeps the next semantic action queued', async () => {
    const masterPlan = plan();
    const collection = collectionMock();
    vi.mocked(collection.findOne).mockResolvedValue(record({
      status: 'running',
      stage: 'writing',
      stageFailureCount: 2,
      leaseToken: 'lease_1',
      plan: masterPlan,
      planHash: hashLongFormScriptJobValue(masterPlan),
    }));
    vi.mocked(collection.updateOne).mockResolvedValue(successfulUpdate());
    const store = new LongFormScriptGenerationJobStore(async () => collection);

    await store.yieldLease('longscript_123', 'lease_1', NOW);

    expect(collection.updateOne).toHaveBeenCalledWith(
      { _id: 'longscript_123', status: 'running', leaseToken: 'lease_1' },
      expect.objectContaining({
        $set: expect.objectContaining({ status: 'queued', stage: 'writing', stageFailureCount: 0 }),
        $unset: { leaseToken: '' },
      }),
    );
  });

  it('dead-letters repeated same-stage failure even after many successful dispatches', async () => {
    const collection = collectionMock();
    vi.mocked(collection.findOne).mockResolvedValue(record({
      status: 'running',
      stage: 'assembling',
      dispatchCount: 25,
      stageFailureCount: 2,
      leaseToken: 'lease_1',
    }));
    vi.mocked(collection.updateOne).mockResolvedValue(successfulUpdate());
    const store = new LongFormScriptGenerationJobStore(async () => collection);

    const status = await store.retryOrDeadLetter(
      'longscript_123',
      'lease_1',
      new Error('assembly unavailable'),
      true,
      NOW,
    );

    expect(status).toBe('dead_letter');
    expect(collection.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ stageFailureCount: 2 }),
      expect.objectContaining({
        $set: expect.objectContaining({ status: 'dead_letter', stageFailureCount: 3 }),
        $unset: { activeDedupeKey: '', leaseToken: '' },
      }),
    );
  });

  it('completes only from a durable assembly and commit receipt', async () => {
    const masterPlan = plan();
    const collection = collectionMock();
    vi.mocked(collection.findOne).mockResolvedValue(record({
      status: 'running',
      stage: 'committing',
      leaseToken: 'lease_1',
      plan: masterPlan,
      planHash: hashLongFormScriptJobValue(masterPlan),
      chapterArtifacts: { chapter_one: {} as never },
      assembledResult: { content: 'durable' } as never,
      assembledResultHash: SHA,
      commitReceipt: {
        documentVersion: 4,
        contentHash: hashScriptDocumentContent('durable'),
        committedAt: NOW.toISOString(),
      },
    }));
    vi.mocked(collection.updateOne).mockResolvedValue(successfulUpdate());
    const store = new LongFormScriptGenerationJobStore(async () => collection);

    await store.complete('longscript_123', 'lease_1', NOW);

    expect(collection.updateOne).toHaveBeenCalledWith(
      { _id: 'longscript_123', status: 'running', leaseToken: 'lease_1', commitReceipt: { $ne: null } },
      expect.objectContaining({
        $set: expect.objectContaining({ status: 'completed' }),
        $unset: { activeDedupeKey: '', leaseToken: '' },
      }),
    );
  });
});
