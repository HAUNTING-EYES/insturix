import User from "@/schemas/user";
import { UserType } from "@/types/userTypes";

/**
 * Upgrades a user to a premium plan
 */
export async function upgradeUserToPremium(
  clerkUserId: string,
  planDetails: {
    price: number;
    endDate?: Date;
    features?: string[];
  }
) {
  try {
    const user = await User.findOne({ clerkUserId });
    
    if (!user) {
      throw new Error("User not found");
    }
    
    const now = new Date();
    const endDate = planDetails.endDate || new Date(now.setMonth(now.getMonth() + 1));
    
    // Update the current plan
    user.currentPlan = {
      name: UserType.Premium,
      startDate: new Date(),
      endDate,
      price: planDetails.price,
      status: "active",
      features: planDetails.features || ["Premium features", "Priority support", "Unlimited storage"],
    };
    
    // This is critical when updating a nested object
    user.markModified("currentPlan");
    
    await user.save();
    return user;
  } catch (error) {
    console.error("Error upgrading user:", error);
    throw error;
  }
}

/**
 * Cancels a user's current plan
 */
export async function cancelUserPlan(clerkUserId: string) {
  try {
    const user = await User.findOne({ clerkUserId });
    
    if (!user) {
      throw new Error("User not found");
    }
    
    // Update the current plan status to canceled
    user.currentPlan.status = "canceled";
    
    // Mark the nested object as modified
    user.markModified("currentPlan");
    
    await user.save();
    return user;
  } catch (error) {
    console.error("Error canceling user plan:", error);
    throw error;
  }
} 