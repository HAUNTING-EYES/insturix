import mongoose, { Schema, type Document } from "mongoose";
import { CampaignReferenceSchema, type CalosCampaignReference } from "@/schemas/calos-campaign";

/**
 * Brand-level references = the source materials (links, PDFs, docs, notes, images) a user attaches to
 * a BRAND, independent of any campaign. This is the baseline: references are brand knowledge and must
 * work even when the user never creates a campaign. Generation always pulls these; a campaign's own
 * references (calos_campaigns.references) are layered ON TOP when a card belongs to one.
 *
 * One document per (ownerUserId, brandId). Reuses the same reference sub-schema as campaigns so the
 * shape + ingestion stay identical across both levels.
 */
export interface ICalosBrandReferences extends Document {
  ownerUserId: string;
  brandId: string;
  orgId?: string | null; // optional agency/team-share layer (future)
  references: CalosCampaignReference[];
  createdAt: Date;
  updatedAt: Date;
}

const CalosBrandReferencesSchema = new Schema<ICalosBrandReferences>(
  {
    ownerUserId: { type: String, required: true },
    brandId: { type: String, required: true },
    orgId: { type: String, default: null },
    references: { type: [CampaignReferenceSchema], default: [] },
  },
  { timestamps: true }
);

// One references doc per owner+brand.
CalosBrandReferencesSchema.index({ ownerUserId: 1, brandId: 1 }, { unique: true });

const CalosBrandReferences =
  mongoose.models.CalosBrandReferences ||
  mongoose.model<ICalosBrandReferences>(
    "CalosBrandReferences",
    CalosBrandReferencesSchema,
    "calos_brand_references"
  );

export default CalosBrandReferences;
