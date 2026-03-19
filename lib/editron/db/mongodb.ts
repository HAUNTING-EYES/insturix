/**
 * MongoDB Connection Utility
 * 
 * Provides singleton MongoDB client for server-side operations
 */

import { MongoClient, Db } from 'mongodb';

// Read env vars lazily to avoid crashing next build when they're not set (e.g. CI).
function getMongoConfig() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.EDITRON_MONGODB_DB_NAME || process.env.MONGODB_DB_NAME;
  if (!uri) throw new Error('Please define the MONGODB_URI environment variable');
  if (!dbName) throw new Error('Please define the MONGODB_DB_NAME environment variable');
  return { uri, dbName };
}

let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;

export async function connectToDatabase(): Promise<{ client: MongoClient; db: Db }> {
  // Return cached connection if available
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  // Create new connection
  const { uri, dbName } = getMongoConfig();
  const client = new MongoClient(uri);

  await client.connect();
  const db = client.db(dbName);

  // Cache the connection
  cachedClient = client;
  cachedDb = db;

  return { client, db };
}

/**
 * Get MongoDB database instance
 */
export async function getDatabase(): Promise<Db> {
  const { db } = await connectToDatabase();
  return db;
}

/**
 * Collection names
 */
export const COLLECTIONS = {
  PROJECTS: 'projects',
  CHECKPOINTS: 'checkpoints',
  CHAT_SESSIONS: 'chatSessions',
  MEDIA_ASSETS: 'mediaAssets',
} as const;

/**
 * Initialize database indexes
 * Call this once during deployment/setup
 */
export async function initializeIndexes(): Promise<void> {
  const db = await getDatabase();

  // Projects indexes
  await db.collection(COLLECTIONS.PROJECTS).createIndexes([
    { key: { projectId: 1 }, name: 'projectId_unique', unique: true },
    { key: { userId: 1, createdAt: -1 }, name: 'userId_createdAt' },
    { key: { userId: 1, updatedAt: -1 }, name: 'userId_updatedAt' },
  ]);

  // Checkpoints indexes with TTL
  await db.collection(COLLECTIONS.CHECKPOINTS).createIndexes([
    { key: { sessionId: 1, timestamp: 1 }, name: 'sessionId_timestamp' },
    { key: { projectId: 1, timestamp: -1 }, name: 'projectId_timestamp' },
    { 
      key: { createdAt: 1 }, 
      name: 'ttl_index',
      expireAfterSeconds: 2592000 // 30 days
    },
  ]);

  // Chat sessions indexes
  await db.collection(COLLECTIONS.CHAT_SESSIONS).createIndexes([
    { key: { sessionId: 1, userId: 1 }, name: 'sessionId_userId', unique: true },
    { key: { projectId: 1, updatedAt: -1 }, name: 'projectId_updatedAt' },
  ]);

  // Media assets indexes
  await db.collection(COLLECTIONS.MEDIA_ASSETS).createIndexes([
    { key: { userId: 1, uploadedAt: -1 }, name: 'userId_uploadedAt' },
    { key: { projectId: 1 }, name: 'projectId' },
    { key: { assetId: 1, userId: 1 }, name: 'assetId_userId', unique: true },
  ]);

  console.log('Database indexes initialized successfully');
}
