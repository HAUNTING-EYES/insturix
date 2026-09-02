import {
  createMediaProxyMasterTranscodeExecutionBudgetMongoLedgerCoreV1,
  type MediaProxyMasterTranscodeExecutionBudgetMongoCollectionCoreV1,
  type MediaProxyMasterTranscodeExecutionBudgetMongoRuntimeCoreV1,
  type MediaProxyMasterTranscodeExecutionBudgetMongoSessionCoreV1,
} from './media-proxy-master-transcode-execution-budget-mongo-ledger-core-v1';
import {
  MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_LEDGER_RECORD_VERSION_V1,
  type MediaProxyMasterTranscodeExecutionBudgetLedgerRecordV1,
} from './media-proxy-master-transcode-execution-budget-ledger-record-v1';
import type { MediaProxyMasterTranscodeExecutionBudgetLedgerV1 }
  from './media-proxy-master-transcode-execution-budget-ledger-owner-v1';

export const MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_LEDGER_COLLECTION_V1 =
  'editron_media_proxy_master_transcode_execution_budget_ledger_v1' as const;

export type MediaProxyMasterTranscodeExecutionBudgetMongoSessionV1 =
  MediaProxyMasterTranscodeExecutionBudgetMongoSessionCoreV1;

export type MediaProxyMasterTranscodeExecutionBudgetMongoCollectionV1 =
  MediaProxyMasterTranscodeExecutionBudgetMongoCollectionCoreV1;

export type MediaProxyMasterTranscodeExecutionBudgetMongoRuntimeV1 =
  MediaProxyMasterTranscodeExecutionBudgetMongoRuntimeCoreV1;

export function createMediaProxyMasterTranscodeExecutionBudgetMongoLedgerV1(
  input: Readonly<{
    loadRuntime?: () => Promise<Readonly<
      MediaProxyMasterTranscodeExecutionBudgetMongoRuntimeV1
    >>;
  }> = {},
): Readonly<MediaProxyMasterTranscodeExecutionBudgetLedgerV1> {
  return createMediaProxyMasterTranscodeExecutionBudgetMongoLedgerCoreV1<
    MediaProxyMasterTranscodeExecutionBudgetLedgerRecordV1
  >({
    collectionName:
      MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_LEDGER_COLLECTION_V1,
    recordSchemaVersion:
      MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_LEDGER_RECORD_VERSION_V1,
    uniqueReservationIndexName:
      'uniq_proxy_transcode_execution_budget_reservation_v1',
    scopeStatusIndexName:
      'scope_asset_status_proxy_transcode_execution_budget_v1',
    loadRuntime: input.loadRuntime,
    fail,
  });
}

function fail(code: string): never {
  throw new MediaProxyMasterTranscodeExecutionBudgetMongoLedgerErrorV1(code);
}

export class MediaProxyMasterTranscodeExecutionBudgetMongoLedgerErrorV1
  extends Error {
  constructor(code: string) {
    super(
      `MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_MONGO_LEDGER_${code}`,
    );
    this.name =
      'MediaProxyMasterTranscodeExecutionBudgetMongoLedgerErrorV1';
  }
}
