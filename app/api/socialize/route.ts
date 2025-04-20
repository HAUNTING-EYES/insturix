import { NextRequest } from "next/server";
import { WithId, Document, MongoClient, Db } from "mongodb";

interface UserData {
  uniqueUsername: string;
  username?: string;
  bio?: string;
  links?: any[];
  notifications?: any[];
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
      return Response.json({ error: "uniqueUsername required" }, { status: 400 });
    }

    const updateData: Record<string, any> = {};

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
  } catch (e: any) {
    console.log(e.message);
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const uniqueUsername = searchParams.get("uniqueUsername");

    console.log("uniqueUsername(uniqueUsername) from request:", uniqueUsername);

    if (!uniqueUsername) {
      return Response.json({ error: "uniqueUsername required" }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    const userData = await db
      .collection<WithId<Document>>("users")
      .findOne({ uniqueUsername });

    if (!userData) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    console.log("User data retrieved:", userData);

    return Response.json(userData, { status: 200 });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
