// import mongoose from "mongoose";
// import Socialize from "@/schemas/Socialize";
// import connectToDatabase from "@/schemas/ConnectToDatabase";

// // Import interfaces from Socialize schema
// import type { SocializeLink, BannerConfig } from "@/schemas/Socialize";

// export interface SocializeNotification {
//   message: string
//   duration: number
//  timestamp?: Date
// }

// export interface SocializeUser {
//   clerkUserId: string
//  username: string
//  uniqueUsername: string
//   profileImage: string
//   bio: string
//   links: SocializeLink[]
//   banner?: BannerConfig
//   notifications?: SocializeNotification[]
//   createdAt: Date
//   updatedAt: Date
//   _id?: string;
// }

// /**
//  * Fetch user data from the Socialize API
//  */
// export async function fetchSocializeUser(uniqueUsername: string): Promise<SocializeUser> {
//   try {
//     // Always use direct database access regardless of environment
//     await connectToDatabase();
    
//     const userDataRaw = (await Socialize.findOne({ username: uniqueUsername }).lean()) as any;
//     if (!userDataRaw) throw Object.assign(new Error("Socialize profile not found"), { status: 404 });

//     const responseData = {
//       ...userDataRaw,
//       uniqueUsername: userDataRaw.username,
//       _id: userDataRaw._id?.toString?.(),
//       createdAt: userDataRaw.createdAt || new Date(),
//       updatedAt: userDataRaw.updatedAt || new Date(),
//     } as unknown as SocializeUser;

//     return responseData;
//  } catch (error) {
//     console.error("Error fetching Socialize user:", error)
//     throw error
//   }
// }

import Socialize from "@/schemas/Socialize";
import connectToDatabase from "@/schemas/ConnectToDatabase";

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
  // clerkUserId: string;
  // username: string;
  // uniqueUsername: string;
  // profileImage: string;
  // bio: string;
  // links: SocializeLink[];
  // banner?: BannerConfig;
  // notifications?: SocializeNotification[];
  // createdAt: Date;
  // updatedAt: Date;
  // _id?: string;
   clerkUserId: string;
  username: string;
  profileImage: string;
  bio: string;
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

/**
 * Fetch user data from the Socialize API
 * Filters out expired notifications before returning
 */
export async function fetchSocializeUser(
 uniqueUsername: string
): Promise<SocializeUser> {
  try {
    await connectToDatabase();

    const userDataRaw = (await Socialize.findOne({ username: uniqueUsername }).lean()) as any;
    if (!userDataRaw)
      throw Object.assign(new Error("Socialize profile not found"), { status: 404 });

    // 🧠 Filter out expired notifications
    // const now = new Date();
    // const validNotifications = (userDataRaw.notifications || []).filter((n: any) => {
    //   if (!n.expiresAt) return true; // Permanent update
    //   return new Date(n.expiresAt) > now;
    // });
// 🧠 Filter out expired notifications
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

  // If no timestamp → treat as expired (safety)
  return false;
});

    const responseData: SocializeUser = {
      ...userDataRaw,
      uniqueUsername: userDataRaw.username,
      notifications: validNotifications,
      _id: userDataRaw._id?.toString?.(),
      createdAt: userDataRaw.createdAt || new Date(),
      updatedAt: userDataRaw.updatedAt || new Date(),
    };

    return responseData;
  } catch (error) {
    console.error("Error fetching Socialize user:", error);
    throw error;
  }
}
