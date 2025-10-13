import mongoose, { Schema, Document, models, model } from "mongoose";

export type GameType = "bgmi" | "valorant";

export interface TeamMemberCommon {
  name: string;
}

export interface BgmiDetails {
  ign: string; // In-Game Name
  uid: string; // BGMI ID (UID)
  rank?: string; // Tier/Rank
}

export interface ValorantDetails {
  riotId: string; // Name#Tagline
  rank?: string;
  preferredAgents?: string; // comma-separated
}

export interface TeamMember extends TeamMemberCommon {
  bgmi?: BgmiDetails;
  valorant?: ValorantDetails;
}

export interface Ics25Registration extends Document {
  clerkUserId?: string; // optional if user not logged in (allow guest?)
  leader: {
    name: string;
    phone: string;
    email: string;
    instagram: string;
    discord?: string;
  };
  teamName: string;
  game: GameType;
  leaderGameInfo: {
    bgmi?: BgmiDetails;
    valorant?: ValorantDetails;
  };
  teammates: TeamMember[]; // number of teammates selected
  numTeammates: number; // 0..3 (bgmi) or 0..4 (valorant)
  amountPerPerson: number; // 500
  currency: string; // INR
  totalAmount: number; // computed = amountPerPerson * (1 + numTeammates)
  razorpay: {
    orderId?: string;
    paymentId?: string;
    signature?: string;
    status: "pending" | "paid" | "failed";
  };
  createdAt: Date;
  updatedAt: Date;
}

const BgmiDetailsSchema = new Schema<BgmiDetails>({
  ign: { type: String, required: true },
  uid: { type: String, required: true },
  rank: { type: String },
});

const ValorantDetailsSchema = new Schema<ValorantDetails>({
  riotId: { type: String, required: true },
  rank: { type: String },
  preferredAgents: { type: String },
});

const TeamMemberSchema = new Schema<TeamMember>({
  name: { type: String, required: true },
  bgmi: { type: BgmiDetailsSchema, required: false },
  valorant: { type: ValorantDetailsSchema, required: false },
});

const Ics25RegistrationSchema = new Schema<Ics25Registration>(
  {
    clerkUserId: { type: String },
    leader: {
      name: { type: String, required: true },
      phone: { type: String, required: true },
      email: { type: String, required: true },
      instagram: { type: String, required: true },
      discord: { type: String },
    },
    teamName: { type: String, required: true },
    game: { type: String, enum: ["bgmi", "valorant"], required: true },
    leaderGameInfo: {
      bgmi: { type: BgmiDetailsSchema },
      valorant: { type: ValorantDetailsSchema },
    },
    teammates: { type: [TeamMemberSchema], default: [] },
    numTeammates: { type: Number, required: true },
    amountPerPerson: { type: Number, default: 500 },
    currency: { type: String, default: "INR" },
    totalAmount: { type: Number, required: true },
    razorpay: {
      orderId: { type: String },
      paymentId: { type: String },
      signature: { type: String },
      status: { type: String, enum: ["pending", "paid", "failed"], default: "pending" },
    },
  },
  { timestamps: true }
);

export default (models.Ics25Registration as mongoose.Model<Ics25Registration>) ||
  model<Ics25Registration>("Ics25Registration", Ics25RegistrationSchema);
