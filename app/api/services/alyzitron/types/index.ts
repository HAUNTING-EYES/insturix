
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
  clerkUserId: string;
  videoUrl: string;
  status: AnalysisStatus;
  estimatedTime: number;    // in seconds
  expectedDurationSeconds?: number; // Add expected duration
  queuePosition?: number;   // Only present when status is 'queued'
  unread: boolean;          // Indicates if the analysis results are unread
  results: AnalysisResults | null;
  additional_details?: string; // User preferences and requirements
  error?: {
    code: string;
    message: string;
    action?: string;
  };
  metadata: {
    originalFilename: string;
    videoSize: number;       // in bytes
    videoDuration: number;   // in seconds
    mimeType: string;
    isPublic: boolean;       // Determines if the analysis is public or private
  };
  createdAt: Date;
  updatedAt: Date;
  processingStartTime?: number; // timestamp in ms
  refunded?: boolean;
}

export interface ServiceError {
  code: string;        // Machine-readable error code
  message: string;     // User-friendly message
  action?: string;     // Suggested resolution
  technical?: string;  // Technical details (logs only)
}