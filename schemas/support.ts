import mongoose, { Document, Schema } from "mongoose";

interface ISupport extends Document {
  FullName: string;
  email: string;
  OrganizationName: string;
  Help: string;
  message: string;
  telephone: string;
}

const supportSchema = new Schema<ISupport>(
  {
    FullName: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    OrganizationName: {
      type: String,
      required: true,
    },
    Help: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    telephone: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const Support = mongoose.model<ISupport>("Support", supportSchema);
export default Support;
