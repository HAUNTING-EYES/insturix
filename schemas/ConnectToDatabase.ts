import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const connectToDatabase = async (ConnectionString: string) => {
  try {
    const uri = ConnectionString as string;
    
    // Extract database name from connection string
    let dbName = "prod"; // Default database name
    
    try {
      // Parse the connection string to extract the database name
      const uriObj = new URL(uri);
      const pathParts = uriObj.pathname.split('/');
      if (pathParts.length > 1 && pathParts[1]) {
        dbName = pathParts[1];
      }
    } catch {
      console.warn("Could not parse database name from connection string, using default 'prod'");
    }
    
    // Connect to MongoDB with options to create database if it doesn't exist
    await mongoose.connect(uri, {
      autoCreate: true, // Create the database if it doesn't exist
    });
    
    // Check if the connection is successful
    if (mongoose.connection.readyState === 1) {
      console.log(`Connected to MongoDB database: ${dbName}`);
    }
    
  } catch (error) {
    console.error("Error connecting to database:", error);
    throw error; // Re-throw to allow proper handling in API routes
  }
};

export default connectToDatabase;
