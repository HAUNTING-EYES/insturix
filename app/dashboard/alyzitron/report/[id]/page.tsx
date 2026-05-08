import { auth } from "@clerk/nextjs/server";
import { ObjectId } from "mongodb";
import { getCollections } from "@/app/api/services/alyzitron/utils/mongodb";
import { notFound } from "next/navigation";
import type { AnalysisData, MetricData } from "../../../../../lib/types";
import { AnalysisDetails, AnalysisError, PrivateAnalysisView } from "./components";
import { getGcsSignedUrl } from "../../utils/GcsSignedUrl";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

async function getAnalysis(id: string) {
  const session = await auth();

  try {
    // Skip favicon.ico requests and other static file requests
    if (id === 'favicon.ico' || id === 'robots.txt' || id === 'manifest.json') {
      return { error: 'invalid_id' };
    }
    
    // Validate if it's a valid ObjectId format
    if (!ObjectId.isValid(id)) {
      return { error: 'invalid_id' };
    }

    const { analyses } = await getCollections();

    // First, find the analysis regardless of user
    const analysis = await analyses.findOne({
      _id: new ObjectId(id),
      $or: [{ status: "completed" }, { status: "failed" }],
    } as any);

    if (!analysis) {
      return { error: 'not_found' };
    }

    // Check if the analysis is public or belongs to the current user
    const isOwner = session?.userId && analysis.clerkUserId === session.userId;
    const isPublic = analysis.metadata?.isPublic === true;

    // Allow access if user is owner OR analysis is public
    if (!isOwner && !isPublic) {
      return { error: 'access_denied', isPrivate: true };
    }

    // If user is authenticated and is the owner, mark as read
    if (isOwner && session?.userId) {
      await analyses.updateOne(
        { _id: new ObjectId(id) } as any,
        { $set: { unread: false } }
      );
    }

    return {
      analysis: {
        ...analysis,
        _id: analysis._id.toString()
      } as any,
      isOwner: !!isOwner,
      isPublic
    };
  } catch (error) {
    console.error("Error fetching analysis:", error);
    return { error: 'server_error' };
  }
}

export default async function AnalysisReport({ params }: PageProps) {
  const resolvedParams = await params;
  const result = await getAnalysis(resolvedParams.id);

  // Handle different error cases
  if ('error' in result) {
    if (result.error === 'access_denied' && result.isPrivate) {
      return <PrivateAnalysisView />;
    }
    notFound();
  }

  const { analysis, isOwner, isPublic } = result;

  // Handle failed analysis
  if (analysis.status === 'failed') {
    return (
      <div className="min-h-screen bg-[#0B0B0A] text-[#ECE9E1]">
        <div className="mx-auto max-w-[1040px] px-4 sm:px-7 py-8">
          <AnalysisError
            errorCode={analysis.error?.code || 'UNKNOWN_ERROR'}
            errorMessage={analysis.error?.message || 'An unknown error occurred during analysis'}
            videoUrl={analysis.videoUrl}
            videoTitle={analysis.metadata?.originalFilename}
            createdAt={analysis.createdAt}
          />
        </div>
      </div>
    );
  }

  // Handle new results structure
  const analysisData: AnalysisData = {
    category: analysis.results?.category || 'Analysis',
    overall_score: analysis.results?.overall_score || 0,
    overview: analysis.results?.overview || '',
    remarks: analysis.results?.remarks || '',
    titles: analysis.results?.titles || [],
    descriptions: analysis.results?.descriptions || [],
    target_audience: analysis.results?.target_audience || '',
    creator_feedback: {
      strengths: analysis.results?.strengths || [],
      improvements: analysis.results?.weaknesses || [],
    },
  };

  // Map analysis categories to metric groups
  if (analysis.results?.analysis) {
    analysis.results.analysis.forEach((category: any) => {
      const metrics: Record<string, MetricData> = {};
      category.metrics.forEach((metric: any) => {
        metrics[metric.name.replace(/\s+/g, '_').toLowerCase()] = {
          score: metric.score,
          description: metric.description,
        };
      });
      analysisData[category.category_name.replace(/\s+/g, '_').toLowerCase()] = metrics;
    });
  }

  // Map compliance risks
  if (analysis.results?.compliance_risks) {
    const complianceMetrics: Record<string, MetricData> = {};
    analysis.results.compliance_risks.forEach((risk: any) => {
      complianceMetrics[risk.name.replace(/\s+/g, '_').toLowerCase()] = {
        score: risk.score,
        description: risk.description,
      };
    });
    analysisData.compliance_risks = complianceMetrics;
  }

  const isYouTubeUrl =
    analysis.videoUrl &&
    (analysis.videoUrl.includes("youtube.com") || analysis.videoUrl.includes("youtu.be"));
    
  const isInstagramUrl = 
    analysis.videoUrl &&
    (analysis.videoUrl.includes("instagram.com"));

  const isEmbeddableUrl = isYouTubeUrl || isInstagramUrl;

  const signedUrl = !isEmbeddableUrl ? await getGcsSignedUrl(analysis.videoUrl) : null;

  return (
    <div className="min-h-screen bg-[#0B0B0A] text-[#ECE9E1]">
      <div className="mx-auto max-w-[1040px] px-4 sm:px-7 py-8">
        <AnalysisDetails
          analysisData={analysisData}
          videoUrl={analysis.videoUrl}
          signedUrl={signedUrl || undefined}
          videoTitle={analysis.metadata?.originalFilename}
          createdAt={analysis.createdAt}
          analysisId={analysis._id}
          isOwner={isOwner}
          isPublic={isPublic}
          userId={analysis.clerkUserId}
          taskId={resolvedParams.id}
        />
      </div>
    </div>
  );
}
