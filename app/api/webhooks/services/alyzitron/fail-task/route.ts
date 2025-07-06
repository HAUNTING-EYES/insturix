import { NextResponse } from 'next/server';
import { handleTaskFailure } from '../../../../../../lib/services/tasks/handle-failure';
import { getCollections } from '../../../../services/alyzitron/utils/mongodb';
import { logger } from '../../../../services/alyzitron/utils/logger';

export async function POST(request: Request) {
  // 1. Authenticate the request
  const authHeader = request.headers.get('authorization');
  const serviceSecret = process.env.SERVICES_WEBHOOK_SECRET;

  if (!serviceSecret || authHeader !== `Bearer ${serviceSecret}`) {
    logger.warn('Unauthorized webhook call for Alyzitron');
    return new NextResponse('Unauthorized', { status: 401 });
  }

  // 2. Parse and validate the request body
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new NextResponse('Invalid JSON body', { status: 400 });
  }
 
  const { analysisId, error } = body;
 
  if (!analysisId || typeof analysisId !== 'string' || !error || typeof error.code !== 'string' || typeof error.message !== 'string') {
    return new NextResponse('Invalid request body. Missing analysisId or error object.', { status: 400 });
  }
 
  try {
    // 3. Fetch the task to get the userId
    const { analyses } = await getCollections();
    const task = await analyses.findOne({ _id: analysisId });
 
    if (!task) {
      logger.warn('Webhook received for non-existent Alyzitron task', { analysisId });
      return new NextResponse('Task not found', { status: 404 });
    }
 
    const userId = task.clerkUserId;
    if (!userId) {
        logger.error('Could not find clerkUserId on Alyzitron task for failure handling', { analysisId });
        return new NextResponse('Internal Server Error: User ID missing from task', { status: 500 });
    }
 
    // 4. Call the centralized failure handler
    await handleTaskFailure({
      taskId: analysisId,
      serviceName: 'alyzitron',
      userId,
      error,
    });
 
    return new NextResponse('Failure processed successfully', { status: 200 });
 
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    logger.error('Error processing Alyzitron failure webhook', {
      analysisId,
      errorMessage,
    });
    return new NextResponse(`Internal Server Error: ${errorMessage}`, { status: 500 });
  }
}