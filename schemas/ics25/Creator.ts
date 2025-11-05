import type { Document, InferSchemaType, Model } from 'mongoose';
import { getIcs25Mongoose } from '@/lib/ics25-mongo';

const mongoose = getIcs25Mongoose();
const { Schema } = mongoose;

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

export type Ics25CreatorDocument = InferSchemaType<typeof Ics25CreatorSchema> & Document;

const Ics25CreatorModel =
  (mongoose.models.Ics25Creator as Model<Ics25CreatorDocument>)
  || mongoose.model('Ics25Creator', Ics25CreatorSchema, 'ics25creators');

export default Ics25CreatorModel;
