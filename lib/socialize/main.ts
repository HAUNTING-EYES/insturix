import mongoose from "mongoose";
import Socialize from "@/schemas/Socialize";
import connectToDatabase from "@/schemas/ConnectToDatabase";

// Import interfaces from Socialize schema
import type { SocializeLink } from "@/schemas/Socialize";

export interface SocializeNotification {
  message: string
  duration: number
 timestamp?: Date
}

export interface SocializeUser {
  clerkUserId: string
 username: string
 uniqueUsername: string
  profileImage: string
  bio: string
  links: SocializeLink[]
  notifications?: SocializeNotification[]
  createdAt: Date
  updatedAt: Date
  _id?: string;
}

/**
 * Fetch user data from the Socialize API
 */
export async function fetchSocializeUser(uniqueUsername: string): Promise<SocializeUser> {
  try {
    // Always use direct database access regardless of environment
    await connectToDatabase();
    
    const userDataRaw = (await Socialize.findOne({ username: uniqueUsername }).lean()) as any;
    if (!userDataRaw) throw Object.assign(new Error("Socialize profile not found"), { status: 404 });

    const responseData = {
      ...userDataRaw,
      uniqueUsername: userDataRaw.username,
      _id: userDataRaw._id?.toString?.(),
      createdAt: userDataRaw.createdAt || new Date(),
      updatedAt: userDataRaw.updatedAt || new Date(),
    } as unknown as SocializeUser;

    return responseData;
 } catch (error) {
    console.error("Error fetching Socialize user:", error)
    throw error
  }
}
