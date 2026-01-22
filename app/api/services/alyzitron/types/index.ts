
export interface AlyzitronUserData {
  _id: string;
  clerkUserId: string;
  usage: {
    totalAnalyses: number;
    monthlyAnalyses: number;
    lastAnalysisDate: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}

// Status workflow: listed -> sometimes (queued) -> processing -> completed/failed
export type AnalysisStatus = 'listed' | 'queued' | 'processing' | 'completed' | 'failed';

export type ContextValues = {
  familyFriendly: boolean;
  platform: string;
  location: string;
  additionalDetails?: string;
};

// API specific status (for webhook responses)
export type APIAnalysisStatus = 'queued' | 'started' | 'processing' | 'completed' | 'failed';

// New flexible analysis result structure
export interface Metric {
  name: string;
  score: number;
  description: string;
}

export interface AnalysisCategory {
  category_name: string;
  metrics: Metric[];
}

export interface ComplianceRisk {
  name: string;
  score: number;
  description: string;
}

export interface AnalysisResults {
  category: string;
  overall_score: number;
  overview: string;
  remarks: string;
  titles: string[];
  descriptions: string[];
  target_audience: string;
  strengths: string[];
  weaknesses: string[];
  analysis: AnalysisCategory[];
  compliance_risks: ComplianceRisk[];
}

export interface AlyzitronAnalysis {
  _id: string;
  taskId: string;            // Redundant but indexed ID
  clerkUserId: string;
  videoUrl: string;
  status: AnalysisStatus;
  estimatedTime?: number;    // in seconds
  usageMinutes?: number;     // Credits consumed
  videoDuration?: number;    // seconds
  expectedDurationSeconds?: number;
  queuePosition?: number;
  unread: boolean;
  results: AnalysisResults | null;
  context: ContextValues;    // User preferences
  error?: {
    code?: string;
    message: string;
    action?: string;
    timestamp?: Date;
  };
  metadata: {
    originalFilename: string;
    videoSize: number;
    videoDuration: number;
    mimeType: string;
    isPublic: boolean;
    filename?: string;       // Extension field
    fileSize?: number;       // Extension field
    duration?: number;       // Extension field
  };
  createdAt: Date;
  updatedAt: Date;
  processingStartTime?: Date | number;
  completedAt?: Date;
  refunded?: boolean;
}

export interface ServiceError {
  code: string;        // Machine-readable error code
  message: string;     // User-friendly message
  action?: string;     // Suggested resolution
  technical?: string;  // Technical details (logs only)
}