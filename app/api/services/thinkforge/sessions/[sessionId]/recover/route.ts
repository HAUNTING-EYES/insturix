import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getServiceConfig } from '@/lib/config/services';
import {
  checkThinkForgeLimits,
  createThinkForgeLimitResponse
} from '@/lib/middleware/services/thinkforge';

const serviceConfig = getServiceConfig('thinkforge');
const THINKFORGE_BACKEND_URL = process.env.THINKFORGE_BACKEND_URL || 'http://localhost:8080';

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

    const { sessionId } = await params;

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

    // Call ThinkForge backend to recover session state
    const backendResponse = await fetch(`${THINKFORGE_BACKEND_URL}/api/thinkforge/sessions/${sessionId}/recover?user_id=${session.userId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.userId}`
      }
    });

    if (!backendResponse.ok) {
      const errorData = await backendResponse.json().catch(() => ({}));
      console.error('Backend session recovery error', {
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
            message: errorData.detail || 'Failed to recover session state',
            action: 'Please try again later'
          }
        },
        { status: backendResponse.status }
      );
    }

    const result = await backendResponse.json();

    console.info('Session state recovered successfully', {
      data: {
        userId: session.userId,
        sessionId,
        hasState: !!result.state
      }
    });

    return NextResponse.json({
      success: true,
      sessionId,
      state: result.state || {},
      events: result.events || [],
      message: 'Session state recovered successfully'
    });

  } catch (error) {
    console.error('Session recovery request failed', {
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