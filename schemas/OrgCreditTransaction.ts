import mongoose, { Document, Schema } from "mongoose";

/**
 * Org credit transactions (plan D4).
 *
 * A SEPARATE collection (org_credit_transactions), NOT the embedded 100-cap history, so
 * agencies get UNBOUNDED per-member spend reporting keyed on actorUserId. The org wallet
 * still keeps its embedded creditHistory (via creditsBalanceSchema) only for the fast-path
 * idempotency duplicate check — this collection is the durable audit/report ledger.
 *
 * `metadata` carries the fromSubscription/fromTopup split of a deduct so refunds can route
 * the exact split back to the right pool (plan D5), mirroring the user wallet's transaction
 * metadata.
 */
export interface IOrgCreditTransaction extends Document {
  clerkOrgId: string;        // indexed — the org whose wallet moved
  actorUserId: string;       // WHO spent/funded — the per-member report key
  projectId?: string;
  pool: 'main' | 'media';
  type: 'deduct' | 'topup' | 'subscription_grant' | 'refund' | 'adjust';
  amount: number;            // signed: negative for deduct, positive for a credit
  balanceAfter: number;      // pool total after this op (audit)
  operationId?: string;      // idempotency join to the editing operation
  razorpayEventId?: string;  // unique sparse — dedupes funding webhook replays
  metadata?: Record<string, unknown>;  // { fromSubscription, fromTopup, idempotencyKey, originalTransactionId, ... }
  createdAt: Date;
}

const orgCreditTransactionSchema = new Schema<IOrgCreditTransaction>({
  clerkOrgId: { type: String, required: true, index: true },
  actorUserId: { type: String, required: true },
  projectId: { type: String },
  pool: { type: String, required: true, enum: ['main', 'media'] },
  type: {
    type: String,
    required: true,
    enum: ['deduct', 'topup', 'subscription_grant', 'refund', 'adjust'],
  },
  amount: { type: Number, required: true },
  balanceAfter: { type: Number, required: true },
  operationId: { type: String },
  razorpayEventId: { type: String },
  metadata: { type: Schema.Types.Mixed },
}, {
  // Explicit collection name (plan D4); createdAt only — ledger rows are immutable.
  collection: 'org_credit_transactions',
  timestamps: { createdAt: true, updatedAt: false },
});

// Reporting indexes (plan §3)
orgCreditTransactionSchema.index({ clerkOrgId: 1, createdAt: -1 });
orgCreditTransactionSchema.index({ clerkOrgId: 1, actorUserId: 1 });
// Idempotency for funding webhooks: at most one row per Razorpay event, but rows without
// one (deducts) are not constrained.
orgCreditTransactionSchema.index({ razorpayEventId: 1 }, { unique: true, sparse: true });

export const OrgCreditTransaction = mongoose.models.OrgCreditTransaction ||
  mongoose.model<IOrgCreditTransaction>("OrgCreditTransaction", orgCreditTransactionSchema);
