import mongoose, { Schema, Document, models } from "mongoose";

export interface IUploaderX extends Document {
  name?: string;
  email: string;
  youtubeTokens?: object;
  facebookTokens?: {
    userAccessToken: string;
    userId: string;
    userName: string;
    pages: Array<{
      pageId: string;
      pageName: string;
      pageAccessToken: string;
    }>;
    connectedAt: Date;
  };
  twitterTokens?: {
    accessToken: string;
    refreshToken: string;
    userId: string;
    userName: string;
    expiresAt: Date;
    connectedAt: Date;
  };
  linkedinTokens?: {
    accessToken: string;
    refreshToken?: string;
    userId: string;
    userName: string;
    expiresAt: Date;
    connectedAt: Date;
    organizations?: Array<{
      id: string;
      name: string;
      vanityName: string;
    }>;
  };
  userId: string;
  videoUuid: string;
  filename: string;
  gcsPath: string;
  publicUrl: string;
  size: number;
  contentType: string;
  status: string;
  uploadedAt: Date;
  metadata?: {
    [key: string]: any;
  };
}

const UploaderXSchema = new Schema<IUploaderX>({
  name: { type: String },
  email: { type: String, unique: true, required: true },
  youtubeTokens: { type: Object },
  facebookTokens: { type: Object },
  twitterTokens: {
    accessToken: String,
    refreshToken: String,
    userId: String,
    userName: String,
    expiresAt: Date,
    connectedAt: Date,
  },
  linkedinTokens: {
    accessToken: String,
    refreshToken: String,
    userId: String,
    userName: String,
    expiresAt: Date,
    connectedAt: Date,
    organizations: [{
      id: String,
      name: String,
      vanityName: String,
    }],
  },
  userId: { type: String, required: true },
  videoUuid: { type: String, required: true },
  filename: { type: String, required: true },
  gcsPath: { type: String, required: true },
  publicUrl: { type: String },
  size: { type: Number, required: true },
  contentType: { type: String, required: true },
  status: { type: String, default: "uploaded" },
  uploadedAt: { type: Date, default: Date.now },
  metadata: { type: Object },
});

const UploaderX =
  models.UploaderX || mongoose.model<IUploaderX>("UploaderX", UploaderXSchema, "uploaderxes");

export default UploaderX;
