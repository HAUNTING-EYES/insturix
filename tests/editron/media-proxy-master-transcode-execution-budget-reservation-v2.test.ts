import { describe, expect, it } from 'vitest';

import {
  createMediaProxyMasterR2PreparedArtifactPolicyV1,
} from '@/lib/editron/services/media-proxy-master-r2-prepared-artifact-policy-v1';
import {
  createMediaProxyMasterR2PrivatePublicationPolicyV2,
} from '@/lib/editron/services/media-proxy-master-r2-private-publication-policy-v2';
import {
  buildMediaProxyMasterTranscodeDurableJobContractV2,
} from '@/lib/editron/services/media-proxy-master-transcode-durable-job-v2';
import {
  assertMediaProxyMasterTranscodeExecutionBudgetAuthorizationForJobV2,
  assertMediaProxyMasterTranscodeExecutionBudgetAuthorizationV2,
  assertMediaProxyMasterTranscodeExecutionBudgetReservationV2,
  createMediaProxyMasterTranscodeExecutionBudgetAuthorizationV2,
  createMediaProxyMasterTranscodeExecutionBudgetReservationV2,
  deriveMediaProxyMasterTranscodeExecutionBudgetMaximumUsageV2,
  MEDIA_PROXY_MASTER_TRANSCODE_ARTIFACT_ACCOUNTING_PROFILE_V2,
  mediaProxyMasterTranscodeExecutionBudgetReservationRefV2,
} from '@/lib/editron/services/media-proxy-master-transcode-execution-budget-reservation-v2';
import { buildMediaProxyMasterTranscodeBudgetFixtureV1 }
  from './helpers/media-proxy-master-transcode-budget-fixture';

const MiB = 1_024 * 1_024;

describe('MediaProxyMasterTranscodeExecutionBudgetReservationV2', () => {
  it('binds conservative prepared-publication usage into a V2 job', () => {
    const fixture = buildFixture();

    expect(fixture.authorization.maximumUsage).toEqual({
      sourceBytesRead: '30000000',
      encodedFrameAttempts: '1800',
      processMilliseconds: '720000',
      artifactBytesWritten: '30291456',
      artifactBytesVerified: '48582912',
    });
    expect(
      assertMediaProxyMasterTranscodeExecutionBudgetAuthorizationForJobV2(
        fixture.authorization,
        fixture.policy,
        fixture.job.payload,
      ),
    ).toEqual(fixture.authorization);
    expect(
      assertMediaProxyMasterTranscodeExecutionBudgetReservationV2(
        fixture.reservation,
        fixture.authorization,
        fixture.policy,
      ),
    ).toEqual(fixture.reservation);
    expect(fixture.job.payload.budgetReservation).toEqual({
      reservationId: fixture.reservation.reservationId,
      bindingSha256: fixture.reservation.reservationSha256,
    });
    expect(fixture.authorization.scope.artifactAccountingProfileSha256)
      .toBe(
        MEDIA_PROXY_MASTER_TRANSCODE_ARTIFACT_ACCOUNTING_PROFILE_V2
          .profileSha256,
      );
    expect(
      MEDIA_PROXY_MASTER_TRANSCODE_ARTIFACT_ACCOUNTING_PROFILE_V2
        .localValidationCostDisposition,
    ).toContain('UNMETERED');
    expect(
      MEDIA_PROXY_MASTER_TRANSCODE_ARTIFACT_ACCOUNTING_PROFILE_V2
        .providerRequestCostDisposition,
    ).toContain('UNMETERED');
  });

  it('recreates the exact bounded ceiling stored in the authorization', () => {
    const fixture = buildFixture();
    const derived = deriveMediaProxyMasterTranscodeExecutionBudgetMaximumUsageV2(
      fixture.command,
      fixture.runtimePolicy,
      fixture.preparedArtifactPolicy,
    );

    expect(derived).toEqual(fixture.authorization.maximumUsage);
    expect(Object.isFrozen(derived)).toBe(true);
  });

  it('rejects a self-consistent authorization for a foreign prepared policy', () => {
    const fixture = buildFixture();
    const foreignPrepared = createMediaProxyMasterR2PreparedArtifactPolicyV1({
      publicationPolicy: fixture.publicationPolicy,
      targetChunkBytes: 6 * MiB,
      maximumManifestBytes: 2 * MiB,
    });
    const foreignAuthorization =
      createMediaProxyMasterTranscodeExecutionBudgetAuthorizationV2({
        policy: fixture.policy,
        evidence: {
          ...fixture.evidence,
          preparedArtifactPolicy: foreignPrepared,
        },
        approvedBy: 'finance-admin',
        approvedAt: '2026-08-30T00:05:00.000Z',
        expiresAt: '2026-08-30T01:00:00.000Z',
      });

    expect(() =>
      assertMediaProxyMasterTranscodeExecutionBudgetAuthorizationForJobV2(
        foreignAuthorization,
        fixture.policy,
        fixture.job.payload,
      )).toThrow('AUTHORIZATION_JOB_BINDING_MISMATCH');
  });

  it('rejects substituted receipts and invalid reservation time', () => {
    const fixture = buildFixture();

    expect(() =>
      assertMediaProxyMasterTranscodeExecutionBudgetAuthorizationV2({
        ...fixture.authorization,
        scope: {
          ...fixture.authorization.scope,
          artifactAccountingProfileSha256: 'f'.repeat(64),
        },
      }, fixture.policy)).toThrow('SCOPE_ARTIFACT_ACCOUNTING_PROFILE_MISMATCH');
    expect(() =>
      assertMediaProxyMasterTranscodeExecutionBudgetReservationV2({
        ...fixture.reservation,
        reservationSha256: 'e'.repeat(64),
      }, fixture.authorization, fixture.policy)).toThrow('RESERVATION_INVALID');
    expect(() =>
      createMediaProxyMasterTranscodeExecutionBudgetReservationV2({
        policy: fixture.policy,
        authorization: fixture.authorization,
        reservationId: 'v2-too-early',
        reservedAt: '2026-08-30T00:04:59.999Z',
      })).toThrow('RESERVATION_TIME_INVALID');
  });
});

function buildFixture() {
  const base = buildMediaProxyMasterTranscodeBudgetFixtureV1();
  const publicationPolicy =
    createMediaProxyMasterR2PrivatePublicationPolicyV2({
      bucketName: 'editron-media-proxy-private',
      storagePolicyVersion: 'private-proxy-media-v1',
      browserRouteExposure: 'NO_BROWSER_ROUTE',
    });
  const preparedArtifactPolicy =
    createMediaProxyMasterR2PreparedArtifactPolicyV1({
      publicationPolicy,
      targetChunkBytes: 5 * MiB,
      maximumManifestBytes: MiB,
    });
  const evidence = {
    tenantId: 'tenant-a',
    userId: 'user-a',
    orgId: null,
    assetId: 'asset-a',
    command: base.command,
    runtimePolicy: base.runtimePolicy,
    publicationPolicy,
    preparedArtifactPolicy,
  } as const;
  const authorization =
    createMediaProxyMasterTranscodeExecutionBudgetAuthorizationV2({
      policy: base.policy,
      evidence,
      approvedBy: 'finance-admin',
      approvedAt: '2026-08-30T00:05:00.000Z',
      expiresAt: '2026-08-30T01:00:00.000Z',
    });
  const reservation =
    createMediaProxyMasterTranscodeExecutionBudgetReservationV2({
      policy: base.policy,
      authorization,
      reservationId: 'mpmt-budget-fixture-v2',
      reservedAt: '2026-08-30T00:10:00.000Z',
    });
  const job = buildMediaProxyMasterTranscodeDurableJobContractV2({
    tenantId: evidence.tenantId,
    userId: evidence.userId,
    orgId: evidence.orgId,
    assetId: evidence.assetId,
    command: evidence.command,
    runtimePolicy: evidence.runtimePolicy,
    publicationPolicy: evidence.publicationPolicy,
    preparedArtifactPolicy: evidence.preparedArtifactPolicy,
    budgetReservation:
      mediaProxyMasterTranscodeExecutionBudgetReservationRefV2(reservation),
  });
  return {
    ...base,
    evidence,
    publicationPolicy,
    preparedArtifactPolicy,
    authorization,
    reservation,
    job,
  };
}
