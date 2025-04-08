import { NextResponse } from "next/server";
import { getCollections } from "../utils/mongodb";
import { logger, logCallback } from "../utils/logger";

export async function POST(request: Request) {
  try {
    const data = await request.json();
    
    // Log the incoming callback with full details
    logCallback(data);

    if (!data.task_id) {
      logger.warn('Invalid callback data', {
        data: { error: 'Missing task ID' }
      });
      return NextResponse.json(
        { error: 'Missing task ID' },
        { status: 400 }
      );
    }

    const { analyses } = await getCollections();

    // Use taskId from Python server to find the analysis
    const analysis = await analyses.findOne({ taskId: data.task_id });

    if (!analysis) {
      logger.warn('Analysis not found for callback', {
        data: { taskId: data.task_id }
      });
      return NextResponse.json(
        { error: 'Analysis not found' },
        { status: 404 }
      );
    }

    // Handle different callback types
    if (data.results.status === 'started') {
      logger.info('Analysis started processing', {
        data: {
          taskId: data.task_id,
          analysisId: analysis._id.toString(),
          type: analysis.type
        }
      });

      await analyses.updateOne(
        { taskId: data.task_id },
        {
          $set: {
            status: 'processing',
            processingStartTime: new Date().getTime(),
            updatedAt: new Date()
          }
        }
      );

    } else if (data.results.status === 'completed') {
      logger.info('Analysis completed', {
        data: {
          taskId: data.task_id,
          analysisId: analysis._id.toString(),
          type: analysis.type,
          hasMetrics: !!data.results.data?.engagement_metrics,
          hasInsights: !!data.results.data?.creator_feedback
        }
      });

      await analyses.updateOne(
        { taskId: data.task_id },
        {
          $set: {
            status: 'completed',
            completionTime: new Date().getTime(),
            results: data.results.data,
            hasMetrics: !!data.results.data?.engagement_metrics,
            hasInsights: !!data.results.data?.creator_feedback,
            updatedAt: new Date()
          }
        }
      );

    } else if (!data.results.success) {
      logger.error('Analysis failed', {
        data: {
          taskId: data.task_id,
          analysisId: analysis._id.toString(),
          type: analysis.type,
          error: data.results.error
        }
      });

      // Handle error case
      await analyses.updateOne(
        { taskId: data.task_id },
        {
          $set: {
            status: 'failed',
            error: {
              code: data.results.error?.code || 'UNKNOWN_ERROR',
              message: data.results.error?.message || 'Analysis failed',
              action: data.results.error?.action || 'Please try again'
            },
            updatedAt: new Date()
          }
        }
      );
    }

    return NextResponse.json({ 
      success: true,
      message: 'Callback processed successfully'
    });

  } catch (error) {
    logger.error('Failed to process analysis callback', {
      data: {
        error: error instanceof Error ? error.message : String(error)
      }
    });

    return NextResponse.json(
      { error: 'Failed to process callback' },
      { status: 500 }
    );
  }
}