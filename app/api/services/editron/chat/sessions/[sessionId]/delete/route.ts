import { NextRequest, NextResponse } from 'next/server';
import { chatService } from '@/lib/editron/services/chat-service';
import { auth } from '@clerk/nextjs/server';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const deleted = await chatService.deleteSession(sessionId, userId);

    if (!deleted) {
      return NextResponse.json(
        { success: false, error: 'Session not found or unauthorized' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Session deleted successfully',
    });
  } catch (error: any) {
    console.error('Error deleting chat session:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to delete session' },
      { status: 500 }
    );
  }
}
