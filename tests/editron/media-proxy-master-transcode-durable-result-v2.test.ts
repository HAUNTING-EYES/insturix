import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  assertMediaProxyMasterTranscodeDurablePreparedStateForJobV2,
  assertMediaProxyMasterTranscodeDurableResultForJobV2,
  createMediaProxyMasterTranscodeDurablePreparedStateV2,
  createMediaProxyMasterTranscodeDurableResultV2,
  createMediaProxyMasterTranscodeDurableTerminalReceiptV2,
  createMediaProxyMasterTranscodePreparedResumeStateV2,
  createMediaProxyMasterTranscodeResultResumeStateV2,
  createMediaProxyMasterTrustedReceiptFromPersistedPreparationV2,
  readMediaProxyMasterTranscodeDurableResumeStateV2,
} from '@/lib/editron/services/media-proxy-master-transcode-durable-result-v2';
import {
  MEDIA_PROXY_MASTER_TRANSCODE_V2_FIXTURE_EXPIRES_AT as EXPIRES_AT,
  buildMediaProxyMasterTranscodeV2Fixture as buildFixture,
  createMediaProxyMasterTranscodePreparedStateV2Fixture as createPreparedState,
  withMediaProxyMasterTranscodeResumeV2Fixture as withResume,
} from './helpers/media-proxy-master-transcode-v2-fixture';

describe('MediaProxyMasterTranscodeDurableResultV2', () => {
  it('requires persisted preparation before result and terminal PASS', () => {
    const fixture = buildFixture();
    const preparedState = createPreparedState(fixture);
    const preparedResume = createMediaProxyMasterTranscodePreparedResumeStateV2({
      job: fixture.job,
      preparedState,
    });
    const preparedJob = withResume(fixture.job, 1, preparedResume,
      '2026-08-30T00:12:01.750Z');

    expect(assertMediaProxyMasterTranscodeDurablePreparedStateForJobV2(
      preparedState,
      preparedJob,
    )).toEqual(preparedState);
    expect(readMediaProxyMasterTranscodeDurableResumeStateV2(preparedJob))
      .toEqual(preparedState);

    const trusted =
      createMediaProxyMasterTrustedReceiptFromPersistedPreparationV2({
        job: preparedJob,
        proxySourceVersion: fixture.seedReceipt.proxyEncode.sourceVersion,
        completedAt: fixture.seedReceipt.completedAt,
      });
    expect(trusted.receiptSha256).toBe(fixture.seedReceipt.receiptSha256);
    const result = createMediaProxyMasterTranscodeDurableResultV2({
      job: preparedJob,
      trustedTranscodeReceipt: trusted,
    });
    const resultResume = createMediaProxyMasterTranscodeResultResumeStateV2({
      job: preparedJob,
      result,
    });
    const resultJob = withResume(fixture.job, 2, resultResume,
      '2026-08-30T00:12:02.500Z');

    expect(assertMediaProxyMasterTranscodeDurableResultForJobV2(
      result,
      resultJob,
    )).toEqual(result);
    expect(readMediaProxyMasterTranscodeDurableResumeStateV2(resultJob))
      .toEqual(result);
    const terminal = createMediaProxyMasterTranscodeDurableTerminalReceiptV2({
      job: resultJob,
      completedAt: new Date('2026-08-30T00:12:03.000Z'),
    });
    expect(terminal.disposition).toBe('PASS');
    expect(terminal.proofReferences.map(({ proofId }) => proofId)).toEqual([
      'execution-budget-authorization',
      'private-publication-policy-v2',
      'prepared-artifact-policy',
      'prepared-artifact-reference',
      'prepared-transcode-evidence',
      'durable-prepared-state',
      'trusted-proxy-transcode',
      'durable-transcode-result',
    ]);
  });

  it('blocks finalization when sequence one was never persisted', () => {
    const fixture = buildFixture();

    expect(() => createMediaProxyMasterTrustedReceiptFromPersistedPreparationV2({
      job: fixture.job,
      proxySourceVersion: fixture.seedReceipt.proxyEncode.sourceVersion,
      completedAt: fixture.seedReceipt.completedAt,
    })).toThrow('PREPARED_RESUME_REQUIRED');
    expect(() => createMediaProxyMasterTranscodeDurableResultV2({
      job: fixture.job,
      trustedTranscodeReceipt: fixture.seedReceipt,
    })).toThrow('PREPARED_RESUME_REQUIRED');
    expect(() => createMediaProxyMasterTranscodeDurableTerminalReceiptV2({
      job: fixture.job,
      completedAt: new Date('2026-08-30T00:12:03.000Z'),
    })).toThrow('TERMINAL_RESULT_NOT_PERSISTED');
  });

  it('rejects sequence, state hash, and final result substitution', () => {
    const fixture = buildFixture();
    const prepared = createPreparedState(fixture);
    const resume = createMediaProxyMasterTranscodePreparedResumeStateV2({
      job: fixture.job,
      preparedState: prepared,
    });
    const wrongSequence = withResume(fixture.job, 2, resume,
      '2026-08-30T00:12:01.750Z');
    expect(() => readMediaProxyMasterTranscodeDurableResumeStateV2(wrongSequence))
      .toThrow('RESUME_SEQUENCE_INVALID');
    const forged = withResume(fixture.job, 1, {
      ...resume,
      stateSha256: sha('forged-state'),
    }, '2026-08-30T00:12:01.750Z');
    expect(() => readMediaProxyMasterTranscodeDurableResumeStateV2(forged))
      .toThrow('RESUME_BINDING_INVALID');

    const preparedJob = withResume(fixture.job, 1, resume,
      '2026-08-30T00:12:01.750Z');
    const result = createMediaProxyMasterTranscodeDurableResultV2({
      job: preparedJob,
      trustedTranscodeReceipt: fixture.seedReceipt,
    });
    expect(() => assertMediaProxyMasterTranscodeDurableResultForJobV2({
      ...result,
      resultSha256: sha('forged-result'),
    }, preparedJob)).toThrow('RESULT_BINDING_INVALID');
  });

  it('rejects preparation that expires before the durable job', () => {
    const fixture = buildFixture({ retainUntil: '2026-09-05T23:59:59.999Z' });
    expect(() => createPreparedState(fixture))
      .toThrow('PREPARED_REFERENCE_JOB_MISMATCH');
  });

  it('rejects impossible persistence and terminal chronology', () => {
    const fixture = buildFixture();
    const prepared = createPreparedState(fixture);
    const preparedResume = createMediaProxyMasterTranscodePreparedResumeStateV2({
      job: fixture.job,
      preparedState: prepared,
    });
    const preStageJob = withResume(fixture.job, 1, preparedResume,
      '2026-08-30T00:12:01.400Z');
    expect(() => readMediaProxyMasterTranscodeDurableResumeStateV2(preStageJob))
      .toThrow('RESUME_TIME_INVALID');
    const expiredPreparedJob = withResume(fixture.job, 1, preparedResume,
      EXPIRES_AT);
    expect(() => readMediaProxyMasterTranscodeDurableResumeStateV2(
      expiredPreparedJob,
    )).toThrow('RESUME_TIME_INVALID');

    const preparedJob = withResume(fixture.job, 1, preparedResume,
      '2026-08-30T00:12:01.750Z');
    expect(() => createMediaProxyMasterTrustedReceiptFromPersistedPreparationV2({
      job: preparedJob,
      proxySourceVersion: fixture.seedReceipt.proxyEncode.sourceVersion,
      completedAt: '2026-08-30T00:12:01.600Z',
    })).toThrow('TRUSTED_RECEIPT_BEFORE_PREPARED_COMMIT');

    const result = createMediaProxyMasterTranscodeDurableResultV2({
      job: preparedJob,
      trustedTranscodeReceipt: fixture.seedReceipt,
    });
    const resultResume = createMediaProxyMasterTranscodeResultResumeStateV2({
      job: preparedJob,
      result,
    });
    const preReceiptResultJob = withResume(fixture.job, 2, resultResume,
      '2026-08-30T00:12:01.900Z');
    expect(() => readMediaProxyMasterTranscodeDurableResumeStateV2(
      preReceiptResultJob,
    )).toThrow('RESUME_TIME_INVALID');

    const resultJob = withResume(fixture.job, 2, resultResume,
      '2026-08-30T00:12:02.500Z');
    expect(() => createMediaProxyMasterTranscodeDurableTerminalReceiptV2({
      job: resultJob,
      completedAt: new Date('2026-08-30T00:12:02.250Z'),
    })).toThrow('TERMINAL_TIME_INVALID');
    expect(() => createMediaProxyMasterTranscodeDurableTerminalReceiptV2({
      job: resultJob,
      completedAt: new Date(EXPIRES_AT),
    })).toThrow('TERMINAL_TIME_INVALID');
  });
});

function sha(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
