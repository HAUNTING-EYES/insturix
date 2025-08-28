// Unified Clickatron types for migration from legacy to new canvas suite

// Legacy schema (must remain compatible)
export interface IClickatronTask {
  _id?: string;
  clerkUserId: string;
  title?: string; // used as a human label
  details: any;   // stores original request payload / structured prompt JSON
  status: TaskStatus;
  results?: { thumbnail: { prompt: string; gcs_url: string }; details?: string };
  error_message?: string;
  createdAt: Date; 
  updatedAt: Date; 
  completedAt?: Date; 
  refunded?: boolean;
}

export type TaskStatus = 'listed' | 'queued' | 'processing' | 'completed' | 'failed';

// New session model (client-side only, now unified with legacy schema)
export interface TaskData {
  videoIdea: string;
  timestamp: number;
  stage: 'ideation' | 'canvas';
  selectedDirection?: string;         // maps to chosen creative direction → becomes part of prompt
  selectedPreset?: CanvasPreset;      // preset configuration
  referenceImage?: ReferenceImageMeta | null; // stored locally
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

// Canvas variations
export interface Variation {
  id: string;
  prompt: string;
  timestamp: number;
  status: VariationStatus;
  fineTuning?: FineTuningControls;
  imageRef?: string; // Reference to generated image
  referenceImages?: string[]; // Array of image IDs used as input
  metadata?: {
    aspectRatio?: string;
    dimensions?: string;
    style?: string;
  };
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
}

export interface CanvasData {
  variations: Variation[];
  // Future: additional canvas-specific data
}

// Unified document structure (extends legacy schema)
export interface ClickatronSession extends IClickatronTask {
  // Legacy fields remain unchanged
  clerkUserId: string;
  title?: string;
  details: any;
  status: TaskStatus;
  results?: { thumbnail: { prompt: string; gcs_url: string }; details?: string };
  error_message?: string;
  createdAt: Date; 
  updatedAt: Date; 
  completedAt?: Date; 
  refunded?: boolean;
  
  // New workflow section (nested under details)
  'details.workflow'?: WorkflowData;
  
  // New canvas section (nested under details)
  'details.canvas'?: CanvasData;
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
  session: ClickatronSession;
  isLegacyAdapted: boolean; // indicates if this was a legacy task that got auto-migrated
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
  fetchBackendSession: (sessionId: string) => Promise<ClickatronSession>;
  createVariation: (request: CreateVariationRequest) => Promise<string>;
  updateVariation: (variationId: string, updates: UpdateVariationRequest) => Promise<void>;
  commitVariation: (request: CommitVariationRequest) => Promise<CommitVariationResponse>;
}

// Utility types
export type LegacyTask = Omit<IClickatronTask, 'details.workflow' | 'details.canvas'>;

export interface AdaptedLegacyTask extends ClickatronSession {
  _isAdapted: true; // type marker for runtime identification
}

export interface SessionLoadResult {
  success: boolean;
  session?: ClickatronSession;
  isLegacy?: boolean;
  error?: string;
}

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
