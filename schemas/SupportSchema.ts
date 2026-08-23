import mongoose, { Document, Schema } from "mongoose";

interface ISupport extends Document {
  FullName: string;
  email: string;
  OrganizationName: string;
  Help: string;
  message: string;
  telephone: string;
  budget?: number;
  read?: boolean;
  readAt?: Date | null;
  deleted?: boolean;
  deletedAt?: Date | null;
}

const SupportSchema = new Schema<ISupport>(
  {
    FullName: { type: String, required: true },
    email: { type: String, required: true },
    OrganizationName: { type: String, required: true },
    Help: { type: String, required: true },
    message: { type: String, required: true },
    telephone: { type: String, required: true },
    budget: { type: Number, required: false },
    read: { type: Boolean, default: false },
    readAt: { type: Date, default: null },
    deleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  }
);

const Support =
  mongoose.models.Support || mongoose.model<ISupport>("Support", SupportSchema);

export default Support;
