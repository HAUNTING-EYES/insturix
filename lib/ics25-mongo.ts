import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;
const ICS25_DB_NAME = 'ics25';

if (!MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable');
}

type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

declare global {
  // eslint-disable-next-line no-var
  var ics25_mongoose: MongooseCache | undefined;
}

const cached: MongooseCache = global.ics25_mongoose ?? { conn: null, promise: null };
if (!global.ics25_mongoose) {
  global.ics25_mongoose = cached;
}

async function dbConnect(): Promise<typeof mongoose> {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    const opts: Parameters<typeof mongoose.connect>[1] = {
      bufferCommands: false,
      dbName: ICS25_DB_NAME,
      maxPoolSize: 10,
    };
    cached.promise = mongoose.connect(MONGODB_URI!, opts).then((m) => m);
  }
  cached.conn = await cached.promise;
  return cached.conn;
}

export async function getIcs25Db() {
  await dbConnect();
  return mongoose;
}
