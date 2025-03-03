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

const NewsLetter =
  mongoose.models.NewsLetter ||
  mongoose.model<INewsLetter>("Newsletter", NewsLetterSchema);

export default NewsLetter;
