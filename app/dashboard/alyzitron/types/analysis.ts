export interface Analysis {
  analysisId: string;
  taskId: string;
  type: string;
  title?: string;
  videoUrl: string;
  status: "queued" | "processing" | "completed" | "failed";
  progress: number;
  estimatedTime?: number;
  queuePosition?: number;
  results?: {
    category: string;
    metrics?: Record<string, number>;
    insights?: string[];
  };
  error?: {
    message: string;
    action?: string;
  };
  metadata?: {
    originalFilename: string;
    fileSize: number;
    mimeType: string;
  };
}