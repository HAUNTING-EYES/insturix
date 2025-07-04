import { toast } from '@/hooks/use-toast';

/**
 * Utility to handle API errors with appropriate user-friendly messages
 */
export function handleApiError(error: Error, context: string = 'Operation') {
  let title = `${context} Failed`;
  let description = 'An unexpected error occurred. Please try again.';

  // Check for specific error types
  if (error.message.includes('limit exceeded') || error.message.includes('LIMIT_EXCEEDED')) {
    title = 'Usage Limit Exceeded';
    
    if (error.message.includes('Total analyses limit exceeded') || error.message.includes('maxTotalAnalysis')) {
      description = 'You have reached your weekly analysis limit. Upgrade your plan for more analyses.';
    } else if (error.message.includes('Long video limit exceeded') || error.message.includes('maxOver20MinuteAnalysis')) {
      description = 'You have reached your weekly limit for videos over 20 minutes. Try a shorter video or upgrade your plan.';
    } else {
      description = 'You have reached a usage limit. Please check your dashboard for details or upgrade your plan.';
    }
  } else if (error.message.includes('UNAUTHORIZED') || error.message.includes('Unauthorized')) {
    title = 'Authentication Required';
    description = 'Please sign in to continue.';
  } else if (error.message.includes('Server is offline') || error.message.includes('Failed to create analysis')) {
    title = 'Service Unavailable';
    description = 'The service is temporarily unavailable. Please try again later.';
  } else if (error.message.includes('INVALID_YOUTUBE_URL')) {
    title = 'Invalid Video URL';
    description = 'The provided YouTube URL is invalid or not accessible.';
  } else if (error.message.includes('YOUTUBE_VIDEO_TOO_LONG')) {
    title = 'Video Too Long';
    description = 'The video duration exceeds the maximum allowed limit.';
  } else if (error.message.includes('YOUTUBE_VIDEO_PRIVATE')) {
    title = 'Video Not Accessible';
    description = 'The YouTube video is private or unlisted.';
  }

  toast({
    title,
    description,
    variant: 'destructive',
  });

  return { title, description };
}

/**
 * Extract limit information from error messages for display
 */
export function extractLimitInfo(errorMessage: string) {
  const usageMatch = errorMessage.match(/Used (\d+)\/(\d+)/);
  if (usageMatch) {
    return {
      type: 'usage',
      current: parseInt(usageMatch[1]),
      max: parseInt(usageMatch[2])
    };
  }

  return null;
}