export type MetricData = {
  score?: number;
  description: string;
};

export type AnalysisData = {
  category: string;
  creator_feedback: {
    strengths: string[];
    improvements: string[];
  };
  [key: string]: Record<string, MetricData> | string | { strengths: string[]; improvements: string[]; };
};
// Editron Task interface

// Define a more specific type for the result object
export interface EditronTaskResult {
  gcsUrl?: string | string[]; // Make original optional, allow string or array
  signedUrls?: { playableUrl: string; downloadUrl: string }[]; // Add new field for signed URLs
  // Allow other potential properties within the result object
  [key: string]: unknown;
}

export interface EditronTask {
  _id: string;
  user_id: string;
  youtube_url: string;
  status: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";
  created_at: Date;
  updated_at: Date;
  result?: EditronTaskResult; // Use the new result type, make result optional
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
}