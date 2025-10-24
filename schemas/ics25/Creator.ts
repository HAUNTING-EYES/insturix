import mongoose, { Schema, models, model } from 'mongoose';

const CreatorSocialLinksSchema = new Schema({
  youtube: { type: String },
  instagram: { type: String },
  linkedin: { type: String },
}, { _id: false });

const Ics25CreatorSchema = new Schema({
  clerkUserId: { type: String, index: true, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: true },
  instagram: { type: String, required: true },
  linkedin: { type: String, required: true },
  organization: { type: String },
  profession: { type: String, required: true },
  ageGroup: { type: String, required: true },
  city: { type: String, required: true },
  state: { type: String, required: true },
  socialLinks: { type: CreatorSocialLinksSchema, required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', required: true },
  submittedAt: { type: Date, default: Date.now },
  reviewedAt: { type: Date },
  reviewedBy: { type: String }, // Admin user ID or email
  rejectionReason: { type: String },
  // Flag to track if they've completed payment after approval
  hasCompletedPayment: { type: Boolean, default: false },
}, { timestamps: true });

export type Ics25CreatorDocument = mongoose.InferSchemaType<typeof Ics25CreatorSchema> & mongoose.Document;

export default models.Ics25Creator || model('Ics25Creator', Ics25CreatorSchema, 'ics25creators');
