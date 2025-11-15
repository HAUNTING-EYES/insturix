import type { BlockTree } from "@/lib/thinkforge/schemas/canonical";

export type WorkflowPhase = 'PROMPT' | 'IDEAS' | 'SELECTED' | 'CHAT' | 'SCRIPT';

export type ThinkingHat = 'white' | 'red' | 'black' | 'yellow' | 'green' | 'blue';

// Block ID type
export type BlockId = string;

export interface AnalyticsSummary {
  ideasGenerated: number;
  scriptsCreated: number;
  successRate: number;
}

export interface Idea {
  id: number;
  idea: string;
  purpose: string;
  style: string;
  format: string;
  platform: string;
  tone: ThinkingHat;
}

export interface Script {
  title?: string;
  originalPrompt?: string;
  duration?: string;
  targetAudience?: string;
  tone?: ThinkingHat;
  // Rich text HTML body for the new editor
  body?: string;
  // Canonical block tree (new canonical format)
  blocks?: BlockTree;
  // Legacy BlockNote document structure (kept for migration)
  blocksLegacy?: any[];
  sections?: Array<{
    name?: string;
    content?: string;
    notes?: string;
  }>;
  tips?: string[];
  // Legacy support for scripts that come as simple content string
  content?: string;
  // Orchestration metadata from agentic workflow
  metadata?: {
    workflow?: string;
    thoughts?: string;
    duration_ms?: number;
    agent_steps?: Array<{
      agent?: string;
      step?: string;
      output?: string;
    }>;
    quality_metrics?: {
      score?: number;
      feedback?: string;
    };
  };
}

// Script metadata type
export interface ScriptMetadata {
  scriptId: string;
  userId: string;
  title: string;
  blockIds: BlockId[];
  updatedAt: string;
  version: number;
  metadata?: Record<string, unknown>;
}

// Streaming event type
export type StreamingEvent = {
  event: "block_start" | "block_chunk" | "block_end" | "error" | "done";
  block?: import("@/lib/thinkforge/schemas/canonical").Block;
  blockId?: string;
  chunk?: string;
  message?: string;
};

// Cursor position type
export interface CursorPosition {
  blockId: BlockId;
  offset: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'ai';
  content: string;
  timestamp: Date;
}

export interface DynamicSuggestion {
  id: string;
  title: string;
  description: string;
  type: 'question' | 'action' | 'improvement';
  relevance: number;
}

export interface AnalyticsData {
  trendScore: number;
  viralPotential: number;
  audienceMatch: number;
  platformOptimization: number;
  suggestions: string[];
}

export interface UserSession {
  id: string;
  prompt: string;
  selectedIdea: Idea | null;
  chatHistory: ChatMessage[];
  generatedScript: Script | null;
  analytics: AnalyticsData | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ContentCard {
  id: string;
  title: string;
  date: string; // ISO string - primary date
  platform: "youtube" | "instagram" | "linkedin" | string; // allow custom platforms
  status: "scheduled" | "draft" | "published" | "in_production";
  tags: string[]; // legacy tags for backward compatibility
  aiScore?: number; // 0-100, optional
  // New fields for content planning
  ideaId?: string; // link to generated idea
  sessionId?: string; // link to script session
  scriptPreview?: string; // truncated script content (first 200-300 chars)
  customTags: string[]; // user-defined tags (e.g., "start production", "publish")
  idea?: {
    id?: string | number;
    idea: string;
    purpose: string;
    style: string;
    format: string;
    platform: string;
    tone: ThinkingHat | string;
  }; // full idea details
  details?: string; // additional notes/description
  plannedDates: string[]; // support multiple dates per card (ISO strings)
  createdAt?: string; // ISO string
  updatedAt?: string; // ISO string
} 