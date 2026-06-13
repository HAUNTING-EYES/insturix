import { cache } from 'react';
import { getPublicSocializeUser } from "@/lib/socialize/main";
import type { SocializeUser } from "@/lib/socialize/main";

// Define the data type for user profile
type SocializeUserData = SocializeUser & {
  [key: string]: unknown;
};

// Create a cached version of the getSocializeUserData function to improve performance
export const getSocializeUserData = cache(async (uniqueUsername: string): Promise<SocializeUserData | null> => {
  try {
    const userData = await getPublicSocializeUser(uniqueUsername);

    // If no user data is found, return null
    if (!userData) {
      console.log(`No user found with username: ${uniqueUsername}`);
      return null;
    }

    return userData as SocializeUserData;
  } catch (error) {
    // Log the error and return null if there's an issue
    console.error("Error fetching Socialize user data:", error);
    return null;
  }
});
