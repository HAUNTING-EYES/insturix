/**
 * Chat Service
 * 
 * Service layer for chat session management and message storage
 */

import { getDatabase, COLLECTIONS } from '../db/mongodb';
import { nanoid } from 'nanoid';
import type { AuthorizedChatAttachment } from './chat-attachment-contract';
import type { ChatRequestOwnerLicense } from '../agent/chat-request-owner';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  timestamp: Date;
  attachments?: AuthorizedChatAttachment[];
  requestOwnerLicense?: ChatRequestOwnerLicense;
  toolCalls?: Array<{
    id: string;
    name: string;
    args: any;
  }>;
  toolResults?: Array<{
    toolCallId: string;
    toolName: string;
    result: any;
  }>;
  checkpointIds?: string[]; // Checkpoints created during this message
}

export interface ChatSession {
  _id?: any;
  sessionId: string;
  userId: string;
  projectId: string;
  name?: string; // User-defined session name
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
}

export class ChatService {
  /**
   * Create a new chat session
   */
  async createSession(userId: string, projectId: string, name?: string): Promise<string> {
    const db = await getDatabase();
    const sessionId = `sess_${Date.now()}_${nanoid(7)}`;

    const session: ChatSession = {
      sessionId,
      userId,
      projectId,
      name: name || `Chat ${new Date().toLocaleDateString()}`,
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.collection(COLLECTIONS.CHAT_SESSIONS).insertOne(session);

    console.log(`[CHAT] Created session ${sessionId} for project ${projectId}`);
    return sessionId;
  }

  /**
   * Save a message to a session
   */
  async saveMessage(
    sessionId: string,
    userId: string,
    projectId: string,
    message: Omit<ChatMessage, 'timestamp'>
  ): Promise<void> {
    const db = await getDatabase();

    const messageWithTimestamp: ChatMessage = {
      ...message,
      timestamp: new Date(),
    };

    const result = await db.collection(COLLECTIONS.CHAT_SESSIONS).updateOne(
      { sessionId, userId, projectId },
      {
        $push: { messages: messageWithTimestamp } as any,
        $set: { updatedAt: new Date() },
      }
    );

    if (result.matchedCount !== 1) {
      throw new Error('Chat session is not accessible for this project');
    }

    console.log(`[CHAT] Saved ${message.role} message to session ${sessionId}`);
  }

  /**
   * Get session history
   */
  async getSessionHistory(
    sessionId: string,
    userId: string,
    projectId: string,
  ): Promise<ChatMessage[] | null> {
    const db = await getDatabase();

    const session = await db
      .collection(COLLECTIONS.CHAT_SESSIONS)
      .findOne({ sessionId, userId, projectId });

    if (!session) {
      return null;
    }

    return session.messages || [];
  }

  /**
   * Get or create session for a project
   * If a session already exists, return it. Otherwise create new.
   */
  async getOrCreateSession(userId: string, projectId: string, sessionId?: string): Promise<string> {
    if (sessionId) {
      // Check if session exists
      const db = await getDatabase();
      const session = await db
        .collection(COLLECTIONS.CHAT_SESSIONS)
        .findOne({ sessionId, userId, projectId });

      if (session) {
        return sessionId;
      }
    }

    // Create new session
    return this.createSession(userId, projectId);
  }

  /**
   * List all sessions for a project
   */
  async listProjectSessions(projectId: string, userId: string): Promise<ChatSession[]> {
    const db = await getDatabase();

    const sessions = await db
      .collection(COLLECTIONS.CHAT_SESSIONS)
      .find({ projectId, userId })
      .sort({ updatedAt: -1 })
      .toArray();

    return sessions.map((s) => ({
      sessionId: s.sessionId,
      userId: s.userId,
      projectId: s.projectId,
      messages: s.messages || [],
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));
  }

  /**
   * Delete all sessions for a project
   */
  async deleteProjectSessions(projectId: string): Promise<void> {
    const db = await getDatabase();
    await db.collection(COLLECTIONS.CHAT_SESSIONS).deleteMany({ projectId });
    console.log(`[CHAT] Deleted all sessions for project ${projectId}`);
  }

  /**
   * Delete a specific session
   */
  async deleteSession(sessionId: string, userId: string): Promise<boolean> {
    const db = await getDatabase();
    const result = await db.collection(COLLECTIONS.CHAT_SESSIONS).deleteOne({ 
      sessionId, 
      userId 
    });
    console.log(`[CHAT] Deleted session ${sessionId}`);
    return result.deletedCount > 0;
  }

  /**
   * Rename a session
   */
  async renameSession(sessionId: string, userId: string, newName: string): Promise<boolean> {
    const db = await getDatabase();
    const result = await db.collection(COLLECTIONS.CHAT_SESSIONS).updateOne(
      { sessionId, userId },
      { $set: { name: newName, updatedAt: new Date() } }
    );
    console.log(`[CHAT] Renamed session ${sessionId} to "${newName}"`);
    return result.modifiedCount > 0;
  }

  /**
   * Get a single session
   */
  async getSession(
    sessionId: string,
    userId: string,
    projectId: string,
  ): Promise<ChatSession | null> {
    const db = await getDatabase();
    const session = await db
      .collection(COLLECTIONS.CHAT_SESSIONS)
      .findOne({ sessionId, userId, projectId });
    
    if (!session) return null;

    return {
      sessionId: session.sessionId,
      userId: session.userId,
      projectId: session.projectId,
      name: session.name,
      messages: session.messages || [],
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }
}

export const chatService = new ChatService();
