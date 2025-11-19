import { NextRequest, NextResponse } from 'next/server';
import { chatService } from '@/lib/services/chat-service';
import { getUserId } from '@/components/editor/version-7.0.0/utils/user-id';

export async function GET(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  try {
    const { sessionId } = params;
    const userId = getUserId();

    const messages = await chatService.getSessionHistory(sessionId);

    return NextResponse.json({
      success: true,
      messages,
    });
  } catch (error: any) {
    console.error('Error fetching session history:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch history' },
      { status: 500 }
    );
  }
}
