import { NextRequest, NextResponse } from 'next/server';
import { getCollections } from '../utils/mongodb';
import { ServiceError } from '../types';

// Validate webhook secret to ensure request is from our backend
function validateWebhookSecret(secret: string | null): void {
  if (!process.env.ALYZITRON_WEBHOOK_SECRET) {
    throw new Error('ALYZITRON_WEBHOOK_SECRET not configured');
  }

  if (secret !== process.env.ALYZITRON_WEBHOOK_SECRET) {
    throw {
      code: 'INVALID_WEBHOOK_SECRET',
      message: 'Invalid webhook secret',
    } as ServiceError;
  }
}

export async function POST(req: NextRequest) {
  try {
    // Validate webhook secret from headers
    const webhookSecret = req.headers.get('x-webhook-secret');
    validateWebhookSecret(webhookSecret);

    const body = await req.json();
    const { taskId, status, progress, results, error } = body;

    if (!taskId || !status) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const { analyses } = await getCollections();

    // Find the analysis record
    const analysis = await analyses.findOne({ taskId });
    if (!analysis) {
      return NextResponse.json(
        { error: 'Analysis not found' },
        { status: 404 }
      );
    }

    // Update analysis based on status
    const now = new Date();
    const updateData: Record<string, any> = {
      status,
      updatedAt: now,
    };

    switch (status) {
      case 'queued':
        updateData.queueStartTime = now;
        break;

      case 'processing':
        updateData.processingStartTime = now;
        if (progress?.estimatedTime) {
          updateData.estimatedTime = progress.estimatedTime;
        }
        break;

      case 'completed':
        updateData.completionTime = now;
        updateData.results = results;
        break;

      case 'failed':
        updateData.completionTime = now;
        updateData.error = error || {
          code: 'PROCESSING_FAILED',
          message: 'Analysis failed',
          action: 'Please try again or contact support if the issue persists',
        };
        break;
    }

    // Update the record
    await analyses.updateOne(
      { taskId },
      { $set: updateData }
    );

    // Return success
    return NextResponse.json({
      success: true,
      message: `Analysis ${status}`,
    });

  } catch (error) {
    console.error('Webhook processing failed:', error);
    
    const serviceError = error as ServiceError;
    return NextResponse.json(
      {
        error: {
          code: serviceError.code || 'WEBHOOK_ERROR',
          message: serviceError.message || 'Failed to process webhook',
        },
      },
      { status: 400 }
    );
  }
}

// Verify webhook endpoint is active
export async function GET() {
  return NextResponse.json({
    status: 'active',
    timestamp: new Date().toISOString(),
  });
}