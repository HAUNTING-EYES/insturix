export type WorkflowPhase = 'PROMPT' | 'IDEAS' | 'SELECTED' | 'CHAT' | 'SCRIPT';

export type ThinkingHat = 'white' | 'red' | 'black' | 'yellow' | 'green' | 'blue';

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
  // BlockNote document structure for better round-trip editing
  blocks?: any[];
  sections?: Array<{
    name?: string;
    content?: string;
    notes?: string;
  }>;
  tips?: string[];
  // Legacy support for scripts that come as simple content string
  content?: string;
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