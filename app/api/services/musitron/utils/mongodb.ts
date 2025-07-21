import { MongoClient, Db } from 'mongodb';
import { MusitronTask } from '../types';

if (!process.env.MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable');
}

if (!process.env.MONGODB_DB_NAME) {
  throw new Error('Please define the MONGODB_DB_NAME environment variable');
}

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME;

// Collection names for Musitron
const COLLECTIONS = {
  SONGS: 'musitron_tasks',
} as const;

let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;

export async function connectToDatabase() {
  if (cachedClient && cachedDb) {
    return {
      client: cachedClient,
      db: cachedDb,
    };
  }

  const client = await MongoClient.connect(MONGODB_URI);
  const db = client.db(MONGODB_DB_NAME);

  cachedClient = client;
  cachedDb = db;

  return {
    client,
    db,
  };
}

// Collection getter (no user data concept)
export async function getCollections() {
  const { db } = await connectToDatabase();

  return {
    tasks: db.collection<MusitronTask>(COLLECTIONS.SONGS),
  };
}

// Initialize collections and indexes
export async function initializeCollections() {
  const { db } = await connectToDatabase();

  // Create songs collection if it doesn't exist
  await db.createCollection(COLLECTIONS.SONGS);

  // Create indexes for songs collection
  await db.collection(COLLECTIONS.SONGS).createIndexes([
    {
      key: { clerkUserId: 1, createdAt: -1 }
    },
    {
      key: { status: 1 }
    },
    {
      key: { unread: 1 }
    }
  ]);
}