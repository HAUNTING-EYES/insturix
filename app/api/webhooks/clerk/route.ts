import { UserInitializationService } from "@/lib/services/userInitializationService";
import { organizationService, ClerkOrganizationData } from "@/lib/services/organizationService";
import { orgMemberService, ClerkMembershipData } from "@/lib/services/orgMemberService";
import { NextRequest } from "next/server";
import { Webhook } from "svix";
import { sendEmail } from '@/lib/services/email';
import { promotionalEmailTemplate } from '@/lib/services/email/templates/promotional';

// Extended webhook payload to include organization events
interface WebhookPayload {
  type: string;
  data: Record<string, unknown>;
}

// Type guards for different payload types
interface UserEventData {
  id: string;
  email_addresses?: Array<{ email_address: string }>;
  username?: string;
  image_url?: string;
}

interface OrganizationEventData {
  id: string;
  name: string;
  slug: string;
  image_url?: string;
  created_by: string;
  members_count?: number;
}

interface MembershipEventData {
  id: string;
  organization: {
    id: string;
    name: string;
    slug: string;
  };
  public_user_data: {
    user_id: string;
    identifier: string;
    first_name?: string;
    last_name?: string;
    image_url?: string;
  };
  role: string;
  created_at: number;
}

export const dynamic = 'force-dynamic';
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

    const eventType = payload.type;
    console.log(`📨 Clerk webhook received: ${eventType}`);
    
    // ============================================
    // USER EVENTS
    // ============================================
    
    if (eventType === "user.created") {
      const data = payload.data as unknown as UserEventData;
      try {
        const primaryEmail = data.email_addresses?.[0]?.email_address || "";
        const clerkUserId = data.id;
        const username = data.username;
        const imageUrl = data.image_url;

        if (!username) {
          console.error("Username is missing in the payload for user.created event");
          return new Response("Username is required", { status: 400 });
        }

        const initResult = await UserInitializationService.ensureUserExists(clerkUserId, primaryEmail, username, imageUrl);
        
        if (initResult.error) {
          console.error("Error creating user:", initResult.error);
          return new Response("Error creating user", { status: 500 });
        }
        
        if (initResult.isNewUser) {
          console.log("User created successfully:", clerkUserId);
          
          // Send promotional email to new users (only until Nov 22, 2025)
          const cutoffDate = new Date('2025-11-22T23:59:59Z');
          const currentDate = new Date();
          
          if (currentDate <= cutoffDate && primaryEmail) {
            try {
              const { html, text } = promotionalEmailTemplate(username || 'Valued User');
              
              sendEmail({
                to: primaryEmail,
                subject: "Welcome to Insturix! You're Invited to ICS'25 🚀",
                htmlBody: html,
                textBody: text,
              }).then((result) => {
                if (result.success) {
                  console.log(`✅ Promotional email sent to new user: ${primaryEmail}`);
                } else {
                  console.error(`❌ Failed to send promotional email to ${primaryEmail}:`, result.error);
                }
              }).catch((error) => {
                console.error(`❌ Error sending promotional email to ${primaryEmail}:`, error);
              });
            } catch (emailError) {
              console.error(`Error preparing promotional email for ${primaryEmail}:`, emailError);
            }
          } else if (currentDate > cutoffDate) {
            console.log(`⏰ Promotional email not sent to ${primaryEmail} - cutoff date passed (Nov 22, 2025)`);
          }
        } else {
          console.log(`User with email ${primaryEmail} already exists, skipping creation`);
        }
      } catch (error) {
        console.error("Error in user.created handler:", error);
        return new Response("Error creating user", { status: 500 });
      }
    }
    
    else if (eventType === "user.updated") {
      const data = payload.data as unknown as UserEventData;
      try {
        const clerkUserId = data.id;
        const clerkUserData = {
          email: data.email_addresses?.[0]?.email_address,
          username: data.username,
          imageUrl: data.image_url,
          emailAddresses: data.email_addresses?.map((emailAddr, index) => ({
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

    else if (eventType === "user.deleted") {
      const data = payload.data as unknown as UserEventData;
      try {
        const clerkUserId = data.id;
        
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

    // ============================================
    // ORGANIZATION EVENTS
    // ============================================

    else if (eventType === "organization.created") {
      const data = payload.data as unknown as OrganizationEventData;
      try {
        await organizationService.createFromClerk(data as ClerkOrganizationData);
        console.log(`✅ Organization created: ${data.name} (${data.id})`);
      } catch (error) {
        console.error("Error in organization.created handler:", error);
        return new Response("Error creating organization", { status: 500 });
      }
    }

    else if (eventType === "organization.updated") {
      const data = payload.data as unknown as OrganizationEventData;
      try {
        await organizationService.updateFromClerk(data as ClerkOrganizationData);
        console.log(`✅ Organization updated: ${data.name} (${data.id})`);
      } catch (error) {
        console.error("Error in organization.updated handler:", error);
        return new Response("Error updating organization", { status: 500 });
      }
    }

    else if (eventType === "organization.deleted") {
      const data = payload.data as { id: string };
      try {
        await organizationService.deleteOrganization(data.id);
        console.log(`✅ Organization deleted: ${data.id}`);
      } catch (error) {
        console.error("Error in organization.deleted handler:", error);
        return new Response("Error deleting organization", { status: 500 });
      }
    }

    // ============================================
    // ORGANIZATION MEMBERSHIP EVENTS
    // ============================================

    else if (eventType === "organizationMembership.created") {
      const data = payload.data as unknown as MembershipEventData;
      try {
        await orgMemberService.addMemberFromClerk(data as ClerkMembershipData);
        console.log(`✅ Member added: ${data.public_user_data.user_id} to ${data.organization.id}`);
      } catch (error) {
        console.error("Error in organizationMembership.created handler:", error);
        return new Response("Error adding organization member", { status: 500 });
      }
    }

    else if (eventType === "organizationMembership.updated") {
      const data = payload.data as unknown as MembershipEventData;
      try {
        await orgMemberService.updateFromClerk(data as ClerkMembershipData);
        console.log(`✅ Member updated: ${data.public_user_data.user_id} in ${data.organization.id}`);
      } catch (error) {
        console.error("Error in organizationMembership.updated handler:", error);
        return new Response("Error updating organization member", { status: 500 });
      }
    }

    else if (eventType === "organizationMembership.deleted") {
      const data = payload.data as unknown as MembershipEventData;
      try {
        await orgMemberService.removeFromClerk(data);
        console.log(`✅ Member removed: ${data.public_user_data.user_id} from ${data.organization.id}`);
      } catch (error) {
        console.error("Error in organizationMembership.deleted handler:", error);
        return new Response("Error removing organization member", { status: 500 });
      }
    }

    // ============================================
    // ORGANIZATION INVITATION EVENTS (optional handling)
    // ============================================

    else if (eventType === "organizationInvitation.created") {
      // Invitation sent - optional logging
      console.log(`📧 Organization invitation created`);
    }

    else if (eventType === "organizationInvitation.accepted") {
      // Invitation accepted - member will be added via organizationMembership.created
      console.log(`✅ Organization invitation accepted`);
    }

    else if (eventType === "organizationInvitation.revoked") {
      // Invitation revoked - optional logging
      console.log(`🚫 Organization invitation revoked`);
    }

    return new Response("Webhook processed successfully", { status: 200 });
  } catch (err) {
    console.error("Error processing webhook:", err);
    return new Response("Webhook processing error", { status: 500 });
  }
}
