import mongoose, { Schema, models, model } from 'mongoose';

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

export type LinkedInSubmissionDocument = mongoose.InferSchemaType<typeof LinkedInSubmissionSchema> & mongoose.Document;

export default models.Ics25LinkedInPromo || model('Ics25LinkedInPromo', LinkedInSubmissionSchema);
