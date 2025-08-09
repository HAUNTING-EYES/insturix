import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ThinkForgeRTDBManager } from "../../utils/rtdb";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { userId, taskId, taskType, sessionId, status } = body;

    // Validate required fields
    if (!userId || !taskId || !taskType) {
      return NextResponse.json(
        { error: 'Missing required fields: userId, taskId, taskType' },
        { status: 400 }
      );
    }

    // Verify user authorization
    if (userId !== session.userId) {
      return NextResponse.json(
        { error: 'Unauthorized: User ID mismatch' },
        { status: 403 }
      );
    }

    // Create task in RTDB
    try {
      await ThinkForgeRTDBManager.createTask(
        userId,
        taskId,
        taskType,
        sessionId
      );
    } catch (error) {
      console.error('Failed to create task in RTDB:', error);
      return NextResponse.json(
        { error: 'Failed to create task in RTDB' },
        { status: 500 }
      );
    }

    console.info('ThinkForge task created in RTDB', {
      data: {
        userId,
        taskId,
        taskType,
        sessionId,
        status: status || 'listed'
      }
    });

    return NextResponse.json({
      success: true,
      taskId,
      message: 'Task created successfully'
    });

  } catch (error) {
    console.error('Failed to create task', {
      data: {
        error: error instanceof Error ? error.message : String(error)
      }
    });

    return NextResponse.json(
      { error: 'Failed to create task' },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic'; 