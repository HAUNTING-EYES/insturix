import { classifyMediaProxyMasterTranscodeBudgetMongoFailureCoreV1 }
  from './media-proxy-master-transcode-budget-mongo-failure-classifier-core-v1';
import { MediaProxyMasterTranscodeExecutionBudgetLedgerOwnerErrorV1 }
  from './media-proxy-master-transcode-execution-budget-ledger-owner-v1';
import { MediaProxyMasterTranscodeExecutionBudgetMongoLedgerErrorV1 }
  from './media-proxy-master-transcode-execution-budget-mongo-ledger-v1';
import { MediaProxyMasterTranscodeExecutionBudgetPolicyMongoErrorV1 }
  from './media-proxy-master-transcode-execution-budget-policy-mongo-v1';
import type { MediaProxyMasterTranscodeBudgetInfrastructureFailureV1 }
  from './media-proxy-master-transcode-execution-budget-worker-owner-v1';

/** Classifies only known Finance-domain or Mongo-driver failures. */
export function classifyMediaProxyMasterTranscodeBudgetMongoFailureV1(
  error: unknown,
): MediaProxyMasterTranscodeBudgetInfrastructureFailureV1 | null {
  return classifyMediaProxyMasterTranscodeBudgetMongoFailureCoreV1(
    error,
    isPermanentDomainFailure,
  );
}

function isPermanentDomainFailure(error: unknown): error is Error {
  return error
      instanceof MediaProxyMasterTranscodeExecutionBudgetLedgerOwnerErrorV1
    || error
      instanceof MediaProxyMasterTranscodeExecutionBudgetMongoLedgerErrorV1
    || error
      instanceof MediaProxyMasterTranscodeExecutionBudgetPolicyMongoErrorV1;
}
