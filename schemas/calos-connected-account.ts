import mongoose, { Schema, Document, models } from "mongoose";
import type { CalosPublishPlatform } from "@/schemas/calos-scheduled-publish";

/**
 * Per-BRAND connected social account for publishing. This is the agency-grade replacement for the
 * per-USER `User.<platform>Tokens` blob: a brand can connect its OWN account(s) per platform, and a
 * user managing many brands posts to each brand's own socials (not their personal accounts).
 *
 * Tokens are ENCRYPTED at rest (lib/calos/publish/token-crypto — AES-256-GCM); never stored
 * plaintext (eng-review R1). Lives in the CalOS Mongoose DB (MONGODB_DB_NAME), co-located with the
 * publish queue + deliverables so the sessionless cron resolves a token on one connection (R6).
 *
 * Transition (R4): this is ADDITIVE — `User.<platform>Tokens` stays for the per-user path + the
 * legacy connect UI + brand-vault ingestion. The publisher reads a brand account if one exists for
 * (brandId, platform), else falls back to the user token. Do NOT delete the User blobs.
 */
export interface ICalosConnectedAccount extends Document {
  orgId?: string | null;
  brandId: string;
  platform: CalosPublishPlatform;
  accountRef?: string | null; // the platform's account / page / organization / channel id (author target)
  displayName?: string | null; // human label, e.g. "Acme LinkedIn Page"
  ownerUserId: string; // who connected it — token owner for refresh write-back
  accessTokenEnc: string; // AES-256-GCM blob (token-crypto)
  refreshTokenEnc?: string | null;
  expiresAt?: Date | null;
  scopes?: string[];
  createdAt: Date;
  updatedAt: Date;
}

const CalosConnectedAccountSchema = new Schema<ICalosConnectedAccount>(
  {
    orgId: { type: String, default: null },
    brandId: { type: String, required: true },
    platform: {
      type: String,
      required: true,
      enum: ["youtube", "facebook", "instagram", "linkedin", "twitter", "tiktok"],
    },
    accountRef: { type: String, default: null },
    displayName: { type: String, default: null },
    ownerUserId: { type: String, required: true },
    accessTokenEnc: { type: String, required: true },
    refreshTokenEnc: { type: String, default: null },
    expiresAt: { type: Date, default: null },
    scopes: { type: [String], default: [] },
  },
  { timestamps: true }
);

// One row per (brand, platform, account). A brand may connect multiple accounts per platform
// (e.g. two LinkedIn pages) distinguished by accountRef.
CalosConnectedAccountSchema.index({ brandId: 1, platform: 1, accountRef: 1 }, { unique: true });
CalosConnectedAccountSchema.index({ orgId: 1, brandId: 1 });

const CalosConnectedAccount =
  models.CalosConnectedAccount ||
  mongoose.model<ICalosConnectedAccount>(
    "CalosConnectedAccount",
    CalosConnectedAccountSchema,
    "calos_connected_accounts"
  );

export default CalosConnectedAccount;
