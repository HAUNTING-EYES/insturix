import { auth } from "@clerk/nextjs/server";
import { ObjectId } from "mongodb";
import { getCollections } from "@/app/api/services/alyzitron/utils/mongodb";
import { notFound } from "next/navigation";
import type { AnalysisData, MetricData } from "../../../../../lib/types";
import { AnalysisDetails, AnalysisError, PrivateAnalysisView } from "./components";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

async function getAnalysis(id: string) {
  const session = await auth();

  try {
    // Validate if it's a valid ObjectId format
    if (!ObjectId.isValid(id)) {
      return { error: 'invalid_id' };
    }

    const { analyses } = await getCollections();

    // First, find the analysis regardless of user
    const analysis = await analyses.findOne({
      _id: id,
      $or: [{ status: "completed" }, { status: "failed" }],
    });

    if (!analysis) return { error: 'not_found' };

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
        { _id: id },
        { $set: { unread: false } }
      );
    }

    return {
      analysis: {
        ...analysis,
        _id: analysis._id.toString()
      },
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
      <div className="container mx-auto p-8">
        <div className="max-w-5xl mx-auto">
          <AnalysisError
            errorCode={analysis.error?.code || 'UNKNOWN_ERROR'}
            errorMessage={analysis.error?.message || 'An unknown error occurred during analysis'}
            videoUrl={analysis.videoUrl}
            videoTitle={analysis.metadata?.title || analysis.metadata?.originalFilename}
            createdAt={analysis.createdAt}
          />
        </div>
      </div>
    );
  }

  const analysisData: AnalysisData = {
    category: analysis.type,
    creator_feedback:
      analysis.results?.creator_feedback &&
      typeof analysis.results.creator_feedback === "object" &&
      analysis.results.creator_feedback !== null &&
      "strengths" in analysis.results.creator_feedback &&
      "improvements" in analysis.results.creator_feedback
        ? {
            strengths: Array.isArray(
              analysis.results.creator_feedback.strengths
            )
              ? analysis.results.creator_feedback.strengths
              : [],
            improvements: Array.isArray(
              analysis.results.creator_feedback.improvements
            )
              ? analysis.results.creator_feedback.improvements
              : [],
          }
        : {
            strengths: [],
            improvements: [],
          },
  };

  // Map metrics to their groups
  if (analysis.results) {
    Object.entries(analysis.results).forEach(([group, groupMetrics]) => {
      if (typeof groupMetrics === "object" && groupMetrics !== null) {
        const metrics: Record<string, MetricData> = {};
        Object.entries(groupMetrics).forEach(([key, value]) => {
          if (typeof value === "object" && value !== null && "score" in value) {
            const metric = value as { score?: number; description?: string };
            metrics[key] = {
              score:
                typeof metric.score === "number" ? metric.score : undefined,
              description:
                typeof metric.description === "string"
                  ? metric.description
                  : "",
            };
          }
        });
        if (group != "category" && group != "creator_feedback") {
          analysisData[group] = metrics;
        }
      }
    });
  }

  return (
    <div className="container mx-auto p-8">
      <div className="max-w-5xl mx-auto">
        <AnalysisDetails
          analysisData={analysisData}
          videoUrl={analysis.videoUrl}
          videoTitle={analysis.metadata?.title || analysis.metadata?.originalFilename}
          createdAt={analysis.createdAt}
          analysisId={analysis._id}
          isOwner={isOwner}
          isPublic={isPublic}
        />
      </div>
    </div>
  );
}
