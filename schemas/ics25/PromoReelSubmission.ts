import type { Document, InferSchemaType, Model } from 'mongoose';
import { getIcs25Mongoose } from '@/lib/ics25-mongo';

const mongoose = getIcs25Mongoose();
const { Schema } = mongoose;

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

export type PromoReelSubmissionDocument = InferSchemaType<typeof PromoReelSubmissionSchema> & Document;

const Ics25PromoReelModel =
  (mongoose.models.Ics25PromoReel as Model<PromoReelSubmissionDocument>)
  || mongoose.model('Ics25PromoReel', PromoReelSubmissionSchema);

export default Ics25PromoReelModel;
