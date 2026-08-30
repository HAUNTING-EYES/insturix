import { describe, expect, it, vi } from 'vitest';

import { createMediaProxyMasterTranscodeExecutionBudgetLedgerOwnerV1 }
  from '@/lib/editron/services/media-proxy-master-transcode-execution-budget-ledger-owner-v1';
import {
  createMediaProxyMasterTranscodeExecutionBudgetMongoLedgerV1,
  type MediaProxyMasterTranscodeExecutionBudgetMongoCollectionV1,
  type MediaProxyMasterTranscodeExecutionBudgetMongoSessionV1,
} from '@/lib/editron/services/media-proxy-master-transcode-execution-budget-mongo-ledger-v1';
import {
  buildMediaProxyMasterTranscodeBudgetFixtureV1,
  mediaProxyMasterBudgetHashV1,
} from './helpers/media-proxy-master-transcode-budget-fixture';

type MongoRecord = Record<string, unknown>;

describe('proxy transcode execution-budget Mongo ledger v1', () => {
  it('persists reserve and settlement in majority snapshot transactions', async () => {
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
      status: 'SETTLED',
      recordVersion: 2,
    });
    expect(fixture.createIndex).toHaveBeenCalledTimes(2);
    expect(fixture.loadRuntime).toHaveBeenCalledTimes(1);
    expect(fixture.sessions).toHaveLength(3);
    for (const session of fixture.sessions) {
      expect(session.options).toEqual([{
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
        readPreference: 'primary',
      }]);
      expect(session.endSessionCalls).toBe(1);
    }
  });

  it('accepts identical insert-or-compare redelivery', async () => {
    const fixture = build();
    const reservation = await fixture.owner.reserve(fixture.authorization);
    const stored = fixture.documents.get(reservation.reservationId)!;

    await expect(fixture.ledger.transact(async (transaction) => {
      await transaction.insert(stored.record as never);
    })).resolves.toBeUndefined();
    expect(fixture.documents.get(reservation.reservationId)).toEqual(stored);
  });

  it('rejects stale settlement CAS and preserves reserved state', async () => {
    const fixture = build();
    const reservation = await fixture.owner.reserve(fixture.authorization);
    fixture.loseCas = true;

    await expect(fixture.owner.settle(settlementRequest(reservation)))
      .rejects.toThrow('COMPARE_AND_SET_LOST');
    expect(fixture.documents.get(reservation.reservationId)).toMatchObject({
      status: 'RESERVED',
      recordVersion: 1,
    });
    expect(fixture.sessions.at(-1)?.endSessionCalls).toBe(1);
  });

  it('rejects corrupt persisted envelope before returning state', async () => {
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
    const ledger =
      createMediaProxyMasterTranscodeExecutionBudgetMongoLedgerV1({
        loadRuntime: async () => ({
          ledger: emptyCollection(),
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
  const budget = buildMediaProxyMasterTranscodeBudgetFixtureV1();
  const documents = new Map<string, MongoRecord>();
  const createIndex = vi.fn(async (
    _keys: unknown,
    options: { name: string },
  ) => options.name);
  let loseCas = false;
  const collection:
    MediaProxyMasterTranscodeExecutionBudgetMongoCollectionV1 = {
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
        if (loseCas || !current || !matches(current, filter)) {
          return { matchedCount: 0 };
        }
        documents.set(id, { ...replacement });
        return { matchedCount: 1 };
      },
    };
  const sessions: Array<{ options: unknown[]; endSessionCalls: number }> = [];
  const loadRuntime = vi.fn(async () => ({
    ledger: collection,
    startSession: async (): Promise<
      MediaProxyMasterTranscodeExecutionBudgetMongoSessionV1
    > => {
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
  const ledger =
    createMediaProxyMasterTranscodeExecutionBudgetMongoLedgerV1({
      loadRuntime,
    });
  const owner = createMediaProxyMasterTranscodeExecutionBudgetLedgerOwnerV1({
    ledger,
    policyLocator: { resolve: async () => budget.policy },
    now: () => '2026-08-30T00:10:00.000Z',
  });
  return {
    ...budget,
    documents,
    createIndex,
    sessions,
    loadRuntime,
    ledger,
    owner,
    get loseCas() { return loseCas; },
    set loseCas(value: boolean) { loseCas = value; },
  };
}

function emptyCollection():
  MediaProxyMasterTranscodeExecutionBudgetMongoCollectionV1 {
  return {
    createIndex: async (_keys, options) => options.name,
    findOne: async () => null,
    findOneAndUpdate: async () => null,
    replaceOne: async () => ({ matchedCount: 0 }),
  };
}

function matches(
  document: MongoRecord,
  filter: Readonly<MongoRecord>,
): boolean {
  return Object.entries(filter).every(([key, value]) => document[key] === value);
}

function settlementRequest(reservation: Readonly<{
  reservationId: string;
  reservationSha256: string;
}>) {
  return {
    reservationId: reservation.reservationId,
    bindingSha256: reservation.reservationSha256,
    mode: 'METERED_TRUSTED_TRANSCODE' as const,
    terminalEvidence: {
      jobId: 'dwj_proxy_1',
      jobStatus: 'completed' as const,
      terminalDisposition: 'PASS' as const,
      attemptCount: 1,
      terminalArtifactSha256:
        mediaProxyMasterBudgetHashV1('terminal-artifact'),
    },
    usage: {
      sourceBytesRead: '100000',
      encodedFrameAttempts: '300',
      processMilliseconds: '1000',
      artifactBytesWritten: '100000',
      artifactBytesVerified: '100000',
    },
  };
}
