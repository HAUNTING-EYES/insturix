/**
 * Session state types for ThinkForge
 */

import type { ThinkForgeBlock } from '../schemas/thinkforge-block';
import type { ScriptIntent } from '../protocol/intent';

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
  sessionName?: string;
}

export interface ProjectMeta {
  idea?: string;
  purpose?: string;
  style?: string;
  format?: string;
  platform?: string;
  tone?: string;
  sessionName?: string;
  preferences?: Record<string, any>;
}

export interface ScriptState {
  title: string;
  blocks: ThinkForgeBlock[];
  content: string;
  draft: boolean;
  version: number;
  parentScriptId?: string;
  forkReason?: string;
  createdFromIntent?: ScriptIntent;
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

