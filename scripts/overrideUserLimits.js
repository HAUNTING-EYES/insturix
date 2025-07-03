import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// Set the user ID and new limits here
const USER_ID = "user_2yNaea7Q6DR4zwGm7tcZBEMklgb"; // Change this to your user ID
const NEW_LIMITS = {
  clickatron: [
    {
      limitType: "maxThumbnailGeneration",
      description: "Thumbnail generations per week",
      maxUsage: 100,
      currentUsage: 0,
      resetPeriod: "weekly"
    }
  ]
};

async function overrideUserLimits() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Database connected.");

    // Find user by clerkUserId
    const user = await mongoose.connection.db.collection('users').findOne({ clerkUserId: USER_ID });
    if (!user) {
      console.error(`User with ID ${USER_ID} not found.`);
      return;
    }

    console.log(`Found user: ${user.email}`);
    
    // Update the service limits
    const updatedServiceLimits = { ...user.currentPlan.serviceLimits, ...NEW_LIMITS };
    
    await mongoose.connection.db.collection('users').updateOne(
      { clerkUserId: USER_ID },
      { 
        $set: { 
          'currentPlan.serviceLimits': updatedServiceLimits 
        } 
      }
    );
    
    console.log(`Successfully updated limits for user ${USER_ID}`);
    console.log("New limits:", NEW_LIMITS);

  } catch (error) {
    console.error("Error updating user limits:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Database connection closed.");
  }
}

overrideUserLimits();