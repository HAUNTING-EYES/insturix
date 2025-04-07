import { ObjectId } from 'mongodb';

export interface AlyzitronUserData {
  _id: ObjectId;
  clerkUserId: string;
  usage: {
    totalAnalyses: number;
    monthlyAnalyses: number;
    totalStorageUsed: number; // in bytes
    lastAnalysisDate: Date;
  };
  preferences: {
    defaultVideoType: string;
    defaultLanguage: string;
    notificationPreferences: {
      email: boolean;
      inApp: boolean;
      queueNotifications: boolean;
      completionNotifications: boolean;
    };
    displayPreferences: {
      showQueuePosition: boolean;
      autoPlayResults: boolean;
      compactView: boolean;
    };
  };
  limits: {
    maxStoragePerVideo: number;   // in bytes
    maxConcurrentAnalyses: number;
    maxMonthlyAnalyses: number;
  };
  stats: {
    averageScore: number;
    totalAnalysisTime: number;    // in seconds
    completionRate: number;       // percentage
    popularVideoTypes: Array<{
      type: string;
      count: number;
    }>;
  };
  createdAt: Date;
  updatedAt: Date;
}

export type VideoType = 'SHORT_FORM' | 'EDUCATIONAL' | 'ENTERTAINMENT' | 'MUSIC' | 'PRODUCT_REVIEW' | 'VLOG';

// Status workflow: pending -> queued -> processing -> completed/failed
export type AnalysisStatus = 'pending' | 'queued' | 'processing' | 'completed' | 'failed';

// API specific status (for webhook responses)
export type APIAnalysisStatus = 'queued' | 'started' | 'processing' | 'completed' | 'failed';

interface MetricScore {
  score: number;
  description: string;
}

interface ComplianceRisks {
  copyright_risk: MetricScore;
  guidelines_compliance: MetricScore;
  social_risk: MetricScore;
}

interface CreatorFeedback {
  strengths: string[];
  improvements: string[];
}

interface CategoryMetrics {
  [metric: string]: MetricScore;
}

interface AnalysisResults {
  score: number;
  creator_feedback: CreatorFeedback;
  compliance_risks: ComplianceRisks;
  [category: string]: number | CreatorFeedback | ComplianceRisks | CategoryMetrics;
}

export interface AlyzitronAnalysis {
  _id: ObjectId;
  clerkUserId: string;
  videoUrl: string;
  gcsPath: string;          // Format: 'services/alyzitron/user_{id}/{filename}'
  type: VideoType;
  status: AnalysisStatus;
  taskId: string;
  estimatedTime: number;    // in seconds
  progress: number;         // 0-1 for processing status
  queuePosition?: number;   // Only present when status is 'queued'
  results: AnalysisResults | null;
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
    title?: string;
    description?: string;
    niche?: string;
    target_audience?: string;
    additional_details?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface ServiceError {
  code: string;        // Machine-readable error code
  message: string;     // User-friendly message
  action?: string;     // Suggested resolution
  technical?: string;  // Technical details (logs only)
}