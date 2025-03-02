import mongoose, { Document, Schema } from "mongoose";

interface INewsLetter extends Document {
  email: string;
}

const NewsLetterSchema = new Schema<INewsLetter>(
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

const Newsletter = mongoose.models.Newsletter || mongoose.model<INewsLetter>("Newsletter", NewsLetterSchema);
export default Newsletter;