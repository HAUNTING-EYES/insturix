import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const connectToDatabase = async (uri?: string) => {
  // Log current connection state for diagnostics
  console.log("Mongoose connection readyState:", mongoose.connection.readyState);

  // If not connected, try to reconnect
  if (mongoose.connection.readyState !== 1) {
    try {
      const mongoUri = uri || process.env.MONGODB_URI;

      if (!mongoUri) {
        throw new Error("MONGODB_URI is not defined in environment variables");
      }

      await mongoose.connect(mongoUri, {
        autoCreate: true,
      });

      console.log(`Connected to MongoDB database`);
    } catch (error) {
      console.error("Error connecting to database:", error);
      throw error;
    }
  } else {
    console.log("Already connected to MongoDB.");
  }
};

export default connectToDatabase;
