import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { ObjectId } from 'mongodb';
import { getServiceConfig } from '@/lib/config/services';
import { sanitizeErrorForUser, logSecurely } from '@/lib/utils/secureErrorHandler';
import { checkThinkForgeLimits, createThinkForgeLimitResponse } from '@/lib/middleware/services/thinkforge';
import { ThinkForgePubSubManager } from '../../utils/pubsub';
import { ThinkForgeRTDBManager } from '../../utils/rtdb';
import { requireSessionOwnership } from '../../utils/sessionOwnership';

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

    const { prompt, preferences, session_id } = await request.json();
    
    if (!prompt || !session_id) {
      return NextResponse.json(
        { error: 'Missing required fields: prompt and session_id' },
        { status: 400 }
      );
    }

    // Validate session ownership
    const ownershipValidation = await requireSessionOwnership(session_id, session.userId);
    if (!ownershipValidation.isValid) {
      logSecurely('warn', 'Session ownership validation failed in ideas generation', {
        userId: session.userId,
        sessionId: session_id.substring(0, 8) + '...'
      });
      return NextResponse.json(
        { error: sanitizeErrorForUser(ownershipValidation.error || 'Session access denied') },
        { status: ownershipValidation.httpStatus || 403 }
      );
    }

    // Check if this is a new session (first idea generation) or reshuffle
    const isNewSession = !preferences?.isReshuffle;
    const operation = isNewSession ? 'sessionsPerWeek' : 'ideasReshufflesPerSession';

    // Check service limits using enhanced middleware (SOP compliant)
    const requestData = {
      prompt,
      preferences,
      session_id,
      userId: session.userId
    };
    
    const limitCheck = await checkThinkForgeLimits(requestData);
    
    if (!limitCheck.success || !limitCheck.hasAccess) {
      logSecurely('warn', 'Service limit check failed in ideas generation', {
        userId: session.userId,
        sanitizedError: sanitizeErrorForUser(limitCheck.error || 'Limit check failed')
      });

      return createThinkForgeLimitResponse(limitCheck);
    }

    // Generate ideas request - no session increment needed (only incremented on session creation)
    // Create task with new architecture (MongoDB + RTDB + Pub/Sub)
    try {
      // Generate task ID for this request
      const taskId = new ObjectId().toString();

      // Create task in RTDB
      await ThinkForgeRTDBManager.createTask(
        session.userId,
        taskId,
        'ideas',
        session_id,  // Use ThinkForge session ID
        `Ideas: ${prompt.substring(0, 50)}...`
      );

      // Publish to Pub/Sub for worker processing
      await ThinkForgePubSubManager.publishTask({
        taskId,
        userId: session.userId,
        sessionId: session_id,  // Use ThinkForge session ID
        type: 'ideas',
        data: {
          prompt,
          preferences
        }
      });

      logSecurely('info', 'ThinkForge ideas task created successfully', {
        taskId,
        userId: session.userId,
        sessionId: session_id.substring(0, 8) + '...',
        promptLength: prompt.length
      });

      return NextResponse.json({
        success: true,
        taskId: taskId,
        status: 'queued',
        estimatedTime: 60, // Estimate for ideas generation
        sessionId: session_id
      });

    } catch (error) {
      logSecurely('error', 'Task creation failed in ideas generation', {
        userId: session.userId,
        sanitizedError: sanitizeErrorForUser(error instanceof Error ? error.message : String(error))
      });

      return NextResponse.json(
        { 
          success: false,
          error: {
            type: 'TASK_CREATION_ERROR',
            message: sanitizeErrorForUser('Failed to create ideas task'),
            action: 'Please try again later'
          }
        },
        { status: 500 }
      );
    }

  } catch (error) {
    logSecurely('error', 'Request processing failed in ideas generation', {
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