import { Redis } from '@upstash/redis';
import {
  ClickatronJob,
  JobStatus,
  JobStage,
  JobError,
  CreateJobRequest
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

const IDEMPOTENCY_PENDING_TTL_SECONDS = 15 * 60;

const ATOMIC_JOB_TRANSITION_SCRIPT = `
local raw = redis.call("GET", KEYS[1])
if not raw then
  return cjson.encode({ outcome = "missing" })
end

local job = cjson.decode(raw)
local allowed = cjson.decode(ARGV[1])
local permitted = false
for _, status in ipairs(allowed) do
  if job.status == status then
    permitted = true
    break
  end
end

if not permitted then
  return cjson.encode({ outcome = "rejected", job = job })
end

local updates = cjson.decode(ARGV[2])
for key, value in pairs(updates) do
  job[key] = value
end
job.updatedAt = tonumber(ARGV[3])

if updates.status or updates.stage or updates.progress then
  job.trace = job.trace or {}
  table.insert(job.trace, {
    timestamp = tonumber(ARGV[3]),
    stage = updates.stage or job.stage,
    progress = updates.progress or job.progress,
    message = ARGV[5],
  })
end

local encoded = cjson.encode(job)
redis.call("SET", KEYS[1], encoded, "EX", tonumber(ARGV[4]))
if job.status == "completed" or job.status == "failed" or job.status == "canceled" then
  redis.call("ZREM", KEYS[2], job.id)
end

return cjson.encode({ outcome = "updated", job = job })
`;

const COMMIT_IDEMPOTENCY_SCRIPT = `
local current = redis.call("GET", KEYS[1])
if current ~= ARGV[1] then
  return 0
end
redis.call("SET", KEYS[1], ARGV[2], "EX", tonumber(ARGV[3]))
return 1
`;

const RELEASE_IDEMPOTENCY_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
`;

export interface AtomicJobTransitionResult {
  outcome: 'updated' | 'rejected' | 'missing';
  job: ClickatronJob | null;
}

export interface IdempotencyClaimResult {
  outcome: 'claimed' | 'existing';
  value: string;
}

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
    parentVariationId: jobData.parentVariationId,
    fineTuning: jobData.fineTuning,
    metadata: jobData.metadata,
    modelId: jobData.modelId,
    referenceImageRefs: jobData.referenceImageRefs,
  };

  const jobKey = REDIS_KEYS.job(jobId);
  const indexKey = REDIS_KEYS.jobIndex(jobData.sessionId);

  // The job record is the durable outbox. A transaction prevents a job from
  // existing without the indexes used by dispatch recovery and timeout cleanup.
  await redis.multi()
    .set(jobKey, JSON.stringify(job), { ex: JOB_TTL.ACTIVE })
    .sadd(indexKey, jobId)
    .expire(indexKey, JOB_TTL.COMPLETED)
    .zadd(REDIS_KEYS.activeJobs, {
      score: Date.now(),
      member: jobId,
    })
    .exec();

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
  const result = await transitionJobAtomically(
    jobId,
    ['queued', 'running'],
    updates,
    updates.status ? `Status changed to ${updates.status}` : 'Job progress updated',
  );
  return result.outcome === 'updated' ? result.job : null;
}

/**
 * Mark job as running and update stage
 */
export async function startJob(jobId: string, stage: JobStage = 'prompting'): Promise<ClickatronJob | null> {
  const result = await claimJobForExecution(jobId, stage);
  return result.outcome === 'updated' ? result.job : null;
}

export async function claimJobForExecution(
  jobId: string,
  stage: JobStage = 'prompting',
): Promise<AtomicJobTransitionResult> {
  return transitionJobAtomically(
    jobId,
    ['queued'],
    {
      status: 'running',
      stage,
      progress: 5,
    },
    'Job claimed for execution',
  );
}

/**
 * Complete job successfully
 */
export async function completeJob(jobId: string, resultRef: string): Promise<ClickatronJob | null> {
  const result = await transitionJobAtomically(
    jobId,
    ['running'],
    {
      status: 'completed',
      progress: 100,
      stage: 'finalizing',
      resultRef,
      completedAt: Date.now(),
    },
    'Job completed',
  );
  return result.outcome === 'updated' ? result.job : null;
}

/**
 * Fail job with error
 */
export async function failJob(jobId: string, error: JobError): Promise<ClickatronJob | null> {
  const result = await transitionJobAtomically(
    jobId,
    ['queued', 'running'],
    {
      status: 'failed',
      error,
    },
    `Job failed: ${error.code}`,
  );
  return result.outcome === 'updated' ? result.job : null;
}

/**
 * Fail a job only if no worker has claimed it yet.
 *
 * A dispatch timeout is ambiguous: QStash may have delivered the request even
 * when the publisher did not receive an acknowledgement. Refunding is safe only
 * when this queued-only transition wins.
 */
export async function failQueuedJob(jobId: string, error: JobError): Promise<AtomicJobTransitionResult> {
  return transitionJobAtomically(
    jobId,
    ['queued'],
    {
      status: 'failed',
      error,
    },
    `Queued job failed before dispatch: ${error.code}`,
  );
}

/**
 * Cancel job
 */
export async function cancelJob(jobId: string): Promise<ClickatronJob | null> {
  const result = await transitionJobAtomically(
    jobId,
    ['queued', 'running'],
    { status: 'canceled' },
    'Job canceled',
  );
  return result.outcome === 'updated' ? result.job : null;
}

export async function recordJobCreditTransaction(
  jobId: string,
  transactionId: string,
  chargedCredits: number,
): Promise<ClickatronJob | null> {
  const job = await getJob(jobId);
  if (!job || job.status !== 'queued') return null;
  const result = await transitionJobAtomically(
    jobId,
    ['queued'],
    {
      metadata: {
        ...(job.metadata || {}),
        creditTransactionId: transactionId,
        chargedCredits,
      },
    },
    'Credit transaction attached',
  );
  return result.outcome === 'updated' ? result.job : null;
}

export function getJobCreditTransaction(job: ClickatronJob): {
  transactionId?: string;
  chargedCredits?: number;
} {
  return {
    transactionId: typeof job.metadata?.creditTransactionId === 'string'
      ? job.metadata.creditTransactionId
      : undefined,
    chargedCredits: typeof job.metadata?.chargedCredits === 'number'
      ? job.metadata.chargedCredits
      : undefined,
  };
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

export async function claimIdempotencyKey(
  key: string,
  claimToken: string,
): Promise<IdempotencyClaimResult> {
  const redis = getRedisClient();
  const idempotencyKey = REDIS_KEYS.idempotency(key);
  const pendingValue = `pending:${claimToken}`;
  const claimed = await redis.set(idempotencyKey, pendingValue, {
    ex: IDEMPOTENCY_PENDING_TTL_SECONDS,
    nx: true,
  });
  if (claimed === 'OK') return { outcome: 'claimed', value: pendingValue };
  const existing = await redis.get<string>(idempotencyKey);
  return { outcome: 'existing', value: existing ?? pendingValue };
}

export async function commitIdempotencyKey(
  key: string,
  claimToken: string,
  sessionId: string,
): Promise<boolean> {
  const result = await getRedisClient().eval<[string, string, number], number>(
    COMMIT_IDEMPOTENCY_SCRIPT,
    [REDIS_KEYS.idempotency(key)],
    [`pending:${claimToken}`, sessionId, 24 * 60 * 60],
  );
  return result === 1;
}

export async function releaseIdempotencyKey(
  key: string,
  claimToken: string,
): Promise<void> {
  await getRedisClient().eval<[string], number>(
    RELEASE_IDEMPOTENCY_SCRIPT,
    [REDIS_KEYS.idempotency(key)],
    [`pending:${claimToken}`],
  );
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

/**
 * Check for and fail expired jobs
 */
export async function failExpiredJobs(): Promise<{ failed: number }> {
  const redis = getRedisClient();
  const result = { failed: 0 };
  
  try {
    // Get all active jobs
    const activeJobIds = await redis.zrange(REDIS_KEYS.activeJobs, 0, -1) as string[];
    
    for (const jobId of activeJobIds) {
      try {
        const job = await getJob(jobId);
        if (!job) continue;
        
        // Check if job has been active for too long (e.g., 10 minutes)
        const timeSinceStart = Date.now() - job.startedAt;
        const maxJobDuration = 10 * 60 * 1000; // 10 minutes in milliseconds
        
        if (timeSinceStart > maxJobDuration && job.status === 'running') {
          // Mark job as failed due to timeout
          await failJob(jobId, {
            code: 'JOB_TIMEOUT',
            message: 'Job timed out after 10 minutes',
          });
          result.failed++;
        } else if (timeSinceStart > maxJobDuration && job.status === 'queued') {
          // Mark queued jobs as failed if they've been queued for too long
          await failJob(jobId, {
            code: 'JOB_QUEUE_TIMEOUT',
            message: 'Job stayed in queue for too long',
          });
          result.failed++;
        }
      } catch (error) {
        console.error(`Error processing job ${jobId} for timeout check:`, error);
      }
    }
  } catch (error) {
    console.error('Error in failExpiredJobs:', error);
  }
  
  return result;
}

async function transitionJobAtomically(
  jobId: string,
  allowedStatuses: JobStatus[],
  updates: Partial<ClickatronJob>,
  traceMessage: string,
): Promise<AtomicJobTransitionResult> {
  const status = updates.status;
  const ttl = status === 'completed'
    ? JOB_TTL.COMPLETED
    : status === 'failed' || status === 'canceled'
      ? JOB_TTL.FAILED
      : JOB_TTL.ACTIVE;
  const raw = await getRedisClient().eval<
    [string, string, number, number, string],
    string
  >(
    ATOMIC_JOB_TRANSITION_SCRIPT,
    [REDIS_KEYS.job(jobId), REDIS_KEYS.activeJobs],
    [
      JSON.stringify(allowedStatuses),
      JSON.stringify(updates),
      Date.now(),
      ttl,
      traceMessage,
    ],
  );
  const parsed = JSON.parse(raw) as {
    outcome: AtomicJobTransitionResult['outcome'];
    job?: ClickatronJob;
  };
  return {
    outcome: parsed.outcome,
    job: parsed.job ?? null,
  };
}
