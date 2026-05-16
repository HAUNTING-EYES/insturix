import mongoose, { Schema, Document, models } from "mongoose";

export interface IUploaderXVideo extends Document {
  userId: string;
  email: string;
  videoUuid: string;
  filename: string;
  gcsPath: string;
  publicUrl: string;
  size: number;
  contentType: string;
  status: string;
  uploadedAt: Date;
  editronProjectId?: string | null;
  metadata?: Record<string, unknown>;
}

const UploaderXVideoSchema = new Schema<IUploaderXVideo>({
  userId: { type: String, required: true, index: true },
  email: { type: String, required: true, index: true },
  videoUuid: { type: String, required: true, unique: true, index: true },
  filename: { type: String, required: true },
  gcsPath: { type: String, required: true },
  publicUrl: { type: String },
  size: { type: Number, required: true },
  contentType: { type: String, required: true },
  status: { type: String, default: "uploaded" },
  uploadedAt: { type: Date, default: Date.now },
  editronProjectId: { type: String, default: null },
  metadata: { type: Object },
});

const UploaderXVideo =
  models.UploaderXVideo ||
  mongoose.model<IUploaderXVideo>("UploaderXVideo", UploaderXVideoSchema, "uploaderx_videos");

export default UploaderXVideo;
