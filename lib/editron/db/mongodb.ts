/**
 * MongoDB Connection Utility
 * 
 * Provides singleton MongoDB client for server-side operations
 */

import { MongoClient, Db } from 'mongodb';

if (!process.env.MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable');
}

if (!process.env.MONGODB_DB_NAME) {
  throw new Error('Please define the MONGODB_DB_NAME environment variable');
}

const uri = process.env.MONGODB_URI;
const dbName = process.env.EDITRON_MONGODB_DB_NAME || process.env.MONGODB_DB_NAME;

let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;

export async function connectToDatabase(): Promise<{ client: MongoClient; db: Db }> {
  // Return cached connection if available
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  // Create new connection with pool sizing for Vercel serverless.
  // Each serverless instance gets its own connection pool.
  // maxPoolSize=10: enough for concurrent requests on one instance
  // minPoolSize=2: keep warm connections to avoid cold-start latency
  // maxIdleTimeMS=30000: close idle connections after 30s (Vercel instances are short-lived)
  // serverSelectionTimeoutMS=5000: fail fast if Atlas is unreachable
  const client = new MongoClient(uri, {
    maxPoolSize: 10,
    minPoolSize: 2,
    maxIdleTimeMS: 30000,
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
  });

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
  MEDIA_UPLOADS: 'mediaUploads',
  MOTION_GRAPHIC_TEMPLATES: 'motionGraphicTemplates',
  STYLE_PROFILES: 'styleProfiles',
  PROJECT_LINKS: 'project_links',
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
    { key: { userId: 1, name: 1 }, name: 'userId_name' },
    { key: { orgId: 1, visibility: 1, createdAt: -1 }, name: 'org_visibility_createdAt' },
    { key: { orgId: 1, visibility: 1, updatedAt: -1 }, name: 'org_visibility_updatedAt' },
    { key: { orgId: 1, visibility: 1, name: 1 }, name: 'org_visibility_name' },
    { key: { status: 1, updatedAt: -1 }, name: 'status_updatedAt' },
    { key: { brandId: 1, status: 1 }, name: 'brandId_status' },
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

  // Media uploads tracking (multipart) — TTL on lastActivityAt so active slow uploads survive
  await db.collection(COLLECTIONS.MEDIA_UPLOADS).createIndexes([
    { key: { assetId: 1, userId: 1 }, name: 'assetId_userId', unique: true },
    {
      key: { lastActivityAt: 1 },
      name: 'ttl_lastActivity',
      expireAfterSeconds: 604800, // 7 days
    },
  ]);

  // Project links indexes (cross-service content lineage)
  await db.collection(COLLECTIONS.PROJECT_LINKS).createIndexes([
    { key: { universalId: 1 }, name: 'universalId_unique', unique: true },
    { key: { userId: 1, brandId: 1 }, name: 'userId_brandId' },
    { key: { userId: 1, sessionId: 1 }, name: 'userId_sessionId' },
    { key: { userId: 1, storyboardIds: 1 }, name: 'userId_storyboardIds' },
    { key: { userId: 1, projectIds: 1 }, name: 'userId_projectIds' },
    { key: { userId: 1, videoIds: 1 }, name: 'userId_videoIds' },
  ]);

  console.log('Database indexes initialized successfully');
}
