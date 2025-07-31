import { google } from 'googleapis';
import { logger } from './logger';

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const MAX_DURATION_SECONDS = 55 * 60; // 55 minutes

const youtube = google.youtube({
  version: 'v3',
  auth: YOUTUBE_API_KEY,
});

// Function to parse ISO 8601 duration format (e.g., PT1H2M3S)
function parseISO8601Duration(duration: string): number {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;

  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);

  return hours * 3600 + minutes * 60 + seconds;
}

// Function to extract YouTube Video ID from various URL formats
function extractYouTubeVideoId(url: string): string | null {
  const regexes = [
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/, // Standard URL
    /(?:https?:\/\/)?(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]{11})/,             // Shortened URL
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,    // Embed URL
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,        // V URL
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,   // Shorts URL
  ];

  for (const regex of regexes) {
    const match = url.match(regex);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
}

export async function validateYouTubeVideo(url: string): Promise<{ valid: boolean; error?: string; duration?: number }> {
  if (!YOUTUBE_API_KEY) {
    logger.error('YouTube API Key (YOUTUBE_API_KEY) is not configured.');
    // Allow processing but log error, as API key might not be needed for all environments
    // Or throw new Error('YOUTUBE_API_ERROR: API Key not configured');
    return { valid: true }; // Proceed without validation if key is missing
  }

  const videoId = extractYouTubeVideoId(url);
  if (!videoId) {
    return { valid: false, error: 'INVALID_YOUTUBE_URL' };
  }

  try {
    const response = await youtube.videos.list({
      part: ['status', 'contentDetails'],
      id: [videoId],
    });

    if (!response.data.items || response.data.items.length === 0) {
      logger.warn('YouTube video not found', { data: { videoId } });
      return { valid: false, error: 'INVALID_YOUTUBE_URL' };
    }

    const video = response.data.items[0];
    const status = video.status;
    const contentDetails = video.contentDetails;

    // Check privacy status
    if (status?.privacyStatus !== 'public') {
      logger.warn('YouTube video is not public', { data: { videoId, privacyStatus: status?.privacyStatus } });
      return { valid: false, error: 'YOUTUBE_VIDEO_PRIVATE' };
    }

    // Check if embeddable (optional but good practice)
    // if (!status?.embeddable) {
    //   logger.warn('YouTube video is not embeddable', { data: { videoId } });
    //   return { valid: false, error: 'YOUTUBE_VIDEO_NOT_EMBEDDABLE' };
    // }

    // Check duration
    const durationString = contentDetails?.duration;
    if (!durationString) {
        logger.warn('Could not retrieve YouTube video duration', { data: { videoId } });
        return { valid: false, error: 'YOUTUBE_API_ERROR' }; // Indicate an issue fetching details
    }

    const durationSeconds = parseISO8601Duration(durationString);
    if (durationSeconds > MAX_DURATION_SECONDS) {
      logger.warn('YouTube video duration exceeds limit', { data: { videoId, durationSeconds, limit: MAX_DURATION_SECONDS } });
      return { valid: false, error: 'YOUTUBE_VIDEO_TOO_LONG' };
    }

    return { valid: true, duration: durationSeconds };

  } catch (error: unknown) {
    logger.error('Error validating YouTube video', {
      data: {
        videoId,
        // Safely access message if it's an Error, otherwise stringify
        error: error instanceof Error ? error.message : String(error),
        // Safely access nested property, assuming error might have response.data
        response: (error as { response?: { data?: unknown } })?.response?.data
      }
    });
    // Return a generic API error to the client
    return { valid: false, error: 'YOUTUBE_API_ERROR' };
  }
}