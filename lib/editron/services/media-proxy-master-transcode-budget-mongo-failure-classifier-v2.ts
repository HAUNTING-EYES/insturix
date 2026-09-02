import { classifyMediaProxyMasterTranscodeBudgetMongoFailureCoreV1 }
  from './media-proxy-master-transcode-budget-mongo-failure-classifier-core-v1';
import { MediaProxyMasterTranscodeExecutionBudgetLedgerOwnerErrorV2 }
  from './media-proxy-master-transcode-execution-budget-ledger-owner-v2';
import { MediaProxyMasterTranscodeExecutionBudgetMongoLedgerErrorV2 }
  from './media-proxy-master-transcode-execution-budget-mongo-ledger-v2';
import { MediaProxyMasterTranscodeExecutionBudgetPolicyMongoErrorV1 }
  from './media-proxy-master-transcode-execution-budget-policy-mongo-v1';
import type { MediaProxyMasterTranscodeBudgetInfrastructureFailureV2 }
  from './media-proxy-master-transcode-execution-budget-worker-owner-v2';

/** Classifies only known V2 Finance-domain or Mongo-driver failures. */
export function classifyMediaProxyMasterTranscodeBudgetMongoFailureV2(
  error: unknown,
): MediaProxyMasterTranscodeBudgetInfrastructureFailureV2 | null {
  return classifyMediaProxyMasterTranscodeBudgetMongoFailureCoreV1(
    error,
    isPermanentDomainFailure,
  );
}

function isPermanentDomainFailure(error: unknown): error is Error {
  return error
      instanceof MediaProxyMasterTranscodeExecutionBudgetLedgerOwnerErrorV2
    || error
      instanceof MediaProxyMasterTranscodeExecutionBudgetMongoLedgerErrorV2
    || error
      instanceof MediaProxyMasterTranscodeExecutionBudgetPolicyMongoErrorV1;
}
