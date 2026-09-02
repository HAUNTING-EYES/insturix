import {
  MongoError,
  MongoNetworkError,
  MongoNetworkTimeoutError,
  MongoNotConnectedError,
  MongoOperationTimeoutError,
  MongoTopologyClosedError,
} from 'mongodb';
import { describe, expect, it } from 'vitest';

import { classifyMediaProxyMasterTranscodeBudgetMongoFailureV2 }
  from '@/lib/editron/services/media-proxy-master-transcode-budget-mongo-failure-classifier-v2';
import { MediaProxyMasterTranscodeExecutionBudgetLedgerOwnerErrorV2 }
  from '@/lib/editron/services/media-proxy-master-transcode-execution-budget-ledger-owner-v2';
import { MediaProxyMasterTranscodeExecutionBudgetMongoLedgerErrorV2 }
  from '@/lib/editron/services/media-proxy-master-transcode-execution-budget-mongo-ledger-v2';
import { MediaProxyMasterTranscodeExecutionBudgetPolicyMongoErrorV1 }
  from '@/lib/editron/services/media-proxy-master-transcode-execution-budget-policy-mongo-v1';

describe('proxy transcode Finance Mongo failure classifier V2', () => {
  it.each([
    new MediaProxyMasterTranscodeExecutionBudgetLedgerOwnerErrorV2(
      'LEDGER_RESERVATION_NOT_FOUND',
    ),
    new MediaProxyMasterTranscodeExecutionBudgetMongoLedgerErrorV2(
      'RECORD_INVALID',
    ),
    new MediaProxyMasterTranscodeExecutionBudgetPolicyMongoErrorV1(
      'NOT_FOUND',
    ),
  ])('preserves typed V2 domain failures as permanent blocks', (error) => {
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
    error.addErrorLabel('UnknownTransactionCommitResult');
    expect(classify(error)).toEqual({
      errorCode: 'PROXY_BUDGET_MONGO_TRANSIENT_OPERATION',
      retryable: true,
    });
  });

  it('does not guess for generic or unlabeled driver errors', () => {
    expect(classify(new MongoError('bad credentials'))).toBeNull();
    expect(classify(new Error(
      'MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_V2_LEDGER_NOT_FOUND',
    ))).toBeNull();
  });
});

function classify(error: unknown) {
  return classifyMediaProxyMasterTranscodeBudgetMongoFailureV2(error);
}
