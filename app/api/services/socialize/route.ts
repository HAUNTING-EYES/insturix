import { NextRequest } from "next/server";
import { MongoClient, Db } from "mongodb";
import Socialize from "@/schemas/Socialize";
import mongoose from "mongoose";

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
  uniqueUsername?: string; // For compatibility
}

if (!process.env.MONGODB_URI) {
  throw new Error("Please define the MONGODB_URI environment variable");
}

if (!process.env.MONGODB_DB_NAME) {
  throw new Error("Please define the MONGODB_DB_NAME environment variable");
}

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME;

let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;

// Changed from export to regular async function
async function connectToDatabase() {
  // If we have cached values, use them
  if (cachedClient && cachedDb) {
    return {
      client: cachedClient,
      db: cachedDb,
    };
  }

  // Connect to MongoDB via mongoose if not already connected
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(MONGODB_URI);
  }

  // Connect to cluster via MongoClient for direct operations
  const client = await MongoClient.connect(MONGODB_URI);
  const db = client.db(MONGODB_DB_NAME);

  // Cache the values
  cachedClient = client;
  cachedDb = db;

  return {
    client,
    db,
  };
}

// POST route for creating new profiles
export async function POST(request: NextRequest) {
  try {
    await connectToDatabase(); // Ensure mongoose is connected

    const body: ISocializeData = await request.json();
    const { username } = body;

    if (!username) {
      return Response.json({ error: "username required" }, { status: 400 });
    }

    // Check if profile already exists
    const existingProfile = await Socialize.findOne({ username }).lean();
    if (existingProfile) {
      return Response.json(
        { error: "Profile already exists. Use PATCH to update." },
        { status: 409 }
      );
    }

    // Create new profile
    const newProfile = new Socialize(body);
    const savedProfile = await newProfile.save();

    console.log("Created new Socialize profile:", savedProfile);

    return Response.json(
      {
        message: "Socialize profile created",
        profile: savedProfile,
      },
      { status: 201 }
    );
  } catch (e: unknown) {
    const error = e as Error;
    console.log("POST Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// PATCH route for updating existing profiles
export async function PATCH(request: NextRequest) {
  try {
    await connectToDatabase(); // Ensure mongoose is connected

    const body: ISocializeData = await request.json();
    const { username, ...updateFields } = body;

    if (!username) {
      return Response.json({ error: "username required" }, { status: 400 });
    }

    // Prepare update data with explicit handling
    const updateData: Record<string, unknown> = {};

    // Handle bio field explicitly
    if (updateFields.bio !== undefined) {
      updateData.bio = updateFields.bio;
    }

    // Handle links array explicitly
    if (updateFields.links !== undefined) {
      updateData.links = updateFields.links;
    }

    // Handle notifications array explicitly
    if (updateFields.notifications !== undefined) {
      updateData.notifications = updateFields.notifications;
    }

    // Handle remaining fields
    Object.entries(updateFields).forEach(([key, value]) => {
      if (
        value !== undefined &&
        !["bio", "links", "notifications"].includes(key)
      ) {
        updateData[key] = value;
      }
    });

    console.log("PATCH: Updating Socialize profile data:", {
      username,
      updateData,
    });

    // Use findOneAndUpdate with Mongoose model
    const updatedProfile = await Socialize.findOneAndUpdate(
      { username },
      { $set: updateData },
      { new: true }
    );

    if (!updatedProfile) {
      return Response.json({ error: "Profile not found" }, { status: 404 });
    }

    console.log("PATCH: Updated profile:", updatedProfile);

    return Response.json(
      {
        message: "Socialize profile updated",
        profile: updatedProfile,
      },
      { status: 200 }
    );
  } catch (e: unknown) {
    const error = e as Error;
    console.log("PATCH Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// GET route for retrieving profiles
export async function GET(request: NextRequest) {
  try {
    await connectToDatabase(); // Ensure mongoose is connected

    const { searchParams } = new URL(request.url);
    const username = searchParams.get("uniqueUsername");

    if (!username) {
      return Response.json({ error: "username required" }, { status: 400 });
    }

    // Try to find the user using the Socialize model
    const userData = (await Socialize.findOne({
      username,
    }).lean()) as ISocializeData & {
      _id: mongoose.Types.ObjectId;
      __v: number;
    };

    if (!userData) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    // Add uniqueUsername field for compatibility with existing code
    const responseData = {
      ...userData,
      uniqueUsername: userData.username,
      _id: userData._id.toString(), // Convert ObjectId to string
    };

    console.log("Socialize data retrieved:", responseData);

    return Response.json(responseData, { status: 200 });
  } catch (e: unknown) {
    const error = e as Error;
    console.log("GET Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
