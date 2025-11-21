import { NextRequest, NextResponse } from 'next/server';
import { chatService } from '@/lib/editron/services/chat-service';
import { auth } from '@clerk/nextjs/server';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  try {
    const { sessionId } = await params;
    const { name } = await request.json();
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'Valid name is required' },
        { status: 400 }
      );
    }

    const updated = await chatService.renameSession(sessionId, userId, name.trim());

    if (!updated) {
      return NextResponse.json(
        { success: false, error: 'Session not found or unauthorized' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Session renamed successfully',
    });
  } catch (error: any) {
    console.error('Error renaming chat session:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to rename session' },
      { status: 500 }
    );
  }
}
