export interface IClickatronTask {
  _id?: string;
  clerkUserId: string;
  title?: string; // used as a human label
  details: {
    workflow: WorkflowData;
    canvas: CanvasData;
  };
  error_message?: string;
  createdAt: Date;
  updatedAt: Date;
  refunded?: boolean;
}

export interface TaskData {
  videoIdea: string;
  timestamp: number;
  stage: 'ideation' | 'canvas';
  selectedDirection?: string;
  selectedPreset?: CanvasPreset;
  referenceImage?: ReferenceImageMeta | null;
}

export interface CanvasPreset {
  id: string;
  name: string;
  aspectRatio: string;
  dimensions: string;
  promptText: string;
  placeholder: string;
}

export interface ReferenceImageMeta {
  name: string;
  size: number;
  type: string;
  imageId: string; // Reference to image in IndexedDB
}

export interface GeneratedIdea {
  id: string;
  title: string;
  description: string;
  prompt: string;
  generatedAt: Date;
}

// Enhanced variation with GCS storage
export interface Variation {
  id: string;
  prompt: string;
  timestamp: number;
  status: VariationStatus;
  fineTuning?: FineTuningControls;
  imageRef?: string; // GCS URL for generated image
  referenceImages?: string[]; // Array of GCS URLs used as input
  metadata?: {
    aspectRatio?: string;
    dimensions?: string;
    style?: string;
    gcsPath?: string; // Full GCS path
    fileSize?: number; // File size in bytes
    contentType?: string; // MIME type
  };
  jobId?: string; // Associated async job ID
  createdAt: Date;
  updatedAt: Date;
}


export type VariationStatus = 'generating' | 'completed' | 'failed';

export interface FineTuningControls {
  brightness: number;
  contrast: number;
  saturation: number;
}

// Workflow and Canvas sections (to be nested under details in legacy schema)
export interface WorkflowData {
  videoIdea: string;
  stage: 'ideation' | 'canvas';
  selectedPreset?: CanvasPreset;
  selectedDirection?: string;
  referenceImageMeta?: ReferenceImageMeta;
  workflowVersion?: number; // for future silent migrations

  // Comprehensive audit trail
  generatedIdeas?: GeneratedIdea[];
  selectedIdea?: GeneratedIdea;
  generatedDirections?: CreativeDirection[];
  selectedDirectionData?: CreativeDirection;
  committedVariation?: Variation;
}

export interface CanvasData {
  variations: Variation[];
  committedVariationId?: string; // ID of the committed variation
  // Future: additional canvas-specific data
}

// Creative directions generated during ideation
export interface CreativeDirection {
  id: string;
  title: string;
  description: string;
  prompt: string;
  generatedAt: Date;
}

// API request/response types
export interface CreateSessionRequest {
  clerkUserId: string;
  videoIdea: string;
  preset?: CanvasPreset;
  referenceImage?: ReferenceImageMeta;
}

export interface CreateSessionResponse {
  sessionId: string;
  taskData: TaskData;
}

export interface GetSessionResponse {
  session: IClickatronTask;
  isLegacyAdapted: boolean;
}

export interface UpsertSessionRequest {
  workflow?: Partial<WorkflowData>;
  canvas?: Partial<CanvasData>;
}

export interface CreateVariationRequest {
  sessionId: string;
  prompt: string;
  referenceImages?: string[];
  fineTuning?: FineTuningControls;
  metadata?: {
    aspectRatio?: string;
    dimensions?: string;
    style?: string;
  };
}

export interface CreateVariationResponse {
  variationId: string;
  status: VariationStatus;
  estimatedTime?: number; // seconds
}

export interface UpdateVariationRequest {
  fineTuning?: FineTuningControls;
  metadata?: {
    aspectRatio?: string;
    dimensions?: string;
    style?: string;
  };
}

export interface GenerateIdeaRequest {
  prompt: string;
  count?: number;
  style?: 'professional' | 'creative' | 'minimal' | 'bold';
}

export interface GenerateDirectionsRequest {
  videoIdea: string;
  selectedPreset?: CanvasPreset;
  style?: 'professional' | 'creative' | 'minimal' | 'bold';
  count?: number;
}

// Enhanced API types for comprehensive audit trail
export interface StoreIdeasRequest {
  sessionId: string;
  ideas: GeneratedIdea[];
  selectedIdeaId?: string;
}

export interface StoreDirectionsRequest {
  sessionId: string;
  directions: CreativeDirection[];
  selectedDirectionId?: string;
}


export interface CommitVariationRequest {
  variationId: string;
  finalPrompt?: string;
}

export interface GenerateIdeaResponse {
  success: boolean;
  ideas: Array<{
    id: string;
    title: string;
    description: string;
    prompt: string;
    tags: string[];
  }>;
  metadata: {
    prompt: string;
    count: number;
    style?: string;
    generatedAt: string;
  };
}

export interface GenerateDirectionsResponse {
  success: boolean;
  directions: Array<{
    id: string;
    title: string;
    description: string;
    prompt: string;
    tags: string[];
    styleHints: string[];
  }>;
  metadata: {
    videoIdea: string;
    preset?: CanvasPreset;
    style?: string;
    generatedAt: string;
  };
}

export interface CommitVariationResponse {
  success: boolean;
  thumbnailUrl?: string;
  taskId: string;
}

// Store types (extended from existing useCanvasStore)
export interface CanvasStoreState {
  // Existing fields
  taskData: TaskData | null;
  taskId: string | null;
  loadError: string | null;
  variations: Variation[];
  activeVariationId: string | null;
  fineTuningControls: FineTuningControls;
  galleryCollapsed: boolean;
  zoomLevel: number;
  panOffset: { x: number; y: number };
  history: string[];
  historyIndex: number;
  isGenerating: boolean;
  isLoading: boolean;
  
  // New fields for backend sync
  sessionId: string | null;
  backendSynced: boolean;
  isDirty: boolean; // indicates local changes not yet synced to backend
  syncError: string | null;
}

export interface CanvasStoreActions {
  // Existing actions
  setTaskData: (taskData: TaskData) => void;
  setTaskId: (taskId: string) => void;
  updateTaskData: (updates: Partial<TaskData>) => Promise<void>;
  loadTaskData: (taskId: string) => Promise<boolean>;
  addVariation: (variation: Variation) => void;
  removeVariation: (variationId: string) => void;
  setActiveVariation: (variationId: string) => void;
  duplicateVariation: (variationId: string) => void;
  updateFineTuning: (key: keyof FineTuningControls, value: number) => void;
  resetFineTuning: () => void;
  setGalleryCollapsed: (collapsed: boolean) => void;
  setZoomLevel: (level: number) => void;
  setPanOffset: (offset: { x: number; y: number }) => void;
  addToHistory: (variationId: string) => void;
  undo: () => void;
  redo: () => void;
  setIsGenerating: (generating: boolean) => void;
  setIsLoading: (loading: boolean) => void;
  reset: () => void;
  saveSession: () => Promise<void>;
  
  // New actions for backend sync
  setSessionId: (sessionId: string) => void;
  setBackendSynced: (synced: boolean) => void;
  setIsDirty: (dirty: boolean) => void;
  setSyncError: (error: string | null) => void;
  persistToBackend: (updates: UpsertSessionRequest) => Promise<void>;
  createBackendSession: (request: CreateSessionRequest) => Promise<string>;
  fetchBackendSession: (sessionId: string) => Promise<IClickatronTask>;
  createVariation: (request: CreateVariationRequest) => Promise<string>;
  updateVariation: (variationId: string, updates: UpdateVariationRequest) => Promise<void>;
  commitVariation: (request: CommitVariationRequest) => Promise<CommitVariationResponse>;
}

// Utility types

// Error types
export interface ClickatronError {
  type: 'VALIDATION_ERROR' | 'AUTH_ERROR' | 'NOT_FOUND' | 'RATE_LIMIT' | 'BACKEND_ERROR' | 'NETWORK_ERROR';
  message: string;
  details?: any;
}

// Zod validation schemas (for server-side validation)
import { z } from 'zod';

export const CreateSessionRequestSchema = z.object({
  clerkUserId: z.string(),
  videoIdea: z.string().min(1).max(500),
  preset: z.object({
    id: z.string(),
    name: z.string(),
    aspectRatio: z.string(),
    dimensions: z.string(),
    promptText: z.string(),
    placeholder: z.string(),
  }).optional(),
  referenceImage: z.object({
    name: z.string(),
    size: z.number(),
    type: z.string(),
    imageId: z.string(),
  }).optional(),
});

export const CreateVariationRequestSchema = z.object({
  sessionId: z.string(),
  prompt: z.string().min(1).max(1000),
  referenceImages: z.array(z.string()).optional(),
  fineTuning: z.object({
    brightness: z.number().min(0).max(200),
    contrast: z.number().min(0).max(200),
    saturation: z.number().min(0).max(200),
  }).optional(),
  metadata: z.object({
    aspectRatio: z.string().optional(),
    dimensions: z.string().optional(),
    style: z.string().optional(),
  }).optional(),
});

export const UpdateVariationRequestSchema = z.object({
  fineTuning: z.object({
    brightness: z.number().min(0).max(200),
    contrast: z.number().min(0).max(200),
    saturation: z.number().min(0).max(200),
  }).optional(),
  metadata: z.object({
    aspectRatio: z.string().optional(),
    dimensions: z.string().optional(),
    style: z.string().optional(),
  }).optional(),
});

export const GenerateIdeaRequestSchema = z.object({
  prompt: z.string().min(1).max(500),
  count: z.number().min(1).max(5).default(3),
  style: z.enum(['professional', 'creative', 'minimal', 'bold']).optional(),
});

export const GenerateDirectionsRequestSchema = z.object({
  videoIdea: z.string().min(1),
  selectedPreset: z.object({
    id: z.string(),
    name: z.string(),
    aspectRatio: z.string(),
    dimensions: z.string(),
    promptText: z.string(),
  }).optional(),
  style: z.enum(['professional', 'creative', 'minimal', 'bold']).optional(),
  count: z.number().min(1).max(5).default(3),
});

export const CommitVariationRequestSchema = z.object({
  variationId: z.string(),
  finalPrompt: z.string().optional(),
});

// QStash Job Types (for async generation)
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
  resultRef?: string;
  error?: JobError;
  trace: JobTraceEntry[];
  fineTuning?: FineTuningControls;
  metadata?: {
    aspectRatio?: string;
    dimensions?: string;
    style?: string;
  };
}

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'canceled';
export type JobStage = 'queued' | 'prompting' | 'generating' | 'refining' | 'finalizing';

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

// Job API request/response types
export interface CreateJobRequest {
  sessionId: string;
  variationId: string;
  prompt: string;
  userId: string;
  fineTuning?: FineTuningControls;
  metadata?: {
    aspectRatio?: string;
    dimensions?: string;
    style?: string;
  };
}

export interface CreateJobResponse {
  jobId: string;
  variationId: string;
  status: JobStatus;
  estimatedTime?: number;
}

export interface JobStatusResponse {
  job: ClickatronJob;
  isTerminal: boolean;
}

export interface CancelJobResponse {
  success: boolean;
  previousStatus: JobStatus;
}

// SSE Event types
export interface JobStatusEvent {
  type: 'status' | 'progress' | 'completed' | 'failed' | 'canceled';
  data: Partial<ClickatronJob>;
  timestamp: number;
}

// Worker execution types
export interface WorkerPayload extends CreateJobRequest {
  jobId: string;
}

export interface WorkerResponse {
  success: boolean;
  resultRef?: string;
  error?: JobError;
}

// Job validation schemas
export const CreateJobRequestSchema = z.object({
  sessionId: z.string(),
  variationId: z.string(),
  prompt: z.string().min(1).max(1000),
  userId: z.string(),
  fineTuning: z.object({
    brightness: z.number().min(0).max(200),
    contrast: z.number().min(0).max(200),
    saturation: z.number().min(0).max(200),
  }).optional(),
  metadata: z.object({
    aspectRatio: z.string().optional(),
    dimensions: z.string().optional(),
    style: z.string().optional(),
  }).optional(),
});

export const WorkerPayloadSchema = CreateJobRequestSchema.extend({
  jobId: z.string(),
});
