import { z } from 'zod';

import {
  RenderDeliveryManifestSchema,
  type RenderDeliveryManifest,
} from '@/lib/editron/services/render-delivery-manifest';

/**
 * Schema for Remotion Lambda render jobs stored in MongoDB
 * Collection: editron_render_jobs
 */

// Zod schema for validation
export const RenderJobSchema = z.object({
  _id: z.string(), // Editron-owned durable job ID (legacy rows use the Lambda render ID)
  userId: z.string(),
  projectId: z.string(),
  providerRenderId: z.string().optional(),
  status: z.enum(['pending', 'queued', 'rendering', 'done', 'error']),
  progress: z.number().min(0).max(1).default(0),
  outputUrl: z.string().optional(),
  outputSize: z.number().optional(),
  deliveryManifest: RenderDeliveryManifestSchema.optional(),
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
  bucketName?: string,
  deliveryManifest?: RenderDeliveryManifest,
): RenderJob {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + DEFAULT_EXPIRATION_DAYS * 24 * 60 * 60 * 1000);
  
  return {
    _id: renderId,
    userId,
    projectId,
    providerRenderId: renderId,
    status: 'rendering',
    progress: 0,
    startedAt: now,
    bucketName,
    ...(deliveryManifest ? { deliveryManifest } : {}),
    region: 'us-east-1',
    expiresAt,
  };
}

export function createPendingRenderJob(
  jobId: string,
  userId: string,
  projectId: string,
  region: string,
): RenderJob {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + DEFAULT_EXPIRATION_DAYS * 24 * 60 * 60 * 1000);

  return {
    _id: jobId,
    userId,
    projectId,
    status: 'pending',
    progress: 0,
    startedAt: now,
    region,
    expiresAt,
  };
}
