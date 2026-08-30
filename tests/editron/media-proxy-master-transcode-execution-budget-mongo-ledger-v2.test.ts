import { describe, expect, it, vi } from 'vitest';

import { hashEditronCanonicalJsonV1 }
  from '@/lib/editron/services/canonical-json-v1';
import { createMediaProxyMasterTranscodeExecutionBudgetReservedRecordV1 }
  from '@/lib/editron/services/media-proxy-master-transcode-execution-budget-ledger-record-v1';
import { createMediaProxyMasterTranscodeExecutionBudgetLedgerOwnerV2 }
  from '@/lib/editron/services/media-proxy-master-transcode-execution-budget-ledger-owner-v2';
import {
  createMediaProxyMasterTranscodeExecutionBudgetMongoLedgerV2,
  type MediaProxyMasterTranscodeExecutionBudgetMongoCollectionV2,
  type MediaProxyMasterTranscodeExecutionBudgetMongoSessionV2,
} from '@/lib/editron/services/media-proxy-master-transcode-execution-budget-mongo-ledger-v2';
import { buildMediaProxyMasterTranscodeBudgetFixtureV1 }
  from './helpers/media-proxy-master-transcode-budget-fixture';
import { buildMediaProxyMasterTranscodeV2Fixture }
  from './helpers/media-proxy-master-transcode-v2-fixture';

type MongoRecord = Record<string, unknown>;

describe('proxy transcode execution-budget Mongo ledger V2', () => {
  it('persists reserve and settlement in majority snapshot transactions', async () => {
    const fixture = build();
    const reservation = await fixture.owner.reserve(
      fixture.budgetAuthorization,
    );
    const replay = await fixture.owner.reserve(fixture.budgetAuthorization);
    expect(replay).toEqual(reservation);

    await expect(fixture.owner.resolve({
      reservationId: reservation.reservationId,
      bindingSha256: reservation.reservationSha256,
    })).resolves.toMatchObject({ record: { status: 'RESERVED' } });

    await fixture.owner.settle(settlementRequest(fixture, reservation));
    expect(fixture.documents.get(reservation.reservationId)).toMatchObject({
      status: 'SETTLED',
      recordVersion: 2,
      version: 'EDITRON_MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_LEDGER_RECORD_V2',
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
    const reservation = await fixture.owner.reserve(
      fixture.budgetAuthorization,
    );
    const stored = fixture.documents.get(reservation.reservationId)!;

    await expect(fixture.ledger.transact(async (transaction) => {
      await transaction.insert(stored.record as never);
    })).resolves.toBeUndefined();
    expect(fixture.documents.get(reservation.reservationId)).toEqual(stored);
  });

  it('rejects stale settlement CAS and preserves reserved state', async () => {
    const fixture = build();
    const reservation = await fixture.owner.reserve(
      fixture.budgetAuthorization,
    );
    fixture.loseCas = true;

    await expect(fixture.owner.settle(
      settlementRequest(fixture, reservation),
    )).rejects.toThrow('COMPARE_AND_SET_LOST');
    expect(fixture.documents.get(reservation.reservationId)).toMatchObject({
      status: 'RESERVED',
      recordVersion: 1,
    });
    expect(fixture.sessions.at(-1)?.endSessionCalls).toBe(1);
  });

  it('rejects corrupt or extended persisted envelopes', async () => {
    const fixture = build();
    const reservation = await fixture.owner.reserve(
      fixture.budgetAuthorization,
    );
    const stored = fixture.documents.get(reservation.reservationId)!;
    fixture.documents.set(reservation.reservationId, {
      ...stored,
      unowned: true,
    });

    await expect(fixture.ledger.get(reservation.reservationId))
      .rejects.toThrow('STORED_ENVELOPE_INVALID');
  });

  it('rejects a V1 ledger record at the V2 storage fence', async () => {
    const fixture = build();
    const legacy = buildMediaProxyMasterTranscodeBudgetFixtureV1();
    const legacyRecord =
      createMediaProxyMasterTranscodeExecutionBudgetReservedRecordV1(
        legacy.policy,
        legacy.authorization,
        legacy.reservation,
      );

    await expect(fixture.ledger.transact(async (transaction) => {
      await transaction.insert(legacyRecord as never);
    })).rejects.toThrow('V2_MONGO_LEDGER_RECORD_INVALID');
  });

  it('fails an uncommitted transaction and always ends its session', async () => {
    const endSession = vi.fn(async () => undefined);
    const withTransaction = vi.fn(async () => undefined);
    const ledger =
      createMediaProxyMasterTranscodeExecutionBudgetMongoLedgerV2({
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
  const budget = buildMediaProxyMasterTranscodeV2Fixture();
  const documents = new Map<string, MongoRecord>();
  const createIndex = vi.fn(async (
    _keys: unknown,
    options: { name: string },
  ) => options.name);
  let loseCas = false;
  const collection:
    MediaProxyMasterTranscodeExecutionBudgetMongoCollectionV2 = {
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
      MediaProxyMasterTranscodeExecutionBudgetMongoSessionV2
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
    createMediaProxyMasterTranscodeExecutionBudgetMongoLedgerV2({
      loadRuntime,
    });
  const owner = createMediaProxyMasterTranscodeExecutionBudgetLedgerOwnerV2({
    ledger,
    policyLocator: { resolve: async () => budget.base.policy },
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
  MediaProxyMasterTranscodeExecutionBudgetMongoCollectionV2 {
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

function settlementRequest(
  fixture: ReturnType<typeof buildMediaProxyMasterTranscodeV2Fixture>,
  reservation: Readonly<{
    reservationId: string;
    reservationSha256: string;
  }>,
) {
  const artifact = BigInt(fixture.preparedArtifactReference.artifactByteLength);
  const manifest = BigInt(fixture.preparedArtifactReference.manifestByteLength);
  return {
    reservationId: reservation.reservationId,
    bindingSha256: reservation.reservationSha256,
    mode: 'METERED_TRUSTED_TRANSCODE' as const,
    terminalEvidence: {
      jobId: fixture.job.jobId,
      jobStatus: 'completed' as const,
      terminalDisposition: 'PASS' as const,
      attemptCount: 1,
      terminalArtifactSha256: hashEditronCanonicalJsonV1({
        jobId: fixture.job.jobId,
        status: 'PASS',
      }),
    },
    usage: {
      sourceBytesRead: String(
        fixture.contract.payload.command.masterSourceVersion.byteLength,
      ),
      encodedFrameAttempts:
        fixture.contract.payload.command.masterTimeMap.totalFrameCount,
      processMilliseconds: '60000',
      artifactBytesWritten: (
        artifact * BigInt(2) + manifest
      ).toString(),
      artifactBytesVerified: (
        artifact * BigInt(3) + manifest * BigInt(2)
      ).toString(),
    },
  };
}
