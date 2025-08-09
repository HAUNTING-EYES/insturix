import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getServiceConfig } from '@/lib/config/services';
import {
  checkThinkForgeLimits,
  createThinkForgeLimitResponse
} from '@/lib/middleware/services/thinkforge';

const serviceConfig = getServiceConfig('thinkforge');

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { sessionId, scriptDraft, editRequest, preferences } = await request.json();
    
    if (!sessionId || !scriptDraft || !editRequest) {
      return NextResponse.json(
        { error: 'Missing required fields: sessionId, scriptDraft, editRequest' },
        { status: 400 }
      );
    }

    // Check service limits for script editing
    const requestData = {
      sessionId,
      scriptDraft,
      editRequest,
      preferences,
      userId: session.userId
    };
    
    const limitCheck = await checkThinkForgeLimits(requestData);
    
    if (!limitCheck.success || !limitCheck.hasAccess) {
      console.warn('Script edit limit check failed', {
        data: {
          userId: session.userId,
          limitInfo: limitCheck.limitInfo,
          hasAccess: limitCheck.hasAccess
        }
      });

      return createThinkForgeLimitResponse(limitCheck);
    }

    // Script edit request - no session increment needed (only incremented on session creation)
    try {
      // Call backend worker (no limits enforcement) for script editing
      const backendUrl = process.env.THINKFORGE_BACKEND_URL || 'http://localhost:8080';
      
      const backendResponse = await fetch(`${backendUrl}/api/thinkforge/scripts/edit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.userId}`, // Pass user ID for auth
        },
        body: JSON.stringify({
          session_id: sessionId,
          user_id: session.userId,
          script_draft: scriptDraft,
          edit_request: editRequest,
          preferences: preferences || {}
        }),
      });

      if (!backendResponse.ok) {
        const errorData = await backendResponse.json().catch(() => ({}));
        throw new Error(errorData.detail || `Backend worker error: ${backendResponse.status}`);
      }

      const result = await backendResponse.json();

      console.info('Script edit completed successfully', {
        data: {
          userId: session.userId,
          sessionId,
          editLength: editRequest.length
        }
      });

      return NextResponse.json({
        success: true,
        ...result
      });

    } catch (error) {
      console.error('Script edit failed', {
        data: {
          userId: session.userId,
          sessionId,
          error: error instanceof Error ? error.message : String(error)
        }
      });

      return NextResponse.json(
        { 
          success: false,
          error: {
            type: 'SCRIPT_EDIT_ERROR',
            message: 'Failed to edit script',
            details: error instanceof Error ? error.message : String(error),
            action: 'Please try again or simplify your edit request'
          }
        },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('Script edit request processing failed', {
      data: {
        error: error instanceof Error ? error.message : String(error)
      }
    });

    return NextResponse.json(
      { 
        success: false,
        error: {
          type: 'REQUEST_PROCESSING_ERROR',
          message: 'Failed to process edit request',
          action: 'Please try again later'
        }
      },
      { status: 500 }
    );
  }
} 