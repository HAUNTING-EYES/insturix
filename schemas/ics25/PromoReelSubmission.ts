import mongoose, { Schema, models, model } from 'mongoose';

const PromoReelSubmissionSchema = new Schema({
  playerId: { type: String, index: true },
  clerkUserId: { type: String, index: true },
  name: String,
  instagram: String,
  proofUrl: String,
  amount: { type: Number, default: 100 },
  status: { type: String, enum: ['submitted', 'verified', 'rejected'], default: 'submitted' },
  reviewedAt: Date,
}, { timestamps: true });

export type PromoReelSubmissionDocument = mongoose.InferSchemaType<typeof PromoReelSubmissionSchema> & mongoose.Document;

export default models.Ics25PromoReel || model('Ics25PromoReel', PromoReelSubmissionSchema);
