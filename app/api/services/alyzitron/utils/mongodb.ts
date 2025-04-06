import { MongoClient, Collection, Db } from 'mongodb';
import { AlyzitronUserData, AlyzitronAnalysis } from '../types';

if (!process.env.MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable');
}

if (!process.env.MONGODB_DB_NAME) {
  throw new Error('Please define the MONGODB_DB_NAME environment variable');
}

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME;

// Collection names following service naming convention
const COLLECTIONS = {
  USER_DATA: 'alyzitron_user_data',
  ANALYSES: 'alyzitron_analyses',
} as const;

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

// Collection getter with type safety
export async function getCollections() {
  const { db } = await connectToDatabase();

  return {
    userData: db.collection<AlyzitronUserData>(COLLECTIONS.USER_DATA),
    analyses: db.collection<AlyzitronAnalysis>(COLLECTIONS.ANALYSES),
  };
}

// Initialize collections and indexes
export async function initializeCollections() {
  const { db } = await connectToDatabase();
  
  // Create collections if they don't exist
  await db.createCollection(COLLECTIONS.USER_DATA);
  await db.createCollection(COLLECTIONS.ANALYSES);

  // Create indexes for user_data collection
  await db.collection(COLLECTIONS.USER_DATA).createIndexes([
    { 
      key: { clerkUserId: 1 }, 
      unique: true 
    },
    { 
      key: { "usage.lastAnalysisDate": -1 } 
    }
  ]);

  // Create indexes for analyses collection
  await db.collection(COLLECTIONS.ANALYSES).createIndexes([
    { 
      key: { clerkUserId: 1, createdAt: -1 } 
    },
    { 
      key: { taskId: 1 }, 
      unique: true 
    },
    { 
      key: { status: 1, queueStartTime: 1 } 
    }
  ]);
}

// Error handling wrapper
export async function withErrorHandling<T>(
  operation: () => Promise<T>
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    console.error('MongoDB operation failed:', error);
    throw {
      code: 'DATABASE_ERROR',
      message: 'Database operation failed',
      technical: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}