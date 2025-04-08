import { VideoType, AnalysisStatus } from '@/app/api/services/alyzitron/types';

// Client-side types that avoid server-only dependencies
export interface ClientAlyzitronAnalysis {
  _id: string;  // Using string instead of ObjectId for client-side
  clerkUserId: string;
  videoUrl: string;
  gcsPath: string;
  type: VideoType;
  status: AnalysisStatus;
  taskId: string;
  estimatedTime: number;
  expectedDurationSeconds?: number; // Add expected duration
  processingStartTime?: number; // Timestamp in ms when processing started
  queuePosition?: number;
  unread: boolean;
  results: Record<string, unknown> | null;
  error?: {
    code: string;
    message: string;
    action?: string;
  };
  metadata: {
    originalFilename: string;
    videoSize: number;
    videoDuration: number;
    mimeType: string;
    title?: string;
    description?: string;
    niche?: string;
    target_audience?: string;
    additional_details?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}