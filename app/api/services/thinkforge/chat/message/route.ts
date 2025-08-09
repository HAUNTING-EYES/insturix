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

    const { message, sessionId, context, selectedIdea } = await request.json();
    
    if (!message || !sessionId) {
      return NextResponse.json(
        { error: 'Missing required fields: message, sessionId' },
        { status: 400 }
      );
    }

    // Enhanced session ownership validation with auto-recovery
    const ownershipValidation = await requireSessionOwnership(sessionId, session.userId, true);
    
    if (!ownershipValidation.isValid) {
      logSecurely('warn', 'Session ownership validation failed', {
        userId: session.userId,
        sessionId: sessionId.substring(0, 8) + '...',
        error: ownershipValidation.error,
        autoRecovered: ownershipValidation.autoRecovered
      });

      // If auto-recovery succeeded, use the new session ID
      if (ownershipValidation.autoRecovered && ownershipValidation.sessionId) {
        logSecurely('info', 'Session auto-recovery successful, proceeding with new session', {
          userId: session.userId,
          originalSessionId: sessionId.substring(0, 8) + '...',
          newSessionId: ownershipValidation.sessionId.substring(0, 8) + '...'
        });
      } else {
        // Recovery failed or wasn't attempted
        const errorMessage = ownershipValidation.shouldRetry 
          ? 'Session validation failed temporarily. Please try again.'
          : sanitizeErrorForUser(ownershipValidation.error || 'Session access denied');
          
        return NextResponse.json(
          { 
            error: errorMessage,
            sessionRecoverable: ownershipValidation.shouldRetry === true,
            httpStatus: ownershipValidation.httpStatus 
          },
          { status: ownershipValidation.httpStatus || 403 }
        );
      }
    }

    // Use the validated (or recovered) session ID
    const validatedSessionId = ownershipValidation.sessionId || sessionId;

    // Check rate limiting with the validated session ID
    // The legacy rate limiting system is removed, so this check is no longer needed.
    // The new architecture relies on SOP and usage tracking.

    // Check service limits using enhanced middleware (SOP compliant)
    const requestData = {
      message,
      sessionId: validatedSessionId,
      context,
      selectedIdea,
      userId: session.userId
    };
    
    const limitCheck = await checkThinkForgeLimits(requestData);
    
    if (!limitCheck.success || !limitCheck.hasAccess) {
      logSecurely('warn', 'Service limit check failed', {
        userId: session.userId,
        sanitizedError: sanitizeErrorForUser(limitCheck.error || 'Limit check failed')
      });

      return createThinkForgeLimitResponse(limitCheck);
    }

    // Chat message request - no session increment needed (only incremented on session creation)
    // Create task with new architecture (MongoDB + RTDB + Pub/Sub)
    try {
      const taskId = new ObjectId().toString();

      // Create task in RTDB with retry logic
      let rtdbAttempts = 0;
      const maxRtdbAttempts = 3;
      
      while (rtdbAttempts < maxRtdbAttempts) {
        try {
          await ThinkForgeRTDBManager.createTask(
            session.userId,
            taskId,
            'chat',
            validatedSessionId,
            `Chat: ${message.substring(0, 50)}...`
          );
          break; // Success, exit retry loop
        } catch (rtdbError) {
          rtdbAttempts++;
          if (rtdbAttempts === maxRtdbAttempts) {
            // If RTDB fails completely, we can still proceed with Pub/Sub
            logSecurely('warn', 'RTDB task creation failed after retries, proceeding with Pub/Sub only', {
              userId: session.userId,
              taskId,
              attempts: rtdbAttempts
            });
          } else {
            // Brief delay before retry
            await new Promise(resolve => setTimeout(resolve, 500 * rtdbAttempts));
          }
        }
      }

      // Publish to Pub/Sub for worker processing
      await ThinkForgePubSubManager.publishTask({
        taskId,
        userId: session.userId,
        sessionId: validatedSessionId,
        type: 'chat',
        data: {
          message,
          context,
          selectedIdea
        }
      });

      // Update rate limit usage counter
      // The legacy rate limiting system is removed, so this update is no longer needed.
      // The new architecture relies on SOP and usage tracking.

      logSecurely('info', 'ThinkForge chat task created successfully', {
        taskId,
        userId: session.userId,
        sessionId: validatedSessionId.substring(0, 8) + '...',
        messageLength: message.length,
        sessionRecovered: ownershipValidation.autoRecovered || false
      });

      return NextResponse.json({
        success: true,
        taskId: taskId,
        status: 'queued',
        estimatedTime: 30,
        sessionId: validatedSessionId, // Return the validated/recovered session ID
        sessionRecovered: ownershipValidation.autoRecovered || false
      });

    } catch (error) {
      logSecurely('error', 'Task creation failed', {
        userId: session.userId,
        sanitizedError: sanitizeErrorForUser(error instanceof Error ? error.message : String(error))
      });

      return NextResponse.json(
        { 
          success: false,
          error: {
            type: 'TASK_CREATION_ERROR',
            message: sanitizeErrorForUser('Failed to create chat task'),
            action: 'Please try again later'
          }
        },
        { status: 500 }
      );
    }

  } catch (error) {
    logSecurely('error', 'Request processing failed', {
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