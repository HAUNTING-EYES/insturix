import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { ObjectId } from 'mongodb';
import { logger } from '../utils/logger';
import { validateYouTubeVideo } from '../utils/youtube';
import {
  checkAlyzitronLimits,
  incrementAlyzitronUsage,
  createAlyzitronLimitResponse
} from '@/lib/middleware/services/alyzitron';

function getGcsUrl(gcsPath: string): string {
  // Ensure GCS_BUCKET_NAME is defined before using it
  const bucketName = process.env.ALYZITRON_GCS_BUCKET_NAME;
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
    
    if (!video_url) {
      return NextResponse.json(
        { error: 'Missing required field: video_url' },
        { status: 400 }
      );
    }

    // Determine if it's a GCS path or a potential YouTube URL
    const isGCS = video_url.startsWith('services/alyzitron/');
    const isMaybeYouTube = !isGCS && (video_url.includes('youtube.com') || video_url.includes('youtu.be'));
    let videoDuration = 0; // Default duration

    // Validate YouTube URL if applicable and get duration
    if (isMaybeYouTube) {
      logger.info('Potential YouTube URL detected, starting validation.', { data: { url: video_url } });
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
      logger.info('YouTube URL validation successful.', { data: { url: video_url, duration: videoDuration } });
    }

    // Check service limits using enhanced middleware
    const requestData = {
      video_url,
      additional_details,
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
      // For GCS files, extract filename from path
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
      
      const backendResponse = await fetch(`${monolithicUrl}/alyzitron/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.MONOLITHIC_BACKEND_SECRET}`,
        },
        body: JSON.stringify({
          userId: session.userId,
          videoUrl: finalVideoUrl,
          additionalDetails: additional_details,
          metadata: metadata,
        }),
      });

      if (!backendResponse.ok) {
        const errorText = await backendResponse.text();
        console.error('Error from monolithic backend:', errorText);
        return NextResponse.json({ success: false, error: 'Task processing failed' }, { status: 500 });
      }

      logger.info('Analysis task created and queued successfully', {
        data: {
          userId: session.userId
        }
      });

      return NextResponse.json({
        success: true,
        taskId: new ObjectId().toString(),
      });

    } catch (processingError) {
      logger.error('Analysis post-save processing failed', {
        data: {
          error: processingError instanceof Error ? processingError.message : String(processingError)
        }
      });

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