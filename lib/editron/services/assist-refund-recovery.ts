import {
  ASSIST_STATUS_SCAN_FAILED,
  settleAssistScanFailure,
  type AssistScanFailureSettlementDisposition,
} from '@/lib/editron/services/assist-lane';

const ACTIVE_ASSIST_SCAN_STATES = [
  'queued',
  'analyzing',
  'transcribing',
  'cleaning',
  'computing_params',
  'analyzing_deep',
  'analysis_complete',
  'directing_queued',
] as const;

type AssistRecoveryProject = {
  projectId?: unknown;
  userId?: unknown;
  autoEditStatus?: unknown;
  updatedAt?: unknown;
  assistCreditTransactionId?: unknown;
  assistChargedCredits?: unknown;
  assistRefundPending?: unknown;
};

export interface AssistRefundRecoveryDetail {
  projectId: string;
  outcome:
    | AssistScanFailureSettlementDisposition
    | 'failed-without-charge'
    | 'invalid-recovery-record'
    | 'recovery-error';
}

export interface AssistRefundRecoveryResult {
  found: number;
  recovered: number;
  pending: number;
  details: AssistRefundRecoveryDetail[];
}

export async function recoverAssistScanSettlements(
  db: { collection: (name: string) => any },
  input: { staleBefore: Date; limit?: number },
): Promise<AssistRefundRecoveryResult> {
  const limit = Number.isSafeInteger(input.limit) && (input.limit ?? 0) > 0
    ? Math.min(input.limit as number, 25)
    : 10;
  const projects = db.collection('projects');
  const candidates = await projects.find({
    editMode: 'assist',
    $or: [
      { autoEditStatus: ASSIST_STATUS_SCAN_FAILED, assistRefundPending: true },
      {
        autoEditStatus: { $in: ACTIVE_ASSIST_SCAN_STATES },
        updatedAt: { $lt: input.staleBefore },
      },
    ],
  })
    .project({
      _id: 0,
      projectId: 1,
      userId: 1,
      autoEditStatus: 1,
      updatedAt: 1,
      assistCreditTransactionId: 1,
      assistChargedCredits: 1,
      assistRefundPending: 1,
    })
    .limit(limit)
    .toArray() as AssistRecoveryProject[];

  const result: AssistRefundRecoveryResult = {
    found: candidates.length,
    recovered: 0,
    pending: 0,
    details: [],
  };

  for (const candidate of candidates) {
    const projectId = typeof candidate.projectId === 'string' ? candidate.projectId.trim() : '';
    const userId = typeof candidate.userId === 'string' ? candidate.userId.trim() : '';
    if (!projectId || !userId) {
      result.pending += 1;
      result.details.push({ projectId: projectId || 'unknown', outcome: 'invalid-recovery-record' });
      continue;
    }

    try {
      const transactionId = typeof candidate.assistCreditTransactionId === 'string'
        ? candidate.assistCreditTransactionId.trim()
        : '';
      if (transactionId) {
        const outcome = await settleAssistScanFailure(db, {
          projectId,
          userId,
          reason: `Assist scan recovery: stale in '${String(candidate.autoEditStatus ?? 'unknown')}'`,
          creditTransactionId: transactionId,
        });
        if (outcome === 'refunded') result.recovered += 1;
        else result.pending += 1;
        result.details.push({ projectId, outcome });
        continue;
      }

      if (candidate.autoEditStatus === ASSIST_STATUS_SCAN_FAILED) {
        result.pending += 1;
        result.details.push({ projectId, outcome: 'invalid-recovery-record' });
        continue;
      }

      const terminal = await projects.updateOne(
        {
          projectId,
          userId,
          editMode: 'assist',
          autoEditStatus: candidate.autoEditStatus,
          updatedAt: candidate.updatedAt,
          $and: [
            { $or: [{ assistCreditTransactionId: { $exists: false } }, { assistCreditTransactionId: null }] },
            { $or: [{ assistChargedCredits: { $exists: false } }, { assistChargedCredits: null }] },
          ],
        },
        {
          $set: {
            autoEditStatus: ASSIST_STATUS_SCAN_FAILED,
            autoEditError: `Assist scan recovery: stale in '${String(candidate.autoEditStatus ?? 'unknown')}' before any charge`,
            updatedAt: new Date(),
          },
        },
      );
      if (terminal.modifiedCount === 1) {
        result.recovered += 1;
        result.details.push({ projectId, outcome: 'failed-without-charge' });
      } else {
        result.pending += 1;
        result.details.push({ projectId, outcome: 'transition-lost' });
      }
    } catch (error: unknown) {
      console.error('[DirectorMode][RECOVERY-FAILED] Assist settlement recovery failed:', {
        projectId,
        error: error instanceof Error ? error.message : String(error),
      });
      result.pending += 1;
      result.details.push({ projectId, outcome: 'recovery-error' });
    }
  }

  return result;
}
