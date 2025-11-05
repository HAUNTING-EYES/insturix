import type { Document, InferSchemaType, Model } from 'mongoose';
import { getIcs25Mongoose } from '@/lib/ics25-mongo';

const mongoose = getIcs25Mongoose();
const { Schema } = mongoose;

const TeamSchema = new Schema({
  teamName: { type: String, required: true, maxlength: 20 },
  code: { type: String, required: true, unique: true, index: true },
  game: { type: String, enum: ['valorant', 'bgmi'], required: true },
  leaderId: { type: String, required: true, index: true }, // clerkUserId
  members: { type: [String], default: [] }, // clerkUserIds
  pendingRequests: { type: [String], default: [] }, // clerkUserIds
  link: { type: String },
  // When true, the team will appear in public browse lists for the selected game
  // Default public; older teams without this field are treated as public by API browse
  listed: { type: Boolean, default: true },
  meta: Schema.Types.Mixed,
}, { timestamps: true });

export type TeamDocument = InferSchemaType<typeof TeamSchema> & Document;

const Ics25TeamModel =
  (mongoose.models.Ics25Team as Model<TeamDocument>)
  || mongoose.model('Ics25Team', TeamSchema);

export default Ics25TeamModel;
