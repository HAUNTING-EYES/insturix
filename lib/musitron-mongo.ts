import mongoose from 'mongoose';
import { MusitronTask } from '../schemas/Musitron';

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable inside .env.local');
}

type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

declare global {
  var mongoose: MongooseCache | undefined;
}

const cached: MongooseCache = global.mongoose ?? { conn: null, promise: null };

if (!global.mongoose) {
  global.mongoose = cached;
}

async function dbConnect(): Promise<typeof mongoose> {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts: Parameters<typeof mongoose.connect>[1] = {
      bufferCommands: false,
      // Don't override the database name - use the one from MONGODB_URI
    };

    cached.promise = mongoose.connect(MONGODB_URI!, opts).then((m) => m);
  }
  cached.conn = await cached.promise;
  return cached.conn;
}

export async function getMusitronDb() {
  await dbConnect();
  return { MusitronTask };
}