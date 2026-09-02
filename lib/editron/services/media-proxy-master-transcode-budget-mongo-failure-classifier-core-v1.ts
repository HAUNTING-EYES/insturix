import {
  MongoError,
  MongoNetworkError,
  MongoNetworkTimeoutError,
  MongoNotConnectedError,
  MongoOperationTimeoutError,
  MongoServerSelectionError,
  MongoTopologyClosedError,
} from 'mongodb';

export type MediaProxyMasterTranscodeBudgetInfrastructureFailureCoreV1 =
  Readonly<{
    errorCode: string;
    retryable: boolean;
  }>;

const TRANSIENT_LABELS = Object.freeze([
  'TransientTransactionError',
  'RetryableWriteError',
  'UnknownTransactionCommitResult',
]);

/** Classifies only caller-owned domain errors or known Mongo-driver failures. */
export function classifyMediaProxyMasterTranscodeBudgetMongoFailureCoreV1(
  error: unknown,
  isPermanentDomainFailure: (value: unknown) => value is Error,
): MediaProxyMasterTranscodeBudgetInfrastructureFailureCoreV1 | null {
  if (isPermanentDomainFailure(error)) return result(error.message, false);
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
): MediaProxyMasterTranscodeBudgetInfrastructureFailureCoreV1 {
  return Object.freeze({ errorCode, retryable });
}
