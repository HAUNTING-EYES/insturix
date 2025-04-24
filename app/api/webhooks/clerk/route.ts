import User, { IPlan } from "@/schemas/user";
import Socialize from "@/schemas/Socialize";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import { UserType } from "@/types/userTypes";

// Interface for MongoDB duplicate key errors
interface MongoDBError extends Error {
  code?: number;
  keyPattern?: Record<string, number | string>;
  keyValue?: Record<string, unknown>;
}

export async function POST(req: Request) {
  try {
    await connectToDatabase(process.env.MONGODB_URI || "");
    const payload = await req.json();
    
    // Handle user creation event
    if (payload.type === "user.created") {
      try {
        const now = new Date();
        const oneMonthLater = new Date(now);
        oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);

        const freePlan: IPlan = {
          name: UserType.Free,
          startDate: now,
          endDate: oneMonthLater,
          price: 0,
          status: "active",
          features: ["Basic access", "Limited storage", "Community support"],
        };

        // Get primary email
        const primaryEmail =
          payload.data.email_addresses?.[0]?.email_address || "";

        // Create user account with try-catch to handle duplicate emails
        try {
          const newUser = new User({
            clerkUserId: payload.data.id,
            email: primaryEmail,
            userType: UserType.Free,
            payments: [],
            signUpDate: now,
            currentPlan: freePlan,
            planHistory: [freePlan],
          });
          await newUser.save();
          console.log("User created successfully:", payload.data.id);
        } catch (error) {
          const userError = error as MongoDBError;
          if (
            userError.code === 11000 &&
            userError.keyPattern &&
            "email" in userError.keyPattern
          ) {
            console.log(
              `User with email ${primaryEmail} already exists, skipping creation`
            );
          } else {
            throw error;
          }
        }

        // Create Socialize profile if username is available
        if (payload.data.username) {
          try {
            // Check if profile already exists
            const existingProfile = await Socialize.findOne({ 
              clerkUserId: payload.data.id 
            });
            
            if (existingProfile) {
              console.log(
                `Socialize profile already exists for ${payload.data.username}, updating`
              );
              
              existingProfile.username = payload.data.username;
              
              if (payload.data.image_url) {
                existingProfile.profileImage = payload.data.image_url;
              }
              
              await existingProfile.save();
            } else {
              // Create new profile
              const newSocializeProfile = new Socialize({
                clerkUserId: payload.data.id,
                username: payload.data.username,
                profileImage: payload.data.image_url || "",
                bio: "",
                links: [],
                notifications: [],
              });

              await newSocializeProfile.save();
              console.log(
                "Socialize profile created for:",
                payload.data.username
              );
            }
          } catch (socializeError) {
            console.error("Error handling Socialize profile:", socializeError);
          }
        }
      } catch (error) {
        console.error("Error in user.created handler:", error);
      }
    }
    
    // Handle user update event - FOCUSED ONLY ON USERNAME AND PROFILE IMAGE
    else if (payload.type === "user.updated" && payload.data.id) {
      try {
        const clerkUserId = payload.data.id;
        const username = payload.data.username;
        const profileImage = payload.data.image_url;
        
        // Skip if no username is provided
        if (!username) {
          console.log("No username provided in update event, skipping");
          return new Response("Username is required for update", { status: 400 });
        }
        
        // Find the existing profile
        const existingProfile = await Socialize.findOne({ clerkUserId });
        
        if (existingProfile) {
          // Track if any updates are needed
          let isUpdated = false;
          const updates: Record<string, unknown> = {};
          
          // Check if username has changed
          if (existingProfile.username !== username) {
            updates.username = username;
            isUpdated = true;
            console.log(`Username update detected: ${existingProfile.username} → ${username}`);
          }
          
          // Check if profile image has changed
          if (profileImage && existingProfile.profileImage !== profileImage) {
            updates.profileImage = profileImage;
            isUpdated = true;
            console.log("Profile image update detected");
          }
          
          // Only update if changes were detected
          if (isUpdated) {
            const updatedProfile = await Socialize.findOneAndUpdate(
              { clerkUserId },
              { $set: updates },
              { new: true }
            );
            
            console.log("Socialize profile updated successfully:", {
              username: updatedProfile?.username,
              fieldsUpdated: Object.keys(updates)
            });
          } else {
            console.log("No changes to username or profileImage detected");
          }
        } else {
          // Create a new profile if it doesn't exist
          const newSocializeProfile = new Socialize({
            clerkUserId,
            username,
            profileImage: profileImage || "",
            bio: "",
            links: [],
            notifications: [],
          });
          
          await newSocializeProfile.save();
          console.log(`New Socialize profile created for user: ${username}`);
        }
      } catch (error) {
        console.error("Error updating Socialize profile:", error);
        return new Response("Error updating Socialize profile", { status: 500 });
      }
    }

    return new Response("Webhook processed successfully", { status: 200 });
  } catch (err) {
    console.error("Error processing webhook:", err);
    return new Response("Webhook processing error", { status: 400 });
  }
}
