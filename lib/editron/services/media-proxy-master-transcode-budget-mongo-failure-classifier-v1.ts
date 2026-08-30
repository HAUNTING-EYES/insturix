import {
  MongoError,
  MongoNetworkError,
  MongoNetworkTimeoutError,
  MongoNotConnectedError,
  MongoOperationTimeoutError,
  MongoServerSelectionError,
  MongoTopologyClosedError,
} from 'mongodb';

import { MediaProxyMasterTranscodeExecutionBudgetLedgerOwnerErrorV1 }
  from './media-proxy-master-transcode-execution-budget-ledger-owner-v1';
import { MediaProxyMasterTranscodeExecutionBudgetMongoLedgerErrorV1 }
  from './media-proxy-master-transcode-execution-budget-mongo-ledger-v1';
import { MediaProxyMasterTranscodeExecutionBudgetPolicyMongoErrorV1 }
  from './media-proxy-master-transcode-execution-budget-policy-mongo-v1';
import type { MediaProxyMasterTranscodeBudgetInfrastructureFailureV1 }
  from './media-proxy-master-transcode-execution-budget-worker-owner-v1';

const TRANSIENT_LABELS = Object.freeze([
  'TransientTransactionError',
  'RetryableWriteError',
  'UnknownTransactionCommitResult',
]);

/** Classifies only known Finance-domain or Mongo-driver failures. */
export function classifyMediaProxyMasterTranscodeBudgetMongoFailureV1(
  error: unknown,
): MediaProxyMasterTranscodeBudgetInfrastructureFailureV1 | null {
  if (error instanceof MediaProxyMasterTranscodeExecutionBudgetLedgerOwnerErrorV1
    || error instanceof MediaProxyMasterTranscodeExecutionBudgetMongoLedgerErrorV1
    || error instanceof MediaProxyMasterTranscodeExecutionBudgetPolicyMongoErrorV1) {
    return result(error.message, false);
  }
  if (error instanceof MongoNetworkTimeoutError
    || error instanceof MongoOperationTimeoutError) {
    return result('PROXY_BUDGET_MONGO_TIMEOUT', true);
  }
  if (error instanceof MongoNetworkError) {
    return result('PROXY_BUDGET_MONGO_NETWORK_UNAVAILABLE', true);
  }
  if (error instanceof MongoServerSelectionError) {
    return result('PROXY_BUDGET_MONGO_SERVER_SELECTION_UNAVAILABLE', true);
  }
  if (error instanceof MongoTopologyClosedError
    || error instanceof MongoNotConnectedError) {
    return result('PROXY_BUDGET_MONGO_CLIENT_UNAVAILABLE', true);
  }
  if (error instanceof MongoError
    && TRANSIENT_LABELS.some((label) => error.hasErrorLabel(label))) {
    return result('PROXY_BUDGET_MONGO_TRANSIENT_OPERATION', true);
  }
  return null;
}

function result(
  errorCode: string,
  retryable: boolean,
): MediaProxyMasterTranscodeBudgetInfrastructureFailureV1 {
  return Object.freeze({ errorCode, retryable });
}
