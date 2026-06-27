import mongoose, { Schema, Document, models } from "mongoose";

/**
 * CalOS client-view share link RECORD.
 *
 * The share token (lib/calos/client-view.ts) is a stateless HMAC payload — signature + expiry verify
 * with zero DB reads. This record is what makes a link REVOCABLE: each minted link writes one row
 * keyed by the token's nonce (`tokenId`); a view checks the row isn't `revoked`, and the owner can
 * flip `revoked` to kill a link before its TTL. It also tracks usage (viewCount/lastViewedAt) so the
 * "manage links" UI can show which links are live.
 *
 * Scoping mirrors calosScope: org-shared when minted in an org, else creator-scoped (ownerUserId =
 * the scope the link reads as; createdBy = who minted it — same person at mint, kept distinct for a
 * future "team member X created this" view).
 */
export interface ICalosShareLink extends Document {
  tokenId: string; // = the token nonce; link identity (unique)
  brandId: string;
  orgId?: string | null;
  ownerUserId: string; // the scope the link reads as
  createdBy: string; // clerkUserId who minted it
  label?: string | null;
  revoked: boolean;
  expiresAt: Date; // mirrors the token TTL — a view past this is dead even if not revoked
  viewCount: number;
  lastViewedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const CalosShareLinkSchema = new Schema<ICalosShareLink>(
  {
    tokenId: { type: String, required: true, unique: true },
    brandId: { type: String, required: true },
    orgId: { type: String, default: null },
    ownerUserId: { type: String, required: true },
    createdBy: { type: String, required: true },
    label: { type: String, default: null },
    revoked: { type: Boolean, default: false },
    expiresAt: { type: Date, required: true },
    viewCount: { type: Number, default: 0 },
    lastViewedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// List a brand's links (newest first) for the manage-links UI.
CalosShareLinkSchema.index({ brandId: 1, ownerUserId: 1, createdAt: -1 });

const CalosShareLink =
  models.CalosShareLink ||
  mongoose.model<ICalosShareLink>("CalosShareLink", CalosShareLinkSchema, "calos_share_links");

export default CalosShareLink;
