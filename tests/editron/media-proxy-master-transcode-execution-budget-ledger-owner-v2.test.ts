import { describe, expect, it, vi } from 'vitest';

import { hashEditronCanonicalJsonV1 }
  from '@/lib/editron/services/canonical-json-v1';
import { createMediaProxyMasterTranscodeExecutionBudgetLedgerOwnerV2 }
  from '@/lib/editron/services/media-proxy-master-transcode-execution-budget-ledger-owner-v2';
import type { MediaProxyMasterTranscodeExecutionBudgetLedgerRecordV2 }
  from '@/lib/editron/services/media-proxy-master-transcode-execution-budget-ledger-record-v2';
import { buildMediaProxyMasterTranscodeV2Fixture }
  from './helpers/media-proxy-master-transcode-v2-fixture';

describe('proxy transcode execution-budget transactional ledger owner V2', () => {
  it('reserves deterministically and replays without another insert', async () => {
    const fixture = build();
    const first = await fixture.owner.reserve(fixture.budgetAuthorization);
    const second = await fixture.owner.reserve(fixture.budgetAuthorization);

    expect(second).toEqual(first);
    expect(first.reservationId).toBe(
      `mpmtb_${fixture.budgetAuthorization.authorizationSha256}`,
    );
    expect(fixture.insert).toHaveBeenCalledTimes(1);
    expect(fixture.policyResolve).toHaveBeenCalledTimes(2);
  });

  it('resolves only the exact durable V2 reservation binding', async () => {
    const fixture = build();
    const reservation = await fixture.owner.reserve(
      fixture.budgetAuthorization,
    );

    await expect(fixture.owner.resolve({
      reservationId: reservation.reservationId,
      bindingSha256: reservation.reservationSha256,
    })).resolves.toMatchObject({
      record: { status: 'RESERVED', reservationId: reservation.reservationId },
    });
    await expect(fixture.owner.resolve({
      reservationId: reservation.reservationId,
      bindingSha256: fixture.preparedEvidence.evidenceSha256,
    })).rejects.toThrow('LEDGER_RESERVATION_BINDING_MISMATCH');
  });

  it('atomically settles once and returns an identical replay', async () => {
    const fixture = build();
    const reservation = await fixture.owner.reserve(
      fixture.budgetAuthorization,
    );
    const request = settlementRequest(fixture, reservation);
    const first = await fixture.owner.settle(request);
    const second = await fixture.owner.settle(request);

    expect(second).toEqual(first);
    expect(
      BigInt(first.settledNanoUsd) + BigInt(first.releasedNanoUsd),
    ).toBe(BigInt(fixture.budgetAuthorization.maximumCostNanoUsd));
    expect(first.artifactAccountingProfileSha256).toBe(
      fixture.budgetAuthorization.scope.artifactAccountingProfileSha256,
    );
    expect(fixture.replace).toHaveBeenCalledTimes(1);
    expect(fixture.records.get(reservation.reservationId)).toMatchObject({
      status: 'SETTLED',
      recordVersion: 2,
    });
  });

  it('rejects conflicting terminal redelivery without replacing state', async () => {
    const fixture = build();
    const reservation = await fixture.owner.reserve(
      fixture.budgetAuthorization,
    );
    const request = settlementRequest(fixture, reservation);
    await fixture.owner.settle(request);

    await expect(fixture.owner.settle({
      ...request,
      usage: { ...request.usage!, processMilliseconds: '59000' },
    })).rejects.toThrow('LEDGER_SETTLEMENT_CONFLICT');
    expect(fixture.replace).toHaveBeenCalledTimes(1);
  });

  it('fails before insertion when the historical policy is absent', async () => {
    const fixture = build();
    fixture.policyResolve.mockRejectedValueOnce(new Error('POLICY_NOT_FOUND'));

    await expect(fixture.owner.reserve(
      fixture.budgetAuthorization,
    )).rejects.toThrow('POLICY_NOT_FOUND');
    expect(fixture.insert).not.toHaveBeenCalled();
  });

  it('rejects corrupt stored state and a lost compare-and-set', async () => {
    const fixture = build();
    const reservation = await fixture.owner.reserve(
      fixture.budgetAuthorization,
    );
    const stored = fixture.records.get(reservation.reservationId)!;
    fixture.records.set(reservation.reservationId, {
      ...stored,
      recordSha256: fixture.preparedEvidence.evidenceSha256,
    } as never);

    await expect(fixture.owner.resolve({
      reservationId: reservation.reservationId,
      bindingSha256: reservation.reservationSha256,
    })).rejects.toThrow('LEDGER_RECORD_INVALID');

    fixture.records.set(reservation.reservationId, stored);
    fixture.loseCas = true;
    await expect(fixture.owner.settle(
      settlementRequest(fixture, reservation),
    )).rejects.toThrow('TEST_LEDGER_CAS_LOST');
    expect(fixture.records.get(reservation.reservationId)).toEqual(stored);
  });
});

function build() {
  const budget = buildMediaProxyMasterTranscodeV2Fixture();
  const records = new Map<
    string,
    MediaProxyMasterTranscodeExecutionBudgetLedgerRecordV2
  >();
  const insert = vi.fn(async (
    record: MediaProxyMasterTranscodeExecutionBudgetLedgerRecordV2,
  ) => {
    if (records.has(record.reservationId)) {
      throw new Error('TEST_LEDGER_DUPLICATE');
    }
    records.set(record.reservationId, record);
  });
  let loseCas = false;
  const replace = vi.fn(async ({ expectedRecordSha256, record }: {
    expectedRecordSha256: string;
    record: MediaProxyMasterTranscodeExecutionBudgetLedgerRecordV2;
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
  const policyResolve = vi.fn(async () => budget.base.policy);
  return {
    ...budget,
    records,
    insert,
    replace,
    policyResolve,
    get loseCas() { return loseCas; },
    set loseCas(value: boolean) { loseCas = value; },
    owner: createMediaProxyMasterTranscodeExecutionBudgetLedgerOwnerV2({
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
