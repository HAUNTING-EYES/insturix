/**
 * Session State Management
 * Centralized session state store with MongoDB persistence
 */

import mongoose, { Schema, Model } from 'mongoose';
import connectToDatabase from '@/schemas/ConnectToDatabase';
import type { SessionState, ChatMessage, ScriptState, ProjectMeta, IdeaCardData } from './types';

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
  richText: { type: Schema.Types.Mixed },
  draft: { type: Boolean, default: true },
  version: { type: Number, default: 1 },
  documentType: { type: String },
  parentScriptId: { type: String },
  forkReason: { type: String },
  createdFromIntent: { type: String }
}, { _id: false });

const SessionSchema = new Schema({
  _id: { type: String, required: true },
  userId: { type: String, required: true, index: true },
  chat: { type: [ChatMessageSchema], default: [] },
  script: { type: ScriptStateSchema, default: null },
  documents: { type: [ScriptStateSchema], default: [] },
  activeDocumentId: { type: String },
  ideas: { type: Schema.Types.Mixed, default: [] },
  metadata: { type: Schema.Types.Mixed, default: {} },
  complexity: { type: String },
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

type SessionDocument = {
  _id: string;
  userId: string;
  chat?: ChatMessage[];
  script?: ScriptState | null;
  documents?: ScriptState[];
  activeDocumentId?: string;
  ideas?: IdeaCardData[];
  metadata?: ProjectMeta;
  complexity?: SessionState['complexity'];
  version?: number;
  lastUpdated?: Date;
};

function resolveSessionDocuments(doc: Pick<SessionDocument, 'documents' | 'script'>): ScriptState[] {
  if (Array.isArray(doc.documents) && doc.documents.length > 0) {
    return doc.documents;
  }
  return doc.script ? [doc.script] : [];
}

function toSessionState(doc: SessionDocument): SessionState {
  return {
    sessionId: doc._id,
    userId: doc.userId,
    chat: doc.chat || [],
    script: doc.script || null,
    documents: resolveSessionDocuments(doc),
    activeDocumentId: doc.activeDocumentId,
    ideas: doc.ideas || [],
    metadata: doc.metadata || {},
    complexity: doc.complexity,
    version: doc.version || 1,
    lastUpdated: doc.lastUpdated || new Date()
  };
}
/**
 * Get session state from MongoDB
 */
export async function getSessionState(sessionId: string, userId?: string): Promise<SessionState | null> {
  try {
    const Model = await getSessionModel();
    const doc = await Model.findById(sessionId).lean().exec() as SessionDocument | null;
    
    if (!doc) return null;
    
    // Check ownership if userId provided
    if (userId && doc.userId !== userId) {
      return null;
    }
    
    return toSessionState(doc);
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

    if ('script' in updates && updates.script !== undefined && updates.documents === undefined) {
      updateDoc.documents = updates.script ? [updates.script] : [];
    }
    
    // Remove undefined fields
    Object.keys(updateDoc).forEach(key => {
      if (updateDoc[key] === undefined) {
        delete updateDoc[key];
      }
    });
    
    // Increment version for conflict detection
    const incVersion = updates.script || updates.documents || updates.chat || updates.metadata;
    
    const update: any = {
      $set: updateDoc,
      $setOnInsert: { _id: sessionId, userId, documents: [], version: 1, createdAt: new Date() }
    };
    
    if (incVersion) {
      update.$inc = { version: 1 };
    }
    
    const doc = await Model.findByIdAndUpdate(
      sessionId,
      update,
      { upsert: true, new: true, lean: true }
    ).exec() as SessionDocument | null;

    if (!doc) {
      throw new Error(`Failed to update ThinkForge session ${sessionId}`);
    }
    
    return toSessionState(doc);
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
          documents: [script],
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

