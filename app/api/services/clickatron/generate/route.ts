import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getClickatronDb } from '@/lib/clickatron-mongo';
import { checkClickatronLimits, incrementClickatronUsage, createClickatronLimitResponse } from '@/lib/middleware/services/clickatron';
import { getServiceConfig } from '@/lib/config/services';
import { ClickatronRTDBManager } from '@/lib/services/clickatron-rtdb';
import { PubSub } from '@google-cloud/pubsub';

const pubsub = new PubSub();
const clickatronConfig = getServiceConfig('clickatron');

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const body = await req.json();
  console.log('Received body:', JSON.stringify(body, null, 2));

  const { details } = body;

  if (!details) {
    return new NextResponse('Missing details', { status: 400 });
  }

  // Robust string conversion with sanitization
  let detailsString: string;
  
  try {
    if (typeof details === 'string') {
      detailsString = details;
    } else if (typeof details === 'object') {
      detailsString = JSON.stringify(details);
    } else {
      detailsString = String(details);
    }
    
    // Additional sanitization to ensure it's a valid string
    detailsString = detailsString.replace(/[\x00-\x1F\x7F]/g, ''); // Remove control characters
    
    console.log('Final detailsString:', detailsString);
  } catch (error) {
    console.error('Error processing details:', error);
    return new NextResponse('Invalid details format', { status: 400 });
  }

  const limitResult = await checkClickatronLimits({ userId });
  if (!limitResult.hasAccess) {
    return createClickatronLimitResponse(limitResult);
  }

  const { ClickatronTask } = await getClickatronDb();
  const taskCount = await ClickatronTask.countDocuments({ userId });
  const title = `Thumbnail #${taskCount + 1}`;
  
  let newTask;
  try {
    newTask = new ClickatronTask({
      userId,
      title,
      details: detailsString, // Store the JSON string directly in details
      status: 'listed',
    });
    await newTask.save();
    console.log('Task saved successfully:', newTask._id);
  } catch (saveError: any) {
    console.error('Error saving task:', saveError);
    return new NextResponse(`Database error: ${saveError?.message || 'Unknown error'}`, { status: 500 });
  }

  await incrementClickatronUsage({ userId });

  // Create task in RTDB for real-time updates
  try {
    await ClickatronRTDBManager.createTask(userId, newTask._id.toString(), title);
  } catch (error) {
    console.error('Failed to create task in RTDB:', error);
    // Don't fail the whole request if RTDB fails
  }

  const message = {
    taskId: newTask._id.toString(),
    details: detailsString,
    userId,
  };

  if (process.env.CLICKATRON_LOCAL_WORKER) {
    const data = Buffer.from(JSON.stringify(message)).toString('base64');
    await fetch(process.env.CLICKATRON_LOCAL_WORKER, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          data: data,
          attributes: {}
        },
        // Optionally, you can set a subscription value if needed for local testing
        subscription: 'projects/test/subscriptions/test-sub'
      }),
    });
  } else {
    await pubsub.topic(clickatronConfig.pubsubTopic).publishMessage({ json: message });
  }

  return NextResponse.json({ taskId: newTask._id });
}