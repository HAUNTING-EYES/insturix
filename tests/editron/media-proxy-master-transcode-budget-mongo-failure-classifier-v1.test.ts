import {
  MongoError,
  MongoNetworkError,
  MongoNetworkTimeoutError,
  MongoNotConnectedError,
  MongoOperationTimeoutError,
  MongoTopologyClosedError,
} from 'mongodb';
import { describe, expect, it } from 'vitest';

import { classifyMediaProxyMasterTranscodeBudgetMongoFailureV1 }
  from '@/lib/editron/services/media-proxy-master-transcode-budget-mongo-failure-classifier-v1';
import { MediaProxyMasterTranscodeExecutionBudgetLedgerOwnerErrorV1 }
  from '@/lib/editron/services/media-proxy-master-transcode-execution-budget-ledger-owner-v1';
import { MediaProxyMasterTranscodeExecutionBudgetMongoLedgerErrorV1 }
  from '@/lib/editron/services/media-proxy-master-transcode-execution-budget-mongo-ledger-v1';
import { MediaProxyMasterTranscodeExecutionBudgetPolicyMongoErrorV1 }
  from '@/lib/editron/services/media-proxy-master-transcode-execution-budget-policy-mongo-v1';

describe('proxy transcode Finance Mongo failure classifier v1', () => {
  it.each([
    new MediaProxyMasterTranscodeExecutionBudgetLedgerOwnerErrorV1(
      'LEDGER_RESERVATION_NOT_FOUND',
    ),
    new MediaProxyMasterTranscodeExecutionBudgetMongoLedgerErrorV1(
      'RECORD_INVALID',
    ),
    new MediaProxyMasterTranscodeExecutionBudgetPolicyMongoErrorV1(
      'NOT_FOUND',
    ),
  ])('preserves typed domain failures as permanent blocks', (error) => {
    expect(classify(error)).toEqual({
      errorCode: error.message,
      retryable: false,
    });
  });

  it.each([
    [new MongoNetworkTimeoutError('network timeout'),
      'PROXY_BUDGET_MONGO_TIMEOUT'],
    [new MongoOperationTimeoutError('operation timeout'),
      'PROXY_BUDGET_MONGO_TIMEOUT'],
    [new MongoNetworkError('network unavailable'),
      'PROXY_BUDGET_MONGO_NETWORK_UNAVAILABLE'],
    [new MongoTopologyClosedError('topology closed'),
      'PROXY_BUDGET_MONGO_CLIENT_UNAVAILABLE'],
    [new MongoNotConnectedError('client disconnected'),
      'PROXY_BUDGET_MONGO_CLIENT_UNAVAILABLE'],
  ] as const)('marks only known availability errors retryable', (error, code) => {
    expect(classify(error)).toEqual({ errorCode: code, retryable: true });
  });

  it('honours official transient transaction labels', () => {
    const error = new MongoError('transaction interrupted');
    error.addErrorLabel('TransientTransactionError');
    expect(classify(error)).toEqual({
      errorCode: 'PROXY_BUDGET_MONGO_TRANSIENT_OPERATION',
      retryable: true,
    });
  });

  it('does not guess for generic or unlabeled driver errors', () => {
    expect(classify(new MongoError('bad credentials'))).toBeNull();
    expect(classify(new Error(
      'MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_LEDGER_RESERVATION_NOT_FOUND',
    ))).toBeNull();
  });
});

function classify(error: unknown) {
  return classifyMediaProxyMasterTranscodeBudgetMongoFailureV1(error);
}
