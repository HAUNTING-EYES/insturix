import { z } from 'zod';

/**
 * Schema for Remotion Lambda render jobs stored in MongoDB
 * Collection: editron_render_jobs
 */

// Zod schema for validation
export const RenderJobSchema = z.object({
  _id: z.string(), // renderId from Lambda
  userId: z.string(),
  projectId: z.string(),
  status: z.enum(['pending', 'queued', 'rendering', 'done', 'error']),
  progress: z.number().min(0).max(1).default(0),
  outputUrl: z.string().optional(),
  outputSize: z.number().optional(),
  startedAt: z.date(),
  completedAt: z.date().optional(),
  error: z.string().optional(),
  // For S3 cleanup tracking
  bucketName: z.string().optional(),
  region: z.string().default('us-east-1'),
  // TTL index field - MongoDB will auto-delete after this date
  expiresAt: z.date(),
});

export type RenderJob = z.infer<typeof RenderJobSchema>;

// Default expiration: 7 days after creation
export const DEFAULT_EXPIRATION_DAYS = 7;

export function createRenderJob(
  renderId: string,
  userId: string,
  projectId: string,
  bucketName?: string
): RenderJob {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + DEFAULT_EXPIRATION_DAYS * 24 * 60 * 60 * 1000);
  
  return {
    _id: renderId,
    userId,
    projectId,
    status: 'rendering',
    progress: 0,
    startedAt: now,
    bucketName,
    region: 'us-east-1',
    expiresAt,
  };
}
