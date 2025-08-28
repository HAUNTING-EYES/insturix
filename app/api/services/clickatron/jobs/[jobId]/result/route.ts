import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getJob, getRedisClient } from '@/lib/clickatron-jobs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { jobId } = await params;

    if (!jobId || typeof jobId !== 'string') {
      return NextResponse.json({ error: 'Invalid Job ID' }, { status: 400 });
    }

    // Get job from Redis
    const job = await getJob(jobId);

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Verify job ownership
    if (job.userId !== userId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // For direction jobs, fetch the result from Redis
    if (job.prompt?.startsWith('Generate creative directions for:')) {
      if (!job.resultRef) {
        return NextResponse.json({ error: 'Job result not available yet' }, { status: 202 });
      }

      // Fetch result from Redis
      const redis = getRedisClient();
      const resultData = await redis.get(job.resultRef);

      if (!resultData) {
        return NextResponse.json({ error: 'Job result not found' }, { status: 404 });
      }

      try {
        // Handle case where Redis returns an object instead of JSON string
        let parsedResult;
        if (typeof resultData === 'object') {
          parsedResult = resultData;
        } else if (typeof resultData === 'string') {
          parsedResult = JSON.parse(resultData);
        } else {
          throw new Error('Unexpected result data type');
        }
        return NextResponse.json({
          success: true,
          directions: parsedResult.directions,
          jobId,
          metadata: {
            videoIdea: job.prompt.replace('Generate creative directions for: ', ''),
            count: parsedResult.directions?.length || 0,
            generatedAt: parsedResult.generatedAt,
          },
        });
      } catch (parseError) {
        console.error('Error parsing job result:', parseError);
        return NextResponse.json({ error: 'Invalid job result format' }, { status: 500 });
      }
    }

    return NextResponse.json({ error: 'Unsupported job type' }, { status: 400 });

  } catch (error) {
    console.error('Error fetching job result:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}