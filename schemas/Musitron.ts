import mongoose, { Schema, Document, model } from "mongoose";

export type MusitronTaskStatus =
  | "listed"
  | "processing"
  | "completed"
  | "failed";
const ALLOWED_MODELS = [
  "fal-ai/ace-step/prompt-to-audio",
  "stable-audio-2.5",
  "sonauto-mini-max",
] as const;
export interface IMusitronTask extends Document {
  clerkUserId: string;
  title: string;
  style: string;
  instrumental_only: boolean;
  lyrics: string;
  status: MusitronTaskStatus;
  gcs_url?: string;
  error?: {
    code: string;
    message: string;
    action?: string;
  };
  unread: boolean;
  createdAt: Date;
  updatedAt: Date;
  refunded?: boolean;
}

const MusitronTaskSchema: Schema = new Schema({
  clerkUserId: { type: String, required: true },
  title: { type: String, required: true },
  style: { type: String, required: true },
  instrumental_only: { type: Boolean, required: true },
  lyrics: { type: String, default: "" },
  model: { type: String, required: true },
  status: { type: String, enum: ALLOWED_MODELS, required: true },
  gcs_url: { type: String },
  error: {
    code: { type: String },
    message: { type: String },
    action: { type: String },
  },
  unread: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  refunded: { type: Boolean, default: false },
});

export const MusitronTask =
  mongoose.models.MusitronTask ||
  mongoose.model<IMusitronTask>(
    "MusitronTask",
    MusitronTaskSchema,
    "musitron_tasks"
  );
