import { NextResponse } from "next/server";
import { ThinkForgeRTDBManager } from "../utils/rtdb";

export async function POST(request: Request) {
  try {
    const data = await request.json();
    
    console.info('Received ThinkForge webhook', {
      data: {
        taskId: data.task_id,
        status: data.status,
        type: data.type
      }
    });

    if (!data.task_id) {
      console.warn('Invalid webhook data', {
        data: { error: 'Missing task ID' }
      });
      return NextResponse.json(
        { error: 'Missing task ID' },
        { status: 400 }
      );
    }

    // Handle different callback types with improved error handling
    try {
      if (data.status === 'processing') {
        console.info('ThinkForge task started processing', {
          data: {
            taskId: data.task_id,
            userId: data.user_id,
            type: data.type
          }
        });

        await ThinkForgeRTDBManager.updateTaskStatus(
          data.user_id,
          data.task_id,
          'processing'
        );

      } else if (data.status === 'completed') {
        console.info('ThinkForge task completed', {
          data: {
            taskId: data.task_id,
            userId: data.user_id,
            type: data.type,
            hasResult: !!data.result
          }
        });

        await ThinkForgeRTDBManager.updateTaskStatus(
          data.user_id,
          data.task_id,
          'completed',
          data.result
        );

      } else if (data.status === 'failed') {
        console.error('ThinkForge task failed', {
          data: {
            taskId: data.task_id,
            userId: data.user_id,
            type: data.type,
            error: data.error
          }
        });

        await ThinkForgeRTDBManager.updateTaskStatus(
          data.user_id,
          data.task_id,
          'failed',
          undefined,
          {
            code: data.error?.code || 'UNKNOWN_ERROR',
            message: data.error?.message || 'Task failed'
          }
        );
      }
    } catch (rtdbError) {
      // Log RTDB errors but don't fail the webhook response
      // This prevents infinite retries due to Firebase permission issues
      console.warn('Failed to update RTDB but processing webhook anyway', {
        data: {
          taskId: data.task_id,
          userId: data.user_id,
          error: rtdbError instanceof Error ? rtdbError.message : String(rtdbError)
        }
      });
    }

    return NextResponse.json({ 
      success: true,
      message: 'Webhook processed successfully'
    });

  } catch (error) {
    console.error('Failed to process ThinkForge webhook', {
      data: {
        error: error instanceof Error ? error.message : String(error)
      }
    });

    // Return 200 instead of 500 to prevent retries for webhook processing errors
    // The actual task status is already handled by the backend
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to process webhook',
        message: 'Webhook received but processing failed'
      },
      { status: 200 }
    );
  }
} 