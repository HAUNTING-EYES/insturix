import { clerkClient } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import { User } from "@/schemas/user";
import Plan from "@/schemas/plans";
import Socialize from "@/schemas/Socialize";
import { UserType } from "@/types/userTypes";
import { IServiceLimits } from "@/schemas/user";

type DbUser = typeof User extends { schema: unknown }
  ? Awaited<ReturnType<(typeof User)["findOne"]>>
  : unknown;

export interface UserInitializationResult {
  user: DbUser | null;
  isNewUser: boolean;
  error?: string;
}

export class UserInitializationService {
  /**
   * Ensures user exists in MongoDB, creates with default Free plan if not
   */
  static async ensureUserExists(
    clerkUserId: string,
    email: string,
    username: string,
    imageUrl?: string
  ): Promise<UserInitializationResult> {
    try {
      await connectToDatabase();

      // First, try to find existing user
      let user = await User.findOne({ clerkUserId });
      
      if (user) {
        // If user exists, check if socialize profile needs image update
        const socializeProfile = await Socialize.findOne({ clerkUserId });
        if (socializeProfile && !socializeProfile.profileImage && imageUrl) {
          socializeProfile.profileImage = imageUrl;
          await socializeProfile.save();
        }
        return { user, isNewUser: false };
      }

      // User doesn't exist, prepare to create with default Free plan
      console.log(`Creating new user account for Clerk ID: ${clerkUserId}`);

      let finalImageUrl = imageUrl;
      if (!finalImageUrl) {
        try {
          const client = await clerkClient();
          const clerkUser = await client.users.getUser(clerkUserId);
          finalImageUrl = clerkUser.imageUrl;
        } catch (error) {
          console.error("Error fetching user from Clerk:", error);
          // Proceed without image if Clerk fetch fails
        }
      }
      
      // Get default free plan service limits
      const freePlanLimits = await this.getDefaultFreePlanLimits();
      
      console.log(`Creating user with serviceLimits:`, JSON.stringify(freePlanLimits, null, 2));
      
      const now = new Date();
      
      // Get the actual Free plan from plans collection
      const freePlan = await Plan.findOne({
        type: "free",
        isActive: true
      });
      
      if (!freePlan) {
        throw new Error("Free plan not found in plans collection. Database setup is incomplete.");
      }

      // Use findOneAndUpdate with upsert to atomically create or retrieve the user
      // This prevents race conditions from concurrent requests
      let userDoc;
      let isNewUser = false;
      
      try {
        userDoc = await User.findOneAndUpdate(
          { clerkUserId }, // Filter
          {
            $setOnInsert: {
              clerkUserId,
              email: email.toLowerCase().trim(),
              username,
              signUpDate: now,
              currentPlan: {
                planId: freePlan._id.toString(),
                name: UserType.Free,
                startDate: now,
                endDate: null, // Free plan never expires
                price: 0,
                currency: "USD",
                status: "active",
                serviceLimits: freePlanLimits,
              },
              planHistory: [],
              payments: [],
              trialUsed: false,
              preferences: {
                currency: "USD",
                notifications: {
                  planExpiry: true,
                  paymentReminders: true,
                },
              },
            }
          },
          { 
            upsert: true, // Create if doesn't exist
            new: true,    // Return the new document
            setDefaultsOnInsert: true // Apply schema defaults
          }
        );

        user = userDoc;
        isNewUser = true;
        
        console.log(`Successfully created user account for: ${email}`);
      } catch (upsertError: unknown) {
        // Handle duplicate username error
        if (upsertError && typeof upsertError === 'object' && 'code' in upsertError && upsertError.code === 11000) {
          // Check if it's a username conflict vs clerkUserId conflict
          const errorMessage = upsertError && 'message' in upsertError ? String(upsertError.message) : '';
          
          if (errorMessage.includes('username_1')) {
            // Username conflict - the username exists for a different clerkUserId
            // Check if the conflicting user has a different clerkUserId
            const conflictingUser = await User.findOne({ username });
            
            if (conflictingUser && conflictingUser.clerkUserId !== clerkUserId) {
              console.log(`Deleting old user with username "${username}" and different clerkUserId: ${conflictingUser.clerkUserId}`);
              
              // Delete the old user from User collection
              await User.deleteOne({ _id: conflictingUser._id });
              
              // Delete the old user's Socialize profile if it exists
              await Socialize.deleteOne({ clerkUserId: conflictingUser.clerkUserId });
              
              console.log(`Deleted old user and socialize profile for conflicting username: ${username}`);
              
              // Retry the upsert now that the conflict is resolved
              userDoc = await User.findOneAndUpdate(
                { clerkUserId },
                {
                  $setOnInsert: {
                    clerkUserId,
                    email: email.toLowerCase().trim(),
                    username,
                    signUpDate: now,
                    currentPlan: {
                      planId: freePlan._id.toString(),
                      name: UserType.Free,
                      startDate: now,
                      endDate: null,
                      price: 0,
                      currency: "USD",
                      status: "active",
                      serviceLimits: freePlanLimits,
                    },
                    planHistory: [],
                    payments: [],
                    trialUsed: false,
                    preferences: {
                      currency: "USD",
                      notifications: {
                        planExpiry: true,
                        paymentReminders: true,
                      },
                    },
                  }
                },
                { 
                  upsert: true,
                  new: true,
                  setDefaultsOnInsert: true
                }
              );
              
              user = userDoc;
              isNewUser = true;
              console.log(`Successfully created user account for: ${email} after resolving username conflict`);
            } else {
              // Same clerkUserId, this shouldn't happen but handle gracefully
              throw new Error(`Username conflict for same clerkUserId - unexpected state`);
            }
          } else if (errorMessage.includes('clerkUserId_1')) {
            // ClerkUserId conflict - user was created by concurrent request
            console.log(`User already exists (created by concurrent request), fetching existing user: ${clerkUserId}`);
            const existingUser = await User.findOne({ clerkUserId });
            if (existingUser) {
              user = existingUser;
              isNewUser = false;
            } else {
              throw upsertError;
            }
          } else {
            // Unknown duplicate key error
            throw upsertError;
          }
        } else {
          throw upsertError;
        }
      }

      // Use upsert for Socialize profile as well to prevent race conditions
      await Socialize.findOneAndUpdate(
        { clerkUserId },
        {
          $setOnInsert: {
            clerkUserId,
            username,
            profileImage: finalImageUrl,
          }
        },
        { 
          upsert: true,
          new: true 
        }
      );
      
      if (isNewUser) {
        console.log(`New Socialize profile created for user: ${clerkUserId}`);
      }
      
      return { user, isNewUser };
    } catch (error) {
      console.error("Error ensuring user exists:", error);
      
      return { 
        user: null, 
        isNewUser: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      };
    }
  }

  /**
   * Get default service limits for Free plan
   */
  static async getDefaultFreePlanLimits(): Promise<IServiceLimits> {
    // Get limits from plans collection - no fallbacks
    const freePlan = await Plan.findOne({
      type: "free",
      isActive: true
    }).lean();

    if (!freePlan) {
      throw new Error("Free plan not found in plans collection. Database setup is incomplete.");
    }

    if (!("serviceLimits" in freePlan) || !freePlan.serviceLimits) {
      throw new Error("Free plan has no serviceLimits defined. Database setup is incomplete.");
    }

    // Convert plan serviceLimits to user serviceLimits structure
    const convertedLimits = this.convertPlanLimitsToUserLimits(freePlan.serviceLimits as unknown);

    // Check if conversion resulted in valid limits
    const hasValidLimits = Object.values(convertedLimits).some(
      (limits) => Array.isArray(limits) && limits.length > 0
    );

    if (!hasValidLimits) {
      throw new Error("Free plan serviceLimits conversion resulted in empty limits. Database setup is incomplete.");
    }

    console.log("Using Free plan limits from database");
    return convertedLimits;
  }

  /**
   * Convert plan service limits to user service limits structure
   */
  static convertPlanLimitsToUserLimits(
    planServiceLimits: unknown
  ): IServiceLimits {
    const userServiceLimits: IServiceLimits = {
      alyzitron: [],
      editron: [],
      shield: [],
      thinkforge: [],
      musitron: [],
      clickatron: []
    };

    // Validate input - no fallbacks
    if (!planServiceLimits || typeof planServiceLimits !== "object") {
      throw new Error("planServiceLimits is null or invalid. Database setup is incomplete.");
    }

    // Narrow the shape we expect for each plan limit item
    type RawPlanLimit = {
      limitType: string;
      maxUsage: number;
      resetPeriod?: string;
    };

    // Iterate known service keys only
    (Object.keys(userServiceLimits) as Array<keyof IServiceLimits>).forEach((serviceName) => {
      const raw = (planServiceLimits as Record<string, unknown>)[serviceName as string];

      if (Array.isArray(raw)) {
        (raw as unknown[]).forEach((planLimit) => {
          const item = planLimit as Partial<RawPlanLimit>;
          if (!item || typeof item.limitType !== "string" || typeof item.maxUsage !== "number") {
            throw new Error(`Invalid plan limit found for service ${String(serviceName)}. Database setup is incomplete.`);
          }

          userServiceLimits[serviceName].push({
            limitType: item.limitType,
            maxUsage: item.maxUsage,
            currentUsage: 0,
            // Coerce resetPeriod to allowed literals
            resetPeriod:
              item.resetPeriod === "daily" ||
              item.resetPeriod === "weekly" ||
              item.resetPeriod === "monthly" ||
              item.resetPeriod === "none"
                ? item.resetPeriod
                : "weekly",
          });
        });
      }
    });

    return userServiceLimits;
  }

  /**
   * Sync user data from Clerk (email updates, username renames, etc.)
   */
  static async syncUserFromClerk(
    clerkUserId: string,
    clerkUserData: {
      email?: string;
      username?: string;
      imageUrl?: string;
      emailAddresses?: Array<{ emailAddress: string; id: string }>;
    }
  ): Promise<boolean> {
    try {
      await connectToDatabase();
      
      const user = await User.findOne({ clerkUserId });
      if (!user) {
        return false;
      }

      let hasUserChanges = false;
      let hasSocializeChanges = false;
      const oldUsername = user.username;
      
      // Update email if it has changed
      const newEmail = clerkUserData.email ||
        clerkUserData.emailAddresses?.[0]?.emailAddress;
      
      if (newEmail && newEmail.toLowerCase().trim() !== user.email) {
        user.email = newEmail.toLowerCase().trim();
        hasUserChanges = true;
      }
      
      // Update username if it has changed
      if (clerkUserData.username && clerkUserData.username !== user.username) {
        user.username = clerkUserData.username;
        hasUserChanges = true;
      }

      if (hasUserChanges) {
        await user.save();
        console.log(`Updated user data for: ${clerkUserId}`);
      }

      // Get socialize profile for updates
      const socializeProfile = await Socialize.findOne({ clerkUserId });
      
      if (socializeProfile) {
        // Update Socialize profile username if it has changed
        if (clerkUserData.username && clerkUserData.username !== socializeProfile.username) {
          socializeProfile.username = clerkUserData.username;
          hasSocializeChanges = true;
          console.log(`Username renamed from "${oldUsername}" to "${clerkUserData.username}" for user: ${clerkUserId}`);
        }
        
        // Update Socialize profile image if it has changed
        if (clerkUserData.imageUrl && socializeProfile.profileImage !== clerkUserData.imageUrl) {
          socializeProfile.profileImage = clerkUserData.imageUrl;
          hasSocializeChanges = true;
        }
        
        if (hasSocializeChanges) {
          await socializeProfile.save();
          console.log(`Updated Socialize profile for: ${clerkUserId}`);
        }
      } else {
        // If socialize profile doesn't exist, create it
        if (clerkUserData.username) {
          const newSocializeProfile = new Socialize({
            clerkUserId,
            username: clerkUserData.username,
            profileImage: clerkUserData.imageUrl || "",
          });
          await newSocializeProfile.save();
          console.log(`Created missing Socialize profile for user: ${clerkUserId}`);
        }
      }

      return true;
    } catch (error) {
      console.error("Error syncing user from Clerk:", error);
      return false;
    }
  }

  /**
   * Handle user cleanup when deleted from Clerk
   */
  static async handleUserDeletion(clerkUserId: string): Promise<boolean> {
    try {
      await connectToDatabase();
      
      // Delete user from User collection
      const userResult = await User.deleteOne({ clerkUserId });
      
      // Delete user from Socialize collection
      const socializeResult = await Socialize.deleteOne({ clerkUserId });
      
      if (userResult.deletedCount > 0) {
        console.log(`Deleted user account for Clerk ID: ${clerkUserId}`);
        
        if (socializeResult.deletedCount > 0) {
          console.log(`Deleted Socialize profile for Clerk ID: ${clerkUserId}`);
        } else {
          console.log(`No Socialize profile found to delete for Clerk ID: ${clerkUserId}`);
        }
        
        return true;
      }
      
      return false;
    } catch (error) {
      console.error("Error deleting user:", error);
      return false;
    }
  }
}