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
          if (userError.code === 11000 && userError.keyPattern && 'email' in userError.keyPattern) {
            console.log(`User with email ${primaryEmail} already exists, skipping creation`);
          } else {
            throw error;
          }
        }

        // Create Socialize profile if username is available
        if (payload.data.username) {
          try {
            const newSocializeProfile = new Socialize({
              clerkUserId: payload.data.id,
              username: payload.data.username,
              profileImage: payload.data.image_url || payload.data.profile_image_url || "",
              bio: "",
              links: [],
            });

            await newSocializeProfile.save();
            console.log("Socialize profile created for:", payload.data.username);
          } catch (socializeError) {
            console.error("Error creating Socialize profile:", socializeError);
          }
        }
      } catch (error) {
        console.error("Error in user.created handler:", error);
      }
    }

    return new Response("Webhook received", { status: 200 });
  } catch (err) {
    console.error("Error processing webhook:", err);
    return new Response("Webhook error", { status: 400 });
  }
}
