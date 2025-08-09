import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const THINKFORGE_BACKEND_URL = process.env.THINKFORGE_BACKEND_URL || 'http://localhost:8080';

export async function POST(
  request: Request,
  { params }: { params: { sessionId: string } }
) {
  try {
    const session = await auth();
    if (!session?.userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { user_id } = await request.json();
    
    // Verify the user_id matches the authenticated user
    if (user_id !== session.userId) {
      return NextResponse.json(
        { error: 'User ID mismatch' },
        { status: 403 }
      );
    }

    // Forward request to ThinkForge backend
    const backendResponse = await fetch(
      `${THINKFORGE_BACKEND_URL}/api/thinkforge/sessions/${params.sessionId}/migrate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.userId}`
        },
        body: JSON.stringify({ user_id })
      }
    );

    if (!backendResponse.ok) {
      const errorData = await backendResponse.json().catch(() => ({}));
      console.error('ThinkForge session migration failed', {
        data: {
          userId: session.userId,
          sessionId: params.sessionId,
          status: backendResponse.status,
          error: errorData
        }
      });

      return NextResponse.json(
        { 
          success: false,
          error: {
            type: 'MIGRATION_ERROR',
            message: errorData.detail || 'Session migration failed',
            action: 'Please try refreshing the page'
          }
        },
        { status: backendResponse.status }
      );
    }

    const result = await backendResponse.json();

    console.info('ThinkForge session migrated successfully', {
      data: {
        userId: session.userId,
        oldSessionId: params.sessionId,
        newSessionId: result.current_session_id
      }
    });

    return NextResponse.json(result);

  } catch (error) {
    console.error('Session migration request failed', {
      data: {
        sessionId: params.sessionId,
        error: error instanceof Error ? error.message : String(error)
      }
    });

    return NextResponse.json(
      { 
        success: false,
        error: {
          type: 'REQUEST_PROCESSING_ERROR',
          message: 'Failed to process migration request',
          action: 'Please try again later'
        }
      },
      { status: 500 }
    );
  }
} 