import mongoose, { Document, Schema } from "mongoose";

export interface SocializeLink {
  platform: string;
  url: string;
  title?: string;
  icon?: string;
}

export interface BannerConfig {
  type: 'image' | 'color' | 'gradient';
  value: string;
  gcsPath?: string; // GCS path for image banners (not stored in DB, used for signed URL generation)
  gradientType?: 'linear' | 'radial';
  gradientColors?: Array<{
    color: string;
    position: number;
  }>;
}

interface INotification {
  message: string;
  duration: number;
  timestamp?: string;
 expiresAt?: string;
}

interface ISocialize extends Document {
  clerkUserId: string;
  /** §17 Phase 9: a profile may be BRAND-owned. brandId set ⇒ the studio
   *  Brands place owns this profile (vault-scope auth); null ⇒ the legacy
   *  user-owned dashboard profile, untouched. */
  brandId: string | null;
  username: string;
  profileImage: string;
  bio: string;
  status: string;
  accentColor: string;
  links: SocializeLink[];
  notifications: INotification[];
  banner: BannerConfig;
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
      maxlength: 256,
    },
    title: {
      type: String,
      required: false,
      maxlength: 64,
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
    timestamp: {
      type: String,
      required: false,
    },
    expiresAt: {
      type: String,
      required: false,
    },
  },
  { _id: false }
);

const gradientColorSchema = new Schema(
  {
    color: {
      type: String,
      required: true,
      match: /^#[0-9A-Fa-f]{6}$/,
    },
    position: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
  },
  { _id: false }
);

const bannerSchema = new Schema<BannerConfig>(
  {
    type: {
      type: String,
      enum: ['image', 'color', 'gradient'],
      default: 'color',
    },
    value: {
      type: String,
      required: true,
      default: '#D4A652',
    },
    gradientType: {
      type: String,
      enum: ['linear', 'radial'],
      default: 'linear',
    },
    gradientColors: {
      type: [gradientColorSchema],
      default: [],
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
    brandId: {
      type: String,
      default: null,
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
    status: {
      type: String,
      default: "",
      maxlength: 50,
    },
    accentColor: {
      type: String,
      default: "gold",
      enum: ["gold", "cyan", "rose", "green", "purple", "coral"],
    },
    links: {
      type: [linkSchema],
      default: [],
      validate: [
        {
          validator: (links: any[]) => links.length <= 50,
          message: "Cannot have more than 50 links."
        }
      ]
    },
    notifications: {
      type: [notificationSchema],
      default: [],
      validate: [
        {
          validator: (notifications: any[]) => notifications.length <= 50,
          message: "Cannot have more than 50 notifications."
        }
      ]
    },
    banner: {
      type: bannerSchema,
      default: {
        type: 'color',
        value: '#0e6b9c',
        gradientType: 'linear',
        gradientColors: [],
      },
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
// Avoid using tsconfig path alias at top-level so scripts running under the
// ts-node ESM loader don't fail to resolve package-style specifiers. Use a
// relative import with explicit extension required by ESM resolution.
import { getPlatformIconName } from "../lib/socialize/getPlatformIconName.ts";

export const normalizeSocializeLinks = (links: SocializeLink[]): SocializeLink[] => {
  return links.map(link => {
    const title = link.title && link.title.trim() ? link.title : link.platform;
    const icon = getPlatformIconName ? getPlatformIconName(link.platform) : link.icon;
    return { ...link, title, icon };
  });
};