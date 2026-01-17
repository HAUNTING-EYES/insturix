import { NextResponse } from 'next/server';
import { CreditsService } from '@/lib/services/creditsService';

export async function POST(request: Request) {
  // 1. Authenticate the request
  const authHeader = request.headers.get('authorization');
  const serviceSecret = process.env.SERVICES_WEBHOOK_SECRET;

  if (!serviceSecret || authHeader !== `Bearer ${serviceSecret}`) {
    console.warn('Unauthorized webhook call for Clickatron');
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    // 2. Parse request body
    const body = await request.json();
    const { taskType, userid: userId, amount, transactionId } = body;

    if (!userId) {
      return new NextResponse('Missing required field: userid', { status: 400 });
    }

    // Default amount to 3 credits (standard clickatron variation cost)
    const refundAmount = amount ?? 3;

    // 3. Process credits refund
    const result = await CreditsService.refundCredits(
      userId,
      refundAmount,
      `Service failure refund: ${taskType || 'clickatron'}`,
      {
        service: 'clickatron',
        action: taskType || 'variation',
        originalTransactionId: transactionId,
      }
    );

    if (!result.success) {
      console.error('Failed to refund credits:', result.error);
      return new NextResponse(`Refund failed: ${result.error}`, { status: 500 });
    }

    return new NextResponse('Refund processed successfully', { status: 200 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error processing Clickatron refund webhook', { errorMessage });
    return new NextResponse(`Internal Server Error: ${errorMessage}`, { status: 500 });
  }
}