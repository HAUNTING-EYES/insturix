import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const connectToDatabase = async (ConnectionString: string) => {
  try {
    const uri = ConnectionString as string;
    await mongoose.connect(uri);
  } catch (error) {
    console.error("Error connecting to database:", error);
  }
};

export default connectToDatabase;
