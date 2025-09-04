import { z } from 'zod';

// Main Task Interface (matches the new MongoDB schema)
export interface IClickatronTask {
  _id?: string;
  clerkUserId: string;
  title?: string;
  status?: 'pending' | 'processing' | 'completed' | 'failed';
  details: {
    videoIdea: string;
    aspectRatio: string;
    ideas?: Idea[];
    selectedIdea?: Idea;
    canvas?: Canvas;
    workflow?: {
      stage: 'ideation' | 'canvas';
      workflowVersion: number;
    };
  };
  error_message?: string;
  createdAt: Date;
  updatedAt: Date;
  refunded?: boolean;
}

// Data Structures
export interface Idea {
  id: string;
  title: string;
  description: string;
  prompt: string;
}

export interface Canvas {
  variations: Variation[];
}

export interface Variation {
  id: string;
  prompt: string; // Can be empty string for blank variations
  status: 'completed' | 'generating' | 'blank'; // Added blank status
  imageRef: string; // Can be empty string for blank variations
  aspectRatio: string; // Moved from session to variation
  fineTuning?: FineTuningControls;
}

export interface FineTuningControls {
  brightness: number;
  contrast: number;
  saturation: number;
}


// API Request/Response Types

// POST /api/services/clickatron/session
export interface CreateSessionRequest {
  videoIdea: string;
  aspectRatio: string;
}

export const CreateSessionRequestSchema = z.object({
  videoIdea: z.string().min(1, "Idea cannot be empty"),
  // Accept integers or decimals for width and height, e.g. '16:9' or '1.85:1'
  aspectRatio: z
    .string()
    .regex(/^\d+(?:\.\d+)?:\d+(?:\.\d+)?$/, "Aspect ratio must be in format 'W:H'"),
});

export interface CreateSessionResponse {
  sessionId: string;
  ideas: Idea[];
}

// POST /api/services/clickatron/session/[id]/ideas/select
export interface SelectIdeaRequest {
  selectedIdea: Idea;
}

export const SelectIdeaRequestSchema = z.object({
  selectedIdea: z.object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    prompt: z.string(),
  }),
});

// POST /api/services/clickatron/session/[id]/variation
export interface CreateVariationRequest {
  prompt: string;
  fineTuning?: FineTuningControls;
  referenceImages?: string[]; // Store as data URLs
  metadata?: Record<string, any>;
}

export const CreateVariationRequestSchema = z.object({
  prompt: z.string().min(1, "Prompt is required"),
  fineTuning: z.object({
    brightness: z.number().min(0).max(200).default(100),
    contrast: z.number().min(0).max(200).default(100),
    saturation: z.number().min(0).max(200).default(100),
  }).optional(),
  referenceImages: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional(),
});

// PATCH /api/services/clickatron/session/[id]/variation/[varId]
export interface UpdateVariationRequest {
  status?: 'completed' | 'failed' | 'generating';
  imageRef?: string;
  fineTuning?: FineTuningControls;
  metadata?: Record<string, any>;
}

export const UpdateVariationRequestSchema = z.object({
  status: z.enum(['completed', 'failed', 'generating']).optional(),
  imageRef: z.string().optional(),
  fineTuning: z.object({
    brightness: z.number().min(0).max(200),
    contrast: z.number().min(0).max(200),
    saturation: z.number().min(0).max(200),
  }).optional(),
  metadata: z.record(z.any()).optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: "At least one field must be provided for update",
});

// PATCH /api/services/clickatron/session/[id]
export interface SyncCanvasRequest {
  canvas: Canvas;
}

export const SyncCanvasRequestSchema = z.object({
  canvas: z.object({
    variations: z.array(z.any()), // Basic validation, can be improved
  }),
});


// Zustand Store Types
export interface ClickatronStore {
  task: IClickatronTask | null;
  isSaving: boolean;
  saveError: string | null;
  lastSaved: Date | null;
  setTask: (task: IClickatronTask) => void;
  updateCanvas: (canvas: Canvas) => void;

  // Actions
  createSession: (request: CreateSessionRequest) => Promise<string | null>; // Returns sessionId
  selectIdea: (sessionId: string, idea: Idea) => Promise<boolean>;
  syncCanvas: (sessionId: string, canvas: Canvas) => Promise<void>;
  loadSession: (sessionId: string) => Promise<void>;
}
