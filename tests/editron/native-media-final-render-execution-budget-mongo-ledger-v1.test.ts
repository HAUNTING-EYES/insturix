import { describe, expect, it, vi } from 'vitest';

import {
  createNativeMediaFinalRenderExecutionBudgetMongoLedgerV1,
  type NativeMediaFinalRenderExecutionBudgetMongoCollectionV1,
  type NativeMediaFinalRenderExecutionBudgetMongoSessionV1,
} from '@/lib/editron/services/native-media-final-render-execution-budget-mongo-ledger-v1';
import { createNativeMediaFinalRenderExecutionBudgetLedgerOwnerV1 }
  from '@/lib/editron/services/native-media-final-render-execution-budget-ledger-owner-v1';
import { createNativeMediaFinalRenderExecutionBudgetPolicyV1 }
  from '@/lib/editron/services/native-media-final-render-execution-budget-policy-v1';
import { createNativeMediaFinalRenderExecutionBudgetAuthorizationV1 }
  from '@/lib/editron/services/native-media-final-render-execution-budget-reservation-v1';

const HASH = (character: string) => character.repeat(64);
type MongoRecord = Record<string, unknown>;

describe('native final-render execution-budget Mongo ledger v1', () => {
  it('persists reserve and settlement through majority snapshot transactions', async () => {
    const fixture = build();
    const reservation = await fixture.owner.reserve(fixture.authorization);
    const replay = await fixture.owner.reserve(fixture.authorization);
    expect(replay).toEqual(reservation);

    await expect(fixture.owner.resolve({
      reservationId: reservation.reservationId,
      bindingSha256: reservation.reservationSha256,
    })).resolves.toMatchObject({ record: { status: 'RESERVED' } });

    await fixture.owner.settle(settlementRequest(reservation));
    expect(fixture.documents.get(reservation.reservationId)).toMatchObject({
      status: 'SETTLED', recordVersion: 2,
    });
    expect(fixture.createIndex).toHaveBeenCalledTimes(2);
    expect(fixture.loadRuntime).toHaveBeenCalledTimes(1);
    expect(fixture.sessions).toHaveLength(3);
    for (const session of fixture.sessions) {
      expect(session.options).toEqual([
        {
          readConcern: { level: 'snapshot' },
          writeConcern: { w: 'majority' },
          readPreference: 'primary',
        },
      ]);
      expect(session.endSessionCalls).toBe(1);
    }
  });

  it('accepts an identical insert-or-compare redelivery', async () => {
    const fixture = build();
    const reservation = await fixture.owner.reserve(fixture.authorization);
    const stored = fixture.documents.get(reservation.reservationId)!;

    await expect(fixture.ledger.transact(async (transaction) => {
      await transaction.insert(stored.record as never);
    })).resolves.toBeUndefined();
    expect(fixture.documents.get(reservation.reservationId)).toEqual(stored);
  });

  it('rejects a stale settlement compare-and-set and preserves reserved state', async () => {
    const fixture = build();
    const reservation = await fixture.owner.reserve(fixture.authorization);
    fixture.loseCas = true;

    await expect(fixture.owner.settle(settlementRequest(reservation)))
      .rejects.toThrow('COMPARE_AND_SET_LOST');
    expect(fixture.documents.get(reservation.reservationId)).toMatchObject({
      status: 'RESERVED', recordVersion: 1,
    });
    expect(fixture.sessions.at(-1)?.endSessionCalls).toBe(1);
  });

  it('rejects a corrupt persisted envelope before returning domain state', async () => {
    const fixture = build();
    const reservation = await fixture.owner.reserve(fixture.authorization);
    const stored = fixture.documents.get(reservation.reservationId)!;
    fixture.documents.set(reservation.reservationId, {
      ...stored,
      updatedAt: new Date('2026-08-30T00:11:00.000Z'),
    });

    await expect(fixture.ledger.get(reservation.reservationId))
      .rejects.toThrow('STORED_ENVELOPE_INVALID');
  });

  it('fails an uncommitted transaction and always ends its session', async () => {
    const endSession = vi.fn(async () => undefined);
    const withTransaction = vi.fn(async () => undefined);
    const collection = emptyCollection();
    const ledger = createNativeMediaFinalRenderExecutionBudgetMongoLedgerV1({
      loadRuntime: async () => ({
        ledger: collection,
        startSession: async () => ({
          driverSession: {}, withTransaction, endSession,
        }),
      }),
    });

    await expect(ledger.transact(async () => 'not-run'))
      .rejects.toThrow('TRANSACTION_NOT_COMMITTED');
    expect(endSession).toHaveBeenCalledTimes(1);
  });
});

function build() {
  const policy = createNativeMediaFinalRenderExecutionBudgetPolicyV1({
    ownerVersion: 'finance-render-v1',
    effectiveAt: '2026-08-30T00:00:00.000Z',
    expiresAt: '2026-09-01T00:00:00.000Z',
    encodedFrameAttempt: { nanoUsdNumerator: '3', unitsDenominator: '2' },
    artifactByteWritten: { nanoUsdNumerator: '1', unitsDenominator: '10' },
    artifactByteVerified: { nanoUsdNumerator: '2', unitsDenominator: '10' },
  });
  const authorization = createNativeMediaFinalRenderExecutionBudgetAuthorizationV1({
    policy,
    scope: {
      tenantId: 'tenant-a', userId: 'user-a', orgId: null,
      projectId: 'project-a', sequenceId: 'main',
      projectRevisionSha256: HASH('1'), admissionReceiptSha256: HASH('2'),
      exactSourceRequestSha256: HASH('3'),
    },
    maximumUsage: {
      encodedFrameAttempts: '300', artifactBytesWritten: '1000',
      artifactBytesVerified: '1000',
    },
    approvedBy: 'finance-admin', approvedAt: '2026-08-30T00:05:00.000Z',
    expiresAt: '2026-08-30T01:00:00.000Z',
  });
  const documents = new Map<string, MongoRecord>();
  const createIndex = vi.fn(async (_keys, options: { name: string }) => options.name);
  let loseCas = false;
  const collection: NativeMediaFinalRenderExecutionBudgetMongoCollectionV1 = {
    createIndex,
    findOne: async (filter) => {
      const stored = documents.get(String(filter._id));
      return stored && matches(stored, filter) ? stored : null;
    },
    findOneAndUpdate: async (filter, update) => {
      const id = String(filter._id);
      const existing = documents.get(id);
      if (existing) return existing;
      const inserted = { _id: id, ...update.$setOnInsert };
      documents.set(id, inserted);
      return inserted;
    },
    replaceOne: async (filter, replacement) => {
      const id = String(filter._id);
      const current = documents.get(id);
      if (loseCas || !current || !matches(current, filter)) return { matchedCount: 0 };
      documents.set(id, { ...replacement });
      return { matchedCount: 1 };
    },
  };
  const sessions: Array<{
    options: unknown[];
    endSessionCalls: number;
  }> = [];
  const loadRuntime = vi.fn(async () => ({
    ledger: collection,
    startSession: async (): Promise<NativeMediaFinalRenderExecutionBudgetMongoSessionV1> => {
      const options: unknown[] = [];
      const probe = { options, endSessionCalls: 0 };
      const withTransaction = async <T>(
        operation: () => Promise<T>,
        transactionOptions: unknown,
      ) => {
        options.push(transactionOptions);
        return operation();
      };
      const endSession = async () => { probe.endSessionCalls += 1; };
      sessions.push(probe);
      return { driverSession: {}, withTransaction, endSession };
    },
  }));
  const ledger = createNativeMediaFinalRenderExecutionBudgetMongoLedgerV1({ loadRuntime });
  const owner = createNativeMediaFinalRenderExecutionBudgetLedgerOwnerV1({
    ledger,
    policyLocator: { resolve: async () => policy },
    now: () => '2026-08-30T00:10:00.000Z',
  });
  return {
    policy, authorization, documents, createIndex, sessions, loadRuntime, ledger, owner,
    get loseCas() { return loseCas; },
    set loseCas(value: boolean) { loseCas = value; },
  };
}

function emptyCollection(): NativeMediaFinalRenderExecutionBudgetMongoCollectionV1 {
  return {
    createIndex: async (_keys, options) => options.name,
    findOne: async () => null,
    findOneAndUpdate: async () => null,
    replaceOne: async () => ({ matchedCount: 0 }),
  };
}

function matches(document: MongoRecord, filter: Readonly<MongoRecord>): boolean {
  return Object.entries(filter).every(([key, value]) => document[key] === value);
}

function settlementRequest(reservation: { reservationId: string; reservationSha256: string }) {
  return {
    reservationId: reservation.reservationId,
    bindingSha256: reservation.reservationSha256,
    mode: 'METERED_FINAL_ARTIFACT' as const,
    terminalEvidence: {
      jobId: 'dwj_exact_1', jobStatus: 'completed' as const,
      terminalDisposition: 'PASS' as const, attemptCount: 1,
      terminalArtifactSha256: HASH('8'),
    },
    usage: {
      encodedFrameAttempts: '200',
      artifactBytesWritten: '500', artifactBytesVerified: '500',
    },
  };
}
