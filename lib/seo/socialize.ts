import { cache } from 'react';
import connectToDatabase from "@/schemas/ConnectToDatabase";
import Socialize from "@/schemas/Socialize";

// Define more specific types instead of using 'any'
import type { SocializeLink, BannerConfig } from "@/schemas/Socialize";

interface Notification {
  message: string;
  duration: number;
  createdAt?: Date;
}

// Define the data type for user profile
interface SocializeUserData {
  username?: string;
  bio?: string;
  profileImage?: string;
  banner?: BannerConfig;
  links?: SocializeLink[];
  notifications?: Notification[];
  [key: string]: unknown;
}

// Create a cached version of the getSocializeUserData function to improve performance
export const getSocializeUserData = cache(async (uniqueUsername: string): Promise<SocializeUserData | null> => {
  try {
    // Connect to the MongoDB database with the required connection string
    const MONGODB_URI = process.env.MONGODB_URI || '';
    const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME;

    if (!MONGODB_DB_NAME) {
      throw new Error('Please define the MONGODB_DB_NAME environment variable');
    }

    await connectToDatabase(MONGODB_URI);

    // Find the user in the Socialize collection by username
    const userData = await Socialize.findOne({ username: uniqueUsername }).lean();

    // If no user data is found, return null
    if (!userData) {
      console.log(`No user found with username: ${uniqueUsername}`);
      return null;
    }

    // Cast the userData to a more specific type
    const typedUserData = userData as unknown as SocializeUserData;

    // Return the user data with properly typed fields
    return {
      ...typedUserData,
      username: typedUserData.username || uniqueUsername,
      bio: typedUserData.bio || '',
      profileImage: typedUserData.profileImage || '',
      banner: typedUserData.banner,
      uniqueUsername: uniqueUsername,
    };
  } catch (error) {
    // Log the error and return null if there's an issue
    console.error("Error fetching Socialize user data:", error);
    return null;
  }
});