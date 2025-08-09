import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ThinkForgeRTDBManager } from "../../utils/rtdb";

export async function GET(
  request: Request,
  { params }: { params: { taskId: string } }
) {
  try {
    const session = await auth();
    if (!session?.userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { taskId } = params;

    if (!taskId) {
      return NextResponse.json(
        { error: 'Missing task ID' },
        { status: 400 }
      );
    }

    // Get task from RTDB
    const task = await ThinkForgeRTDBManager.getTask(session.userId, taskId);

    if (!task) {
      return NextResponse.json(
        { error: 'Task not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      task
    });

  } catch (error) {
    console.error('Failed to get task status', {
      data: {
        error: error instanceof Error ? error.message : String(error)
      }
    });

    return NextResponse.json(
      { error: 'Failed to get task status' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { taskId: string } }
) {
  try {
    const session = await auth();
    if (!session?.userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { taskId } = params;

    if (!taskId) {
      return NextResponse.json(
        { error: 'Missing task ID' },
        { status: 400 }
      );
    }

    // Get task to check if it can be cancelled
    const task = await ThinkForgeRTDBManager.getTask(session.userId, taskId);

    if (!task) {
      return NextResponse.json(
        { error: 'Task not found' },
        { status: 404 }
      );
    }

    if (task.status !== 'queued') {
      return NextResponse.json(
        {
          error: 'Cannot cancel task',
          message: 'Task is already being processed or completed',
        },
        { status: 400 }
      );
    }

    // Update task status to failed with cancellation reason
    await ThinkForgeRTDBManager.updateTaskStatus(
      session.userId,
      taskId,
      'failed',
      undefined,
      {
        code: 'CANCELLED',
        message: 'Task cancelled by user'
      }
    );

    console.info('ThinkForge task cancelled successfully', {
      data: {
        taskId,
        userId: session.userId
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Task cancelled successfully',
    });

  } catch (error) {
    console.error('Failed to cancel task', {
      data: {
        error: error instanceof Error ? error.message : String(error)
      }
    });

    return NextResponse.json(
      { error: 'Failed to cancel task' },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic'; 