import { auth } from '@clerk/nextjs/server';
import { ObjectId } from 'mongodb';
import { getCollections } from '@/app/api/services/alyzitron/utils/mongodb';
import { notFound } from 'next/navigation';
import { serializeAnalysis } from '../../utils/serialization';
import type { AnalysisData, MetricData } from '../../types';
import { AnalysisDetails } from './components';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

async function getAnalysis(id: string) {
  const session = await auth();
  if (!session?.userId) return null;

  try {
    let objectId: ObjectId;
    try {
      objectId = new ObjectId(id);
    } catch {
      return null;
    }

    const { analyses } = await getCollections();
    
    // Find and update the analysis document
    const analysis = await analyses.findOneAndUpdate(
      {
        _id: objectId,
        clerkUserId: session.userId,
        status: 'completed',
      },
      {
        $set: { unread: false }
      },
      {
        returnDocument: 'after'
      }
    );

    if (!analysis) return null;

    return serializeAnalysis(analysis);
  } catch (error) {
    console.error('Error fetching analysis:', error);
    return null;
  }
}

export default async function AnalysisReport({ params }: PageProps) {
  const resolvedParams = await params;
  const analysis = await getAnalysis(resolvedParams.id);
  
  if (!analysis) {
    notFound();
  }

  const analysisData: AnalysisData = {
    category: analysis.type,
    creator_feedback: analysis.results?.creator_feedback || {
      strengths: [],
      improvements: []
    }
  };

  // Map metrics to their groups
  if (analysis.results) {
    Object.entries(analysis.results).forEach(([group, groupMetrics]) => {
      if (typeof groupMetrics === 'object' && groupMetrics !== null) {
        const metrics: Record<string, MetricData> = {};
        Object.entries(groupMetrics).forEach(([key, value]) => {
          if (typeof value === 'object' && value !== null && 'score' in value) {
            const metric = value as { score?: number; description?: string };
            metrics[key] = {
              score: typeof metric.score === 'number' ? metric.score : undefined,
              description: typeof metric.description === 'string' ? metric.description : ''
            };
          }
        });
        if (group != 'category' && group != 'creator_feedback') {analysisData[group] = metrics;}
      }
    });
  }

  return (
    <div className="container mx-auto p-8">
      <div className="max-w-5xl mx-auto">
        <AnalysisDetails analysisData={analysisData} />
      </div>
    </div>
  );
}