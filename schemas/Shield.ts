import mongoose, { Document, Schema } from "mongoose";

interface IContact extends Document {
  name: string;
  email: string;
  subject: string;
  message: string;
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
  },
  {
    timestamps: true,
  }
);

const Shield = mongoose.models.Shield || mongoose.model<IContact>("Shield", contactSchema);
export default Shield;