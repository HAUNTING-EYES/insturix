import {
  createMediaProxyMasterTranscodeExecutionBudgetMongoLedgerCoreV1,
  type MediaProxyMasterTranscodeExecutionBudgetMongoCollectionCoreV1,
  type MediaProxyMasterTranscodeExecutionBudgetMongoRuntimeCoreV1,
  type MediaProxyMasterTranscodeExecutionBudgetMongoSessionCoreV1,
} from './media-proxy-master-transcode-execution-budget-mongo-ledger-core-v1';
import {
  MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_LEDGER_RECORD_VERSION_V2,
  type MediaProxyMasterTranscodeExecutionBudgetLedgerRecordV2,
} from './media-proxy-master-transcode-execution-budget-ledger-record-v2';
import type { MediaProxyMasterTranscodeExecutionBudgetLedgerV2 }
  from './media-proxy-master-transcode-execution-budget-ledger-owner-v2';

export const MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_LEDGER_COLLECTION_V2 =
  'editron_media_proxy_master_transcode_execution_budget_ledger_v2' as const;

export type MediaProxyMasterTranscodeExecutionBudgetMongoSessionV2 =
  MediaProxyMasterTranscodeExecutionBudgetMongoSessionCoreV1;

export type MediaProxyMasterTranscodeExecutionBudgetMongoCollectionV2 =
  MediaProxyMasterTranscodeExecutionBudgetMongoCollectionCoreV1;

export type MediaProxyMasterTranscodeExecutionBudgetMongoRuntimeV2 =
  MediaProxyMasterTranscodeExecutionBudgetMongoRuntimeCoreV1;

export function createMediaProxyMasterTranscodeExecutionBudgetMongoLedgerV2(
  input: Readonly<{
    loadRuntime?: () => Promise<Readonly<
      MediaProxyMasterTranscodeExecutionBudgetMongoRuntimeV2
    >>;
  }> = {},
): Readonly<MediaProxyMasterTranscodeExecutionBudgetLedgerV2> {
  return createMediaProxyMasterTranscodeExecutionBudgetMongoLedgerCoreV1<
    MediaProxyMasterTranscodeExecutionBudgetLedgerRecordV2
  >({
    collectionName:
      MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_LEDGER_COLLECTION_V2,
    recordSchemaVersion:
      MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_LEDGER_RECORD_VERSION_V2,
    uniqueReservationIndexName:
      'uniq_proxy_transcode_execution_budget_reservation_v2',
    scopeStatusIndexName:
      'scope_asset_status_proxy_transcode_execution_budget_v2',
    loadRuntime: input.loadRuntime,
    fail,
  });
}

function fail(code: string): never {
  throw new MediaProxyMasterTranscodeExecutionBudgetMongoLedgerErrorV2(code);
}

export class MediaProxyMasterTranscodeExecutionBudgetMongoLedgerErrorV2
  extends Error {
  constructor(code: string) {
    super(
      `MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_V2_MONGO_LEDGER_${code}`,
    );
    this.name =
      'MediaProxyMasterTranscodeExecutionBudgetMongoLedgerErrorV2';
  }
}
