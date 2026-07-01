export type MetricData = {
  score?: number;
  description: string;
  name?: string; // Naya field metrics ke liye
};

// Naya structure jo Gemini bhej raha hai
export type AnalysisCategory = {
  category_name: string;
  metrics: { name: string; score: number; description: string }[];
};

export type AnalysisData = {
  category: string;
  overall_score?: number;
  overview?: string;
  remarks?: string;
  titles: string[];
  descriptions: string[];
  target_audience?: string;
  content_intent?: string;
  brand_fit_summary?: string;
  applicable_takeaways?: string[];

  // --- Naye Fields (Optional rakhe hain taaki purana code na tute) ---
  strengths?: string[];
  weaknesses?: string[];
  analysis?: AnalysisCategory[];
  compliance_risks?: { name: string; score: number; description: string }[] | Record<string, MetricData>;
  // ----------------------------------------------------------------

  creator_feedback: {
    strengths: string[];
    improvements: string[];
  };

  [key: string]: any; // Index signature ko flexible rakha hai
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