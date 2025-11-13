import mongoose, { Schema, Document, models } from "mongoose";

export interface IUploaderX extends Document {
  name?: string;
  email: string;
  youtubeTokens?: object;
  userId: string;
  videoUuid: string;
  filename: string;
  gcsPath: string;
  publicUrl: string;
  size: number;
  contentType: string;
  status: string;
  uploadedAt: Date;
}

const UploaderXSchema = new Schema<IUploaderX>({
   name: { type: String },
  email: { type: String, unique: true, required: true },
  youtubeTokens: { type: Object },
  userId: { type: String, required: true },
  videoUuid: { type: String, required: true },
  filename: { type: String, required: true },
  gcsPath: { type: String, required: true },
  publicUrl: { type: String },
  size: { type: Number, required: true },
  contentType: { type: String, required: true },
  status: { type: String, default: "uploaded" },
  uploadedAt: { type: Date, default: Date.now },
});

const UploaderX =
  models.UploaderX || mongoose.model<IUploaderX>("UploaderX", UploaderXSchema, "uploaderxes");

export default UploaderX;
