import { NextRequest, NextResponse } from 'next/server';
import { getCollections } from '@/app/api/services/alyzitron/utils/mongodb';
import { AlyzitronAnalysis } from '@/app/api/services/alyzitron/types';
import { logger, withLogging } from '@/app/api/services/alyzitron/utils/logger';

type CallbackBody = {
  task_id: string;
  results: {
    success: boolean;
    status: 'started' | 'completed' | 'failed';
    message?: string;
    data?: any;
    error?: {
      code: string;
      message: string;
      action: string;
    };
  };
};

async function handleCallback(req: NextRequest) {
  try {
    const body = (await req.json()) as CallbackBody;
    const { task_id, results } = body;

    logger.info('Analysis callback received', {
      data: {
        taskId: task_id,
        status: results.status,
        success: results.success,
      }
    });

    if (!task_id || !results) {
      logger.warn('Invalid callback payload', {
        data: { taskId: task_id }
      });
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const { analyses } = await getCollections();

    // Find the analysis record
    const analysis = await analyses.findOne({ taskId: task_id });
    if (!analysis) {
      logger.warn('Analysis not found for callback', {
        data: { taskId: task_id }
      });
      return NextResponse.json(
        { error: 'Analysis not found' },
        { status: 404 }
      );
    }

    // Map status from Python server to our status
    const status = results.status === 'started' ? 'processing' :
                  results.status === 'completed' ? 'completed' :
                  'failed';

    // Prepare update data based on status
    const updateData: Partial<AlyzitronAnalysis> = {
      status,
      updatedAt: new Date(),
    };

    if (status === 'processing') {
      updateData.processingStartTime = new Date();
      logger.info('Analysis processing started', {
        userId: analysis.clerkUserId,
        data: {
          analysisId: analysis._id.toString(),
          taskId: task_id,
        }
      });
    } else if (status === 'completed') {
      updateData.completionTime = new Date();
      updateData.results = results.data;
      logger.info('Analysis completed successfully', {
        userId: analysis.clerkUserId,
        data: {
          analysisId: analysis._id.toString(),
          taskId: task_id,
          duration: updateData.completionTime.getTime() - analysis.processingStartTime.getTime(),
        }
      });
    } else if (status === 'failed') {
      updateData.completionTime = new Date();
      updateData.error = results.error;
      logger.error('Analysis failed', {
        userId: analysis.clerkUserId,
        data: {
          analysisId: analysis._id.toString(),
          taskId: task_id,
          error: results.error,
        }
      });
    }

    // Update the analysis record
    await analyses.updateOne(
      { taskId: task_id },
      { $set: updateData }
    );

    return NextResponse.json({ success: true });

  } catch (error) {
    logger.error('Callback processing error', {
      code: 'CALLBACK_ERROR',
      data: {
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const POST = withLogging(handleCallback);