import mongoose, { Schema, models, model } from 'mongoose';

const TeamSchema = new Schema({
  teamName: { type: String, required: true },
  code: { type: String, required: true, unique: true, index: true },
  game: { type: String, enum: ['valorant', 'bgmi'], required: true },
  leaderId: { type: String, required: true, index: true }, // clerkUserId
  members: { type: [String], default: [] }, // clerkUserIds
  pendingRequests: { type: [String], default: [] }, // clerkUserIds
  link: { type: String },
  // When true, the team will appear in public browse lists for the selected game
  listed: { type: Boolean, default: false },
  meta: Schema.Types.Mixed,
}, { timestamps: true });

export type TeamDocument = mongoose.InferSchemaType<typeof TeamSchema> & mongoose.Document;

export default models.Ics25Team || model('Ics25Team', TeamSchema);
