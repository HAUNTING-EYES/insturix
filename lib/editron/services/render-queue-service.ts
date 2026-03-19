import { Redis } from '@upstash/redis';
import { countActiveRenders, createJob } from './render-job-service';
import { renderMediaOnLambda } from '@remotion/lambda/client';

// Maximum concurrent renders (based on AWS Lambda account limits)
export const MAX_CONCURRENT_RENDERS = 3; // Conservative limit for 10 concurrent Lambdas

// Lazy singleton to avoid crashing next build when env vars are missing.
let _redis: Redis | null = null;
function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
  }
  return _redis;
}

const QUEUE_KEY = 'editron:render:queue';

interface QueuedJob {
  userId: string;
  projectId: string;
  inputProps: Record<string, unknown>;
  compositionId?: string;
  queuedAt: number;
}

/**
 * Add a render job to the queue
 */
export async function enqueueRender(job: Omit<QueuedJob, 'queuedAt'>): Promise<{
  status: 'queued' | 'started';
  position?: number;
  renderId?: string;
  bucketName?: string;
}> {
  const activeCount = await countActiveRenders();
  
  // If under limit, start immediately
  if (activeCount < MAX_CONCURRENT_RENDERS) {
    const result = await startRender(job);
    return { status: 'started', ...result };
  }
  
  // Otherwise queue the job
  const queuedJob: QueuedJob = {
    ...job,
    queuedAt: Date.now(),
  };
  
  await getRedis().rpush(QUEUE_KEY, JSON.stringify(queuedJob));
  const position = await getRedis().llen(QUEUE_KEY);
  
  return { status: 'queued', position };
}

/**
 * Process the next job in queue (called by cron or worker)
 */
export async function processQueue(): Promise<{
  processed: boolean;
  renderId?: string;
}> {
  const activeCount = await countActiveRenders();
  
  if (activeCount >= MAX_CONCURRENT_RENDERS) {
    return { processed: false };
  }
  
  // Pop the first job from queue
  const jobJson = await getRedis().lpop<string>(QUEUE_KEY);
  if (!jobJson) {
    return { processed: false };
  }
  
  const job: QueuedJob = JSON.parse(jobJson);
  const result = await startRender(job);
  
  return { processed: true, renderId: result.renderId };
}

/**
 * Get current queue length
 */
export async function getQueueLength(): Promise<number> {
  return getRedis().llen(QUEUE_KEY);
}

/**
 * Start a render on Lambda and save to DB
 */
async function startRender(job: Omit<QueuedJob, 'queuedAt'>): Promise<{
  renderId: string;
  bucketName: string;
}> {
  const functionName = process.env.REMOTION_LAMBDA_FUNCTION_NAME!;
  const serveUrl = process.env.REMOTION_LAMBDA_SERVE_URL!;
  const region = (process.env.REMOTION_AWS_REGION || 'us-east-1') as any;
  
  // Set AWS credentials
  process.env.AWS_ACCESS_KEY_ID = process.env.REMOTION_AWS_ACCESS_KEY_ID;
  process.env.AWS_SECRET_ACCESS_KEY = process.env.REMOTION_AWS_SECRET_ACCESS_KEY;
  
  const { bucketName, renderId } = await renderMediaOnLambda({
    region,
    functionName,
    serveUrl,
    composition: job.compositionId || 'TestComponent',
    inputProps: job.inputProps || {},
    codec: 'h264',
    audioCodec: 'mp3', // Faster audio processing than AAC
    privacy: 'public',
    // Set to 200 to use ~5-8 concurrent Lambdas (safe for new AWS accounts with limit 10)
    framesPerLambda: 200,
    timeoutInMilliseconds: 240000,
  });
  
  // Save to database
  await createJob(renderId, job.userId, job.projectId, bucketName);
  
  return { renderId, bucketName };
}
