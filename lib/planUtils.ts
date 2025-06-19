import { UserType } from "@/types/userTypes";

// Utility to get display name for plan types
export function getPlanDisplayName(userType: UserType | string | undefined): string {
  if (!userType) return "Unknown Plan";
  
  switch (userType) {
    case UserType.Free:
    case "free": // Handle raw string value from DB if UserType enum isn't directly available
      return "Free";
    case UserType.Plus:
    case "plus":
      return "Plus";
    case UserType.Pro:
    case "pro":
      return "Pro";
    case UserType.Premium:
    case "premium":
      return "Premium";
    default:
      // Capitalize first letter if it's an unknown string
      return typeof userType === 'string' ? userType.charAt(0).toUpperCase() + userType.slice(1) : "Unknown Plan";
  }
}