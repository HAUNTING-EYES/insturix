import { UserInitializationService } from "@/lib/services/userInitializationService";
import { NextRequest } from "next/server";
import { Webhook } from "svix";

interface WebhookPayload {
  type: string;
  data: {
    id: string;
    email_addresses?: Array<{ email_address: string }>;
    username?: string;
    image_url?: string;
  };
}

export async function POST(req: NextRequest) {
  try {
    const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error("CLERK_WEBHOOK_SECRET is not configured");
      return new Response("Webhook secret not configured", { status: 500 });
    }

    const rawPayload = await req.text();
    const svixId = req.headers.get("svix-id");
    const svixTimestamp = req.headers.get("svix-timestamp");
    const svixSignature = req.headers.get("svix-signature");

    if (!svixId || !svixTimestamp || !svixSignature) {
      console.error("Missing required Svix headers");
      return new Response("Missing required headers", { status: 401 });
    }

    const wh = new Webhook(webhookSecret);
    let payload: WebhookPayload;

    try {
      payload = wh.verify(rawPayload, {
        "svix-id": svixId,
        "svix-timestamp": svixTimestamp,
        "svix-signature": svixSignature,
      }) as WebhookPayload;
    } catch (err) {
      console.error("Webhook verification failed:", err);
      return new Response("Webhook verification failed", { status: 401 });
    }
    
    if (payload.type === "user.created") {
      try {
        const primaryEmail = payload.data.email_addresses?.[0]?.email_address || "";
        const clerkUserId = payload.data.id;
        const username = payload.data.username;
        const imageUrl = payload.data.image_url;

        if (!username) {
          console.error("Username is missing in the payload for user.created event");
          return new Response("Username is required", { status: 400 });
        }

        // Use UserInitializationService to ensure user exists
        const initResult = await UserInitializationService.ensureUserExists(clerkUserId, primaryEmail, username, imageUrl);
        
        if (initResult.error) {
          console.error("Error creating user:", initResult.error);
          return new Response("Error creating user", { status: 500 });
        }
        
        if (initResult.isNewUser) {
          console.log("User created successfully:", clerkUserId);
        } else {
          console.log(`User with email ${primaryEmail} already exists, skipping creation`);
        }
      } catch (error) {
        console.error("Error in user.created handler:", error);
        return new Response("Error creating user", { status: 500 });
      }
    }
    
    else if (payload.type === "user.updated") {
      try {
        const clerkUserId = payload.data.id;
        const clerkUserData = {
          email: payload.data.email_addresses?.[0]?.email_address,
          username: payload.data.username,
          imageUrl: payload.data.image_url,
          emailAddresses: payload.data.email_addresses?.map((emailAddr, index) => ({
            emailAddress: emailAddr.email_address,
            id: `email_${index}`
          }))
        };

        const syncResult = await UserInitializationService.syncUserFromClerk(clerkUserId, clerkUserData);
        
        if (!syncResult) {
          console.error(`Failed to sync user data for Clerk ID: ${clerkUserId}`);
          return new Response("Failed to sync user data", { status: 500 });
        }
        
        console.log("User updated successfully:", clerkUserId);
      } catch (error) {
        console.error("Error in user.updated handler:", error);
        return new Response("Error updating user", { status: 500 });
      }
    }

    else if (payload.type === "user.deleted") {
      try {
        const clerkUserId = payload.data.id;
        
        const deletionResult = await UserInitializationService.handleUserDeletion(clerkUserId);
        
        if (!deletionResult) {
          console.error(`Failed to delete user data for Clerk ID: ${clerkUserId}`);
          return new Response("Failed to delete user data", { status: 500 });
        }
        
        console.log("User deleted successfully:", clerkUserId);
      } catch (error) {
        console.error("Error in user.deleted handler:", error);
        return new Response("Error deleting user", { status: 500 });
      }
    }

    return new Response("Webhook processed successfully", { status: 200 });
  } catch (err) {
    console.error("Error processing webhook:", err);
    return new Response("Webhook processing error", { status: 500 });
  }
}
