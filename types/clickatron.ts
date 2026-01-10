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
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  variationId?: string; // Link to variation if this message generated one
  referenceImages?: string[]; // Store reference image data URLs
}

export interface Canvas {
  variations: Variation[];
  chatHistory: ChatMessage[];
}

export interface Variation {
  id: string;
  prompt: string; // Can be empty string for blank variations
  status: 'completed' | 'generating' | 'blank' | 'failed';
  imageRef: string; // Can be empty string for blank variations
  thumbnailRef?: string;
  aspectRatio: string;
  fineTuning: FineTuningControls;
  createdAt: Date;
  updatedAt: Date;
  parentVariationId?: string; // For tracking edit relationships
  // AI generation metadata
  modelId: string; // Renamed from modelUsed and now required
  seed?: number;
  generationParams?: Record<string, any>;
  referenceImageRefs?: string[];
  metadata?: Record<string, any>;
  error?: string;
}

export interface CurvePoint {
  x: number;
  y: number;
}

export interface ColorCurves {
  master: CurvePoint[];
  red: CurvePoint[];
  green: CurvePoint[];
  blue: CurvePoint[];
}

export interface FineTuningControls {
  brightness: number;
  contrast: number;
  saturation: number;
  curves?: ColorCurves;
}


// API Request/Response Types

// POST /api/services/clickatron/session
export const CreateSessionRequestSchema = z.object({
  prompt: z.string().min(1, "Prompt cannot be empty"),
  aspectRatio: z
    .string()
    .regex(/^\d+(?:\.\d+)?:\d+(?:\.\d+)?$/, "Aspect ratio must be in format 'W:H'"),
  modelId: z.string().min(1, "Model ID is required"),
});

export type CreateSessionRequest = z.infer<typeof CreateSessionRequestSchema>;

export interface CreateSessionResponse {
  sessionId: string;
  variation: Variation;
}


// POST /api/services/clickatron/session/[id]/variation
export interface CreateVariationRequest {
  prompt: string;
  modelId: string; // Now required
  parentVariationId?: string; // For editing existing variations
  updateExistingBlank?: boolean; // For generating on an existing blank variation
  fineTuning?: FineTuningControls;
  referenceImages?: string[]; // Store as data URLs (deprecated, use referenceImageRefs in Variation)
  metadata?: Record<string, any>;
}

export const CreateVariationRequestSchema = z.object({
  prompt: z.string().min(1, "Prompt is required"),
  modelId: z.string().min(1, "Model ID is required").optional(),
  aspectRatio: z
    .string()
    .regex(/^\d+(?:\.\d+)?:\d+(?:\.\d+)?$/, "Aspect ratio must be in format 'W:H'")
    .optional(),
  parentVariationId: z.string().optional(), // For editing existing variations
  updateExistingBlank: z.boolean().optional(), // For generating on an existing blank variation
  fineTuning: z.object({
    brightness: z.number().min(0).max(200),
    contrast: z.number().min(0).max(200),
    saturation: z.number().min(0).max(200),
  }).optional(),
  referenceImages: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  sessionId: z.string().optional(), // Added to match route validation
});

// PATCH /api/services/clickatron/session/[id]/variation/[varId]
export interface UpdateVariationRequest {
  status?: 'completed' | 'failed' | 'generating';
  imageRef?: string;
  thumbnailRef?: string; 
  fineTuning?: FineTuningControls;
  metadata?: Record<string, any>;
}

export const UpdateVariationRequestSchema = z.object({
  status: z.enum(['completed', 'failed', 'generating']).optional(),
  imageRef: z.string().optional(),
  thumbnailRef: z.string().optional(),
  fineTuning: z.object({
    brightness: z.number().min(0).max(200),
    contrast: z.number().min(0).max(200),
    saturation: z.number().min(0).max(200),
  }).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
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


// Job Management Types
export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'canceled';
export type JobStage = 'queued' | 'prompting' | 'generating' | 'processing' | 'finalizing';

export interface JobError {
  code: string;
  message: string;
  details?: any;
}

export interface JobTraceEntry {
  timestamp: number;
  stage: JobStage;
  progress: number;
  message?: string;
}

export interface ClickatronJob {
  id: string;
  userId: string;
  sessionId: string;
  variationId: string;
  prompt: string;
  status: JobStatus;
  progress: number;
  stage: JobStage;
  attempt: number;
  startedAt: number;
  updatedAt: number;
  completedAt?: number;
  resultRef?: string;
  error?: JobError;
  trace: JobTraceEntry[];
  parentVariationId?: string;
  fineTuning?: FineTuningControls;
  metadata?: Record<string, any>;
  modelId?: string;
  referenceImageRefs?: string[];
}

export interface CreateJobRequest {
  sessionId: string;
  variationId: string;
  prompt: string;
  userId: string;
  parentVariationId?: string;
  fineTuning?: FineTuningControls;
  metadata?: Record<string, any>;
  modelId?: string;
  aspectRatio: string;
  referenceImageRefs?: string[]; // GCS URIs of reference images
  maskUrl?: string; // Optional generative fill mask URL (GCS URI)
}

export interface WorkerPayload {
  jobId: string;
  sessionId: string;
  variationId: string;
  prompt: string;
  userId: string;
  parentVariationId?: string;
  modelId?: string;
  fineTuning?: FineTuningControls;
  metadata?: Record<string, any>;
  aspectRatio: string;
  referenceImageRefs?: string[]; // GCS URIs of reference images
  maskUrl?: string; // Optional generative fill mask URL (GCS URI)
}

// Zustand Store Types
export interface ClickatronStore {
  task: IClickatronTask | null;
  isSaving: boolean;
  saveError: string | null;
  lastSaved: Date | null;
  editModelId: string | undefined;
  setTask: (task: IClickatronTask) => void;
  updateCanvas: (canvas: Canvas) => void;
  setCanvasFromBackend: (canvas: Canvas) => void;
  updateVariation: (variationId: string, newVariationData: Partial<Variation>) => void;
  setEditModelId: (modelId: string | null) => void;

  // Actions
  createSession: (formData: FormData) => Promise<{ sessionId: string, variation: Variation } | null>;
  syncCanvas: (sessionId: string, canvas: Canvas) => Promise<void>;
  loadSession: (sessionId: string) => Promise<void>;
}
