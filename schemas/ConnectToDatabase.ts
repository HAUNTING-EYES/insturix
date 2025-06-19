import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const connectToDatabase = async (uri?: string) => {
  try {
    const mongoUri = uri || process.env.MONGODB_URI;

    if (!mongoUri) {
      throw new Error("MONGODB_URI is not defined in environment variables");
    }

    await mongoose.connect(mongoUri, {
      autoCreate: true,
    });

    if (mongoose.connection.readyState === 1) {
      console.log(`Connected to MongoDB database`);
    }
  } catch (error) {
    console.error("Error connecting to database:", error);
    throw error;
  }
};

export default connectToDatabase;
