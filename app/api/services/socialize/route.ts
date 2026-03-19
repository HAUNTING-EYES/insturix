import { NextRequest } from "next/server";
import Socialize from "@/schemas/Socialize";
import mongoose from "mongoose";
import { auth } from "@clerk/nextjs/server"; // Import Clerk authentication
import { SocializeGCSManager } from "@/lib/socialize-gcs";
import { Ratelimit } from "@upstash/ratelimit";
import { getExpiresAtFromDuration } from "@/lib/utils/notification"; // Only import getExpiresAtFromDuration
import { Redis } from "@upstash/redis";

// Lazy singleton to avoid crashing next build when env vars are missing.
let _ratelimit: Ratelimit | null = null;
function getRatelimit(): Ratelimit {
  if (!_ratelimit) {
    _ratelimit = new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(100, "10 m"),
      analytics: true,
      prefix: "@upstash/ratelimit/socialize",
      ephemeralCache: new Map(),
    });
  }
  return _ratelimit;
}

// Interface matching the Socialize schema
import type { SocializeLink, BannerConfig } from "@/schemas/Socialize";

interface Notification {
  message: string;
  duration: number;
  timestamp?: string; // when created
  expiresAt?: string; // calculated expiration time
}

interface ISocializeData {
  clerkUserId: string;
  username: string;
  profileImage?: string;
  bio?: string;
  links?: SocializeLink[];
  notifications?: Notification[];
  banner?: BannerConfig;
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

// Global is used here to maintain a cached connection across hot reloads
// in development. This prevents connections growing exponentially
// during API Route usage.
let cached = (global as any).mongoose;

if (!cached) {
  cached = (global as any).mongoose = { conn: null, promise: null };
}

async function connectToDatabase() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      dbName: process.env.MONGODB_DB_NAME,
    };

    cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongoose) => {
      return mongoose;
    });
  }
  cached.conn = await cached.promise;
  return cached.conn;
}

// Helper function to generate signed URLs for banner images (Correctly scoped globally)
async function generateBannerSignedUrl(
  banner: BannerConfig
): Promise<BannerConfig> {
  if (banner.type === "image" && banner.gcsPath) {
    try {
      const signedUrl = await SocializeGCSManager.generateSignedUrl(
        banner.gcsPath,
        24
      );
      return {
        ...banner,
        value: signedUrl, // Replace with fresh signed URL
      };
    } catch (error) {
      console.error("Failed to generate signed URL for banner:", error); // Return original banner config if signed URL generation fails
      return banner;
    }
  }
  return banner;
}

// Helper for input validation
function isValidSocializeData(
  data: ISocializeData,
  isPatch: boolean = false
): string | null {
  if (!isPatch && !data.clerkUserId) return "clerkUserId is required.";
  if (!isPatch && !data.username) return "Username is required.";

  if (
    data.username &&
    (typeof data.username !== "string" ||
      data.username.length < 3 ||
      data.username.length > 30)
  ) {
    return "Username must be a string between 3 and 30 characters.";
  }
  if (data.bio && (typeof data.bio !== "string" || data.bio.length > 256)) {
    return "Bio must be a string up to 256 characters.";
  }
  if (data.links !== undefined) {
    if (!Array.isArray(data.links)) return "Links must be an array.";
    for (const link of data.links) {
      if (typeof link.platform !== "string" || !link.platform.trim())
        return "Each link must have a platform.";
      if (
        typeof link.url !== "string" ||
        !link.url.trim() ||
        !/^https?:\/\/.+/.test(link.url)
      )
        return "Each link must have a valid URL.";
    }
  }
  if (data.notifications !== undefined) {
    if (!Array.isArray(data.notifications))
      return "Notifications must be an array.";
    for (const notification of data.notifications) {
      if (
        typeof notification.message !== "string" ||
        !notification.message.trim()
      )
        return "Each notification must have a message.";
      if (
        typeof notification.duration !== "number" ||
        notification.duration < 1 ||
        notification.duration > 24
      )
        return "Each notification must have a duration between 1 and 24.";
    }
  }
  if (data.banner !== undefined) {
    if (
      !data.banner.type ||
      !["image", "color", "gradient"].includes(data.banner.type)
    ) {
      return "Banner type must be 'image', 'color', or 'gradient'.";
    }
    if (!data.banner.value || typeof data.banner.value !== "string") {
      return "Banner value is required.";
    }
    if (
      data.banner.type === "color" &&
      !/^#[0-9A-Fa-f]{6}$/.test(data.banner.value)
    ) {
      return "Banner color must be a valid hex color (e.g., #ff0000).";
    }
    if (
      data.banner.type === "image" &&
      !/^https?:\/\/.+/.test(data.banner.value)
    ) {
      return "Banner image must be a valid URL.";
    }
    if (data.banner.type === "gradient") {
      if (
        !data.banner.gradientColors ||
        !Array.isArray(data.banner.gradientColors) ||
        data.banner.gradientColors.length < 2
      ) {
        return "Gradient must have at least 2 colors.";
      }
      for (const colorStop of data.banner.gradientColors) {
        if (!/^#[0-9A-Fa-f]{6}$/.test(colorStop.color)) {
          return "Gradient colors must be valid hex colors.";
        }
        if (
          typeof colorStop.position !== "number" ||
          colorStop.position < 0 ||
          colorStop.position > 100
        ) {
          return "Gradient color positions must be between 0 and 100.";
        }
      }
    }
  }
  return null;
}

// POST route for creating new profiles (FIXED)
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
      return Response.json(
        { error: "Unauthorized: clerkUserId mismatch" },
        { status: 403 }
      );
    }

    const { username } = body;

    const existingProfile = (await Socialize.findOne({
      username,
    }).lean()) as ISocializeData | null;
    if (existingProfile) {
      return Response.json(
        { error: "Profile already exists. Use PATCH to update." },
        { status: 409 }
      );
    }

    // 🚀 NEW LOGIC for POST: Process notifications before saving
    if (body.notifications && Array.isArray(body.notifications)) {
      const now = new Date().toISOString();
      // Mutate body.notifications to include timestamp and expiresAt
      body.notifications = body.notifications.map((n) => {
        const expiresAt = getExpiresAtFromDuration(n.duration);
        return {
          ...n,
          timestamp: n.timestamp || now,
          expiresAt: expiresAt,
        } as Notification;
      });
    }

    // Check if the number of notifications exceeds the limit
    if (body.notifications && body.notifications.length > 50) {
      return Response.json(
        { error: "Cannot have more than 50 notifications." },
        { status: 400 }
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

// PATCH route for updating existing profiles (Corrected)
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
      return Response.json(
        { error: "Username is required for update" },
        { status: 400 }
      );
    }

    const existingProfile = (await Socialize.findOne({
      username,
    }).lean()) as ISocializeData | null;
    if (!existingProfile) {
      return Response.json({ error: "Profile not found" }, { status: 404 });
    }
    if (existingProfile.clerkUserId !== userId) {
      return Response.json(
        { error: "Unauthorized: You can only update your own profile" },
        { status: 403 }
      );
    }

    const updateData: Record<string, unknown> = {};

    if (updateFields.bio !== undefined) updateData.bio = updateFields.bio;
    if (updateFields.profileImage !== undefined)
      updateData.profileImage = updateFields.profileImage;
    if (updateFields.banner !== undefined)
      updateData.banner = updateFields.banner;

    // Current implementation replaces the entire array if provided.
    if (updateFields.links !== undefined) updateData.links = updateFields.links;

    // 🚀 NEW LOGIC: Process and enhance notifications with expiry data
    if (updateFields.notifications !== undefined) {
      // Check if the number of notifications exceeds the limit
      if (updateFields.notifications.length > 50) {
        return Response.json(
          { error: "Cannot have more than 50 notifications." },
          { status: 400 }
        );
      }

      // Get a single, consistent timestamp for all notifications being updated now
      const now = new Date().toISOString();

      const processedNotifications = updateFields.notifications.map((n) => {
        // Calculate the expiration time based on the duration (in hours)
        const expiresAt = getExpiresAtFromDuration(n.duration);

        return {
          ...n,
          // Use existing timestamp if provided (for granular updates), otherwise use now
          timestamp: n.timestamp || now,
          // Set the calculated expiresAt time (will be undefined for duration <= 0)
          expiresAt: expiresAt,
        } as Notification;
      });

      updateData.notifications = processedNotifications;
    }

    // TODO: Implement rate limiting to prevent abuse and brute-force attacks on these endpoints.
    // TODO: Consider schema versioning and migration strategies for future database changes.

    console.log(
      `PATCH: Updating Socialize profile for user: ${userId}, username: ${username}`
    );

    const updatedProfile = await Socialize.findOneAndUpdate(
      { username, clerkUserId: userId },
      { $set: updateData },
      { new: true }
    );

    if (!updatedProfile) {
      return Response.json(
        { error: "Profile not found or unauthorized to update" },
        { status: 404 }
      );
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
    console.error("PATCH Error:", error.message);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// DELETE route for removing specific notifications
export async function DELETE(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();

    const body = await request.json();
    const { username, notificationIndex } = body;

    if (!username) {
      return Response.json(
        { error: "Username is required for delete" },
        { status: 400 }
      );
    }

    if (typeof notificationIndex !== "number") {
      return Response.json(
        { error: "Notification index is required for delete" },
        { status: 400 }
      );
    }

    const existingProfile = (await Socialize.findOne({
      username,
    }).lean()) as ISocializeData | null;
    if (!existingProfile) {
      return Response.json({ error: "Profile not found" }, { status: 404 });
    }
    if (existingProfile.clerkUserId !== userId) {
      return Response.json(
        { error: "Unauthorized: You can only update your own profile" },
        { status: 403 }
      );
    }

    // Remove the notification at the specified index
    const updatedNotifications = [...(existingProfile.notifications || [])];
    if (
      notificationIndex < 0 ||
      notificationIndex >= updatedNotifications.length
    ) {
      return Response.json(
        { error: "Invalid notification index" },
        { status: 400 }
      );
    }

    updatedNotifications.splice(notificationIndex, 1);

    const updatedProfile = await Socialize.findOneAndUpdate(
      { username, clerkUserId: userId },
      { $set: { notifications: updatedNotifications } },
      { new: true }
    );

    if (!updatedProfile) {
      return Response.json(
        { error: "Profile not found or unauthorized to update" },
        { status: 404 }
      );
    }

    console.log(
      `DELETE: Removed notification at index ${notificationIndex} for user: ${userId}`
    );

    return Response.json(
      {
        message: "Notification removed",
        profile: updatedProfile,
      },
      { status: 200 }
    );
  } catch (e: unknown) {
    const error = e as Error;
    console.error("DELETE Error:", error.message);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// GET route for retrieving profiles (Corrected)
export async function GET(request: NextRequest) {
  try {
    // Rate limiting for GET requests - use IP as unique identifier
    const identifier =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "anonymous";

    const { success, limit, remaining, reset } =
      await getRatelimit().limit(identifier);

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
      return Response.json(
        { error: "Socialize profile not found" },
        { status: 404 }
      );
    } // --- 🧹 Filter out expired notifications ---

    if (userData.notifications && Array.isArray(userData.notifications)) {
      const now = new Date();
      userData.notifications = userData.notifications.filter((n) => {
        // Keep permanent ones (no expiresAt)
        if (!n.expiresAt) return true; // Keep active ones only
        return new Date(n.expiresAt) > now;
      });
    } // --- 🔗 Generate fresh signed URL for banner if image ---

    let updatedBanner = userData.banner;
    if (updatedBanner) {
      updatedBanner = await generateBannerSignedUrl(updatedBanner);
    } // --- 📦 Prepare response data ---

    const responseData = {
      ...userData,
      banner: updatedBanner,
      uniqueUsername: userData.username,
      _id: userData._id?.toString(),
    };

    console.log(`✅ Socialize data retrieved for username: ${username}`);

    return Response.json(responseData, { status: 200 });
  } catch (e: unknown) {
    const error = e as Error;
    console.error("❌ GET Error:", error.message);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
