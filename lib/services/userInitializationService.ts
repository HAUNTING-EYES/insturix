import connectToDatabase from "@/schemas/ConnectToDatabase";
import { User } from "@/schemas/user";
import Plan from "@/schemas/plans";
import { UserType } from "@/types/userTypes";
import { IServiceLimits } from "@/schemas/user";

export interface UserInitializationResult {
  user: any;
  isNewUser: boolean;
  error?: string;
}

export class UserInitializationService {
  /**
   * Ensures user exists in MongoDB, creates with default Free plan if not
   */
  static async ensureUserExists(
    clerkUserId: string,
    email: string
  ): Promise<UserInitializationResult> {
    try {
      await connectToDatabase();

      // Check if user already exists
      let user = await User.findOne({ clerkUserId });
      
      if (user) {
        return { user, isNewUser: false };
      }

      // User doesn't exist, create with default Free plan
      console.log(`Creating new user account for Clerk ID: ${clerkUserId}`);
      
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

      // Create new user with Free plan
      user = new User({
        clerkUserId,
        email: email.toLowerCase().trim(),
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
      });

      await user.save();
      
      console.log(`Successfully created user account for: ${email}`);
      
      return { user, isNewUser: true };
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
    });
    
    if (!freePlan) {
      throw new Error("Free plan not found in plans collection. Database setup is incomplete.");
    }
    
    if (!freePlan.serviceLimits) {
      throw new Error("Free plan has no serviceLimits defined. Database setup is incomplete.");
    }
    
    // Convert Mongoose document to plain object to avoid internal properties
    const plainServiceLimits = freePlan.serviceLimits.toObject ? freePlan.serviceLimits.toObject() : freePlan.serviceLimits;
    
    // Convert plan serviceLimits to user serviceLimits structure
    const convertedLimits = this.convertPlanLimitsToUserLimits(plainServiceLimits);
    
    // Check if conversion resulted in valid limits
    const hasValidLimits = Object.values(convertedLimits).some(
      limits => Array.isArray(limits) && limits.length > 0
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
  static convertPlanLimitsToUserLimits(planServiceLimits: any): IServiceLimits {
    const now = new Date();
    const userServiceLimits: IServiceLimits = {
      alyzitron: [],
      editron: [],
      shield: [],
      socialize: [],
      thinkforge: [],
      musitron: [],
    };

    // Validate input - no fallbacks
    if (!planServiceLimits || typeof planServiceLimits !== 'object') {
      throw new Error('planServiceLimits is null or invalid. Database setup is incomplete.');
    }

    // Convert each service's limits
    Object.keys(planServiceLimits).forEach(serviceName => {
      if (userServiceLimits[serviceName as keyof IServiceLimits] && Array.isArray(planServiceLimits[serviceName])) {
        planServiceLimits[serviceName].forEach((planLimit: any) => {
          if (!planLimit || !planLimit.limitType || planLimit.maxUsage === undefined) {
            throw new Error(`Invalid plan limit found for service ${serviceName}. Database setup is incomplete.`);
          }
          
          userServiceLimits[serviceName as keyof IServiceLimits].push({
            limitType: planLimit.limitType,
            maxUsage: planLimit.maxUsage,
            currentUsage: 0, // Always start with 0 usage
            resetPeriod: planLimit.resetPeriod || "weekly",
            // Don't set lastReset initially - it gets set when usage goes from 0 to 1
          });
        });
      }
    });

    return userServiceLimits;
  }

  /**
   * Sync user data from Clerk (email updates, etc.)
   */
  static async syncUserFromClerk(
    clerkUserId: string,
    clerkUserData: {
      email?: string;
      emailAddresses?: Array<{ emailAddress: string; id: string }>;
    }
  ): Promise<boolean> {
    try {
      await connectToDatabase();
      
      const user = await User.findOne({ clerkUserId });
      if (!user) {
        return false;
      }

      let hasChanges = false;
      
      // Update email if it has changed
      const newEmail = clerkUserData.email || 
        clerkUserData.emailAddresses?.[0]?.emailAddress;
      
      if (newEmail && newEmail.toLowerCase().trim() !== user.email) {
        user.email = newEmail.toLowerCase().trim();
        hasChanges = true;
      }

      if (hasChanges) {
        await user.save();
        console.log(`Updated user data for: ${clerkUserId}`);
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
      
      const result = await User.deleteOne({ clerkUserId });
      
      if (result.deletedCount > 0) {
        console.log(`Deleted user account for Clerk ID: ${clerkUserId}`);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error("Error deleting user:", error);
      return false;
    }
  }
}