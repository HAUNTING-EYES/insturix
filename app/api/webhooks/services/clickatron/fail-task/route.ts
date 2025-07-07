import { NextResponse } from 'next/server';
import { handleTaskFailure } from '@/lib/services/tasks/handle-failure';
import { ClickatronTask } from '@/schemas/Clickatron';
import { getClickatronDb } from '@/lib/clickatron-mongo';
import { logger } from '@/app/api/services/alyzitron/utils/logger'; // Using a shared logger

export async function POST(request: Request) {
  // 1. Authenticate the request
  const authHeader = request.headers.get('authorization');
  const serviceSecret = process.env.CLICKATRON_SERVICE_SECRET;

  if (!serviceSecret || authHeader !== `Bearer ${serviceSecret}`) {
    logger.warn('Unauthorized webhook call for Clickatron');
    return new NextResponse('Unauthorized', { status: 401 });
  }

  // 2. Parse and validate the request body
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new NextResponse('Invalid JSON body', { status: 400 });
  }

  const { taskId, error } = body;

  if (!taskId || typeof taskId !== 'string' || !error || typeof error.code !== 'string' || typeof error.message !== 'string') {
    return new NextResponse('Invalid request body. Missing taskId or error object.', { status: 400 });
  }

  try {
    // 3. Fetch the task to get the userId
    await getClickatronDb();
    const task = await ClickatronTask.findById(taskId);

    if (!task) {
      logger.warn('Webhook received for non-existent Clickatron task', { taskId });
      return new NextResponse('Task not found', { status: 404 });
    }

    const userId = task.userId;
    if (!userId) {
        logger.error('Could not find userId on Clickatron task for failure handling', { taskId });
        return new NextResponse('Internal Server Error: User ID missing from task', { status: 500 });
    }

    // 4. Call the centralized failure handler
    await handleTaskFailure({
      taskId,
      serviceName: 'clickatron',
      userId,
      error,
    });

    return new NextResponse('Failure processed successfully', { status: 200 });

  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    logger.error('Error processing Clickatron failure webhook', {
      taskId,
      errorMessage,
    });
    return new NextResponse(`Internal Server Error: ${errorMessage}`, { status: 500 });
  }
}