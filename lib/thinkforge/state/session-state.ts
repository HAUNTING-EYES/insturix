/**
 * Session State Management
 * Centralized session state store with MongoDB persistence
 */

import mongoose, { Schema, Model } from 'mongoose';
import connectToDatabase from '@/schemas/ConnectToDatabase';
import type { SessionState, ChatMessage, ScriptState, ProjectMeta, IdeaCardData } from './types';
import type { BlockTree } from '../schemas/canonical';

// MongoDB schemas
const ChatMessageSchema = new Schema({
  role: { type: String, required: true, enum: ['user', 'assistant'] },
  content: { type: String, required: true },
  ts: { type: Number },
  createdAt: { type: Date, default: Date.now }
}, { _id: true });

const ScriptStateSchema = new Schema({
  title: { type: String, required: true },
  blocks: { type: Schema.Types.Mixed, required: true },
  content: { type: String, required: true },
  draft: { type: Boolean, default: true },
  version: { type: Number, default: 1 },
  parentScriptId: { type: String },
  forkReason: { type: String },
  createdFromIntent: { type: String }
}, { _id: false });

const SessionSchema = new Schema({
  _id: { type: String, required: true },
  userId: { type: String, required: true, index: true },
  chat: { type: [ChatMessageSchema], default: [] },
  script: { type: ScriptStateSchema, default: null },
  ideas: { type: Schema.Types.Mixed, default: [] },
  metadata: { type: Schema.Types.Mixed, default: {} },
  version: { type: Number, default: 1 },
  lastUpdated: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now }
}, { collection: 'thinkforge_sessions', timestamps: false });

let SessionModel: Model<any>;

async function getSessionModel() {
  if (!SessionModel) {
    await connectToDatabase();
    SessionModel = mongoose.models.thinkforge_sessions || mongoose.model('thinkforge_sessions', SessionSchema);
  }
  return SessionModel;
}

/**
 * Get session state from MongoDB
 */
export async function getSessionState(sessionId: string, userId?: string): Promise<SessionState | null> {
  try {
    const Model = await getSessionModel();
    const doc = await Model.findById(sessionId).lean();
    
    if (!doc) return null;
    
    // Check ownership if userId provided
    if (userId && doc.userId !== userId) {
      return null;
    }
    
    return {
      sessionId: doc._id,
      userId: doc.userId,
      chat: doc.chat || [],
      script: doc.script || null,
      ideas: doc.ideas || [],
      metadata: doc.metadata || {},
      version: doc.version || 1,
      lastUpdated: doc.lastUpdated || new Date()
    };
  } catch (error) {
    console.error('Error getting session state:', error);
    return null;
  }
}

/**
 * Create or update session state atomically
 */
export async function updateSessionState(
  sessionId: string,
  userId: string,
  updates: Partial<SessionState>
): Promise<SessionState> {
  try {
    const Model = await getSessionModel();
    
    const updateDoc: any = {
      ...updates,
      userId,
      lastUpdated: new Date()
    };
    
    // Remove undefined fields
    Object.keys(updateDoc).forEach(key => {
      if (updateDoc[key] === undefined) {
        delete updateDoc[key];
      }
    });
    
    // Increment version for conflict detection
    const incVersion = updates.script || updates.chat || updates.metadata;
    
    const update: any = {
      $set: updateDoc,
      $setOnInsert: { _id: sessionId, userId, version: 1, createdAt: new Date() }
    };
    
    if (incVersion) {
      update.$inc = { version: 1 };
    }
    
    const doc = await Model.findByIdAndUpdate(
      sessionId,
      update,
      { upsert: true, new: true, lean: true }
    );
    
    return {
      sessionId: doc._id,
      userId: doc.userId,
      chat: doc.chat || [],
      script: doc.script || null,
      ideas: doc.ideas || [],
      metadata: doc.metadata || {},
      version: doc.version || 1,
      lastUpdated: doc.lastUpdated || new Date()
    };
  } catch (error) {
    console.error('Error updating session state:', error);
    throw error;
  }
}

/**
 * Append chat message to session
 */
export async function appendChatMessage(
  sessionId: string,
  userId: string,
  role: 'user' | 'assistant',
  content: string
): Promise<void> {
  try {
    const Model = await getSessionModel();
    await Model.findByIdAndUpdate(
      sessionId,
      {
        $push: {
          chat: {
            role,
            content,
            ts: Date.now(),
            createdAt: new Date()
          }
        },
        $inc: { version: 1 },
        $set: { lastUpdated: new Date() }
      },
      { upsert: true }
    );
  } catch (error) {
    console.error('Error appending chat message:', error);
    throw error;
  }
}

/**
 * Update script state
 */
export async function updateScriptState(
  sessionId: string,
  userId: string,
  script: ScriptState
): Promise<void> {
  try {
    const Model = await getSessionModel();
    await Model.findByIdAndUpdate(
      sessionId,
      {
        $set: {
          script,
          lastUpdated: new Date()
        },
        $inc: { version: 1 }
      },
      { upsert: true }
    );
  } catch (error) {
    console.error('Error updating script state:', error);
    throw error;
  }
}

