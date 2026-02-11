import mongoose, { Document, Schema } from "mongoose";

interface IContact extends Document {
  name: string;
  email: string;
  subject: string;
  message: string;
  read?: boolean;
  readAt?: Date | null;
  deleted?: boolean;
  deletedAt?: Date | null;
}

const contactSchema = new Schema<IContact>(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    subject: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    read: {
      type: Boolean,
      default: false,
    },
    readAt: {
      type: Date,
      required: false,
      default: null,
    },
    deleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      required: false,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const Contact =
  mongoose.models.Contact || mongoose.model<IContact>("Contact", contactSchema);
export default Contact;
