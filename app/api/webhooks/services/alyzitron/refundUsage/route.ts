import { NextResponse } from 'next/server';
import { processRefund } from '@/lib/services/tasks/simple-refund';

export async function POST(request: Request) {
  // 1. Authenticate the request
  const authHeader = request.headers.get('authorization');
  const serviceSecret = process.env.SERVICES_WEBHOOK_SECRET;

  if (!serviceSecret || authHeader !== `Bearer ${serviceSecret}`) {
    console.warn('Unauthorized webhook call for Alyzitron');
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    // 2. Parse request body
    const body = await request.json();
    const { taskType, userid: userId, minutes } = body;

    if (!taskType || !userId || minutes === undefined) {
      return new NextResponse('Missing required fields: taskType, userid, or minutes', { status: 400 });
    }

    // 3. Process refund
    await processRefund('alyzitron', taskType, userId, minutes);

    return new NextResponse('Refund processed successfully', { status: 200 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error processing Alyzitron refund webhook', { errorMessage });
    return new NextResponse(`Internal Server Error: ${errorMessage}`, { status: 500 });
  }
}