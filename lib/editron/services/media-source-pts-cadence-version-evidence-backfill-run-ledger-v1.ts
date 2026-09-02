import type { MediaSourcePtsCadenceVersionEvidenceBackfillBatchReceiptV1 }
  from './media-source-pts-cadence-version-evidence-backfill-batch-v1';
import type { MediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1 }
  from './media-source-pts-cadence-version-evidence-backfill-run-record-v1';

export type MediaSourcePtsCadenceVersionEvidenceBackfillRunLedgerPortsV1 =
  Readonly<{
    load(
      migrationRunId: string,
    ): Promise<MediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1 | null>;
    compareAndSet(input: Readonly<{
      migrationRunId: string;
      expectedRecordSha256: string | null;
      next: MediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1;
      acceptedReceipt:
        MediaSourcePtsCadenceVersionEvidenceBackfillBatchReceiptV1 | null;
    }>): Promise<boolean>;
  }>;
