import mongoose, { Schema, models, model } from 'mongoose';

const AttendeePaymentSchema = new Schema({
  status: { type: String, enum: ['none', 'pending', 'paid', 'failed'], default: 'none' },
  orderId: String,
  paymentId: String,
  signature: String,
  amount: Number,
  currency: String,
  paidAt: Date,
}, { _id: false });

const AttendeeReferralSchema = new Schema({
  code: { type: String },
  referredCount: { type: Number, default: 0 },
  referredUserIds: { type: [String], default: [] },
  qualified: { type: Boolean, default: false },
  amount: Number,
}, { _id: false });

const UpgradePaymentSchema = new Schema({
  orderId: String,
  paymentId: String,
  signature: String,
  amount: Number,
  targetTier: String,
  paidAt: Date,
}, { _id: false });

const RefundSchema = new Schema({
  paymentId: String,
  refundId: String,
  amount: Number,
  reason: String,
  status: { type: String, enum: ['pending', 'processed', 'failed'], default: 'pending' },
  processedAt: Date,
}, { _id: false });

const UpgradeIntentSchema = new Schema({
  targetTier: String,
  orderId: String,
  amount: Number,
  status: { type: String, enum: ['pending', 'completed', 'cancelled'], default: 'pending' },
}, { _id: false });

const Ics25AttendeeSchema = new Schema({
  clerkUserId: { type: String, index: true, required: true },
  name: { type: String },
  email: { type: String },
  phone: { type: String },
  instagram: { type: String },
  linkedin: String,
  organization: String,
  profession: { type: String },
  ageGroup: { type: String },
  city: { type: String },
  state: { type: String },
  attendeePassTier: { type: String, enum: ['bronze', 'silver', 'gold', 'creators'], required: true },
  payment: { type: AttendeePaymentSchema, default: () => ({ status: 'none' }) },
  referredBy: {
    code: { type: String },
    referrerUserId: { type: String },
    confirmed: { type: Boolean, default: false },
  },
  cashback: {
    referral: { type: AttendeeReferralSchema, default: () => ({ amount: 150, referredCount: 0, referredUserIds: [], qualified: false }) },
  },
  upgradeIntent: { type: UpgradeIntentSchema },
  upgradePayments: { type: [UpgradePaymentSchema], default: [] },
  refunds: { type: [RefundSchema], default: [] },
}, { timestamps: true });

export type Ics25AttendeeDocument = mongoose.InferSchemaType<typeof Ics25AttendeeSchema> & mongoose.Document;

export default models.Ics25Attendee || model('Ics25Attendee', Ics25AttendeeSchema);
