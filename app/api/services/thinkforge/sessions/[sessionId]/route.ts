import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getServiceConfig } from '@/lib/config/services';
import {
  checkThinkForgeLimits,
  createThinkForgeLimitResponse
} from '@/lib/middleware/services/thinkforge';

const serviceConfig = getServiceConfig('thinkforge');
import { sanitizeErrorForUser, logSecurely } from '@/lib/utils/secureErrorHandler';

const THINKFORGE_BACKEND_URL = process.env.THINKFORGE_BACKEND_URL || 'http://localhost:8080';

// Enhanced recovery endpoint for session validation

export async function GET(
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

    const { sessionId } = params;

    // Check service limits using enhanced middleware
    const requestData = {
      sessionId,
      userId: session.userId
    };
    
    const limitCheck = await checkThinkForgeLimits(requestData);
    
    if (!limitCheck.success || !limitCheck.hasAccess) {
      console.warn('Service limit check failed', {
        data: {
          userId: session.userId,
          limitInfo: limitCheck.limitInfo,
          error: limitCheck.error
        }
      });

      return createThinkForgeLimitResponse(limitCheck);
    }

    // Call ThinkForge backend to get session
    const backendResponse = await fetch(`${THINKFORGE_BACKEND_URL}/api/thinkforge/sessions/${sessionId}?user_id=${session.userId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.userId}` // Pass user ID as auth
      }
    });

    if (!backendResponse.ok) {
      const errorData = await backendResponse.json().catch(() => ({}));
      console.error('ThinkForge backend error', {
        data: {
          userId: session.userId,
          sessionId,
          status: backendResponse.status,
          error: errorData
        }
      });

      return NextResponse.json(
        { 
          success: false,
          error: {
            type: 'BACKEND_ERROR',
            message: errorData.detail || 'Failed to get session',
            action: 'Please try again later'
          }
        },
        { status: backendResponse.status }
      );
    }

    const result = await backendResponse.json();

    console.info('Session retrieved successfully', {
      data: {
        userId: session.userId,
        sessionId
      }
    });

    return NextResponse.json({
      success: true,
      session_id: sessionId,
      state: result.state || {},
      events: result.events || []
    });

  } catch (error) {
    console.error('Request processing failed', {
      data: {
        error: error instanceof Error ? error.message : String(error)
      }
    });

    return NextResponse.json(
      { 
        success: false,
        error: {
          type: 'REQUEST_PROCESSING_ERROR',
          message: 'Failed to process request',
          action: 'Please try again later'
        }
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
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

    const { sessionId } = params;

    // Check service limits using enhanced middleware
    const requestData = {
      sessionId,
      userId: session.userId
    };
    
    const limitCheck = await checkThinkForgeLimits(requestData);
    
    if (!limitCheck.success || !limitCheck.hasAccess) {
      console.warn('Service limit check failed', {
        data: {
          userId: session.userId,
          limitInfo: limitCheck.limitInfo,
          error: limitCheck.error
        }
      });

      return createThinkForgeLimitResponse(limitCheck);
    }

    // Call ThinkForge backend to delete session
    const backendResponse = await fetch(`${THINKFORGE_BACKEND_URL}/api/thinkforge/sessions/${sessionId}?user_id=${session.userId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.userId}` // Pass user ID as auth
      }
    });

    if (!backendResponse.ok) {
      const errorData = await backendResponse.json().catch(() => ({}));
      console.error('ThinkForge backend error', {
        data: {
          userId: session.userId,
          sessionId,
          status: backendResponse.status,
          error: errorData
        }
      });

      return NextResponse.json(
        { 
          success: false,
          error: {
            type: 'BACKEND_ERROR',
            message: errorData.detail || 'Failed to delete session',
            action: 'Please try again later'
          }
        },
        { status: backendResponse.status }
      );
    }

    const result = await backendResponse.json();

    console.info('Session deleted successfully', {
      data: {
        userId: session.userId,
        sessionId
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Session deleted successfully'
    });

  } catch (error) {
    console.error('Request processing failed', {
      data: {
        error: error instanceof Error ? error.message : String(error)
      }
    });

    return NextResponse.json(
      { 
        success: false,
        error: {
          type: 'REQUEST_PROCESSING_ERROR',
          message: 'Failed to process request',
          action: 'Please try again later'
        }
      },
      { status: 500 }
    );
  }
} 