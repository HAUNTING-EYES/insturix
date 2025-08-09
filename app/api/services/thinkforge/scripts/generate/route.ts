import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
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

    const { sessionId, selectedIdea, chatHistory } = await request.json();
    
    if (!sessionId || !selectedIdea) {
      return NextResponse.json(
        { error: 'Missing required fields: sessionId, selectedIdea' },
        { status: 400 }
      );
    }

    // Validate session ownership
    const ownershipValidation = await requireSessionOwnership(sessionId, session.userId);
    if (!ownershipValidation.isValid) {
      logSecurely('warn', 'Session ownership validation failed in script generation', {
        userId: session.userId,
        sessionId: sessionId.substring(0, 8) + '...'
      });
      return NextResponse.json(
        { error: sanitizeErrorForUser(ownershipValidation.error || 'Session access denied') },
        { status: ownershipValidation.httpStatus || 403 }
      );
    }

    // Check service limits using enhanced middleware (SOP compliant)
    const requestData = {
      sessionId,
      selectedIdea,
      chatHistory,
      userId: session.userId
    };
    
    const limitCheck = await checkThinkForgeLimits(requestData);
    
    if (!limitCheck.success || !limitCheck.hasAccess) {
      logSecurely('warn', 'Service limit check failed in script generation', {
        userId: session.userId,
        sanitizedError: sanitizeErrorForUser(limitCheck.error || 'Limit check failed')
      });

      return createThinkForgeLimitResponse(limitCheck);
    }

    // Script generation request - no session increment needed (only incremented on session creation)
    // Create task with new architecture (MongoDB + RTDB + Pub/Sub)
    try {
      const taskId = new ObjectId().toString();

      // Create task in RTDB
      await ThinkForgeRTDBManager.createTask(
        session.userId,
        taskId,
        'scripts',
        sessionId,
        `Script: ${selectedIdea.idea?.substring(0, 50) || 'Untitled'}...`
      );

      // Publish to Pub/Sub for worker processing
      await ThinkForgePubSubManager.publishTask({
        taskId,
        userId: session.userId,
        sessionId,
        type: 'scripts',
        data: {
          selectedIdea,
          chatHistory
        }
      });

      // No usage counter needed - session limits handled at session creation
      logSecurely('info', 'ThinkForge script task created successfully', {
        taskId,
        userId: session.userId,
        sessionId: sessionId.substring(0, 8) + '...',
        ideaTitle: selectedIdea.idea?.substring(0, 50) || 'Untitled'
      });

      return NextResponse.json({
        success: true,
        taskId: taskId,
        status: 'queued',
        estimatedTime: 120, // Estimate for script generation
        sessionId
      });

    } catch (error) {
      logSecurely('error', 'Task creation failed in script generation', {
        userId: session.userId,
        sanitizedError: sanitizeErrorForUser(error instanceof Error ? error.message : String(error))
      });

      return NextResponse.json(
        { 
          success: false,
          error: {
            type: 'TASK_CREATION_ERROR',
            message: sanitizeErrorForUser('Failed to create script task'),
            action: 'Please try again later'
          }
        },
        { status: 500 }
      );
    }

  } catch (error) {
    logSecurely('error', 'Request processing failed in script generation', {
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