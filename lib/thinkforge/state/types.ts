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
  brandBrief?: string;
}

export interface ProjectMeta {
  idea?: string;
  purpose?: string;
  style?: string;
  format?: string;
  platform?: string;
  tone?: string;
  sessionName?: string;
  brandId?: string;
  brandBrief?: string;
  preferences?: Record<string, any>;
}

// ---------------------------------------------------------------------------
// Document Type & Complexity (Dynamic Blueprints)
// ---------------------------------------------------------------------------

export type DocumentType =
  | 'screenplay'
  | 'vfx_brief'
  | 'budget'
  | 'shot_list'
  | 'character_bible'
  | 'world_bible'
  | 'interview_questions'
  | 'score_direction'
  | 'research_brief'
  | 'custom';

export type ProjectComplexity = 'solo_ugc' | 'brand_doc' | 'short_film' | 'feature_film' | 'epic';

export interface ScriptState {
  title: string;
  blocks: ThinkForgeBlock[];
  content: string;
  draft: boolean;
  version: number;
  documentType?: DocumentType;
  parentScriptId?: string;
  forkReason?: string;
  createdFromIntent?: ScriptIntent;
}

export interface SessionState {
  sessionId: string;
  userId: string;
  chat: ChatMessage[];
  script: ScriptState | null;
  /** All documents in this session (multi-tab support) */
  documents: ScriptState[];
  /** Active document ID for the editor */
  activeDocumentId?: string;
  ideas: IdeaCardData[];
  metadata: ProjectMeta;
  /** Detected project complexity level */
  complexity?: ProjectComplexity;
  version: number;
  lastUpdated: Date;
}

// ---------------------------------------------------------------------------
// Sidecar Card Types (for structured agent outputs in the chat panel)
// ---------------------------------------------------------------------------

export type SidecarCardType =
  | 'asset'
  | 'context'
  | 'decision'
  | 'error'
  | 'action'
  | 'suggestion'
  | 'specialist_result';

export interface SidecarCard {
  id: string;
  type: SidecarCardType;
  title: string;
  body?: string;
  data?: Record<string, any>;
  actions?: SidecarCardAction[];
  dismissible?: boolean;
  timestamp?: number;
}

export interface SidecarCardAction {
  id: string;
  label: string;
  variant?: 'primary' | 'secondary' | 'destructive';
  payload?: Record<string, any>;
}

