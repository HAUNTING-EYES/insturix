import { describe, expect, it, vi } from 'vitest';

import { createMediaProxyMasterTranscodeExecutionBudgetLedgerOwnerV1 }
  from '@/lib/editron/services/media-proxy-master-transcode-execution-budget-ledger-owner-v1';
import type { MediaProxyMasterTranscodeExecutionBudgetLedgerRecordV1 }
  from '@/lib/editron/services/media-proxy-master-transcode-execution-budget-ledger-record-v1';
import {
  buildMediaProxyMasterTranscodeBudgetFixtureV1,
  mediaProxyMasterBudgetHashV1,
} from './helpers/media-proxy-master-transcode-budget-fixture';

describe('proxy transcode execution-budget transactional ledger owner v1', () => {
  it('reserves deterministically and replays without another insert', async () => {
    const fixture = build();
    const first = await fixture.owner.reserve(fixture.authorization);
    const second = await fixture.owner.reserve(fixture.authorization);
    expect(second).toEqual(first);
    expect(first.reservationId).toBe(
      `mpmtb_${fixture.authorization.authorizationSha256}`,
    );
    expect(fixture.insert).toHaveBeenCalledTimes(1);
    expect(fixture.policyResolve).toHaveBeenCalledTimes(2);
  });

  it('resolves only the exact durable reservation binding', async () => {
    const fixture = build();
    const reservation = await fixture.owner.reserve(fixture.authorization);
    await expect(fixture.owner.resolve({
      reservationId: reservation.reservationId,
      bindingSha256: reservation.reservationSha256,
    })).resolves.toMatchObject({
      record: { status: 'RESERVED', reservationId: reservation.reservationId },
    });
    await expect(fixture.owner.resolve({
      reservationId: reservation.reservationId,
      bindingSha256: mediaProxyMasterBudgetHashV1('wrong-binding'),
    })).rejects.toThrow('LEDGER_RESERVATION_BINDING_MISMATCH');
  });

  it('atomically settles once and returns an identical replay', async () => {
    const fixture = build();
    const reservation = await fixture.owner.reserve(fixture.authorization);
    const request = settlementRequest(reservation);
    const first = await fixture.owner.settle(request);
    const second = await fixture.owner.settle(request);
    expect(second).toEqual(first);
    expect(first).toMatchObject({
      settledNanoUsd: '6301',
      releasedNanoUsd: '896219',
    });
    expect(fixture.replace).toHaveBeenCalledTimes(1);
    expect(fixture.records.get(reservation.reservationId)).toMatchObject({
      status: 'SETTLED',
      recordVersion: 2,
    });
  });

  it('rejects conflicting terminal redelivery without replacing state', async () => {
    const fixture = build();
    const reservation = await fixture.owner.reserve(fixture.authorization);
    await fixture.owner.settle(settlementRequest(reservation));
    await expect(fixture.owner.settle({
      ...settlementRequest(reservation),
      usage: { ...usage(), processMilliseconds: '2000' },
    })).rejects.toThrow('LEDGER_SETTLEMENT_CONFLICT');
    expect(fixture.replace).toHaveBeenCalledTimes(1);
  });

  it('fails before insertion when the historical Finance policy is absent', async () => {
    const fixture = build();
    fixture.policyResolve.mockRejectedValueOnce(new Error('POLICY_NOT_FOUND'));
    await expect(fixture.owner.reserve(fixture.authorization)).rejects.toThrow(
      'POLICY_NOT_FOUND',
    );
    expect(fixture.insert).not.toHaveBeenCalled();
  });

  it('rejects corrupt stored state and a lost compare-and-set', async () => {
    const fixture = build();
    const reservation = await fixture.owner.reserve(fixture.authorization);
    const stored = fixture.records.get(reservation.reservationId)!;
    fixture.records.set(reservation.reservationId, {
      ...stored,
      recordSha256: mediaProxyMasterBudgetHashV1('forged-record'),
    } as never);
    await expect(fixture.owner.resolve({
      reservationId: reservation.reservationId,
      bindingSha256: reservation.reservationSha256,
    })).rejects.toThrow('LEDGER_RECORD_INVALID');

    fixture.records.set(reservation.reservationId, stored);
    fixture.loseCas = true;
    await expect(
      fixture.owner.settle(settlementRequest(reservation)),
    ).rejects.toThrow('TEST_LEDGER_CAS_LOST');
    expect(fixture.records.get(reservation.reservationId)).toEqual(stored);
  });
});

function build() {
  const budget = buildMediaProxyMasterTranscodeBudgetFixtureV1();
  const records = new Map<
    string,
    MediaProxyMasterTranscodeExecutionBudgetLedgerRecordV1
  >();
  const insert = vi.fn(async (
    record: MediaProxyMasterTranscodeExecutionBudgetLedgerRecordV1,
  ) => {
    if (records.has(record.reservationId)) {
      throw new Error('TEST_LEDGER_DUPLICATE');
    }
    records.set(record.reservationId, record);
  });
  let loseCas = false;
  const replace = vi.fn(async ({ expectedRecordSha256, record }: {
    expectedRecordSha256: string;
    record: MediaProxyMasterTranscodeExecutionBudgetLedgerRecordV1;
  }) => {
    if (loseCas || records.get(record.reservationId)?.recordSha256
      !== expectedRecordSha256) {
      throw new Error('TEST_LEDGER_CAS_LOST');
    }
    records.set(record.reservationId, record);
  });
  const transaction = {
    get: async (id: string) => records.get(id) ?? null,
    insert,
    replace,
  };
  const policyResolve = vi.fn(async () => budget.policy);
  return {
    ...budget,
    records,
    insert,
    replace,
    policyResolve,
    get loseCas() { return loseCas; },
    set loseCas(value: boolean) { loseCas = value; },
    owner: createMediaProxyMasterTranscodeExecutionBudgetLedgerOwnerV1({
      ledger: {
        transact: async <T>(
          operation: (tx: typeof transaction) => Promise<T>,
        ) => operation(transaction),
        get: async (id) => records.get(id) ?? null,
      },
      policyLocator: { resolve: policyResolve },
      now: () => '2026-08-30T00:10:00.000Z',
    }),
  };
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
    usage: usage(),
  };
}

function usage() {
  return {
    sourceBytesRead: '100000',
    encodedFrameAttempts: '300',
    processMilliseconds: '1000',
    artifactBytesWritten: '100000',
    artifactBytesVerified: '100000',
  };
}
