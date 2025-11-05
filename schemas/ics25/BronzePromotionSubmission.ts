import type { Document, InferSchemaType, Model } from 'mongoose';
import { getIcs25Mongoose } from '@/lib/ics25-mongo';

const mongoose = getIcs25Mongoose();
const { Schema } = mongoose;

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

export type BronzePromotionSubmissionDocument = InferSchemaType<typeof BronzePromotionSubmissionSchema> & Document;

const Ics25BronzePromotionModel =
  (mongoose.models.Ics25BronzePromotion as Model<BronzePromotionSubmissionDocument>)
  || mongoose.model('Ics25BronzePromotion', BronzePromotionSubmissionSchema);

export default Ics25BronzePromotionModel;
