/**
 * Background Job Queue for Script Refinement
 * Simple queue implementation using MongoDB (since BullMQ requires Redis connection)
 * For production, consider using a proper job queue service
 */

import type { SessionState } from '../state/types';
import type { BlockTree } from '../schemas/canonical';
import { refineScriptDraft } from '../agents/script-refinement-agent';
import { getSessionState } from '../state/session-state';
import mongoose, { Schema, Model } from 'mongoose';
import connectToDatabase from '@/schemas/ConnectToDatabase';

// Simple job schema for MongoDB
const RefinementJobSchema = new Schema({
  sessionId: { type: String, required: true, index: true },
  userId: { type: String, required: true },
  instruction: { type: String, required: true },
  draftBlocks: { type: Schema.Types.Mixed, required: true },
  status: { type: String, enum: ['pending', 'processing', 'completed', 'failed'], default: 'pending' },
  attempts: { type: Number, default: 0 },
  maxAttempts: { type: Number, default: 3 },
  error: { type: String },
  createdAt: { type: Date, default: Date.now },
  processedAt: { type: Date }
}, { collection: 'thinkforge_refinement_jobs' });

let RefinementJobModel: Model<any>;

async function getJobModel() {
  if (!RefinementJobModel) {
    await connectToDatabase();
    RefinementJobModel = mongoose.models.thinkforge_refinement_jobs || mongoose.model('thinkforge_refinement_jobs', RefinementJobSchema);
  }
  return RefinementJobModel;
}

/**
 * Queue script refinement job
 * Uses MongoDB as simple queue (process jobs in background via cron or separate worker)
 */
export async function queueRefinement(
  sessionId: string,
  userId: string,
  instruction: string,
  draftBlocks: BlockTree
): Promise<void> {
  try {
    const Model = await getJobModel();
    
    // Create job
    await Model.create({
      sessionId,
      userId,
      instruction,
      draftBlocks,
      status: 'pending'
    });
    
    console.log(`Queued refinement for session ${sessionId}`);
    
    // Process immediately (in production, this would be handled by a separate worker)
    // For now, process asynchronously without blocking
    processRefinementJob(sessionId, userId, instruction, draftBlocks).catch(error => {
      console.error(`Error processing refinement for session ${sessionId}:`, error);
    });
  } catch (error) {
    console.error('Error queueing refinement:', error);
    // Don't throw - queue failures shouldn't break the system
  }
}

/**
 * Process a refinement job
 */
async function processRefinementJob(
  sessionId: string,
  userId: string,
  instruction: string,
  draftBlocks: BlockTree
): Promise<void> {
  try {
    const Model = await getJobModel();
    
    // Mark as processing
    await Model.findOneAndUpdate(
      { sessionId, status: 'pending' },
      { status: 'processing', $inc: { attempts: 1 }, processedAt: new Date() }
    );
    
    // Load fresh session state
    const sessionState = await getSessionState(sessionId, userId);
    if (!sessionState) {
      throw new Error(`Session ${sessionId} not found`);
    }
    
    // Refine script
    await refineScriptDraft(sessionId, userId, instruction, draftBlocks, sessionState);
    
    // Mark as completed
    await Model.findOneAndUpdate(
      { sessionId, status: 'processing' },
      { status: 'completed' }
    );
    
    console.log(`Refinement completed for session ${sessionId}`);
  } catch (error) {
    console.error(`Refinement failed for session ${sessionId}:`, error);
    
    // Mark as failed
    try {
      const Model = await getJobModel();
      const job = await Model.findOne({ sessionId, status: 'processing' });
      if (job) {
        if (job.attempts < job.maxAttempts) {
          // Retry
          await Model.findByIdAndUpdate(job._id, {
            status: 'pending',
            error: String(error)
          });
        } else {
          // Max attempts reached
          await Model.findByIdAndUpdate(job._id, {
            status: 'failed',
            error: String(error)
          });
        }
      }
    } catch (updateError) {
      console.error('Error updating job status:', updateError);
    }
  }
}

/**
 * Get queue status (for monitoring)
 */
export async function getQueueStatus() {
  try {
    const Model = await getJobModel();
    const [pending, processing, completed, failed] = await Promise.all([
      Model.countDocuments({ status: 'pending' }),
      Model.countDocuments({ status: 'processing' }),
      Model.countDocuments({ status: 'completed' }),
      Model.countDocuments({ status: 'failed' })
    ]);
    
    return {
      available: true,
      waiting: pending,
      active: processing,
      completed,
      failed
    };
  } catch (error) {
    console.error('Error getting queue status:', error);
    return { available: false, error: String(error) };
  }
}

