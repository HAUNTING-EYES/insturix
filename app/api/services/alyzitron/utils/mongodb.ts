import { MongoClient, Db } from 'mongodb';

// Read env vars lazily to avoid crashing next build when they're not set (e.g. CI).
function getMongoConfig() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB_NAME;
  if (!uri) throw new Error('Please define the MONGODB_URI environment variable');
  if (!dbName) throw new Error('Please define the MONGODB_DB_NAME environment variable');
  return { uri, dbName };
}

// Collection names following service naming convention
const COLLECTIONS = {
  ANALYSES: 'alyzitron_tasks',
  UPLOAD_TRACKING: 'alyzitron_upload_tracking',
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
  const { uri, dbName } = getMongoConfig();
  const client = await MongoClient.connect(uri);
  const db = client.db(dbName);

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
    analyses: db.collection(COLLECTIONS.ANALYSES),
    uploadTracking: db.collection(COLLECTIONS.UPLOAD_TRACKING),
  };
}

// Initialize collections and indexes
export async function initializeCollections() {
  const { db } = await connectToDatabase();

  // Create collections if they don't exist
  await db.createCollection(COLLECTIONS.ANALYSES);
  await db.createCollection(COLLECTIONS.UPLOAD_TRACKING);

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

  // Create indexes for upload tracking collection
  await db.collection(COLLECTIONS.UPLOAD_TRACKING).createIndexes([
    {
      key: { uploadId: 1 },
      unique: true
    },
    {
      key: { userId: 1, uploadedAt: -1 }
    },
    {
      key: { status: 1, expiresAt: 1 }
    },
    {
      key: { expiresAt: 1 },
      expireAfterSeconds: 0 // TTL index for automatic cleanup
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