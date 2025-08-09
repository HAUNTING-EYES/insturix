import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getServiceConfig } from '@/lib/config/services';
import {
  checkThinkForgeLimits,
  createThinkForgeLimitResponse
} from '@/lib/middleware/services/thinkforge';
import { requireSessionOwnership } from '../../../utils/sessionOwnership';
import { sanitizeErrorForUser, logSecurely } from '@/lib/utils/secureErrorHandler';

const serviceConfig = getServiceConfig('thinkforge');
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

    const { state_data, timestamp } = await request.json();
    const { sessionId } = await params;
    
    if (!state_data) {
      return NextResponse.json(
        { error: 'Missing state_data' },
        { status: 400 }
      );
    }

    // Validate session ownership
    const ownershipValidation = await requireSessionOwnership(sessionId, session.userId);
    if (!ownershipValidation.isValid) {
      logSecurely('warn', 'Session ownership validation failed in session save', {
        userId: session.userId,
        sessionId: sessionId.substring(0, 8) + '...'
      });
      return NextResponse.json(
        { error: sanitizeErrorForUser(ownershipValidation.error || 'Session access denied') },
        { status: ownershipValidation.httpStatus || 403 }
      );
    }

    // Check service limits using enhanced middleware
    const requestData = {
      sessionId,
      session_state: state_data,
      timestamp,
      userId: session.userId
    };
    
    const limitCheck = await checkThinkForgeLimits(requestData);
    
    if (!limitCheck.success || !limitCheck.hasAccess) {
      logSecurely('warn', 'Service limit check failed in session save', {
        userId: session.userId,
        sanitizedError: sanitizeErrorForUser(limitCheck.error || 'Limit check failed')
      });

      return createThinkForgeLimitResponse(limitCheck);
    }

    // Call ThinkForge backend to save session state
    const backendResponse = await fetch(`${THINKFORGE_BACKEND_URL}/api/thinkforge/sessions/${sessionId}/save`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.userId}`
      },
      body: JSON.stringify({
        session_id: sessionId,
        user_id: session.userId,
        state_data,
        timestamp
      })
    });

    if (!backendResponse.ok) {
      const errorData = await backendResponse.json().catch(() => ({}));
      logSecurely('error', 'Backend session save error', {
        userId: session.userId,
        sessionId: sessionId.substring(0, 8) + '...',
        status: backendResponse.status,
        sanitizedError: sanitizeErrorForUser(errorData.detail || 'Backend error')
      });

      return NextResponse.json(
        { 
          success: false,
          error: {
            type: 'BACKEND_ERROR',
            message: sanitizeErrorForUser(errorData.detail || 'Failed to save session state'),
            action: 'Please try again later'
          }
        },
        { status: backendResponse.status }
      );
    }

    const result = await backendResponse.json();

    logSecurely('info', 'Session state saved successfully', {
      userId: session.userId,
      sessionId: sessionId.substring(0, 8) + '...',
      timestamp
    });

    return NextResponse.json({
      success: true,
      sessionId,
      message: 'Session state saved successfully'
    });

  } catch (error) {
    logSecurely('error', 'Session save request failed', {
      sanitizedError: sanitizeErrorForUser(error instanceof Error ? error.message : String(error))
    });

    return NextResponse.json(
      { 
        success: false,
        error: {
          type: 'REQUEST_PROCESSING_ERROR',
          message: sanitizeErrorForUser('Failed to process request'),
          action: 'Please try again later'
        }
      },
      { status: 500 }
    );
  }
} 