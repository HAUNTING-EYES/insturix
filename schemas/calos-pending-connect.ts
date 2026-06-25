import mongoose, { Schema, Document, models } from "mongoose";
import type { CalosPublishPlatform } from "@/schemas/calos-scheduled-publish";

/**
 * Short-lived holding record for the CalOS client-connect OAuth (Model B). After a client logs in with
 * their OWN account we have their (encrypted) token + the accounts that token can post as, but not yet
 * which one binds to the brand. We stash that here, hand a pendingId back to the UI, and the user picks
 * → /select promotes it to a CalosConnectedAccount and deletes this. TTL-expires in ~15m if abandoned.
 *
 * Tokens are ENCRYPTED at rest here too (token-crypto) — a pending record holds a real client token.
 * Lives in the CalOS Mongoose DB (MONGODB_DB_NAME), alongside the connected-account + publish queue.
 */
export interface ICalosPendingAccount {
  accountRef: string;
  accountType: "organization" | "personal";
  displayName: string;
}

export interface ICalosPendingConnect extends Document {
  pendingId: string;
  ownerUserId: string;
  orgId?: string | null;
  brandId: string;
  platform: CalosPublishPlatform;
  accessTokenEnc: string;
  refreshTokenEnc?: string | null;
  tokenExpiresAt?: Date | null;
  availableAccounts: ICalosPendingAccount[];
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const PendingAccountSchema = new Schema<ICalosPendingAccount>(
  {
    accountRef: { type: String, required: true },
    accountType: { type: String, enum: ["organization", "personal"], required: true },
    displayName: { type: String, default: "" },
  },
  { _id: false },
);

const CalosPendingConnectSchema = new Schema<ICalosPendingConnect>(
  {
    pendingId: { type: String, required: true, unique: true },
    ownerUserId: { type: String, required: true },
    orgId: { type: String, default: null },
    brandId: { type: String, required: true },
    platform: {
      type: String,
      required: true,
      enum: ["youtube", "facebook", "instagram", "linkedin", "twitter", "tiktok"],
    },
    accessTokenEnc: { type: String, required: true },
    refreshTokenEnc: { type: String, default: null },
    tokenExpiresAt: { type: Date, default: null },
    availableAccounts: { type: [PendingAccountSchema], default: [] },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

// TTL: Mongo drops the doc once expiresAt passes (abandoned connects clean themselves up).
CalosPendingConnectSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const CalosPendingConnect =
  models.CalosPendingConnect ||
  mongoose.model<ICalosPendingConnect>(
    "CalosPendingConnect",
    CalosPendingConnectSchema,
    "calos_pending_connects",
  );

export default CalosPendingConnect;
