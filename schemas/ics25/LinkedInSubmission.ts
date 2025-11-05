import type { Document, InferSchemaType, Model } from 'mongoose';
import { getIcs25Mongoose } from '@/lib/ics25-mongo';

const mongoose = getIcs25Mongoose();
const { Schema } = mongoose;

const LinkedInSubmissionSchema = new Schema({
  playerId: { type: String, index: true },
  clerkUserId: { type: String, index: true },
  name: String,
  instagram: String,
  proofUrl: String,
  amount: { type: Number, default: 75 },
  status: { type: String, enum: ['submitted', 'verified', 'rejected'], default: 'submitted' },
  reviewedAt: Date,
}, { timestamps: true });

export type LinkedInSubmissionDocument = InferSchemaType<typeof LinkedInSubmissionSchema> & Document;

const Ics25LinkedInPromoModel =
  (mongoose.models.Ics25LinkedInPromo as Model<LinkedInSubmissionDocument>)
  || mongoose.model('Ics25LinkedInPromo', LinkedInSubmissionSchema);

export default Ics25LinkedInPromoModel;
