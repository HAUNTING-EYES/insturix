import mongoose, { Connection, Mongoose } from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;
const ICS25_DB_NAME = 'ics25';

if (!MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable');
}

type MongooseCache = {
  conn: Connection | null;
  promise: Promise<Connection> | null;
  mongoose: Mongoose;
};

declare global {
  // eslint-disable-next-line no-var
  var ics25_mongoose: MongooseCache | undefined;
}

const cached: MongooseCache = global.ics25_mongoose ?? {
  conn: null,
  promise: null,
  mongoose: new mongoose.Mongoose(),
};

if (!global.ics25_mongoose) {
  global.ics25_mongoose = cached;
}

async function dbConnect(): Promise<Connection> {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    const opts: Parameters<typeof cached.mongoose.connect>[1] = {
      bufferCommands: false,
      dbName: ICS25_DB_NAME,
      maxPoolSize: 10,
    };
    cached.promise = cached.mongoose.connect(MONGODB_URI!, opts).then((m) => m.connection);
  }
  cached.conn = await cached.promise;
  return cached.conn;
}

export function getIcs25Mongoose() {
  return cached.mongoose;
}

export async function getIcs25Db() {
  await dbConnect();
  return cached.mongoose;
}

export async function getIcs25Connection() {
  return dbConnect();
}
