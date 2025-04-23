import mongoose, { Document, Schema } from "mongoose";

interface ILink {
  platform: string;
  url: string;
}

interface ISocialize extends Document {
  clerkUserId: string;
  username: string;
  profileImage: string;
  bio: string;
  links: ILink[];
  createdAt: Date;
  updatedAt: Date;
}

const linkSchema = new Schema<ILink>(
  {
    platform: {
      type: String,
      required: true,
    },
    url: {
      type: String,
      required: true,
    },
  },
  { _id: false }
);

const socializeSchema = new Schema<ISocialize>(
  {
    clerkUserId: {
      type: String,
      required: true,
      index: true,
    },
    username: {
      type: String,
      required: true,
      unique: true,
    },
    profileImage: {
      type: String,
      default: "",
    },
    bio: {
      type: String,
      default: "",
    },
    links: {
      type: [linkSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to ensure uniqueness of clerkUserId and username
socializeSchema.index({ clerkUserId: 1, username: 1 }, { unique: true });

const Socialize =
  mongoose.models.Socialize ||
  mongoose.model<ISocialize>("Socialize", socializeSchema);

export default Socialize;