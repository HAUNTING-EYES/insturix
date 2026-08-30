import { describe, expect, it, vi } from 'vitest';

import { hashEditronCanonicalJsonV1 }
  from '@/lib/editron/services/canonical-json-v1';
import { MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_DELIVERY_POLICY_V1 }
  from '@/lib/editron/services/media-source-pts-cadence-version-evidence-backfill-dispatch-v1';
import {
  MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_CONTROLLER_ID_V2,
  recoverMediaSourcePtsCadenceVersionEvidenceBackfillSweepsV2,
  resolveMediaSourcePtsCadenceVersionEvidenceBackfillRecoveryConfigurationV2,
  type MediaSourcePtsCadenceVersionEvidenceBackfillRecoveryEnvironmentV2,
} from '@/lib/editron/services/media-source-pts-cadence-version-evidence-backfill-recovery-owner-v2';
import {
  claimMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepStateV1,
  createMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepStateV1,
  settleMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepStateV1,
} from '@/lib/editron/services/media-source-pts-cadence-version-evidence-backfill-recovery-sweep-state-v1';
import {
  assertMediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptV1,
  createMediaSourcePtsCadenceVersionEvidenceBackfillRecoveryControllerV1,
  selectMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepV1,
} from '@/lib/editron/services/media-source-pts-cadence-version-evidence-backfill-recovery-sweep-v1';
import {
  createMediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1,
} from '@/lib/editron/services/media-source-pts-cadence-version-evidence-backfill-run-record-v1';

const NOW = new Date('2026-08-30T20:00:00.000Z');
const ATTEMPTED_AT = new Date('2026-08-30T20:00:01.000Z');
const STALE_BEFORE = new Date('2026-08-30T19:50:00.000Z');
const CLAIM_TOKEN = 'recovery-owner-v2-claim';
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

describe('MediaSourcePtsCadenceVersionEvidenceBackfillRecoveryOwnerV2', () => {
  it('requires a complete bounded policy before any mutation owner runs', async () => {
    expect(() => resolveMediaSourcePtsCadenceVersionEvidenceBackfillRecoveryConfigurationV2({
      ...environment(),
      EDITRON_MEDIA_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_MAX_ATTEMPTS: undefined,
    })).toThrow('OWNER_V2_MAX_ATTEMPTS_CONFIG_INVALID');
    expect(() => resolveMediaSourcePtsCadenceVersionEvidenceBackfillRecoveryConfigurationV2({
      ...environment(),
      EDITRON_MEDIA_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_LEASE_MS: '59999',
    })).toThrow('OWNER_V2_LEASE_MS_INVALID');
    expect(() => resolveMediaSourcePtsCadenceVersionEvidenceBackfillRecoveryConfigurationV2({
      ...environment(),
      EDITRON_MEDIA_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_RETRY_MAX_MS: '299999',
    })).toThrow('OWNER_V2_RETRY_MAX_MS_INVALID');

    const configuration =
      resolveMediaSourcePtsCadenceVersionEvidenceBackfillRecoveryConfigurationV2(
        environment(),
      );
    expect(configuration).toMatchObject({
      staleMs: 600_000,
      selectionLimit: 10,
      batchLimit: 25,
      attemptPolicy: {
        maxAttempts: 3,
        leaseMs: 120_000,
        retryBaseMs: 300_000,
        retryMaxMs: 600_000,
      },
    });

    const selectNext = vi.fn();
    await expect(recoverMediaSourcePtsCadenceVersionEvidenceBackfillSweepsV2({
      environment: {
        ...environment(),
        EDITRON_MEDIA_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_BATCH_LIMIT: undefined,
      },
      selector: { selectNext },
      claimToken: CLAIM_TOKEN,
      now: NOW,
    })).rejects.toThrow('OWNER_V2_BATCH_LIMIT_CONFIG_INVALID');
    await expect(recoverMediaSourcePtsCadenceVersionEvidenceBackfillSweepsV2({
      environment: { ...environment(), QSTASH_TOKEN: undefined },
      selector: { selectNext },
      claimToken: CLAIM_TOKEN,
      now: NOW,
    })).rejects.toThrow('OWNER_V2_DISPATCH_MISSING_QSTASH_TOKEN');
    await expect(recoverMediaSourcePtsCadenceVersionEvidenceBackfillSweepsV2({
      environment: environment(),
      selector: { selectNext },
      claimToken: 'x'.repeat(201),
      now: NOW,
    })).rejects.toThrow('OWNER_V2_CLAIM_TOKEN_INVALID');
    expect(selectNext).not.toHaveBeenCalled();
  });

  it('binds fair selection through claim, dispatch, attempt and settlement', async () => {
    const fixture = selectedFixture(['run-a', 'run-b']);
    const selector = { selectNext: vi.fn(async () => fixture.selection) };
    const sweepStore = settlementStore(fixture);
    const dispatch = vi.fn()
      .mockResolvedValueOnce({
        disposition: 'DISPATCHED' as const,
        messageId: 'qstash-recovery-a',
        deduplicationId: HASH_A,
      })
      .mockResolvedValueOnce({
        disposition: 'DEDUPLICATED' as const,
        messageId: 'qstash-recovery-b',
        deduplicationId: HASH_B,
      });

    const receipt = await recoverMediaSourcePtsCadenceVersionEvidenceBackfillSweepsV2({
      environment: environment(),
      selector,
      sweepStore,
      dispatch,
      claimToken: CLAIM_TOKEN,
      now: NOW,
      attemptedAt: ATTEMPTED_AT,
    });

    expect(selector.selectNext).toHaveBeenCalledWith({
      controllerId:
        MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_CONTROLLER_ID_V2,
      staleBefore: STALE_BEFORE,
      selectedAt: NOW,
      limit: 10,
      attemptPolicy: fixture.claim.attemptPolicy,
    });
    expect(sweepStore.claimNext).toHaveBeenCalledWith({
      claimToken: CLAIM_TOKEN,
      claimedAt: NOW,
    });
    expect(dispatch).toHaveBeenNthCalledWith(1, {
      message: {
        schemaVersion: 1,
        kind: 'RUN_NEXT_BATCH',
        migrationRunId: 'run-a',
        expectedRecordSha256:
          fixture.claim.intent.entries[0]!.expectedRecordSha256,
        batchLimit: 25,
      },
      deliveryPolicy: MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_DELIVERY_POLICY_V1,
      environment: environment(),
    });
    expect(sweepStore.settle).toHaveBeenCalledWith(expect.objectContaining({
      sweepIntentSha256: fixture.claim.sweepIntentSha256,
      claimedRecordSha256: fixture.claim.claimedRecordSha256,
      claimToken: CLAIM_TOKEN,
      attempt: expect.objectContaining({
        attemptNumber: 1,
        disposition: 'COMPLETE',
        confirmedCount: 2,
        unconfirmedCount: 0,
      }),
    }));
    expect(receipt).toMatchObject({
      schemaVersion: 2,
      kind: 'EDITRON_MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_RECEIPT_V2',
      invokedAt: NOW.toISOString(),
      batchLimit: 25,
      selection: {
        disposition: 'SELECTED',
        selectedSweepIntentSha256: fixture.claim.sweepIntentSha256,
      },
      claim: {
        sweepIntentSha256: fixture.claim.sweepIntentSha256,
        entryCount: 2,
        attemptNumber: 1,
      },
      attempt: { disposition: 'COMPLETE' },
      settlement: { disposition: 'SETTLED', sweepStatus: 'COMPLETE' },
      claimedCount: 2,
      confirmedCount: 2,
      unconfirmedCount: 0,
    });
    const { recoveryReceiptSha256, ...material } = receipt;
    expect(recoveryReceiptSha256).toBe(hashEditronCanonicalJsonV1(material));
  });

  it('returns a truthful empty receipt when no sweep is eligible', async () => {
    const controller = createMediaSourcePtsCadenceVersionEvidenceBackfillRecoveryControllerV1({
      controllerId:
        MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_CONTROLLER_ID_V2,
      createdAt: NOW.toISOString(),
    });
    const dispatch = vi.fn();
    const settle = vi.fn();
    const receipt = await recoverMediaSourcePtsCadenceVersionEvidenceBackfillSweepsV2({
      environment: environment(),
      selector: {
        selectNext: async () => ({
          disposition: 'NO_CANDIDATES' as const,
          controller,
        }),
      },
      sweepStore: {
        claimNext: async () => null,
        settle,
      },
      dispatch,
      claimToken: CLAIM_TOKEN,
      now: NOW,
    });

    expect(receipt).toMatchObject({
      selection: { disposition: 'NO_CANDIDATES' },
      claim: null,
      attempt: null,
      settlement: null,
      claimedCount: 0,
      confirmedCount: 0,
      unconfirmedCount: 0,
      results: [],
    });
    expect(dispatch).not.toHaveBeenCalled();
    expect(settle).not.toHaveBeenCalled();
  });

  it('persists thrown, rejected and malformed delivery as retry evidence', async () => {
    const fixture = selectedFixture(['run-a', 'run-b', 'run-c']);
    const sweepStore = settlementStore(fixture);
    const dispatch = vi.fn()
      .mockRejectedValueOnce(new Error('secret-provider-detail'))
      .mockResolvedValueOnce({
        disposition: 'UNCONFIRMED' as const,
        reason: 'QSTASH_PUBLISH_REJECTED' as const,
        messageId: null,
        deduplicationId: HASH_B,
      })
      .mockResolvedValueOnce({
        disposition: 'DISPATCHED' as const,
        messageId: 'forged-success',
        deduplicationId: HASH_A,
        hiddenFallback: true,
      });

    const receipt = await recoverMediaSourcePtsCadenceVersionEvidenceBackfillSweepsV2({
      environment: environment(),
      selector: { selectNext: async () => fixture.selection },
      sweepStore,
      dispatch,
      claimToken: CLAIM_TOKEN,
      now: NOW,
      attemptedAt: ATTEMPTED_AT,
    });

    expect(receipt).toMatchObject({
      attempt: { disposition: 'RETRY_REQUIRED' },
      settlement: { disposition: 'SETTLED', sweepStatus: 'RETRY_WAIT' },
      claimedCount: 3,
      confirmedCount: 0,
      unconfirmedCount: 3,
      results: [{
        dispatch: {
          disposition: 'UNCONFIRMED',
          reason: 'DISPATCH_RUNTIME_UNAVAILABLE',
          deduplicationId: null,
        },
      }, {
        dispatch: {
          disposition: 'UNCONFIRMED',
          reason: 'QSTASH_PUBLISH_REJECTED',
        },
      }, {
        dispatch: {
          disposition: 'UNCONFIRMED',
          reason: 'DISPATCH_RUNTIME_UNAVAILABLE',
          deduplicationId: null,
        },
      }],
    });
    expect(JSON.stringify(receipt)).not.toContain('secret-provider-detail');
  });

  it('rejects a forged frozen policy before dispatch or settlement', async () => {
    const fixture = selectedFixture(['run-a']);
    const dispatch = vi.fn();
    const settle = vi.fn();
    const forgedClaim = {
      ...fixture.claim,
      attemptPolicy: {
        ...fixture.claim.attemptPolicy,
        policySha256: 'f'.repeat(64),
      },
    };

    await expect(recoverMediaSourcePtsCadenceVersionEvidenceBackfillSweepsV2({
      environment: environment(),
      selector: { selectNext: async () => fixture.selection },
      sweepStore: {
        claimNext: async () => forgedClaim,
        settle,
      },
      dispatch,
      claimToken: CLAIM_TOKEN,
      now: NOW,
      attemptedAt: ATTEMPTED_AT,
    })).rejects.toThrow('ATTEMPT_POLICY_HASH_INVALID');
    expect(dispatch).not.toHaveBeenCalled();
    expect(settle).not.toHaveBeenCalled();
  });

  it('rejects a selection from another controller before claiming', async () => {
    const wrongController =
      createMediaSourcePtsCadenceVersionEvidenceBackfillRecoveryControllerV1({
        controllerId: 'wrong-controller',
        createdAt: NOW.toISOString(),
      });
    const claimNext = vi.fn();

    await expect(recoverMediaSourcePtsCadenceVersionEvidenceBackfillSweepsV2({
      environment: environment(),
      selector: {
        selectNext: async () => ({
          disposition: 'NO_CANDIDATES' as const,
          controller: wrongController,
        }),
      },
      sweepStore: { claimNext, settle: vi.fn() },
      claimToken: CLAIM_TOKEN,
      now: NOW,
    })).rejects.toThrow('OWNER_V2_SELECTION_CONTROLLER_INVALID');
    expect(claimNext).not.toHaveBeenCalled();
  });

  it('refuses false success when settlement did not consume the attempt', async () => {
    const fixture = selectedFixture(['run-a']);

    await expect(recoverMediaSourcePtsCadenceVersionEvidenceBackfillSweepsV2({
      environment: environment(),
      selector: { selectNext: async () => fixture.selection },
      sweepStore: {
        claimNext: async () => fixture.claim,
        settle: async () => ({
          disposition: 'SETTLED' as const,
          state: fixture.claimedState,
        }),
      },
      dispatch: async () => ({
        disposition: 'DISPATCHED' as const,
        messageId: 'qstash-run-a',
        deduplicationId: HASH_A,
      }),
      claimToken: CLAIM_TOKEN,
      now: NOW,
      attemptedAt: ATTEMPTED_AT,
    })).rejects.toThrow('OWNER_V2_SETTLEMENT_BINDING_INVALID');
  });
});

function selectedFixture(migrationRunIds: readonly string[]) {
  const configuration =
    resolveMediaSourcePtsCadenceVersionEvidenceBackfillRecoveryConfigurationV2(
      environment(),
    );
  const controller = createMediaSourcePtsCadenceVersionEvidenceBackfillRecoveryControllerV1({
    controllerId:
      MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_CONTROLLER_ID_V2,
    createdAt: '2026-08-30T19:00:00.000Z',
  });
  const selected = selectMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepV1(
    controller,
    {
      candidates: migrationRunIds.map((migrationRunId, index) => (
        createMediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1({
          migrationRunId,
          policyVersion: 'pts-cadence-version-evidence-backfill-policy-v1',
          upperBoundCursor: { assetId: `asset-${index}`, userId: 'user-z' },
          createdAt: new Date(
            Date.parse('2026-08-30T19:00:00.000Z') + index,
          ).toISOString(),
        })
      )),
      wrapped: false,
      staleBefore: STALE_BEFORE.toISOString(),
      selectedAt: NOW.toISOString(),
    },
  );
  const pending = createMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepStateV1(
    selected.intent,
    configuration.attemptPolicy,
  );
  const claimed = claimMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepStateV1(
    pending,
    { claimToken: CLAIM_TOKEN, claimedAt: NOW.toISOString() },
  );
  return {
    selection: {
      disposition: 'SELECTED' as const,
      controller: selected.nextController,
      intent: selected.intent,
    },
    claim: claimed.claim,
    claimedState: claimed.state,
  };
}

function settlementStore(fixture: ReturnType<typeof selectedFixture>) {
  return {
    claimNext: vi.fn(async () => fixture.claim),
    settle: vi.fn(async (input: Readonly<{
      sweepIntentSha256: string;
      claimedRecordSha256: string;
      claimToken: string;
      attempt: unknown;
    }>) => {
      const attempt =
        assertMediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptV1(
          input.attempt,
          fixture.claim.intent,
        );
      return {
        disposition: 'SETTLED' as const,
        state: settleMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepStateV1(
          fixture.claimedState,
          { claimToken: input.claimToken, attempt },
        ),
      };
    }),
  };
}

function environment(): MediaSourcePtsCadenceVersionEvidenceBackfillRecoveryEnvironmentV2 {
  return {
    QSTASH_TOKEN: 'qstash-token',
    QSTASH_CURRENT_SIGNING_KEY: 'current-signing-key',
    QSTASH_NEXT_SIGNING_KEY: 'next-signing-key',
    NEXT_PUBLIC_APP_URL: 'https://editron.example.test',
    EDITRON_MEDIA_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_STALE_MS: '600000',
    EDITRON_MEDIA_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_RUN_LIMIT: '10',
    EDITRON_MEDIA_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_BATCH_LIMIT: '25',
    EDITRON_MEDIA_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_MAX_ATTEMPTS: '3',
    EDITRON_MEDIA_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_LEASE_MS: '120000',
    EDITRON_MEDIA_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_RETRY_BASE_MS: '300000',
    EDITRON_MEDIA_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_RETRY_MAX_MS: '600000',
  };
}
