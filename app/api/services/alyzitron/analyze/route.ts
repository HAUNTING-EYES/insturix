import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { ObjectId } from 'mongodb';
import { AlyzitronAnalysis } from '../types';
import { logger } from '../utils/logger';
import { getCollections } from '../utils/mongodb';
import { validateYouTubeVideo } from '../utils/youtube'; // Import the validator

const PYTHON_SERVER_URL = process.env.PYTHON_SERVER_URL || 'http://localhost:8000';

function getGcsUrl(gcsPath: string): string {
  // Ensure GCS_BUCKET_NAME is defined before using it
  const bucketName = process.env.GCS_BUCKET_NAME;
  if (!bucketName) {
    logger.error("GCS_BUCKET_NAME environment variable is not set.");
    throw new Error("Server configuration error: GCS bucket name missing.");
  }
  return `gs://${bucketName}/${gcsPath}`;
}

// Function to format video type according to API spec
function formatVideoType(type: string): string {
  return type.toUpperCase().replace(/\s+/g, '_');
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

    const { type, video_url, title, description, niche, target_audience, additional_details } = await request.json();
    
    if (!type || !video_url) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Determine if it's a GCS path or a potential YouTube URL
    const isGCS = video_url.startsWith('services/alyzitron/');
    const isMaybeYouTube = !isGCS && (video_url.includes('youtube.com') || video_url.includes('youtu.be'));
    let videoDuration = 0; // Default duration

    // Validate YouTube URL if applicable
    if (isMaybeYouTube) {
      logger.info('Potential YouTube URL detected, starting validation.', { data: { url: video_url } });
      const validationResult = await validateYouTubeVideo(video_url);
      if (!validationResult.valid) {
        logger.warn('YouTube URL validation failed.', { data: { url: video_url, error: validationResult.error } });
        return NextResponse.json(
          {
            success: false,
            error: {
              code: validationResult.error || 'YOUTUBE_VALIDATION_FAILED',
              message: `YouTube video validation failed: ${validationResult.error}`,
            }
          },
          { status: 400 } // Bad Request for invalid input
        );
      }
      videoDuration = validationResult.duration || 0; // Store duration if valid
      logger.info('YouTube URL validation successful.', { data: { url: video_url, duration: videoDuration } });
    }

    // Send to Python server
    try {
      const videoUrlForPython = isGCS ? getGcsUrl(video_url) : video_url;

      // Format request according to API documentation
      const pythonRequestData = {
        type: formatVideoType(type),
        video_url: videoUrlForPython,
        user_id: session.userId,
        title: title || undefined,
        description: description || undefined,
        niche: niche || undefined,
        target_audience: target_audience || undefined,
        additional_details: additional_details || undefined
      };

      logger.info('Sending request to Python server', {
        data: { 
          request: pythonRequestData,
          url: `${PYTHON_SERVER_URL}/api/v1/analyze`
        }
      });

      const pythonResponse = await fetch(`${PYTHON_SERVER_URL}/api/v1/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(pythonRequestData),
      });

      if (!pythonResponse.ok) {
        const errorData = await pythonResponse.json();
        logger.error('Python server rejected request', {
          data: {
            status: pythonResponse.status,
            response: errorData,
            request: pythonRequestData
          }
        });
        throw new Error(errorData.error?.message || 'Python server failed');
      }

      const responseData = await pythonResponse.json();

      // Create analysis record with Python server's task ID
      const analysisRecord: AlyzitronAnalysis = {
        _id: new ObjectId(),
        clerkUserId: session.userId,
        videoUrl: video_url,
        gcsPath: video_url.startsWith('services/alyzitron/') ? video_url : '',
        type: formatVideoType(type) as AlyzitronAnalysis['type'], // Use type from AlyzitronAnalysis
        status: 'queued',
        unread: true,
        taskId: responseData.task_id,
        estimatedTime: responseData.estimated_time,
        results: null,
        metadata: {
          originalFilename: title || type + ' Analysis',
          videoSize: 0, // Note: Size is not available for URL submissions here
          videoDuration: videoDuration, // Use validated duration for YouTube, 0 otherwise
          mimeType: 'video/mp4'
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Save to database
      const { analyses } = await getCollections();
      await analyses.insertOne(analysisRecord);

      logger.info('Analysis request created', {
        data: { 
          analysisId: analysisRecord._id.toString(),
          taskId: responseData.task_id,
          estimatedTime: responseData.estimated_time,
          type: analysisRecord.type
        }
      });

      return NextResponse.json({
        success: true,
        analysisId: analysisRecord._id.toString(),
        taskId: responseData.task_id,
        estimatedTime: responseData.estimated_time
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
            code: error instanceof Error && error.message.startsWith('YOUTUBE_') ? error.message : 'ANALYSIS_CREATION_ERROR',
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
          code: 'REQUEST_PROCESSING_ERROR',
          message: 'Failed to process request',
          action: 'Please try again later'
        }
      },
      { status: 500 }
    );
  }
}