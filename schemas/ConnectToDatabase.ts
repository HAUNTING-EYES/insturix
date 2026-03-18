import mongoose from "mongoose";

if (!process.env.MONGODB_URI) {
  throw new Error("Please define the MONGODB_URI environment variable");
}

const MONGODB_URI = process.env.MONGODB_URI;

/**
 * Global is used here to maintain a cached connection across hot reloads
 * in development. This prevents connections growing exponentially
 * during API Route usage.
 */
let cached = (global as any).mongoose;

if (!cached) {
  cached = (global as any).mongoose = { conn: null, promise: null };
}

async function connectToDatabase() {
  if (cached.conn) {
    // Verify the existing connection is still alive
    if (mongoose.connection.readyState === 1) {
      return cached.conn;
    }
    // Connection dropped — reset cache so we reconnect
    cached.conn = null;
    cached.promise = null;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      dbName: process.env.MONGODB_DB_NAME,
      serverSelectionTimeoutMS: 5000, // Fail fast if no server found (default 30s)
      connectTimeoutMS: 5000,         // TCP connection timeout (default 30s)
      socketTimeoutMS: 10000,         // Socket inactivity timeout (default 0 / infinite)
    };

    cached.promise = mongoose
      .connect(MONGODB_URI, opts)
      .then((mongoose) => {
        return mongoose;
      })
      .catch((err) => {
        // Reset the cached promise so the next request retries
        // instead of awaiting a permanently rejected promise
        cached.promise = null;
        throw err;
      });
  }
  cached.conn = await cached.promise;
  return cached.conn;
}

export default connectToDatabase;
