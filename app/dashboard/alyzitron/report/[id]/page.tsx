import { auth } from '@clerk/nextjs/server';
import { ObjectId } from 'mongodb';
import { getCollections } from '@/app/api/services/alyzitron/utils/mongodb';
import { notFound } from 'next/navigation';
import { serializeAnalysis } from '../../utils/serialization';
import AnalysisDetails from '../../analysis/[id]/page';
import type { AnalysisData, MetricData } from '../../types';

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
    } catch (error) {
      return null;
    }

    const { analyses } = await getCollections();
    const analysis = await analyses.findOne({
      _id: objectId,
      clerkUserId: session.userId,
      status: 'completed',
    });

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
  if (analysis.results?.metrics) {
    Object.entries(analysis.results.metrics).forEach(([group, groupMetrics]) => {
      if (typeof groupMetrics === 'object' && groupMetrics !== null) {
        const metrics: Record<string, MetricData> = {};
        Object.entries(groupMetrics).forEach(([key, value]: [string, any]) => {
          if (typeof value === 'object' && value !== null) {
            metrics[key] = {
              score: typeof value.score === 'number' ? value.score : undefined,
              description: typeof value.description === 'string' ? value.description : ''
            };
          }
        });
        analysisData[group] = metrics;
      }
    });
  }

  return (
    <div className="container mx-auto p-8">
      <div className="max-w-5xl mx-auto">
        <AnalysisDetails 
          params={{ id: resolvedParams.id }}
          analysisData={analysisData}
        />
      </div>
    </div>
  );
}