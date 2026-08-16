import type { BlockTree } from "@/lib/thinkforge/schemas/canonical";
import type { CIRDocument, CIRSection } from "@/lib/thinkforge/schemas/cir";
import type { TiptapJSON } from "@/lib/thinkforge/schemas/tiptap-schema";
import type { ContentCard } from "@/lib/thinkforge/planning/content-card-contract";
import type { DocumentType, SidecarCard, SidecarCardAction } from "@/lib/thinkforge/state/types";
import type { ThinkForgeAuthoringRequest } from "@/lib/thinkforge/schemas/authoring-request";

export type { ContentCard, DocumentType, SidecarCard, SidecarCardAction };

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
  durationSec?: number;
  sessionName?: string;
  originalPrompt?: string;
  brandBrief?: string;
  authoringRequest?: ThinkForgeAuthoringRequest;
}

export interface Script {
  title?: string;
  version?: number;
  scriptId?: string;
  documentType?: DocumentType;
  originalPrompt?: string;
  duration?: string;
  targetAudience?: string;
  tone?: ThinkingHat;
  // Rich text HTML body for the new editor
  body?: string;
  // Canonical TipTap document from the backend/editor runtime
  richText?: TiptapJSON;
  // Canonical block tree (new canonical format)
  blocks?: BlockTree | CIRDocument | CIRSection[];
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
    canonicalFormat?: 'CIR' | 'canonical';
    agent_steps?: Array<{
      agent?: string;
      step?: string;
      output?: string;
    }>;
    quality_metrics?: {
      score?: number;
      feedback?: string;
    };
    selectionEdit?: {
      applySurgically?: boolean;
      editedBlocks?: any[];
      originalRange?: { from: number; to: number };
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
