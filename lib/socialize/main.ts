import Socialize from "@/schemas/Socialize";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import { User } from "@/schemas/user";

// Import interfaces from Socialize schema
import type { SocializeLink, BannerConfig } from "@/schemas/Socialize";

/** Single update/notification item shown in the Socialize profile */
export interface SocializeNotification {
  message: string;
  duration: number; // Duration in hours (0 = permanent)
  timestamp?: string; // ISO string for created time
  expiresAt?: string; // ISO string for expiration
}

/** User data structure used in Socialize feature */
export interface SocializeUser {
  clerkUserId: string;
  username: string;
  profileImage: string;
  bio: string;
  status?: string;
  accentColor?: string;
  links: SocializeLink[];
  banner?: BannerConfig;
  uniqueUsername?: string;
  notifications?: {
    message: string;
    duration: number;
    timestamp?: string;
    expiresAt?: string;
  }[];
  createdAt: Date;
  updatedAt: Date;
}

type UserFallbackRecord = {
  clerkUserId?: string;
  username?: string;
  createdAt?: Date;
  updatedAt?: Date;
};

function serializeSocializeProfile(userDataRaw: any): SocializeUser {
  const now = new Date();
  const validNotifications = (userDataRaw.notifications || []).filter((n: any) => {
    if (!n) return false;

    // No duration = permanent
    if (!n.duration) return true;

    // If expiresAt exists, check that
    if (n.expiresAt) {
      return new Date(n.expiresAt) > now;
    }

    // If only timestamp + duration exist, compute expiration
    if (n.timestamp) {
      const expiration = new Date(new Date(n.timestamp).getTime() + n.duration * 60 * 60 * 1000);
      return expiration > now;
    }

    // If no timestamp, treat as expired.
    return false;
  });

  return {
    ...userDataRaw,
    uniqueUsername: userDataRaw.username,
    notifications: validNotifications,
    _id: userDataRaw._id?.toString?.(),
    createdAt: userDataRaw.createdAt || now,
    updatedAt: userDataRaw.updatedAt || now,
  };
}

function createFallbackProfile(userDataRaw: UserFallbackRecord, requestedUsername: string): SocializeUser | null {
  if (!userDataRaw.clerkUserId || !userDataRaw.username) return null;

  const now = new Date();
  return {
    clerkUserId: userDataRaw.clerkUserId,
    username: userDataRaw.username,
    profileImage: "",
    bio: "",
    status: "",
    accentColor: "gold",
    links: [],
    banner: {
      type: "color",
      value: "#0e6b9c",
      gradientType: "linear",
      gradientColors: [],
    },
    uniqueUsername: requestedUsername,
    notifications: [],
    createdAt: userDataRaw.createdAt || now,
    updatedAt: userDataRaw.updatedAt || now,
  };
}

export async function getPublicSocializeUser(
  uniqueUsername: string
): Promise<SocializeUser | null> {
  await connectToDatabase();

  const username = uniqueUsername.trim();
  if (!username) return null;

  const userDataRaw = (await Socialize.findOne({ username }).lean()) as any;
  if (userDataRaw) {
    return serializeSocializeProfile(userDataRaw);
  }

  const userFallbackRaw = (await User.findOne({ username })
    .select("clerkUserId username createdAt updatedAt")
    .lean()) as UserFallbackRecord | null;

  if (!userFallbackRaw) return null;
  return createFallbackProfile(userFallbackRaw, username);
}

/**
 * Fetch user data from the Socialize API
 * Filters out expired notifications before returning
 */
export async function fetchSocializeUser(
 uniqueUsername: string
): Promise<SocializeUser> {
  try {
    const userData = await getPublicSocializeUser(uniqueUsername);
    if (!userData)
      throw Object.assign(new Error("Socialize profile not found"), { status: 404 });
    return userData;
  } catch (error) {
    console.error("Error fetching Socialize user:", error);
    throw error;
  }
}
