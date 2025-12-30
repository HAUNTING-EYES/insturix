/**
 * ThinkForge Database Service Layer
 * Simple, robust database operations for ThinkForge
 */

import mongoose, { Schema, Model } from 'mongoose';
import connectToDatabase from '@/schemas/ConnectToDatabase';
import type { ChatMessage, ProjectMeta, ScriptState } from '../state/types';
import type { BlockTree } from '../schemas/canonical';

// Collection names
const COLL_SESSIONS = 'thinkforge_sessions';
const COLL_SCRIPTS = 'thinkforge_scripts';
const COLL_CHAT = 'thinkforge_chat';
const COLL_USERS = 'thinkforge_users';
const COLL_RATE_USAGE = 'thinkforge_rate_usage';

// Types
export interface Session {
  _id: string;
  userId: string;
  projectMeta?: ProjectMeta;
  createdAt: Date;
  updatedAt: Date;
}

export interface Script {
  _id: string;
  sessionId: string;
  title: string;
  content: string;
  blocks?: BlockTree;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatMessageDoc {
  _id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
}

export interface UserPreferences {
  _id: string;
  preferences: Record<string, any>;
  updatedAt: Date;
}

// Mongoose Schemas
const SessionSchema = new Schema({
  _id: { type: String, required: true },
  userId: { type: String, required: true, index: true },
  projectMeta: { type: Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { collection: COLL_SESSIONS, timestamps: false });

const ScriptSchema = new Schema({
  sessionId: { type: String, required: true, index: true },
  title: { type: String, required: true },
  content: { type: String, default: '' },
  blocks: { type: Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { collection: COLL_SCRIPTS, timestamps: false });

const ChatMessageSchema = new Schema({
  sessionId: { type: String, required: true, index: true },
  role: { type: String, required: true, enum: ['user', 'assistant'] },
  content: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
}, { collection: COLL_CHAT, timestamps: false });

const UserSchema = new Schema({
  _id: { type: String, required: true },
  preferences: { type: Schema.Types.Mixed, default: {} },
  updatedAt: { type: Date, default: Date.now }
}, { collection: COLL_USERS, timestamps: false });

const RateUsageSchema = new Schema({
  userId: { type: String, required: true, index: true },
  sessionId: { type: String, required: true, index: true },
  planName: { type: String, required: true },
  count: { type: Number, default: 0 },
  resetAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { collection: COLL_RATE_USAGE, timestamps: false });

// Model getters
let SessionModel: Model<any>;
let ScriptModel: Model<any>;
let ChatModel: Model<any>;
let UserModel: Model<any>;
let RateUsageModel: Model<any>;

async function getModels() {
  await connectToDatabase();
  
  if (!SessionModel) {
    SessionModel = mongoose.models[COLL_SESSIONS] || mongoose.model(COLL_SESSIONS, SessionSchema);
  }
  if (!ScriptModel) {
    ScriptModel = mongoose.models[COLL_SCRIPTS] || mongoose.model(COLL_SCRIPTS, ScriptSchema);
  }
  if (!ChatModel) {
    ChatModel = mongoose.models[COLL_CHAT] || mongoose.model(COLL_CHAT, ChatMessageSchema);
  }
  if (!UserModel) {
    UserModel = mongoose.models[COLL_USERS] || mongoose.model(COLL_USERS, UserSchema);
  }
  if (!RateUsageModel) {
    RateUsageModel = mongoose.models[COLL_RATE_USAGE] || mongoose.model(COLL_RATE_USAGE, RateUsageSchema);
  }
  
  return { SessionModel, ScriptModel, ChatModel, UserModel, RateUsageModel };
}

// ==================== Session Operations ====================

export async function getSession(sessionId: string, userId: string): Promise<Session | null> {
  try {
    const { SessionModel } = await getModels();
    const doc = await SessionModel.findOne({ _id: sessionId, userId }).lean() as any;
    if (!doc) return null;
    return {
      _id: String(doc._id),
      userId: doc.userId,
      projectMeta: doc.projectMeta || {},
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt
    };
  } catch (error) {
    console.error('Error getting session:', error);
    return null;
  }
}

export async function getOrCreateSession(
  userId: string,
  sessionId?: string,
  projectMeta?: ProjectMeta
): Promise<Session> {
  try {
    const { SessionModel } = await getModels();
    
    if (sessionId) {
      const existing = await SessionModel.findOne({ _id: sessionId, userId }).lean() as any;
      if (existing) {
        // Update projectMeta if provided
        if (projectMeta) {
          await SessionModel.updateOne(
            { _id: sessionId },
            { $set: { projectMeta, updatedAt: new Date() } }
          );
          return {
            _id: String(existing._id),
            userId: existing.userId,
            projectMeta,
            createdAt: existing.createdAt,
            updatedAt: new Date()
          };
        }
        return {
          _id: String(existing._id),
          userId: existing.userId,
          projectMeta: existing.projectMeta || {},
          createdAt: existing.createdAt,
          updatedAt: existing.updatedAt
        };
      }
    }
    
    // Create new session
    const newSessionId = sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date();
    const doc = {
      _id: newSessionId,
      userId,
      projectMeta: projectMeta || {},
      createdAt: now,
      updatedAt: now
    };
    
    await SessionModel.create(doc);
    return doc;
  } catch (error) {
    console.error('Error creating session:', error);
    throw error;
  }
}

export async function updateSession(sessionId: string, updates: Partial<Session>): Promise<Session> {
  try {
    const { SessionModel } = await getModels();
    const updateDoc = {
      ...updates,
      updatedAt: new Date()
    };
    
    const doc = await SessionModel.findByIdAndUpdate(
      sessionId,
      { $set: updateDoc },
      { new: true, lean: true }
    ) as any;
    
    if (!doc) {
      throw new Error(`Session ${sessionId} not found`);
    }
    
    return {
      _id: String(doc._id),
      userId: doc.userId,
      projectMeta: doc.projectMeta || {},
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt
    };
  } catch (error) {
    console.error('Error updating session:', error);
    throw error;
  }
}

// ==================== Script Operations ====================

export async function getScript(sessionId: string): Promise<Script | null> {
  try {
    const { ScriptModel } = await getModels();
    const doc = await ScriptModel.findOne({ sessionId })
      .sort({ updatedAt: -1 })
      .lean() as any;
    
    if (!doc) return null;
    
    return {
      _id: String(doc._id),
      sessionId: doc.sessionId,
      title: doc.title,
      content: doc.content || '',
      blocks: doc.blocks,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt
    };
  } catch (error) {
    console.error('Error getting script:', error);
    return null;
  }
}

export async function saveScript(sessionId: string, script: Partial<Script>): Promise<Script> {
  try {
    const { ScriptModel } = await getModels();
    const now = new Date();
    
    // Check if script exists
    const existing = await ScriptModel.findOne({ sessionId }).sort({ updatedAt: -1 });
    
    if (existing) {
      // Update existing
      const updateDoc = {
        title: script.title ?? existing.title,
        content: script.content ?? existing.content,
        blocks: script.blocks ?? existing.blocks,
        updatedAt: now
      };
      
      await ScriptModel.findByIdAndUpdate(existing._id, { $set: updateDoc });
      const updated = await ScriptModel.findById(existing._id).lean() as any;
      if (!updated) throw new Error('Failed to update script');
      
      return {
        _id: String(updated._id),
        sessionId: updated.sessionId,
        title: updated.title,
        content: updated.content || '',
        blocks: updated.blocks,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt
      };
    } else {
      // Create new
      const doc = {
        sessionId,
        title: script.title || 'Untitled Script',
        content: script.content || '',
        blocks: script.blocks || [],
        createdAt: now,
        updatedAt: now
      };
      
      const created = await ScriptModel.create(doc);
      return {
        _id: String(created._id),
        sessionId: created.sessionId,
        title: created.title,
        content: created.content || '',
        blocks: created.blocks,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt
      };
    }
  } catch (error) {
    console.error('Error saving script:', error);
    throw error;
  }
}

export async function updateScript(sessionId: string, updates: Partial<Script>): Promise<Script> {
  try {
    const { ScriptModel } = await getModels();
    const existing = await ScriptModel.findOne({ sessionId }).sort({ updatedAt: -1 });
    
    if (!existing) {
      throw new Error(`Script not found for session ${sessionId}`);
    }
    
    const updateDoc = {
      ...updates,
      updatedAt: new Date()
    };
    
    await ScriptModel.findByIdAndUpdate(existing._id, { $set: updateDoc });
    const updated = await ScriptModel.findById(existing._id).lean() as any;
    if (!updated) throw new Error('Failed to update script');
    
    return {
      _id: String(updated._id),
      sessionId: updated.sessionId,
      title: updated.title,
      content: updated.content || '',
      blocks: updated.blocks,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt
    };
  } catch (error) {
    console.error('Error updating script:', error);
    throw error;
  }
}

// ==================== Chat Operations ====================

export async function appendChatMessage(
  sessionId: string,
  role: 'user' | 'assistant',
  content: string
): Promise<void> {
  try {
    const { ChatModel } = await getModels();
    await ChatModel.create({
      sessionId,
      role,
      content,
      createdAt: new Date()
    });
  } catch (error) {
    console.error('Error appending chat message:', error);
    throw error;
  }
}

export async function getChatHistory(sessionId: string, limit: number = 50): Promise<ChatMessage[]> {
  try {
    const { ChatModel } = await getModels();
    const docs = await ChatModel.find({ sessionId })
      .sort({ createdAt: 1 })
      .limit(limit)
      .lean() as any[];
    
    return docs.map(doc => ({
      role: doc.role,
      content: doc.content,
      createdAt: doc.createdAt,
      _id: String(doc._id)
    }));
  } catch (error) {
    console.error('Error getting chat history:', error);
    return [];
  }
}

// ==================== User Operations ====================

export async function getUserPreferences(userId: string): Promise<Record<string, any>> {
  try {
    const { UserModel } = await getModels();
    const doc = await UserModel.findById(userId).lean() as any;
    return doc?.preferences || {};
  } catch (error) {
    console.error('Error getting user preferences:', error);
    return {};
  }
}

export async function saveUserPreferences(userId: string, preferences: Record<string, any>): Promise<void> {
  try {
    const { UserModel } = await getModels();
    await UserModel.findByIdAndUpdate(
      userId,
      {
        $set: {
          preferences,
          updatedAt: new Date()
        }
      },
      { upsert: true }
    );
  } catch (error) {
    console.error('Error saving user preferences:', error);
    throw error;
  }
}

// ==================== Rate Limiting ====================

export async function checkChatLimit(
  userId: string,
  sessionId: string,
  planName: string
): Promise<boolean> {
  try {
    const { RateUsageModel } = await getModels();
    
    // Plan limits (messages per week)
    const limits: Record<string, number> = {
      free: 50,
      pro: 500,
      premium: 5000
    };
    
    const maxAllowed = limits[planName.toLowerCase()] || limits.free;
    const now = new Date();
    const resetAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days from now
    
    // Find or create usage record
    let usage = await RateUsageModel.findOne({ userId, sessionId, planName });
    
    if (!usage) {
      usage = await RateUsageModel.create({
        userId,
        sessionId,
        planName,
        count: 0,
        resetAt
      });
    }
    
    // Check if reset needed
    if (usage.resetAt < now) {
      usage.count = 0;
      usage.resetAt = resetAt;
      await usage.save();
    }
    
    return usage.count < maxAllowed;
  } catch (error) {
    console.error('Error checking chat limit:', error);
    // Fail open - allow request on error
    return true;
  }
}

export async function recordChatUsage(userId: string, sessionId: string): Promise<void> {
  try {
    const { RateUsageModel } = await getModels();
    
    // Get plan name from user (default to 'free')
    // For now, we'll use a default - in production, get from user profile
    const planName = 'free';
    
    const now = new Date();
    const resetAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    await RateUsageModel.findOneAndUpdate(
      { userId, sessionId, planName },
      {
        $inc: { count: 1 },
        $setOnInsert: { resetAt, createdAt: now },
        $set: { updatedAt: now }
      },
      { upsert: true }
    );
  } catch (error) {
    console.error('Error recording chat usage:', error);
    // Don't throw - usage tracking is best effort
  }
}

