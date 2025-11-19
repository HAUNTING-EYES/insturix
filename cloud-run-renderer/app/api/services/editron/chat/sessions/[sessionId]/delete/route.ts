import { NextRequest, NextResponse } from 'next/server';
import { chatService } from '@/lib/services/chat-service';
import { getUserId } from '@/components/editor/version-7.0.0/utils/user-id';

export async function DELETE(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  try {
    const { sessionId } = params;
    const userId = getUserId();

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
