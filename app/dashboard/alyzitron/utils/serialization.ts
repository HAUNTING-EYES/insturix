import { AlyzitronAnalysis } from '@/app/api/services/alyzitron/types';

export function serializeAnalysis(analysis: any): AlyzitronAnalysis {
  if (!analysis || typeof analysis !== 'object') {
    throw new Error('Invalid analysis data');
  }

  // Ensure required date fields are present and valid
  const dates = [
    'createdAt',
    'updatedAt',
    'queueStartTime',
    'processingStartTime',
    'completionTime'
  ];

  const serializedDates = dates.reduce((acc, key) => {
    const date = analysis[key];
    if (date instanceof Date) {
      acc[key] = date.toISOString();
    } else if (typeof date === 'string') {
      acc[key] = new Date(date).toISOString();
    } else if (date?.$date?.$numberLong) {
      acc[key] = new Date(Number(date.$date.$numberLong)).toISOString();
    } else {
      acc[key] = new Date().toISOString(); // Default to current date
    }
    return acc;
  }, {} as Record<string, string>);

  // Extract metrics and insights from results
  const results = analysis.results || {};

  // Transform old metric structure to new format if needed
  const metrics: Record<string, Record<string, any>> = {};
  
  if (results.engagement_metrics) metrics.engagement = results.engagement_metrics;
  if (results.technical_quality) metrics.technical = results.technical_quality;
  if (results.seo_optimization) metrics.seo = results.seo_optimization;
  if (results.compliance_risks) metrics.compliance = results.compliance_risks;

  const creator_feedback = {
    strengths: results.creator_feedback?.strengths || [],
    improvements: results.creator_feedback?.improvements || []
  };

  const hasMetrics = Object.keys(metrics).length > 0;
  const hasInsights = creator_feedback.strengths.length > 0 || creator_feedback.improvements.length > 0;

  const serialized = {
    ...analysis,
    _id: analysis._id?.toString() || analysis._id?.$oid || '',
    ...serializedDates,
    status: analysis.status || 'failed',
    taskId: analysis.taskId || '',
    type: analysis.type || '',
    videoUrl: analysis.videoUrl || '',
    gcsPath: analysis.gcsPath || '',
    estimatedTime: analysis.estimatedTime?.$numberInt || analysis.estimatedTime || 0,
    clerkUserId: analysis.clerkUserId || '',
    hasMetrics,
    hasInsights,
    results: {
      category: results.category || '',
      metrics,
      creator_feedback,
    },
    error: analysis.error || null,
    metadata: {
      originalFilename: analysis.metadata?.originalFilename || 'Untitled',
      fileSize: analysis.metadata?.fileSize?.$numberInt || analysis.metadata?.fileSize || 0,
      mimeType: analysis.metadata?.mimeType || 'unknown',
    },
  };

  return serialized;
}

export function serializeAnalyses(analyses: any[]): AlyzitronAnalysis[] {
  if (!Array.isArray(analyses)) {
    return [];
  }
  
  return analyses
    .map(analysis => {
      try {
        return serializeAnalysis(analysis);
      } catch (error) {
        return null;
      }
    })
    .filter((a): a is AlyzitronAnalysis => a !== null);
}