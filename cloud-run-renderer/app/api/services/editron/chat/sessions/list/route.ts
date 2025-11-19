import { NextRequest, NextResponse } from 'next/server';
import { chatService } from '@/lib/services/chat-service';
import { getUserId } from '@/components/editor/version-7.0.0/utils/user-id';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const userId = getUserId();

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
