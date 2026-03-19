import mongoose from 'mongoose';
import { ClickatronTask } from '../schemas/Clickatron';

// Read env vars lazily to avoid crashing next build when they're not set (e.g. CI).
function getMongoConfig() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB_NAME;
  if (!uri) throw new Error('Please define the MONGODB_URI environment variable inside .env.local');
  if (!dbName) throw new Error('Please define the MONGODB_DB_NAME environment variable inside .env.local');
  return { uri, dbName };
}

let cached = (global as any).mongoose;

if (!cached) {
  cached = (global as any).mongoose = { conn: null, promise: null };
}

async function dbConnect() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const { uri, dbName } = getMongoConfig();
    const opts = {
      bufferCommands: false,
      dbName
    };

    cached.promise = mongoose.connect(uri, opts).then((mongoose) => {
      return mongoose;
    });
  }
  cached.conn = await cached.promise;
  return cached.conn;
}

export async function getClickatronDb() {
  await dbConnect();
  return { ClickatronTask };
}