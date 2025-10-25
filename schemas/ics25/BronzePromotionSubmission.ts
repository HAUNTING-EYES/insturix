import mongoose, { Schema, models, model } from 'mongoose';

const BronzePromotionSubmissionSchema = new Schema({
  clerkUserId: { type: String, index: true },
  name: String,
  email: String,
  phone: String,
  instagramProofUrl: String, // Link to Instagram promotion post
  linkedinProofUrl: String, // Link to LinkedIn promotion post
  status: { type: String, enum: ['submitted', 'verified', 'rejected'], default: 'submitted' },
  rejectionReason: String,
  reviewedAt: Date,
  reviewedBy: String, // admin's clerkUserId
}, { timestamps: true });

export type BronzePromotionSubmissionDocument = mongoose.InferSchemaType<typeof BronzePromotionSubmissionSchema> & mongoose.Document;

export default models.Ics25BronzePromotion || model('Ics25BronzePromotion', BronzePromotionSubmissionSchema);
