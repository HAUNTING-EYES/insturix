import { describe, expect, it, vi } from 'vitest';

import { createNativeMediaFinalRenderExecutionBudgetPolicyV1 }
  from '@/lib/editron/services/native-media-final-render-execution-budget-policy-v1';
import { createNativeMediaFinalRenderExecutionBudgetAuthorizationV1 }
  from '@/lib/editron/services/native-media-final-render-execution-budget-reservation-v1';
import { createNativeMediaFinalRenderExecutionBudgetLedgerOwnerV1 }
  from '@/lib/editron/services/native-media-final-render-execution-budget-ledger-owner-v1';
import type { NativeMediaFinalRenderExecutionBudgetLedgerRecordV1 }
  from '@/lib/editron/services/native-media-final-render-execution-budget-ledger-record-v1';

const HASH = (character: string) => character.repeat(64);

describe('native final-render execution-budget transactional ledger owner v1', () => {
  it('reserves deterministically and replays without a second insert', async () => {
    const fixture = build();
    const first = await fixture.owner.reserve(fixture.authorization);
    const second = await fixture.owner.reserve(fixture.authorization);
    expect(second).toEqual(first);
    expect(first.reservationId).toBe(
      `nmfrb_${fixture.authorization.authorizationSha256}`,
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
      bindingSha256: HASH('9'),
    })).rejects.toThrow('LEDGER_RESERVATION_BINDING_MISMATCH');
  });

  it('atomically settles once and idempotently returns an identical replay', async () => {
    const fixture = build();
    const reservation = await fixture.owner.reserve(fixture.authorization);
    const request = settlementRequest(reservation);
    const first = await fixture.owner.settle(request);
    const second = await fixture.owner.settle(request);
    expect(second).toEqual(first);
    expect(first).toMatchObject({ settledNanoUsd: '450', releasedNanoUsd: '300' });
    expect(fixture.replace).toHaveBeenCalledTimes(1);
    expect(fixture.records.get(reservation.reservationId)).toMatchObject({
      status: 'SETTLED', recordVersion: 2,
    });
  });

  it('rejects a conflicting terminal redelivery without replacing state', async () => {
    const fixture = build();
    const reservation = await fixture.owner.reserve(fixture.authorization);
    await fixture.owner.settle(settlementRequest(reservation));
    await expect(fixture.owner.settle({
      ...settlementRequest(reservation),
      usage: {
        encodedFrameAttempts: '100',
        artifactBytesWritten: '500', artifactBytesVerified: '500',
      },
    })).rejects.toThrow('LEDGER_SETTLEMENT_CONFLICT');
    expect(fixture.replace).toHaveBeenCalledTimes(1);
  });

  it('fails before insertion when the exact Finance policy is absent', async () => {
    const fixture = build();
    fixture.policyResolve.mockRejectedValueOnce(new Error('POLICY_NOT_FOUND'));
    await expect(fixture.owner.reserve(fixture.authorization)).rejects.toThrow(
      'POLICY_NOT_FOUND',
    );
    expect(fixture.insert).not.toHaveBeenCalled();
  });

  it('rejects corrupted stored state and a lost compare-and-set', async () => {
    const fixture = build();
    const reservation = await fixture.owner.reserve(fixture.authorization);
    const stored = fixture.records.get(reservation.reservationId)!;
    fixture.records.set(reservation.reservationId, {
      ...stored, recordSha256: HASH('9'),
    } as never);
    await expect(fixture.owner.resolve({
      reservationId: reservation.reservationId,
      bindingSha256: reservation.reservationSha256,
    })).rejects.toThrow('LEDGER_RECORD_INVALID');

    fixture.records.set(reservation.reservationId, stored);
    fixture.loseCas = true;
    await expect(fixture.owner.settle(settlementRequest(reservation))).rejects.toThrow(
      'TEST_LEDGER_CAS_LOST',
    );
    expect(fixture.records.get(reservation.reservationId)).toEqual(stored);
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
  const records = new Map<string, NativeMediaFinalRenderExecutionBudgetLedgerRecordV1>();
  const insert = vi.fn(async (record: NativeMediaFinalRenderExecutionBudgetLedgerRecordV1) => {
    if (records.has(record.reservationId)) throw new Error('TEST_LEDGER_DUPLICATE');
    records.set(record.reservationId, record);
  });
  let loseCas = false;
  const replace = vi.fn(async ({ expectedRecordSha256, record }: {
    expectedRecordSha256: string;
    record: NativeMediaFinalRenderExecutionBudgetLedgerRecordV1;
  }) => {
    if (loseCas || records.get(record.reservationId)?.recordSha256
      !== expectedRecordSha256) throw new Error('TEST_LEDGER_CAS_LOST');
    records.set(record.reservationId, record);
  });
  const transaction = { get: async (id: string) => records.get(id) ?? null, insert, replace };
  const policyResolve = vi.fn(async () => policy);
  const fixture = {
    policy, authorization, records, insert, replace, policyResolve,
    get loseCas() { return loseCas; },
    set loseCas(value: boolean) { loseCas = value; },
    owner: createNativeMediaFinalRenderExecutionBudgetLedgerOwnerV1({
      ledger: {
        transact: async <T>(operation: (tx: typeof transaction) => Promise<T>) => (
          operation(transaction)
        ),
        get: async (id) => records.get(id) ?? null,
      },
      policyLocator: { resolve: policyResolve },
      now: () => '2026-08-30T00:10:00.000Z',
    }),
  };
  return fixture;
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
