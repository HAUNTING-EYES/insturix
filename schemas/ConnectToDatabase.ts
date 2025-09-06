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
  const mongoUri = uri || process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB_NAME;

  if (!mongoUri) {
    throw new Error("MONGODB_URI is not defined in environment variables");
  }

  if (!dbName) {
    throw new Error("MONGODB_DB_NAME is not defined in environment variables");
  }

  // Return cached connection if available
  if (cached.conn) {
    return cached.conn;
  }

  // Return existing promise if connection is in progress
  if (cached.promise) {
    return cached.promise;
  }

  if (mongoose.connection.readyState === 1) {
    cached.conn = mongoose;
    return mongoose;
  }

  console.log("Creating new MongoDB connection.");
  
  // Cache the connection promise
  cached.promise = mongoose.connect(mongoUri, { 
    dbName,
    maxPoolSize: 10, // Maintain up to 10 socket connections
    serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
    socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
    bufferCommands: false // Disable mongoose buffering
  }).then((mongoose) => {
    console.log("MongoDB connected successfully.");
    cached.conn = mongoose;
    return mongoose;
  }).catch((e) => {
    console.error("Error connecting to database:", e);
    cached.promise = null; // Reset promise on error
    throw e;
  });

  return cached.promise;
};

export default connectToDatabase;
