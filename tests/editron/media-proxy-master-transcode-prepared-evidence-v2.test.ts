import { describe, expect, it } from 'vitest';

import { createMediaProxyMasterR2PreparedArtifactPolicyV1 }
  from '@/lib/editron/services/media-proxy-master-r2-prepared-artifact-policy-v1';
import { createMediaProxyMasterR2PrivatePublicationPolicyV2 }
  from '@/lib/editron/services/media-proxy-master-r2-private-publication-policy-v2';
import { buildMediaProxyMasterTranscodeDurableJobContractV2 }
  from '@/lib/editron/services/media-proxy-master-transcode-durable-job-v2';
import {
  assertMediaProxyMasterTranscodePreparedEvidenceForJobV2,
  createMediaProxyMasterTranscodePreparedEvidenceV2,
} from '@/lib/editron/services/media-proxy-master-transcode-prepared-evidence-v2';
import {
  buildMediaProxyMasterTranscodeBudgetFixtureV1,
  createMediaProxyMasterTranscodeBudgetTrustedReceiptV1,
} from './helpers/media-proxy-master-transcode-budget-fixture';

const MiB = 1_024 * 1_024;

describe('MediaProxyMasterTranscodePreparedEvidenceV2', () => {
  it('persists every receipt input that would otherwise disappear on crash', () => {
    const fixture = buildFixture();
    const evidence = createEvidence(fixture);

    expect(assertMediaProxyMasterTranscodePreparedEvidenceForJobV2(
      evidence,
      fixture.job.payload,
    )).toEqual(evidence);
    expect(evidence.outputProbe.probeSha256)
      .toBe(fixture.receipt.proxyEncode.outputProbe.probeSha256);
    expect(evidence.masterLocalFileEvidence)
      .toEqual(fixture.receipt.masterDecode.localFileEvidence);
    expect(JSON.stringify(evidence)).not.toMatch(/localPath|sourceUrl|https?:\/\//i);
  });

  it('rejects failed process, stale source, and substituted probe evidence', () => {
    const fixture = buildFixture();
    const evidence = createEvidence(fixture);

    expect(() => createMediaProxyMasterTranscodePreparedEvidenceV2({
      ...evidenceInput(fixture),
      process: { ...evidence.process, exitCode: 1 as 0 },
    })).toThrow('PROCESS_EXIT_CODE_INVALID');
    expect(() => createMediaProxyMasterTranscodePreparedEvidenceV2({
      ...evidenceInput(fixture),
      masterLocalFileEvidence: {
        ...evidence.masterLocalFileEvidence,
        contentSha256: 'f'.repeat(64),
      },
    })).toThrow('MASTER_LOCAL_FILE_EVIDENCE_JOB_MISMATCH');
    expect(() => createMediaProxyMasterTranscodePreparedEvidenceV2({
      ...evidenceInput(fixture),
      outputProbe: {
        ...evidence.outputProbe,
        commandSha256: 'e'.repeat(64),
      },
    })).toThrow('OUTPUT_PROBE_INVALID');
  });

  it('rejects timing inversion, unknown fields, and outer-hash tampering', () => {
    const fixture = buildFixture();
    const evidence = createEvidence(fixture);

    expect(() => createMediaProxyMasterTranscodePreparedEvidenceV2({
      ...evidenceInput(fixture),
      process: {
        ...evidence.process,
        completedAt: '2026-08-30T00:10:59.999Z',
      },
    })).toThrow('PROCESS_TIME_ORDER_INVALID');
    expect(() => assertMediaProxyMasterTranscodePreparedEvidenceForJobV2({
      ...evidence,
      unexpected: true,
    }, fixture.job.payload)).toThrow('EVIDENCE_FIELDS_INVALID');
    expect(() => assertMediaProxyMasterTranscodePreparedEvidenceForJobV2({
      ...evidence,
      evidenceSha256: 'd'.repeat(64),
    }, fixture.job.payload)).toThrow('EVIDENCE_BINDING_INVALID');
  });
});

function buildFixture() {
  const base = buildMediaProxyMasterTranscodeBudgetFixtureV1();
  const publicationPolicy = createMediaProxyMasterR2PrivatePublicationPolicyV2({
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
  const job = buildMediaProxyMasterTranscodeDurableJobContractV2({
    tenantId: 'tenant-a',
    userId: 'user-a',
    orgId: null,
    assetId: 'asset-a',
    command: base.command,
    runtimePolicy: base.runtimePolicy,
    publicationPolicy,
    preparedArtifactPolicy,
    budgetReservation: {
      reservationId: base.reservation.reservationId,
      bindingSha256: base.reservation.reservationSha256,
    },
  });
  return {
    job,
    receipt: createMediaProxyMasterTranscodeBudgetTrustedReceiptV1(base.command),
  };
}

function createEvidence(fixture: ReturnType<typeof buildFixture>) {
  return createMediaProxyMasterTranscodePreparedEvidenceV2(
    evidenceInput(fixture),
  );
}

function evidenceInput(fixture: ReturnType<typeof buildFixture>) {
  const receipt = fixture.receipt;
  return {
    jobInput: fixture.job.payload,
    process: {
      startedAt: receipt.process.startedAt,
      completedAt: receipt.process.completedAt,
      exitCode: 0 as const,
      stderrByteLength: receipt.process.stderrByteLength,
      stderrSha256: receipt.process.stderrSha256,
    },
    masterLocalFileEvidence: receipt.masterDecode.localFileEvidence,
    outputProbe: receipt.proxyEncode.outputProbe,
    outputVideoStreamIndex: receipt.proxyEncode.outputVideoStreamIndex,
    outputAudioStreamIndexes: receipt.proxyEncode.outputAudioStreamIndexes,
  };
}
