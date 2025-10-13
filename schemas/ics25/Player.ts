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
  meta: Schema.Types.Mixed,
}, { timestamps: true });

export type PlayerDocument = mongoose.InferSchemaType<typeof PlayerSchema> & mongoose.Document;

export default models.Ics25Player || model('Ics25Player', PlayerSchema);
