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

  if (!mongoUri) {
    throw new Error("MONGODB_URI is not defined in environment variables");
  }

  if (mongoose.connection.readyState === 1) {
    // console.log("Using existing MongoDB connection.");
    return mongoose;
  }

  console.log("Creating new MongoDB connection.");
  try {
    await mongoose.connect(mongoUri);
    console.log("MongoDB connected successfully.");
    return mongoose;
  } catch (e) {
    console.error("Error connecting to database:", e);
    throw e;
  }
};

export default connectToDatabase;
