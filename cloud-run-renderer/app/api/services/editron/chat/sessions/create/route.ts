import { NextRequest, NextResponse } from 'next/server';
import { chatService } from '@/lib/services/chat-service';
import { getUserId } from '@/components/editor/version-7.0.0/utils/user-id';

export async function POST(request: NextRequest) {
  try {
    const { projectId } = await request.json();
    const userId = getUserId();

    if (!projectId) {
      return NextResponse.json(
        { success: false, error: 'Project ID is required' },
        { status: 400 }
      );
    }

    const sessionId = await chatService.createSession(userId, projectId);

    return NextResponse.json({
      success: true,
      sessionId,
    });
  } catch (error: any) {
    console.error('Error creating chat session:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create session' },
      { status: 500 }
    );
  }
}
