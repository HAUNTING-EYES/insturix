import mongoose, { Schema, type Document, type Model } from "mongoose";

import {
  OUTREACH_BLOCK_REASONS,
  OUTREACH_ELIGIBILITIES,
  OUTREACH_MAILBOX_TYPES,
  OUTREACH_TIERS,
  type OutreachBlockReason,
  type OutreachEligibility,
  type OutreachMailboxType,
  type OutreachTier,
} from "@/lib/services/email/outreach/classification";

/**
 * A cold-outreach lead owned by Insturix.
 *
 * Ownership split (see the outbound plan): Twenty owns prospect/company/stage/
 * owner/notes/tasks; Insturix owns eligibility, suppression, campaigns,
 * sequences, deliveries and analytics. This collection is the Insturix half -
 * it is deliberately NOT the CRM, and it never becomes the source of truth for
 * sales stage.
 *
 * Suppression state is denormalised onto `eligibility` at import time for
 * reporting and cohort selection ONLY. The sending path must re-check live
 * suppression before every send; suppression changes after import and a stale
 * row here is not permission to send.
 */

export const OUTREACH_CONTACT_STATUSES = [
  "new",
  "queued",
  "contacted",
  "replied",
  "bounced",
  "unsubscribed",
  "excluded",
] as const;
export type OutreachContactStatus =
  (typeof OUTREACH_CONTACT_STATUSES)[number];

export interface IOutreachContact extends Document {
  email: string;
  normalizedEmail: string;

  // Provenance
  sourceSystem: string;
  sourceRecordId?: string;
  sourceLabel?: string;
  sourceUrl?: string;
  importBatchId?: string;

  // Company / person
  companyName?: string;
  companyDomain?: string;
  contactName?: string;
  jobTitle?: string;
  city?: string;
  jurisdiction: string;

  // Enrichment verdicts carried over from the enrichment service via Twenty
  emailProvenance?: string;
  emailConfidence?: number;
  contactCompleteness?: string;
  hasVerifiedProvenance: boolean;
  /** True when a scraping artifact (e.g. "%20info@") was repaired on import. */
  emailRepaired: boolean;

  // Classification
  eligibility: OutreachEligibility;
  mailboxType: OutreachMailboxType;
  tier: OutreachTier;
  blockReason?: OutreachBlockReason;
  classifierVersion: number;
  classifiedAt: Date;

  // Lifecycle
  status: OutreachContactStatus;
  doNotContact: boolean;
  lastContactedAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

const outreachContactSchema = new Schema<IOutreachContact>(
  {
    email: { type: String, required: true, trim: true },
    normalizedEmail: { type: String, required: true, trim: true, unique: true },

    sourceSystem: { type: String, required: true, trim: true },
    sourceRecordId: { type: String, trim: true },
    sourceLabel: { type: String, trim: true },
    sourceUrl: { type: String, trim: true },
    importBatchId: { type: String, trim: true },

    companyName: { type: String, trim: true },
    companyDomain: { type: String, trim: true },
    contactName: { type: String, trim: true },
    jobTitle: { type: String, trim: true },
    city: { type: String, trim: true },
    jurisdiction: { type: String, required: true, default: "UNKNOWN", trim: true },

    emailProvenance: { type: String, trim: true },
    emailConfidence: { type: Number, min: 0, max: 100 },
    contactCompleteness: { type: String, trim: true },
    hasVerifiedProvenance: { type: Boolean, required: true, default: false },
    emailRepaired: { type: Boolean, required: true, default: false },

    eligibility: {
      type: String,
      enum: OUTREACH_ELIGIBILITIES,
      required: true,
    },
    mailboxType: {
      type: String,
      enum: OUTREACH_MAILBOX_TYPES,
      required: true,
    },
    tier: { type: String, enum: OUTREACH_TIERS, required: true },
    blockReason: { type: String, enum: OUTREACH_BLOCK_REASONS },
    classifierVersion: { type: Number, required: true },
    classifiedAt: { type: Date, required: true },

    status: {
      type: String,
      enum: OUTREACH_CONTACT_STATUSES,
      required: true,
      default: "new",
    },
    doNotContact: { type: Boolean, required: true, default: false },
    lastContactedAt: { type: Date },
  },
  { timestamps: true }
);

// Cohort selection: "give me the next N sendable leads at tier A".
outreachContactSchema.index({ eligibility: 1, tier: 1, status: 1 });
outreachContactSchema.index({ importBatchId: 1 });
outreachContactSchema.index(
  { sourceSystem: 1, sourceRecordId: 1 },
  { sparse: true }
);
// Per-domain throttling needs to count in-flight sends by recipient domain.
outreachContactSchema.index({ companyDomain: 1 });

const OutreachContact =
  (mongoose.models.OutreachContact as Model<IOutreachContact> | undefined) ??
  mongoose.model<IOutreachContact>(
    "OutreachContact",
    outreachContactSchema,
    "outreach_contacts"
  );

export default OutreachContact;
