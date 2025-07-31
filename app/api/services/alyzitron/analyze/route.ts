import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { logger } from '../utils/logger';
import { validateYouTubeVideo } from '../utils/youtube';
import { GCSManager } from '../utils/gcs';
import {
  checkAlyzitronLimits,
  incrementAlyzitronUsage,
  createAlyzitronLimitResponse
} from '@/lib/middleware/services/alyzitron';

interface AlyzitronGenerateRequest {
  clerkUserId: string;
  videoUrl: string;
  additionalDetails?: Record<string, any> | null;
  metadata: MetadataModel;
}

interface MetadataModel {
  originalFilename: string;
  videoSize: number;
  videoDuration: number;
  mimeType: string;
  isPublic: boolean;
}

function getGcsUrl(gcsPath: string): string {
  // Ensure GCS_BUCKET_NAME is defined before using it
  const bucketName = process.env.GCS_BUCKET_NAME;
  if (!bucketName) {
    logger.error("GCS_BUCKET_NAME environment variable is not set.");
    throw new Error("Server configuration error: GCS bucket name missing.");
  }
  return `gs://${bucketName}/${gcsPath}`;
}


export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { video_url, additional_details } = await request.json();
    
    // Ensure additional_details is always an object, not a string
    const parsedAdditionalDetails = typeof additional_details === 'string'
      ? JSON.parse(additional_details || '{}')
      : (additional_details || {});
    
    if (!video_url) {
      return NextResponse.json(
        { error: 'Missing required field: video_url' },
        { status: 400 }
      );
    }

    // Determine if it's a GCS path or a potential YouTube URL
    // GCS paths typically start with 'user_' followed by user ID
    const isGCS = video_url.startsWith('user_') && video_url.includes('/alyzitron-uploads/');
    const isMaybeYouTube = !isGCS && (video_url.includes('youtube.com') || video_url.includes('youtu.be'));
    let videoDuration = 0; // Default duration

    // Validate YouTube URL if applicable and get duration
    if (isMaybeYouTube) {
      const validationResult = await validateYouTubeVideo(video_url);
      if (!validationResult.valid) {
        logger.warn('YouTube URL validation failed.', { data: { url: video_url, error: validationResult.error } });
        return NextResponse.json(
          {
            success: false,
            error: {
              type: validationResult.error || 'YOUTUBE_VALIDATION_FAILED',
              message: `YouTube video validation failed: ${validationResult.error}`,
            }
          },
          { status: 400 }
        );
      }
      videoDuration = validationResult.duration || 0;
    }

    // Check service limits using enhanced middleware
    const requestData = {
      video_url,
      additional_details: parsedAdditionalDetails,
      videoDuration
    };
    
    const limitCheck = await checkAlyzitronLimits(requestData);
    
    if (!limitCheck.success || !limitCheck.hasAccess) {
      logger.warn('Service limit check failed', {
        data: {
          userId: session.userId,
          limitInfo: limitCheck.limitInfo,
          error: limitCheck.error
        }
      });

      return createAlyzitronLimitResponse(limitCheck);
    }

    // Increment usage count BEFORE creating task to ensure proper limit enforcement
    const usageResult = await incrementAlyzitronUsage(requestData, 1);
    
    if (!usageResult.success) {
      logger.error('Failed to increment Alyzitron usage', {
        data: {
          userId: session.userId,
          error: usageResult.error
        }
      });
      
      // If usage increment fails, don't start the task
      return NextResponse.json(
        {
          error: 'Unable to process request. Please try again later.',
          success: false
        },
        { status: 403 }
      );
    }

    // If it's a GCS file, format the videoUrl as gs://${bucketName}/${gcsPath}
    const finalVideoUrl = isGCS ? getGcsUrl(video_url) : video_url;

    // Generate appropriate title based on video source
    let title: string;
    if (isGCS) {
      // For GCS files, extract filename from path (works with both full URL and path only)
      const pathParts = video_url.split('/');
      const filename = pathParts[pathParts.length - 1];
      title = decodeURIComponent(filename);
    } else if (isMaybeYouTube) {
      // For YouTube URLs, try to get title from oEmbed API
      try {
        const oEmbedResponse = await fetch(
          `https://www.youtube.com/oembed?url=${encodeURIComponent(video_url)}&format=json`
        );
        if (oEmbedResponse.ok) {
          const oEmbedData = await oEmbedResponse.json();
          title = oEmbedData.title || video_url;
        } else {
          title = video_url;
        }
      } catch {
        title = video_url;
      }
    } else {
      title = video_url;
    }

    // Prepare metadata for monolithic backend
    const metadata = {
      originalFilename: title,
      videoSize: 0,
      videoDuration: videoDuration,
      mimeType: 'video/mp4',
      isPublic: false // Default to private
    };

    try {
      // Call monolithic backend for task processing
      const monolithicUrl = process.env.MONOLITHIC_BACKEND_URL;
      if (!monolithicUrl) {
        console.error('MONOLITHIC_BACKEND_URL environment variable is not set.');
        return NextResponse.json({ success: false, error: 'Server configuration error' }, { status: 500 });
      }

      // Create properly typed request body using the interface
      const generateRequest: AlyzitronGenerateRequest = {
        clerkUserId: session.userId,
        videoUrl: finalVideoUrl,
        additionalDetails: parsedAdditionalDetails,
        metadata: metadata,
      };
      
      const backendResponse = await fetch(`${monolithicUrl}/alyzitron/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.MONOLITHIC_BACKEND_SECRET}`,
        },
        body: JSON.stringify(generateRequest),
      });

      const backendData = await backendResponse.json();
      
      if (!backendResponse.ok || !backendData.success) {
        const errorType = backendData.error?.type || 'UNKNOWN_ERROR';
        const errorMessage = backendData.error?.message || 'Task processing failed';
        console.error('Error from monolithic backend:', backendData);
        return NextResponse.json({
          success: false,
          error: {
            type: errorType,
            message: errorMessage
          }
        }, { status: 500 });
      }

      logger.info('Analysis task created and queued successfully', {
        data: {
          userId: session.userId,
          taskId: backendData.taskId
        }
      });

      return NextResponse.json({
        success: true,
        taskId: backendData.taskId,
      });

    } catch (processingError) {
      logger.error('Analysis post-save processing failed', {
        data: {
          error: processingError instanceof Error ? processingError.message : String(processingError)
        }
      });

      // Check if this is a GCS video URL and clean it up if the analysis failed
      if (isGCS && finalVideoUrl) {
        try {
          // Extract GCS path from the URL
          const gcsPath = finalVideoUrl.replace(`gs://${process.env.GCS_BUCKET_NAME}/`, '');
          
          // Delete the GCS file locally
          await GCSManager.deleteFile(gcsPath);
          
          logger.info('Successfully cleaned up GCS file after analysis failure', {
            data: {
              userId: session.userId,
              gcsPath,
              videoUrl: finalVideoUrl,
            }
          });
        } catch (deleteError) {
          logger.error('Failed to clean up GCS file after analysis failure', {
            data: {
              error: deleteError instanceof Error ? deleteError.message : String(deleteError),
              videoUrl: finalVideoUrl,
            }
          });
        }
      }

      // Refund usage if task processing failed
      const refundResult = await incrementAlyzitronUsage(requestData, -1);
      if (!refundResult.success) {
        logger.error('Failed to refund Alyzitron usage', {
          data: {
            userId: session.userId,
            error: refundResult.error
          }
        });
      }

      return NextResponse.json(
        {
          success: false,
          error: {
            type: 'ANALYSIS_PROCESSING_ERROR',
            message: 'Failed to queue analysis for processing',
          }
        },
        { status: 500 }
      );
    }
  } catch (error) {
    logger.error('Request processing failed', {
      data: {
        error: error instanceof Error ? error.message : String(error)
      }
    });

    return NextResponse.json(
      { 
        success: false,
        error: {
          type: 'REQUEST_PROCESSING_ERROR',
          message: 'Failed to process request',
          action: 'Please try again later'
        }
      },
      { status: 500 }
    );
  }
}