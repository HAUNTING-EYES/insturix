import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getClickatronDb } from '@/lib/clickatron-mongo';
import { checkClickatronLimits, incrementClickatronUsage, createClickatronLimitResponse } from '@/lib/middleware/services/clickatron';
import { getServiceConfig } from '@/lib/config/services';
import { ClickatronRTDBManager } from '@/lib/services/rtdb/clickatron-rtdb';
import { PubSub } from '@google-cloud/pubsub';

const gcpCredentials = process.env.GOOGLE_CLOUD_CREDENTIALS
  ? JSON.parse(Buffer.from(process.env.GOOGLE_CLOUD_CREDENTIALS, 'base64').toString())
  : null;

if (!gcpCredentials) {
  console.error('GOOGLE_CLOUD_CREDENTIALS environment variable is not configured or invalid.');
  // This will cause the PubSub initialization to fail, which will be caught by the outer try-catch in POST
}

const pubsub = new PubSub({
  projectId: gcpCredentials?.project_id,
  credentials: gcpCredentials,
});
const clickatronConfig = getServiceConfig('clickatron');

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const body = await req.json();
  console.log('Received body:', JSON.stringify(body, null, 2));

  const { details } = body;

  if (
    !details ||
    (typeof details === 'string' && details.trim().length === 0) ||
    (typeof details === 'object' && Object.keys(details).length === 0)
  ) {
    return new NextResponse('Missing or empty details', { status: 400 });
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
    return new NextResponse('Internal Server Error', { status: 500 });
  }

  // New try-catch block for post-save operations
  try {
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
          subscription: 'projects/test/subscriptions/test-sub'
        }),
      });
    } else {
      // Existing PubSub try-catch block
      try {
        console.log(
          '[PubSub] Publishing to topic:',
          clickatronConfig.pubsubTopic,
          'Message:',
          JSON.stringify(message)
        );
        const result = await pubsub.topic(clickatronConfig.pubsubTopic).publishMessage({ json: message });
        console.log('[PubSub] Publish result:', result);
      } catch (pubsubError) {
        // Re-throw to be caught by the outer try-catch
        throw pubsubError;
      }
    }

    // Only increment usage if everything above was successful
    await incrementClickatronUsage({ userId });

    return NextResponse.json({ taskId: newTask._id });

  } catch (processingError: any) {
    console.error('Error during task processing (PubSub/Local Worker/Usage Increment):', processingError);
    // Update task status to failed and store a generic error message
    await ClickatronTask.findByIdAndUpdate(newTask._id, {
      status: 'failed',
      error_message: 'Failed to process task due to an internal error. Please try again later.',
    });
    return new NextResponse('Task processing failed', { status: 500 });
  }
}