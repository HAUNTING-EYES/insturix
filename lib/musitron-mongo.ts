import mongoose from 'mongoose';
import { MusitronTask } from '../schemas/Musitron';

function getMongoConfig() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB_NAME;
  if (!uri) throw new Error('Please define the MONGODB_URI environment variable inside .env.local');
  if (!dbName) throw new Error('Please define the MONGODB_DB_NAME environment variable inside .env.local');
  return { uri, dbName };
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
    const { uri, dbName } = getMongoConfig();
    const opts: Parameters<typeof mongoose.connect>[1] = {
      bufferCommands: false,
      dbName,
    };

    cached.promise = mongoose.connect(uri, opts).then((m) => m);
  }
  cached.conn = await cached.promise;
  return cached.conn;
}

export async function getMusitronDb() {
  await dbConnect();
  return { MusitronTask };
}