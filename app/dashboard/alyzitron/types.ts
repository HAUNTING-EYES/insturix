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