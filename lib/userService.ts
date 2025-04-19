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
      features: planDetails.features || ["Ultra access", "100GB storage", "Dedicated support", "All features", "Custom branding", "API access"],
    };
    
    // Update user type
    user.userType = UserType.Premium;
    
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
    
    // Only proceed if there's an active plan
    if (!user.currentPlan || user.currentPlan.status !== "active") {
      throw new Error("No active plan to cancel");
    }
    
    // Mark current plan as canceled
    user.currentPlan.status = "canceled";
    user.currentPlan.endDate = new Date();
    
    // Set user type back to Free
    user.userType = UserType.Free;
    
    // Create new free plan
    const oneMonthLater = new Date();
    oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);
    
    user.currentPlan = {
      name: UserType.Free,
      startDate: new Date(),
      endDate: oneMonthLater,
      price: 0,
      status: "active",
      features: ["Basic access", "Limited storage", "Community support"],
    };
    
    // Mark nested objects as modified
    user.markModified("currentPlan");
    
    await user.save();
    return user;
  } catch (error) {
    console.error("Error canceling plan:", error);
    throw error;
  }
}