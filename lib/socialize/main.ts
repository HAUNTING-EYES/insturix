import axios from "axios"

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
}

/**
 * Fetch user data from the Socialize API
 */
export async function fetchSocializeUser(uniqueUsername: string): Promise<SocializeUser> {
  try {
    // Use absolute URL for server-side requests
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const { data } = await axios.get(`${baseUrl}/api/services/socialize?username=${uniqueUsername}`);
    return data
  } catch (error) {
    console.error("Error fetching Socialize user:", error)
    throw error
  }
}
