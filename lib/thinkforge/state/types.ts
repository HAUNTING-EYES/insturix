/**
 * Session state types for ThinkForge
 */

import type { BlockTree } from '../schemas/canonical';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  ts?: number;
  createdAt?: Date;
  _id?: string;
  id?: string;
}

export interface IdeaCardData {
  id: string;
  idea: string;
  purpose: string;
  style: string;
  format: string;
  platform: string;
  tone: string;
  projectName?: string;
}

export interface ProjectMeta {
  idea?: string;
  purpose?: string;
  style?: string;
  format?: string;
  platform?: string;
  tone?: string;
  projectName?: string;
  preferences?: Record<string, any>;
}

export interface ScriptState {
  title: string;
  blocks: BlockTree;
  content: string;
  draft: boolean;
  version: number;
}

export interface SessionState {
  sessionId: string;
  userId: string;
  chat: ChatMessage[];
  script: ScriptState | null;
  ideas: IdeaCardData[];
  metadata: ProjectMeta;
  version: number;
  lastUpdated: Date;
}

