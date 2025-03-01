import mongoose, { Document, Schema } from "mongoose";

interface INewsletter extends Document {
  email: string;
}

const newsletterSchema = new Schema<INewsletter>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
    },
  },
  {
    timestamps: true,
  }
);

const Newsletter = mongoose.model<INewsletter>("Newsletter", newsletterSchema);
export default Newsletter;
