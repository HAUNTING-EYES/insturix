import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const connectToDatabase = async () => {
  try {
    const uri = process.env.MONGODB_URI as string;
    await mongoose.connect(uri);
  } catch (error) {
    console.log("Error connecting to database", error);
  }
};

export default connectToDatabase;