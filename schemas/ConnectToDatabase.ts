import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

// We declare a cached variable in the global scope.
// In a serverless environment, the global scope is reused between invocations.
let cached = (global as any).mongoose;

if (!cached) {
  cached = (global as any).mongoose = { conn: null, promise: null };
}

const connectToDatabase = async (uri?: string) => {
  // If we have a cached connection, reuse it
  if (cached.conn) {
    // console.log("Using cached MongoDB connection.");
    return cached.conn;
  }

  // If a connection promise doesn't exist, create one
  if (!cached.promise) {
    const mongoUri = uri || process.env.MONGODB_URI;

    if (!mongoUri) {
      throw new Error("MONGODB_URI is not defined in environment variables");
    }

    console.log("Creating new MongoDB connection.");
    cached.promise = mongoose.connect(mongoUri).then((mongooseInstance) => {
      console.log("MongoDB connected successfully.");
      return mongooseInstance;
    });
  }

  // Wait for the connection promise to resolve
  try {
    cached.conn = await cached.promise;
  } catch (e) {
    // If the connection fails, reset the promise so the next request can try again
    cached.promise = null;
    console.error("Error connecting to database:", e);
    throw e;
  }
  
  return cached.conn;
};

export default connectToDatabase;
