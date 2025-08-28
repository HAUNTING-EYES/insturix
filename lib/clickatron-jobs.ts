import { Redis } from '@upstash/redis';
import {
  ClickatronJob,
  JobStatus,
  JobStage,
  JobError,
  JobTraceEntry,
  CreateJobRequest,
  WorkerPayload
} from '@/types/clickatron';

// Redis client instance
let redis: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redis) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) {
      console.error('Redis environment variables not configured');
      throw new Error('Redis environment variables not configured');
    }

    try {
      redis = new Redis({
        url,
        token,
      });
      console.log('Redis client initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Redis client:', error);
      throw error;
    }
  }
  return redis;
}

// Redis key patterns
export const REDIS_KEYS = {
  job: (jobId: string) => `clickatron:job:${jobId}`,
  jobIndex: (sessionId: string) => `clickatron:job:index:${sessionId}`,
  idempotency: (key: string) => `clickatron:idempotency:${key}`,
  activeJobs: 'clickatron:active',
} as const;

// Job TTL settings
export const JOB_TTL = {
  ACTIVE: 6 * 60 * 60, // 6 hours for active jobs
  COMPLETED: 24 * 60 * 60, // 24 hours for completed jobs
  FAILED: 7 * 24 * 60 * 60, // 7 days for failed jobs
} as const;

/**
 * Create a new job record in Redis
 */
export async function createJob(jobData: CreateJobRequest): Promise<string> {
  const redis = getRedisClient();
  const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const job: ClickatronJob = {
    id: jobId,
    userId: jobData.userId,
    sessionId: jobData.sessionId,
    variationId: jobData.variationId,
    prompt: jobData.prompt,
    status: 'queued',
    progress: 0,
    stage: 'queued',
    attempt: 1,
    startedAt: Date.now(),
    updatedAt: Date.now(),
    trace: [{
      timestamp: Date.now(),
      stage: 'queued',
      progress: 0,
      message: 'Job created and queued',
    }],
    fineTuning: jobData.fineTuning,
    metadata: jobData.metadata,
  };

  const jobKey = REDIS_KEYS.job(jobId);
  const indexKey = REDIS_KEYS.jobIndex(jobData.sessionId);

  // Store job data
  await redis.set(jobKey, JSON.stringify(job), { ex: JOB_TTL.ACTIVE });

  // Add to session index
  await redis.sadd(indexKey, jobId);
  await redis.expire(indexKey, JOB_TTL.COMPLETED);

  // Add to active jobs (for monitoring/cleanup)
  await redis.zadd(REDIS_KEYS.activeJobs, {
    score: Date.now(),
    member: jobId,
  });

  return jobId;
}

/**
 * Get job by ID
 */
export async function getJob(jobId: string): Promise<ClickatronJob | null> {
  const redis = getRedisClient();
  const jobKey = REDIS_KEYS.job(jobId);

  const jobData = await redis.get(jobKey);
  if (!jobData) {
    return null;
  }

  try {
    // Handle case where Redis returns an object instead of JSON string
    if (typeof jobData === 'object') {
      return jobData as ClickatronJob;
    }
    
    // Parse JSON string
    if (typeof jobData === 'string') {
      return JSON.parse(jobData) as ClickatronJob;
    }
    
    console.error('Unexpected Redis data type for job:', typeof jobData, jobData);
    return null;
  } catch (error) {
    console.error('Error parsing job data:', error);
    return null;
  }
}

/**
 * Update job status and progress
 */
export async function updateJob(
  jobId: string,
  updates: Partial<Pick<ClickatronJob, 'status' | 'progress' | 'stage' | 'resultRef' | 'error'>>
): Promise<ClickatronJob | null> {
  const redis = getRedisClient();
  const jobKey = REDIS_KEYS.job(jobId);

  const job = await getJob(jobId);
  if (!job) {
    return null;
  }

  // Update job fields
  const updatedJob: ClickatronJob = {
    ...job,
    ...updates,
    updatedAt: Date.now(),
  };

  // Add trace entry for significant changes
  if (updates.status || updates.stage || updates.progress) {
    const traceEntry: JobTraceEntry = {
      timestamp: Date.now(),
      stage: updates.stage || job.stage,
      progress: updates.progress ?? job.progress,
      message: updates.status ? `Status changed to ${updates.status}` : undefined,
    };
    updatedJob.trace = [...job.trace, traceEntry];
  }

  // Determine TTL based on status
  let ttl = JOB_TTL.ACTIVE;
  if (updatedJob.status === 'completed') {
    ttl = JOB_TTL.COMPLETED;
  } else if (updatedJob.status === 'failed' || updatedJob.status === 'canceled') {
    ttl = JOB_TTL.FAILED;
  }

  // Save updated job
  await redis.set(jobKey, JSON.stringify(updatedJob), { ex: ttl });

  // Update active jobs index if terminal
  if (['completed', 'failed', 'canceled'].includes(updatedJob.status)) {
    await redis.zrem(REDIS_KEYS.activeJobs, jobId);
  }

  return updatedJob;
}

/**
 * Mark job as running and update stage
 */
export async function startJob(jobId: string, stage: JobStage = 'prompting'): Promise<ClickatronJob | null> {
  return updateJob(jobId, {
    status: 'running',
    stage,
    progress: 5, // Start with 5% progress
  });
}

/**
 * Complete job successfully
 */
export async function completeJob(jobId: string, resultRef: string): Promise<ClickatronJob | null> {
  return updateJob(jobId, {
    status: 'completed',
    progress: 100,
    stage: 'finalizing',
    resultRef,
  });
}

/**
 * Fail job with error
 */
export async function failJob(jobId: string, error: JobError): Promise<ClickatronJob | null> {
  return updateJob(jobId, {
    status: 'failed',
    error,
  });
}

/**
 * Cancel job
 */
export async function cancelJob(jobId: string): Promise<ClickatronJob | null> {
  return updateJob(jobId, {
    status: 'canceled',
  });
}

/**
 * Check if job is in terminal state
 */
export function isTerminalStatus(status: JobStatus): boolean {
  return ['completed', 'failed', 'canceled'].includes(status);
}

/**
 * Get all jobs for a session
 */
export async function getSessionJobs(sessionId: string): Promise<ClickatronJob[]> {
  const redis = getRedisClient();
  const indexKey = REDIS_KEYS.jobIndex(sessionId);

  const jobIds = await redis.smembers(indexKey);
  if (jobIds.length === 0) {
    return [];
  }

  const jobs: ClickatronJob[] = [];
  for (const jobId of jobIds) {
    const job = await getJob(jobId);
    if (job) {
      jobs.push(job);
    }
  }

  return jobs.sort((a, b) => b.startedAt - a.startedAt);
}

/**
 * Clean up old jobs (for cron job)
 */
export async function cleanupOldJobs(): Promise<{ cleaned: number }> {
  const redis = getRedisClient();

  // Get jobs older than 30 days
  const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);

  const oldJobIds = await redis.zrange(
    REDIS_KEYS.activeJobs,
    0,
    thirtyDaysAgo,
    { byScore: true }
  ) as string[];

  let cleaned = 0;
  for (const jobId of oldJobIds) {
    try {
      const jobKey = REDIS_KEYS.job(jobId);
      await redis.del(jobKey);
      await redis.zrem(REDIS_KEYS.activeJobs, jobId);
      cleaned++;
    } catch (error) {
      console.error(`Failed to cleanup job ${jobId}:`, error);
      // Continue with next job even if this one fails
    }
  }

  return { cleaned };
}

/**
 * Set idempotency key
 */
export async function setIdempotencyKey(key: string, jobId: string): Promise<void> {
  const redis = getRedisClient();
  const idempotencyKey = REDIS_KEYS.idempotency(key);
  await redis.set(idempotencyKey, jobId, { ex: 24 * 60 * 60 }); // 24 hours
}

/**
 * Get job ID by idempotency key
 */
export async function getIdempotencyKey(key: string): Promise<string | null> {
  const redis = getRedisClient();
  const idempotencyKey = REDIS_KEYS.idempotency(key);
  return redis.get<string>(idempotencyKey);
}

/**
 * Validate job ownership
 */
export async function validateJobOwnership(jobId: string, userId: string): Promise<boolean> {
  const job = await getJob(jobId);
  return job ? job.userId === userId : false;
}