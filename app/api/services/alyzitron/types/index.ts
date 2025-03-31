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

interface MetricScore {
  score: number;
  description: string;
}

interface CreatorFeedback {
  strengths: string[];
  improvements: string[];
}

interface AnalysisResults {
  category: string;
  engagement_metrics?: {
    value_proposition_clarity?: MetricScore;
    information_clarity?: MetricScore;
    structure_organization?: MetricScore;
    comprehensibility?: MetricScore;
    [key: string]: MetricScore | undefined;
  };
  technical_quality?: {
    screen_recording_quality?: MetricScore;
    voice_clarity?: MetricScore;
    visual_aids_usage?: MetricScore;
    [key: string]: MetricScore | undefined;
  };
  seo_optimization?: {
    title_keyword_relevance?: MetricScore;
    description_richness_clarity?: MetricScore;
    content_categorization_accuracy?: { description: string };
    [key: string]: MetricScore | { description: string } | undefined;
  };
  compliance_risks?: {
    copyright_risk?: MetricScore;
    guidelines_compliance?: MetricScore;
    social_risk?: MetricScore;
    [key: string]: MetricScore | undefined;
  };
  creator_feedback: CreatorFeedback;
  metrics?: Record<string, Record<string, MetricScore>>;
}

export interface AlyzitronAnalysis {
  _id: ObjectId;
  clerkUserId: string;
  videoUrl: string;
  gcsPath: string;          // Format: 'services/alyzitron/user_{id}/{filename}'
  type: string;
  status: 'pending' | 'queued' | 'processing' | 'completed' | 'failed';
  taskId: string;
  estimatedTime: number;    // in seconds
  queueStartTime: Date;
  processingStartTime: Date;
  completionTime: Date;
  results: AnalysisResults | null;
  hasMetrics: boolean;
  hasInsights: boolean;
  error?: {
    code: string;
    message: string;
    action: string;
  };
  metadata: {
    originalFilename: string;
    fileSize: number;       // in bytes
    uploadSpeed?: number;    // bytes per second
    mimeType: string;
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