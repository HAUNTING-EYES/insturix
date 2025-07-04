import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { ObjectId } from 'mongodb';
import { AlyzitronAnalysis } from '../types';
import { logger } from '../utils/logger';
import { getCollections } from '../utils/mongodb';
import { validateYouTubeVideo } from '../utils/youtube';
import { RTDBManager } from '../utils/rtdb';
import { PubSubManager } from '../utils/pubsub';
import { getServiceConfig } from '@/lib/config/services';
import {
  checkAlyzitronLimits,
  incrementAlyzitronUsage,
  createAlyzitronLimitResponse
} from '@/lib/middleware/services/alyzitron';

const serviceConfig = getServiceConfig('alyzitron');

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

    // Create task with new architecture (MongoDB + RTDB + Pub/Sub)
    try {
      const taskId = new ObjectId().toString();
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

      // Create analysis record in MongoDB
      const analysisRecord: AlyzitronAnalysis = {
        _id: new ObjectId().toString(),
        clerkUserId: session.userId,
        videoUrl: finalVideoUrl,
        status: 'listed',
        unread: true,
        taskId: taskId,
        estimatedTime: 120, // Default estimate, will be updated by worker
        results: null,
        metadata: {
          originalFilename: title,
          videoSize: 0,
          videoDuration: videoDuration,
          mimeType: 'video/mp4',
          isPublic: false // Default to private
        },
        additional_details,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Save to MongoDB
      const { analyses } = await getCollections();
      await analyses.insertOne(analysisRecord);

      // Create task in RTDB
      await RTDBManager.createTask(
        session.userId,
        taskId,
        title,
        undefined
      );

      const message = {
        taskId,
        userId: session.userId,
        videoUrl: finalVideoUrl,
        additionalDetails: additional_details,
      };

      if (process.env.ALYZITRON_LOCAL_WORKER) {
        const data = Buffer.from(JSON.stringify(message)).toString('base64');
        fetch(process.env.ALYZITRON_LOCAL_WORKER, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: {
              data: data,
              attributes: {}
            },
            subscription: 'projects/test/subscriptions/test-sub' // Placeholder for local testing
          }),
        });
      } else {
        // Publish to Pub/Sub for worker processing
        await PubSubManager.publishTask(message);
      }

      // Increment usage count after successful creation
      const usageResult = await incrementAlyzitronUsage(requestData, 1);
      
      if (!usageResult.success) {
        logger.error('Failed to increment service usage', {
          data: {
            userId: session.userId,
            limitType: limitCheck.limitInfo?.limitType,
            analysisId: analysisRecord._id,
            error: usageResult.error
          }
        });
        // Note: We don't fail the request here since analysis was already created
        // This is logged for monitoring purposes
      }

      logger.info('Service usage incremented', {
        data: {
          userId: session.userId,
          analysisId: analysisRecord._id,
          usageIncrementSuccess: usageResult.success
        }
      });

      // Task starts as 'listed', moves to 'queued' SOMETIMES, then 'processing', finally 'completed'

      logger.info('Analysis task created successfully', {
        data: {
          analysisId: analysisRecord._id,
          taskId,
          userId: session.userId
        }
      });

      return NextResponse.json({
        success: true,
        analysis: analysisRecord,
      });

    } catch (error) {
      logger.error('Analysis creation failed', {
        data: {
          error: error instanceof Error ? error.message : String(error)
        }
      });

      return NextResponse.json(
        { 
          success: false,
          error: {
            type: error instanceof Error && error.message.startsWith('YOUTUBE_') ? error.message : 'ANALYSIS_CREATION_ERROR',
            message: error instanceof Error ? error.message : 'Failed to create analysis',
            // action: 'Please try again later' // Action might not be needed if code is specific
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