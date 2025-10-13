import mongoose, { Schema, models, model } from 'mongoose';

export type Game = 'valorant' | 'bgmi';

const GameSpecificSchema = new Schema({
  valorant: {
    riotId: { type: String },
    rank: { type: String },
    preferredAgents: { type: String },
  },
  bgmi: {
    ign: { type: String },
    uid: { type: String },
    rank: { type: String },
  },
}, { _id: false });

const PaymentSchema = new Schema({
  status: { type: String, enum: ['none', 'pending', 'paid', 'failed'], default: 'none' },
  orderId: String,
  paymentId: String,
  signature: String,
  amount: Number,
  currency: String,
  paidAt: Date,
}, { _id: false });

const CashbackTaskSchema = new Schema({
  status: { type: String, enum: ['none', 'submitted', 'verified', 'rejected'], default: 'none' },
  proofUrl: String,
  amount: Number,
  verifiedAt: Date,
}, { _id: false });

const ReferralSchema = new Schema({
  code: { type: String },
  referredCount: { type: Number, default: 0 },
  referredUserIds: { type: [String], default: [] },
  qualified: { type: Boolean, default: false },
  amount: Number,
}, { _id: false });

const PlayerSchema = new Schema({
  clerkUserId: { type: String, index: true },
  name: String,
  email: String,
  phone: String,
  instagram: String,
  discord: String,
  game: { type: String, enum: ['valorant', 'bgmi'] },
  gameDetails: GameSpecificSchema,
  teamCode: { type: String, default: 'awaiting' },
  teamRequests: { type: [String], default: [] }, // list of codes
  payment: PaymentSchema,
  cashbacks: {
    promoReel: { type: CashbackTaskSchema, default: () => ({ amount: 100, status: 'none' }) },
    linkedinPost: { type: CashbackTaskSchema, default: () => ({ amount: 75, status: 'none' }) },
    referral: { type: ReferralSchema, default: () => ({ amount: 75, referredCount: 0, referredUserIds: [], qualified: false }) },
  },
  referredBy: {
    code: { type: String },
    referrerUserId: { type: String },
    confirmed: { type: Boolean, default: false },
  },
  meta: Schema.Types.Mixed,
}, { timestamps: true });

export type PlayerDocument = mongoose.InferSchemaType<typeof PlayerSchema> & mongoose.Document;

export default models.Ics25Player || model('Ics25Player', PlayerSchema);
