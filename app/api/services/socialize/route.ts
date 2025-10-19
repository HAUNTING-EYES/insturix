import { NextRequest } from "next/server";
import Socialize from "@/schemas/Socialize";
import mongoose from "mongoose";
import { auth } from "@clerk/nextjs/server"; // Import Clerk authentication
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Create a rate limiter for socialize profile access
// Limit to 100 requests per 10 minutes per IP address
const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(100, "10 m"),
  analytics: true,
  prefix: "@upstash/ratelimit/socialize",
  ephemeralCache: new Map(),
});

// Interface matching the Socialize schema
import type { SocializeLink } from "@/schemas/Socialize";

interface Notification {
  message: string;
  duration: number;
}

interface ISocializeData {
  clerkUserId: string;
  username: string;
  profileImage?: string;
  bio?: string;
  links?: SocializeLink[];
  notifications?: Notification[];
  _id?: string; // Add _id for lean results
  __v?: number; // Add __v for lean results
}

if (!process.env.MONGODB_URI) {
  throw new Error("Please define the MONGODB_URI environment variable");
}

if (!process.env.MONGODB_DB_NAME) {
  throw new Error("Please define the MONGODB_DB_NAME environment variable");
}

const MONGODB_URI = process.env.MONGODB_URI;

async function connectToDatabase() {
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(MONGODB_URI, { dbName: process.env.MONGODB_DB_NAME });
  }
}

// Helper for input validation
function isValidSocializeData(data: ISocializeData, isPatch: boolean = false): string | null {
  if (!isPatch && !data.clerkUserId) return "clerkUserId is required.";
  if (!isPatch && !data.username) return "Username is required.";

  if (data.username && (typeof data.username !== 'string' || data.username.length < 3 || data.username.length > 30)) {
    return "Username must be a string between 3 and 30 characters.";
  }
  if (data.bio && (typeof data.bio !== 'string' || data.bio.length > 256)) {
    return "Bio must be a string up to 256 characters.";
  }
  if (data.links !== undefined) {
    if (!Array.isArray(data.links)) return "Links must be an array.";
    for (const link of data.links) {
      if (typeof link.platform !== 'string' || !link.platform.trim()) return "Each link must have a platform.";
      if (typeof link.url !== 'string' || !link.url.trim() || !/^https?:\/\/.+/.test(link.url)) return "Each link must have a valid URL.";
    }
  }
  if (data.notifications !== undefined) {
    if (!Array.isArray(data.notifications)) return "Notifications must be an array.";
    for (const notification of data.notifications) {
      if (typeof notification.message !== 'string' || !notification.message.trim()) return "Each notification must have a message.";
      if (typeof notification.duration !== 'number' || notification.duration < 1 || notification.duration > 24) return "Each notification must have a duration between 1 and 24.";
    }
  }
  return null;
}

// POST route for creating new profiles
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();

    const body: ISocializeData = await request.json();
    const validationError = isValidSocializeData(body);
    if (validationError) {
      return Response.json({ error: validationError }, { status: 400 });
    }

    if (body.clerkUserId !== userId) {
      return Response.json({ error: "Unauthorized: clerkUserId mismatch" }, { status: 403 });
    }

    const { username } = body;

    const existingProfile = (await Socialize.findOne({ username }).lean()) as ISocializeData | null;
    if (existingProfile) {
      return Response.json(
        { error: "Profile already exists. Use PATCH to update." },
        { status: 409 }
      );
    }

    const newProfile = new Socialize(body);
    const savedProfile = await newProfile.save();

    console.log(`Created new Socialize profile for user: ${userId}`);

    return Response.json(
      {
        message: "Socialize profile created",
        profile: savedProfile,
      },
      { status: 201 }
    );
  } catch (e: unknown) {
    const error = e as Error;
    console.error("POST Error:", error.message);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// PATCH route for updating existing profiles
export async function PATCH(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();

    const body: ISocializeData = await request.json();
    const { username, ...updateFields } = body;

    const validationError = isValidSocializeData(body, true);
    if (validationError) {
      return Response.json({ error: validationError }, { status: 400 });
    }

    if (!username) {
      return Response.json({ error: "Username is required for update" }, { status: 400 });
    }

    const existingProfile = (await Socialize.findOne({ username }).lean()) as ISocializeData | null;
    if (!existingProfile) {
      return Response.json({ error: "Profile not found" }, { status: 404 });
    }
    if (existingProfile.clerkUserId !== userId) {
      return Response.json({ error: "Unauthorized: You can only update your own profile" }, { status: 403 });
    }

    const updateData: Record<string, unknown> = {};

    if (updateFields.bio !== undefined) updateData.bio = updateFields.bio;
    if (updateFields.profileImage !== undefined) updateData.profileImage = updateFields.profileImage;

    // TODO: Implement more granular array updates (add, remove, update specific items) for links and notifications.
    // Current implementation replaces the entire array if provided.
    if (updateFields.links !== undefined) updateData.links = updateFields.links;
    if (updateFields.notifications !== undefined) updateData.notifications = updateFields.notifications;

    // TODO: Implement rate limiting to prevent abuse and brute-force attacks on these endpoints.
    // TODO: Consider schema versioning and migration strategies for future database changes.

    console.log(`PATCH: Updating Socialize profile for user: ${userId}, username: ${username}`);

    const updatedProfile = await Socialize.findOneAndUpdate(
      { username, clerkUserId: userId },
      { $set: updateData },
      { new: true }
    );

    if (!updatedProfile) {
      return Response.json({ error: "Profile not found or unauthorized to update" }, { status: 404 });
    }

    console.log(`PATCH: Updated profile for user: ${userId}`);

    return Response.json(
      {
        message: "Socialize profile updated",
        profile: updatedProfile,
      },
      { status: 200 }
    );
  } catch (e: unknown) {
    const error = e as Error;
    console.error("PATCH Error:", error.message); // Use console.error for errors
    return Response.json({ error: "Internal Server Error" }, { status: 500 }); // Generic error message
  }
}

// GET route for retrieving profiles
export async function GET(request: NextRequest) {
  try {
    // Rate limiting for GET requests - use a combination of IP and user agent as identifier
    const identifier =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "anonymous";

    const { success, limit, remaining, reset } = await ratelimit.limit(identifier);

    if (!success) {
      return Response.json(
        {
          error: "Rate limit exceeded. Please try again later.",
          limit,
          remaining,
          reset,
        },
        { status: 429 }
      );
    }

    await connectToDatabase();

    const { searchParams } = new URL(request.url);
    const username = searchParams.get("username");

    if (!username) {
      return Response.json({ error: "Username is required" }, { status: 400 });
    }

    const userData = (await Socialize.findOne({
      username,
    }).lean()) as ISocializeData | null;

    if (!userData) {
      return Response.json({ error: "Socialize profile not found" }, { status: 404 });
    }

    // For public profiles, we don't need to check clerkUserId against the authenticated user.
    // The profile is publicly viewable if it exists.

    const responseData = {
      ...userData,
      uniqueUsername: userData.username,
      _id: userData._id?.toString(),
    };

    console.log(`Socialize data retrieved for username: ${username}`);

    return Response.json(responseData, { status: 200 });
  } catch (e: unknown) {
    const error = e as Error;
    console.error("GET Error:", error.message);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
