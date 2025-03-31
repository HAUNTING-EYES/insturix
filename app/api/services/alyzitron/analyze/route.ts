import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from 'mongodb';
import { AlyzitronAnalysis } from '../types';
import { logger } from '../utils/logger';
import { getCollections } from '../utils/mongodb';

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { type, video_url, title } = await request.json();
    
    if (!type || !video_url) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Prepare analysis record
    const analysisRecord: AlyzitronAnalysis = {
      _id: new ObjectId(),
      clerkUserId: session.userId,
      videoUrl: video_url,
      gcsPath: video_url.startsWith('uploads/') ? video_url : '',
      type,
      status: 'queued',
      taskId: new ObjectId().toString(),
      estimatedTime: 120,  // 2 minutes default
      queueStartTime: new Date(),
      processingStartTime: new Date(),
      completionTime: new Date(),
      hasMetrics: false,
      hasInsights: false,
      results: null,
      metadata: {
        originalFilename: title || 'Untitled',
        fileSize: 0,
        mimeType: 'video/mp4'
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Save to database
    const { analyses } = await getCollections();
    await analyses.insertOne(analysisRecord);

    return NextResponse.json({
      analysisId: analysisRecord._id.toString(),
      taskId: analysisRecord.taskId,
      estimatedTime: analysisRecord.estimatedTime
    });

  } catch (error) {
    logger.error('Analysis creation failed', {
      data: {
        error: error instanceof Error ? error.message : String(error)
      }
    });

    return NextResponse.json(
      { error: 'Failed to create analysis' },
      { status: 500 }
    );
  }
}