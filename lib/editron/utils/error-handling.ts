/**
 * Error Handling Utility
 * 
 * Maps technical error messages to user-friendly messages to prevent
 * exposing internal details (like env var names) to the user.
 */

export function getUserFriendlyErrorMessage(error: unknown): string {
  // Get the raw error message
  const rawMessage = error instanceof Error ? error.message : String(error);
  
  // Check for specific error patterns
  
  // Remotion Cloud Run configuration errors
  if (rawMessage.includes('REMOTION_CLOUDRUN_URL') || rawMessage.includes('not defined')) {
    return "The video renderer is currently unavailable. Please try again later or contact support.";
  }

  // Network errors
  if (rawMessage.includes('Failed to fetch') || rawMessage.includes('Network request failed')) {
    return "Network error. Please check your internet connection and try again.";
  }

  // Authentication/Authorization errors
  if (rawMessage.includes('401') || rawMessage.includes('Unauthorized') || rawMessage.includes('unauthorized')) {
    return "You are not authorized to perform this action. Please try signing in again.";
  }

  if (rawMessage.includes('403') || rawMessage.includes('Forbidden')) {
    return "You do not have permission to access this resource.";
  }

  // Not Found errors
  if (rawMessage.includes('404') || rawMessage.includes('Not Found')) {
    return "The requested resource could not be found.";
  }

  // Server errors
  if (rawMessage.includes('500') || rawMessage.includes('Internal Server Error')) {
    return "A server error occurred. Please try again later.";
  }

  // Timeout errors
  if (rawMessage.includes('timeout') || rawMessage.includes('timed out')) {
    return "The operation timed out. Please try again.";
  }

  // Default fallback for unknown errors
  // We log the raw error for debugging but show a generic message to the user
  console.error('Unhandled error:', error);
  return "An unexpected error occurred. Please try again.";
}
