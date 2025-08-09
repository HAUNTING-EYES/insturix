import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getServiceConfig } from '@/lib/config/services';
import {
  checkThinkForgeLimits,
  createThinkForgeLimitResponse,
  incrementThinkForgeUsage
} from '@/lib/middleware/services/thinkforge';

const serviceConfig = getServiceConfig('thinkforge');
const THINKFORGE_BACKEND_URL = process.env.THINKFORGE_BACKEND_URL || 'http://localhost:8080';

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check service limits using enhanced middleware
    const requestData = {
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

    // Call ThinkForge backend to initialize session
    const backendResponse = await fetch(`${THINKFORGE_BACKEND_URL}/api/thinkforge/sessions/init`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.userId}` // Pass user ID as auth
      },
      body: JSON.stringify({
        user_id: session.userId,
        clerk_session_id: session.sessionId || `clerk_session_${Date.now()}`
      })
    });

    if (!backendResponse.ok) {
      const errorData = await backendResponse.json().catch(() => ({}));
      console.error('ThinkForge backend error', {
        data: {
          userId: session.userId,
          status: backendResponse.status,
          error: errorData
        }
      });

      return NextResponse.json(
        { 
          success: false,
          error: {
            type: 'BACKEND_ERROR',
            message: errorData.detail || 'Failed to initialize session',
            action: 'Please try again later'
          }
        },
        { status: backendResponse.status }
      );
    }

    const result = await backendResponse.json();

    // Increment session usage after successful session creation
    const usageResult = await incrementThinkForgeUsage({ 
      userId: session.userId, 
      type: 'sessions' 
    }, 1);
    
    if (!usageResult.success) {
      console.warn('Failed to increment session usage, but session was created', {
        userId: session.userId,
        sessionId: result.thinkforge_session_id,
        error: usageResult.error
      });
      // Note: We don't fail the request since session was already created successfully
    }

    console.info('ThinkForge session initialized successfully', {
      data: {
        userId: session.userId,
        clerkSessionId: session.sessionId,
        thinkforgeSessionId: result.thinkforge_session_id,
        usageIncremented: usageResult.success
      }
    });

    return NextResponse.json({
      success: true,
      thinkforge_session_id: result.thinkforge_session_id,
      message: result.message || "Session initialized successfully"
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