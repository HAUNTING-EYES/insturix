import { NextRequest } from "next/server";
import { WithId, Document, MongoClient, Db } from "mongodb";

interface Link {
  platform: string;
  url: string;
}

interface Notification {
  message: string;
  timestamp: Date;
  read: boolean;
}

interface UserData {
  uniqueUsername: string;
  username?: string;
  bio?: string;
  links?: Link[];
  notifications?: Notification[];
  profileImage?: string;
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

export async function connectToDatabase() {
  // If we have cached values, use them
  if (cachedClient && cachedDb) {
    return {
      client: cachedClient,
      db: cachedDb,
    };
  }

  // Connect to cluster
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

export async function POST(request: NextRequest) {
  try {
    const body: UserData = await request.json();
    const { uniqueUsername, ...updateFields } = body;

    if (!uniqueUsername) {
      return Response.json(
        { error: "uniqueUsername required" },
        { status: 400 }
      );
    }

    const updateData: Record<
      string,
      string | Link[] | Notification[] | undefined
    > = {};

    Object.entries(updateFields).forEach(([key, value]) => {
      if (value !== undefined) {
        updateData[key] = value;
      }
    });

    const { db } = await connectToDatabase();
    await db
      .collection<WithId<Document>>("users")
      .updateOne({ uniqueUsername }, { $set: updateData }, { upsert: true });

    return Response.json({ message: "User data saved" }, { status: 200 });
  } catch (e: unknown) {
    const error = e as Error;
    console.log(error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const uniqueUsername = searchParams.get("uniqueUsername");

    console.log("uniqueUsername(uniqueUsername) from request:", uniqueUsername);

    if (!uniqueUsername) {
      return Response.json(
        { error: "uniqueUsername required" },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    
    // First try to find in users collection
    let userData = await db
      .collection<WithId<Document>>("users")
      .findOne({ uniqueUsername });

    if (!userData) {
      console.log("User not found in 'users' collection, trying 'socialize' collection");
      
      // If not found, try the socialize collection (with username field)
      userData = await db
        .collection<WithId<Document>>("socialize")
        .findOne({ username: uniqueUsername });
        
      if (userData) {
        console.log("User found in socialize collection");
      }
    }

    if (!userData) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    // If found from socialize collection, adapt field names to match expected format
    if (userData.clerkUserId && !userData.hasOwnProperty('uniqueUsername')) {
      console.log("Adapting Socialize schema to user schema format");
      userData = {
        ...userData,
        uniqueUsername: userData.username || uniqueUsername
      };
    }

    console.log("User data retrieved:", userData);
    console.log("clerkUserId:", userData.clerkUserId);
    
    return Response.json(userData, { status: 200 });
  } catch (e: unknown) {
    const error = e as Error;
    return Response.json({ error: error.message }, { status: 500 });
  }
}
