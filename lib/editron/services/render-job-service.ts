import { Collection } from 'mongodb';
import { getDatabase } from '@/lib/editron/db/mongodb';
import { RenderJob, createRenderJob } from '../schemas/render-job';

const COLLECTION_NAME = 'editron_render_jobs';

async function getCollection(): Promise<Collection<RenderJob>> {
  const db = await getDatabase();
  return db.collection<RenderJob>(COLLECTION_NAME);
}

/**
 * Create a new render job when Lambda render starts
 */
export async function createJob(
  renderId: string,
  userId: string,
  projectId: string,
  bucketName?: string
): Promise<RenderJob> {
  const collection = await getCollection();
  const job = createRenderJob(renderId, userId, projectId, bucketName);
  
  console.log('Creating render job:', { _id: job._id, userId, projectId });
  
  const result = await collection.insertOne(job as any);
  
  console.log('Insert result:', { 
    acknowledged: result.acknowledged, 
    insertedId: result.insertedId 
  });
  
  if (!result.acknowledged) {
    throw new Error('Failed to insert render job');
  }
  
  return job;
}

/**
 * Update job progress
 */
export async function updateJobProgress(
  renderId: string,
  progress: number
): Promise<void> {
  const collection = await getCollection();
  await collection.updateOne(
    { _id: renderId },
    { $set: { progress } }
  );
}

/**
 * Mark job as completed
 */
export async function completeJob(
  renderId: string,
  outputUrl: string,
  outputSize: number
): Promise<void> {
  const collection = await getCollection();
  await collection.updateOne(
    { _id: renderId },
    { 
      $set: { 
        status: 'done',
        progress: 1,
        outputUrl,
        outputSize,
        completedAt: new Date()
      } 
    }
  );
}

/**
 * Mark job as failed
 */
export async function failJob(
  renderId: string,
  error: string
): Promise<void> {
  const collection = await getCollection();
  await collection.updateOne(
    { _id: renderId },
    { 
      $set: { 
        status: 'error',
        error,
        completedAt: new Date()
      } 
    }
  );
}

/**
 * Get active render for a project (for resume-on-refresh)
 */
export async function getActiveRenderForProject(
  projectId: string,
  userId: string
): Promise<RenderJob | null> {
  const collection = await getCollection();
  return collection.findOne({
    projectId,
    userId,
    status: { $in: ['rendering', 'queued', 'pending'] }
  });
}

/**
 * Get all active renders for a user
 */
export async function getActiveRendersForUser(
  userId: string
): Promise<RenderJob[]> {
  const collection = await getCollection();
  return collection.find({
    userId,
    status: { $in: ['rendering', 'queued', 'pending'] }
  }).toArray();
}

/**
 * Get job by ID
 */
export async function getJob(renderId: string): Promise<RenderJob | null> {
  const collection = await getCollection();
  return collection.findOne({ _id: renderId });
}

/**
 * Count active renders (for concurrency limiting)
 */
export async function countActiveRenders(): Promise<number> {
  const collection = await getCollection();
  return collection.countDocuments({
    status: { $in: ['rendering', 'pending'] }
  });
}

/**
 * Get render history for a project (for persistent render list)
 * Returns completed and failed renders, sorted by most recent first
 */
export async function getRenderHistoryForProject(
  projectId: string,
  userId: string,
  limit: number = 10
): Promise<RenderJob[]> {
  const collection = await getCollection();
  return collection.find({
    projectId,
    userId,
    status: { $in: ['done', 'error'] }
  })
  .sort({ completedAt: -1 })
  .limit(limit)
  .toArray();
}
