import mongoose, { Document, Schema } from "mongoose";

export interface SocializeLink {
  platform: string;
  url: string;
  title?: string;
  icon?: string;
}

interface INotification {
  message: string;
  duration: number;
}

interface ISocialize extends Document {
  clerkUserId: string;
  username: string;
  profileImage: string;
  bio: string;
  links: SocializeLink[];
  notifications: INotification[];
  createdAt: Date;
  updatedAt: Date;
}

const linkSchema = new Schema<SocializeLink>(
  {
    platform: {
      type: String,
      required: true,
    },
    url: {
      type: String,
      required: true,
    },
    title: {
      type: String,
      required: false,
    },
    icon: {
      type: String,
      required: false,
    },
  },
  { _id: false }
);

const notificationSchema = new Schema<INotification>(
  {
    message: {
      type: String,
      required: true,
    },
    duration: {
      type: Number,
      required: true,
      min: 1,
      max: 24,
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
    notifications: {
      type: [notificationSchema],
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
/**
 * Normalize an array of SocializeLink objects:
 * - Ensures each link has a title (defaults to platform)
 * - Ensures each link has an icon (auto-chosen by platform)
 */
import { getPlatformIconName } from "@/components/dashboard/Socialize/SocializeIcons";

export const normalizeSocializeLinks = (links: SocializeLink[]): SocializeLink[] => {
  return links.map(link => {
    const title = link.title && link.title.trim() ? link.title : link.platform;
    const icon = getPlatformIconName ? getPlatformIconName(link.platform) : link.icon;
    return { ...link, title, icon };
  });
};