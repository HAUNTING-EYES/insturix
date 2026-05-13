/**
 * Shared types for the proxy upload workflow.
 * Used by: multipart-uploader.ts, upload-progress-bar.tsx, project-dashboard.tsx
 */

// ─── Progress ────────────────────────────────────────────────────

export interface UploadProgress {
  loaded: number;
  total: number;
  percent: number;
  bytesPerSecond: number;
  estimatedSecondsRemaining: number;
}

// ─── Status ──────────────────────────────────────────────────────

export type UploadStatus =
  | 'idle'
  | 'compressing'
  | 'uploading-proxy'
  | 'uploading-original'
  | 'swap-pending'
  | 'complete'
  | 'error'
  | 'paused';

// ─── State machine ───────────────────────────────────────────────

export interface UploadState {
  status: UploadStatus;
  proxyProgress: UploadProgress | null;
  originalProgress: UploadProgress | null;
  assetId: string | null;
  uploadId: string | null;
  r2Key: string | null;
  readUrl: string | null;
  error: string | null;
  completedParts: CompletedPart[];
}

export interface CompletedPart {
  ETag: string;
  PartNumber: number;
}

export const INITIAL_UPLOAD_STATE: UploadState = {
  status: 'idle',
  proxyProgress: null,
  originalProgress: null,
  assetId: null,
  uploadId: null,
  r2Key: null,
  readUrl: null,
  error: null,
  completedParts: [],
};

// ─── Actions ─────────────────────────────────────────────────────

export type UploadAction =
  | { type: 'START_COMPRESS' }
  | { type: 'COMPRESS_DONE' }
  | { type: 'START_PROXY_UPLOAD' }
  | { type: 'PROXY_PROGRESS'; progress: UploadProgress }
  | { type: 'PROXY_DONE'; assetId: string; readUrl: string }
  | { type: 'START_ORIGINAL_UPLOAD'; uploadId: string; r2Key: string; assetId: string }
  | { type: 'ORIGINAL_PROGRESS'; progress: UploadProgress }
  | { type: 'PART_COMPLETED'; part: CompletedPart }
  | { type: 'ORIGINAL_DONE' }
  | { type: 'SWAP_DONE' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'ERROR'; error: string }
  | { type: 'RESET' };

// ─── Reducer ─────────────────────────────────────────────────────

export function uploadReducer(state: UploadState, action: UploadAction): UploadState {
  switch (action.type) {
    case 'START_COMPRESS':
      return { ...state, status: 'compressing', error: null };

    case 'COMPRESS_DONE':
      return { ...state, status: 'uploading-proxy' };

    case 'START_PROXY_UPLOAD':
      return { ...state, status: 'uploading-proxy', error: null };

    case 'PROXY_PROGRESS':
      return { ...state, proxyProgress: action.progress };

    case 'PROXY_DONE':
      return {
        ...state,
        status: 'uploading-original',
        assetId: action.assetId,
        readUrl: action.readUrl,
        proxyProgress: null,
      };

    case 'START_ORIGINAL_UPLOAD':
      return {
        ...state,
        status: 'uploading-original',
        uploadId: action.uploadId,
        r2Key: action.r2Key,
        assetId: action.assetId,
        error: null,
      };

    case 'ORIGINAL_PROGRESS':
      return { ...state, originalProgress: action.progress };

    case 'PART_COMPLETED':
      return {
        ...state,
        completedParts: [...state.completedParts, action.part],
      };

    case 'ORIGINAL_DONE':
      return { ...state, status: 'swap-pending', originalProgress: null };

    case 'SWAP_DONE':
      return { ...state, status: 'complete' };

    case 'PAUSE':
      return { ...state, status: 'paused' };

    case 'RESUME':
      return { ...state, status: 'uploading-original', error: null };

    case 'ERROR':
      return { ...state, status: 'error', error: action.error };

    case 'RESET':
      return INITIAL_UPLOAD_STATE;

    default:
      return state;
  }
}
