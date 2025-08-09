import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { checkThinkForgeLimits } from '@/lib/middleware/services/thinkforge';

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.userId) {
      return NextResponse.json(
        { 
          success: false,
          hasAccess: false, 
          error: { message: 'Unauthorized' } 
        },
        { status: 401 }
      );
    }

    const { userId, sessionId, type } = await request.json();

    // Verify the user ID matches the authenticated user
    if (userId !== session.userId) {
      return NextResponse.json(
        { 
          success: false,
          hasAccess: false,
          error: { message: 'User ID mismatch' } 
        },
        { status: 403 }
      );
    }

    // Check limits using enhanced middleware (MongoDB only, no backend)
    const limitCheck = await checkThinkForgeLimits({
      userId,
      sessionId,
      type,
      taskType: type
    });

    return NextResponse.json(limitCheck);

  } catch (error) {
    console.error('Error in limits check API:', error);
    return NextResponse.json(
      { 
        success: false,
        hasAccess: false,
        error: { message: 'Internal server error' } 
      },
      { status: 500 }
    );
  }
} 