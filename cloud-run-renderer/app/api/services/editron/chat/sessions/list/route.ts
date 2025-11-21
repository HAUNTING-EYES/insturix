import { NextRequest, NextResponse } from 'next/server';
import { chatService } from '@/lib/editron/services/chat-service';
import { auth } from '@clerk/nextjs/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    if (!projectId) {
      return NextResponse.json(
        { success: false, error: 'Project ID is required' },
        { status: 400 }
      );
    }

    const sessions = await chatService.listProjectSessions(projectId, userId);

    return NextResponse.json({
      success: true,
      sessions,
    });
  } catch (error: any) {
    console.error('Error listing chat sessions:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to list sessions' },
      { status: 500 }
    );
  }
}
