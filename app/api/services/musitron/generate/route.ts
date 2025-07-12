import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getMusitronDb } from '@/lib/musitron-mongo';
import { MusitronTask, IMusitronTask } from '@/schemas/Musitron';
import { PubSub } from '@google-cloud/pubsub';
import { getServiceConfig } from '@/lib/config/services';
import { serviceLogger } from '@/lib/services/common/task-service';
import { getUserPlanWithServiceLimits } from '@/lib/services/planService';
import { ServiceUsageService } from '@/lib/services/serviceUsageService';

const gcpCredentials = process.env.GOOGLE_CLOUD_CREDENTIALS
  ? JSON.parse(Buffer.from(process.env.GOOGLE_CLOUD_CREDENTIALS, 'base64').toString())
  : null;

if (!gcpCredentials) {
  console.error('GOOGLE_CLOUD_CREDENTIALS environment variable is not configured or invalid.');
}

const pubsub = new PubSub({
  projectId: gcpCredentials?.project_id,
  credentials: gcpCredentials,
});

const musitronConfig = getServiceConfig('musitron');

export async function POST(req: Request) {
  const { userId } = await auth();

  if (!userId) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    const { customMode, title, instrumental, songDescription, style, lyrics } = await req.json();

    if (!title || typeof instrumental !== 'boolean' || typeof customMode !== 'boolean') {
      return new NextResponse('Missing required fields', { status: 400 });
    }

    if (customMode && (!style || !lyrics)) {
      return new NextResponse('Missing required fields for custom mode', { status: 400 });
    }

    if (!customMode && !songDescription) {
      return new NextResponse('Missing required fields for simple mode', { status: 400 });
    }

    const usageInfo = await ServiceUsageService.canUseService(userId, 'musitron', 'maxMusicGeneration');
    if (!usageInfo.hasAccess) {
      return new NextResponse('API limit reached', { status: 403 });
    }

    await getMusitronDb();

    const newTask: IMusitronTask = new MusitronTask({
      userId,
      status: 'queued',
      createdAt: new Date(),
      options: {
        customMode,
        title,
        instrumental,
        ...(songDescription && { songDescription }),
        ...(style && { style }),
        ...(lyrics && { lyrics }),
      },
    });

    await newTask.save();

    const pubsubMessage = {
      taskId: newTask._id as string,
      userId,
      options: newTask.options,
    };

    if (process.env.MUSITRON_LOCAL_WORKER) {
      const data = Buffer.from(JSON.stringify(pubsubMessage)).toString('base64');
      await fetch(process.env.MUSITRON_LOCAL_WORKER, {
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
      if (!musitronConfig.pubsubTopic) {
        serviceLogger.error('Missing Musitron Pub/Sub topic ID in service configuration');
        return new NextResponse('Server configuration error', { status: 500 });
      }
      await ServiceUsageService.useService(userId, 'musitron', 'maxMusicGeneration');
      await pubsub.topic(musitronConfig.pubsubTopic).publishMessage({ json: pubsubMessage });
    }

    return NextResponse.json({ taskId: newTask._id as string });

  } catch (error) {
    serviceLogger.error('Musitron generate API error', { 
      error: error instanceof Error ? error.message : String(error) 
    });
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}