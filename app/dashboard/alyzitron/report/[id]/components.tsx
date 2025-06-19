"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, CheckCircle, AlertCircle, AlertTriangle, Lock, Shield, Share2, Copy, Eye, EyeOff, Check, Globe, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { AnalysisData, MetricData } from "../../../../../lib/types";

const ScoreIndicator = ({
  score,
  invert,
}: {
  score: number;
  invert?: boolean;
}) => {
  let colorClass;
  const effectiveScore = invert ? 100 - score : score;

  if (effectiveScore >= 80) colorClass = "bg-green-500/10 text-green-400";
  else if (effectiveScore >= 60)
    colorClass = "bg-yellow-500/10 text-yellow-400";
  else colorClass = "bg-red-500/10 text-red-400";

  return (
    <div className={`text-xl font-bold px-3.5 py-1.5 rounded-lg ${colorClass}`}>
      {score}
    </div>
  );
};

interface AnalysisDetailsProps {
  analysisData: AnalysisData;
  videoUrl?: string;
  videoTitle?: string;
  createdAt?: Date;
  analysisId?: string;
  isOwner?: boolean;
  isPublic?: boolean;
}

interface ShareButtonProps {
  analysisId: string;
  isPublic: boolean;
  isOwner: boolean;
  onPrivacyChange: (isPublic: boolean) => void;
}

function ShareButton({ analysisId, isPublic, isOwner, onPrivacyChange }: ShareButtonProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const shareUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/dashboard/alyzitron/report/${analysisId}`
    : `/dashboard/alyzitron/report/${analysisId}`;

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const updatePrivacy = async (newIsPublic: boolean) => {
    if (!isOwner) return;
    
    setIsUpdating(true);
    try {
      const response = await fetch(`/api/services/alyzitron/analyses/${analysisId}/privacy`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isPublic: newIsPublic }),
      });

      if (response.ok) {
        onPrivacyChange(newIsPublic);
      } else {
        console.error('Failed to update privacy setting');
      }
    } catch (error) {
      console.error('Error updating privacy:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  if (!isOwner) {
    return null;
  }

  return (
    <>
      <button
        onClick={() => setShowDialog(true)}
        className="inline-flex items-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white border border-zinc-700 hover:border-zinc-600 font-medium rounded-lg transition-colors"
      >
        <Share2 className="h-4 w-4" />
        Share
      </button>

        {showDialog && (
          <AnimatePresence>
            <motion.div
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }} // Swift fade for backdrop
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
          >
            <div className="fixed inset-0 flex items-center justify-center p-4 overflow-y-auto">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2, ease: "easeInOut" }} // Slightly slower, eased animation for dialog
                className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 w-full max-w-md"
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-zinc-100">Share Analysis</h3>
                <button
                  onClick={() => setShowDialog(false)}
                  className="text-zinc-400 hover:text-zinc-300"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    Privacy Setting
                  </label>
                  <div className="space-y-2">
                    <button
                      onClick={() => updatePrivacy(false)}
                      disabled={isUpdating}
                      className={`w-full p-3 rounded-lg border text-left transition-colors ${
                        !isPublic
                          ? 'bg-zinc-800 border-zinc-600 text-zinc-100'
                          : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-zinc-600'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Lock className="h-5 w-5" />
                        <div>
                          <div className="font-medium">Private</div>
                          <div className="text-sm text-zinc-500">Only you can view this analysis</div>
                        </div>
                      </div>
                    </button>
                    
                    <button
                      onClick={() => updatePrivacy(true)}
                      disabled={isUpdating}
                      className={`w-full p-3 rounded-lg border text-left transition-colors ${
                        isPublic
                          ? 'bg-zinc-800 border-zinc-600 text-zinc-100'
                          : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-zinc-600'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Globe className="h-5 w-5" />
                        <div>
                          <div className="font-medium">Public</div>
                          <div className="text-sm text-zinc-500">Anyone with the link can view</div>
                        </div>
                      </div>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    Share Link
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={shareUrl}
                      readOnly
                      className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-zinc-100 text-sm"
                    />
                    <button
                      onClick={copyToClipboard}
                      className="px-3 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded-md transition-colors"
                    >
                      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                  {!isPublic && (
                    <p className="text-xs text-amber-400 mt-1">
                      ⚠️ This link will only work for you unless you make the analysis public
                    </p>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>
          </AnimatePresence>
       )}
    </>
  );
}

export function AnalysisDetails({ analysisData, videoUrl, videoTitle, createdAt, analysisId, isOwner, isPublic }: AnalysisDetailsProps) {
  const [currentIsPublic, setCurrentIsPublic] = useState(isPublic || false);

  // Extract YouTube video ID from URL
  const extractYouTubeVideoId = (url: string): string | null => {
    const regexes = [
      /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
      /(?:https?:\/\/)?(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]{11})/,
      /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
      /(?:https?:\/\/)?(?:www\.)?youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
      /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    ];

    for (const regex of regexes) {
      const match = url.match(regex);
      if (match && match[1]) {
        return match[1];
      }
    }
    return null;
  };

  // Check if videoUrl is a YouTube URL and get video ID
  const isYouTubeUrl = videoUrl && (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be'));
  const youtubeVideoId = isYouTubeUrl ? extractYouTubeVideoId(videoUrl) : null;
  // Calculate overall score from all metrics that have scores
  const scores: number[] = [];
  Object.entries(analysisData).forEach(([key, value]) => {
    if (
      key !== "category" &&
      key !== "creator_feedback" &&
      typeof value === "object"
    ) {
      Object.values(value as Record<string, MetricData>).forEach((metric) => {
        if (metric && typeof metric.score === "number") {
          // Don't include compliance risk scores in overall score
          if (key !== "compliance_risks") {
            scores.push(metric.score);
          }
        }
      });
    }
  });
  const overallScore =
    scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="pb-8 mb-8 border-b border-zinc-800">
        <div className="flex items-center justify-between mb-6">
          <Link
            href="/dashboard/alyzitron"
            className="inline-flex items-center text-zinc-400 hover:text-zinc-300"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Link>
          {analysisId && (
            <ShareButton
              analysisId={analysisId}
              isPublic={currentIsPublic}
              isOwner={isOwner || false}
              onPrivacyChange={setCurrentIsPublic}
            />
          )}
        </div>
        
        <div className="flex items-end justify-between">
          <div className="flex-1">
            <h1 className="text-3xl font-semibold text-zinc-100">
              Analysis Results
            </h1>
            <p className="text-zinc-400 mt-2 flex items-center gap-2">
              {analysisData.category} •{" "}
              {createdAt?.toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              }) || new Date().toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
              {isOwner && (
                <span className="flex items-center gap-1 text-xs">
                  •
                  {currentIsPublic ? (
                    <>
                      <Globe className="h-3 w-3" />
                      Public
                    </>
                  ) : (
                    <>
                      <Lock className="h-3 w-3" />
                      Private
                    </>
                  )}
                </span>
              )}
            </p>
          </div>
          <div className="text-right flex flex-col justify-end min-h-[100px] ml-8">
            <div className="text-6xl font-bold text-zinc-100 leading-none">
              {overallScore}
            </div>
            <div className="text-zinc-400 mt-2">Overall Score</div>
          </div>
        </div>
      </div>

      {/* Video Section */}
      {youtubeVideoId && (
        <div className="mb-8">
          <div className="bg-black/40 border border-zinc-800 rounded-lg p-6 backdrop-blur-xl">
            <div className="flex flex-col lg:flex-row gap-6">
              <div className="lg:w-2/3">
                <div className="relative w-full" style={{ paddingBottom: '56.25%' /* 16:9 aspect ratio */ }}>
                  <iframe
                    className="absolute top-0 left-0 w-full h-full rounded-lg"
                    src={`https://www.youtube.com/embed/${youtubeVideoId}`}
                    title="YouTube video player"
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                  />
                </div>
              </div>
              <div className="lg:w-1/3 flex flex-col justify-center">
                <h2 className="text-xl font-semibold text-zinc-100 mb-3">
                  {videoTitle || "YouTube Video"}
                </h2>
                <p className="text-zinc-400 text-sm mb-4">
                  Original video being analyzed
                </p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Video Type:</span>
                    <span className="text-zinc-300">{analysisData.category}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Overall Score:</span>
                    <span className="text-zinc-100 font-semibold">{overallScore}/100</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Object.entries(analysisData).map(([section, data]) => {
          // Skip category and creator_feedback as they're handled separately
          if (section === "category" || section === "creator_feedback")
            return null;

          // Ensure data is a metrics object
          if (
            typeof data !== "object" ||
            data === null ||
            Array.isArray(data)
          ) {
            return null;
          }

          return (
            <Card
              key={section}
              className="bg-black/40 border-zinc-800 backdrop-blur-xl"
            >
              <CardHeader>
                <CardTitle className="text-lg font-medium text-zinc-100 capitalize">
                  {section.replace(/_/g, " ")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {Object.entries(data as Record<string, MetricData>).map(
                  ([key, value]) => (
                    <div
                      key={key}
                      className="px-4 py-3.5 bg-black/20 rounded-lg hover:bg-black/30 transition-colors"
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="text-sm font-medium text-zinc-200 capitalize tracking-wide mb-1.5">
                            {key.replace(/_/g, " ")}
                          </div>
                          <p className="text-sm text-zinc-400 leading-relaxed">
                            {value.description}
                          </p>
                        </div>
                        <div className="flex items-center ml-4 shrink-0">
                          {section === "compliance_risks" ? (
                            value.score ? (
                              <ScoreIndicator score={value.score} invert />
                            ) : null
                          ) : value.score ? (
                            <ScoreIndicator score={value.score} />
                          ) : null}
                        </div>
                      </div>
                    </div>
                  )
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Creator Feedback */}
      <Card className="bg-black/40 border-zinc-800 backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="text-lg font-medium text-zinc-100">
            Creator Feedback
          </CardTitle>
        </CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-8">
          <div>
            <h3 className="text-sm font-medium text-zinc-300 mb-4">
              Strengths
            </h3>
            <ul className="space-y-3">
              {analysisData?.creator_feedback?.strengths?.map(
                (strength: string, index: number) => (
                  <li
                    key={index}
                    className="flex items-center gap-2 text-sm text-zinc-400 bg-black/20 p-3 rounded-lg"
                  >
                    <CheckCircle className="h-5 w-5 text-green-400 shrink-0" />
                    <span className="leading-relaxed">{strength}</span>
                  </li>
                )
              ) || []}
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-medium text-zinc-300 mb-4">
              Improvements
            </h3>
            <ul className="space-y-3">
              {analysisData?.creator_feedback?.improvements?.map(
                (improvement: string, index: number) => (
                  <li
                    key={index}
                    className="flex items-center gap-2 text-sm text-zinc-400 bg-black/20 p-3 rounded-lg"
                  >
                    <AlertCircle className="h-5 w-5 text-yellow-400 shrink-0" />
                    <span className="leading-relaxed">{improvement}</span>
                  </li>
                )
              ) || []}
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function PrivateAnalysisView() {
  return (
    <div className="container mx-auto p-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-end justify-between pb-8 mb-8 border-b border-zinc-800">
          <div>
            <Link
              href="/dashboard/alyzitron"
              className="inline-flex items-center text-zinc-400 hover:text-zinc-300 mb-4"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Link>
            <h1 className="text-3xl font-semibold text-zinc-100">
              Private Analysis
            </h1>
            <p className="text-zinc-400 mt-2">
              This analysis is not accessible to you
            </p>
          </div>
          <div className="text-right flex flex-col justify-end min-h-[100px]">
            <Lock className="h-16 w-16 text-zinc-400 mb-2" />
            <div className="text-zinc-400 mt-2">Private</div>
          </div>
        </div>

        <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-lg font-medium text-zinc-100 flex items-center gap-2">
              <Shield className="h-5 w-5 text-zinc-400" />
              Access Restricted
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-6">
              <div className="flex items-start gap-4">
                <Lock className="h-8 w-8 text-zinc-400 mt-1 shrink-0" />
                <div>
                  <h3 className="text-lg font-medium text-zinc-200 mb-2">
                    This Analysis is Private
                  </h3>
                  <p className="text-zinc-400 leading-relaxed mb-4">
                    This video analysis report has been set to private by its creator and can only be viewed by the account that created it.
                  </p>
                  <div className="text-sm text-zinc-500">
                    If you believe you should have access to this analysis, please contact the creator who shared this link with you.
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-start gap-3 p-4 bg-zinc-800/30 rounded-lg">
                <div className="text-blue-400 font-semibold text-sm mt-0.5">💡</div>
                <div className="text-sm text-zinc-300">
                  <strong>Want to create your own analysis?</strong> Upload your video to Alyzitron and get detailed insights about your content.
                </div>
              </div>
              <div className="flex items-start gap-3 p-4 bg-zinc-800/30 rounded-lg">
                <div className="text-green-400 font-semibold text-sm mt-0.5">🔒</div>
                <div className="text-sm text-zinc-300">
                  <strong>Privacy by default:</strong> All analyses are private by default. Creators can choose to make them public if they wish to share.
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-zinc-800">
              <Link
                href="/dashboard/alyzitron"
                className="inline-flex items-center justify-center px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
              >
                Try Alyzitron
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

interface AnalysisErrorProps {
  errorCode: string;
  errorMessage: string;
  videoUrl?: string;
  videoTitle?: string;
  createdAt?: Date;
}

export function AnalysisError({ errorCode, errorMessage, videoUrl, videoTitle, createdAt }: AnalysisErrorProps) {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-end justify-between pb-8 mb-8 border-b border-zinc-800">
        <div>
          <Link
            href="/dashboard/alyzitron"
            className="inline-flex items-center text-zinc-400 hover:text-zinc-300 mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Link>
          <h1 className="text-3xl font-semibold text-zinc-100">
            Analysis Failed
          </h1>
          <p className="text-zinc-400 mt-2">
            {videoTitle || "Video Analysis"} •{" "}
            {createdAt?.toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            }) || new Date().toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>
        <div className="text-right flex flex-col justify-end min-h-[100px]">
          <AlertTriangle className="h-16 w-16 text-red-400 mb-2" />
          <div className="text-zinc-400 mt-2">Failed</div>
        </div>
      </div>

      {/* Error Information */}
      <Card className="bg-red-500/5 border-red-500/20 backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="text-lg font-medium text-red-300 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Analysis Error
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
            <div className="text-sm font-medium text-red-200 mb-2">
              Error Code: {errorCode}
            </div>
            <p className="text-red-300 leading-relaxed">
              {errorMessage}
            </p>
          </div>
          
          {videoUrl && (
            <div className="mt-6">
              <h3 className="text-sm font-medium text-zinc-300 mb-3">
                Video Information
              </h3>
              <div className="bg-black/20 rounded-lg p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Video Title:</span>
                  <span className="text-zinc-300">{videoTitle || "Unknown"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Video URL:</span>
                  <a
                    href={videoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 truncate max-w-xs"
                  >
                    {videoUrl}
                  </a>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Troubleshooting */}
      <Card className="bg-black/40 border-zinc-800 backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="text-lg font-medium text-zinc-100">
            What to do next?
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 bg-black/20 rounded-lg">
              <div className="text-blue-400 font-semibold text-sm mt-0.5">1.</div>
              <div className="text-sm text-zinc-300">
                Try uploading the video again - this might be a temporary issue.
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 bg-black/20 rounded-lg">
              <div className="text-blue-400 font-semibold text-sm mt-0.5">2.</div>
              <div className="text-sm text-zinc-300">
                Check that your video meets the requirements (file size, format, etc.).
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 bg-black/20 rounded-lg">
              <div className="text-blue-400 font-semibold text-sm mt-0.5">3.</div>
              <div className="text-sm text-zinc-300">
                If the problem persists, contact support with the error code above.
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
