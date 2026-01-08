"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, CheckCircle, AlertCircle, AlertTriangle, Lock, Shield, Share2, Copy, Check, Globe, X, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { AnalysisData, MetricData } from "../../../../../lib/types";

// Helper function to copy text to clipboard
const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error('Failed to copy:', err);
    return false;
  }
};

// Helper function to format description with hashtags
const formatDescription = (description: string) => {
  const parts = description.split(/(#\w+)/g);
  return parts.map((part, index) => {
    if (part.startsWith('#')) {
      return (
        <span key={index} className="text-blue-400 font-medium">
          {part}
        </span>
      );
    }
    return part;
  });
};

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
  const [currentTitleIndex, setCurrentTitleIndex] = useState(0);
  const [currentDescriptionIndex, setCurrentDescriptionIndex] = useState(0);
  const [showAllTitles, setShowAllTitles] = useState(false);
  const [showAllDescriptions, setShowAllDescriptions] = useState(false);
  const [copiedItems, setCopiedItems] = useState<Set<string>>(new Set());

  // Helper function to handle copy with visual feedback
  const handleCopy = async (text: string, itemId: string) => {
    const success = await copyToClipboard(text);
    if (success) {
      setCopiedItems(prev => new Set(prev).add(itemId));
      setTimeout(() => {
        setCopiedItems(prev => {
          const newSet = new Set(prev);
          newSet.delete(itemId);
          return newSet;
        });
      }, 2000);
    }
  };

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

  // Helper functions for title/description navigation
  const nextTitle = () => {
    if (analysisData.titles && analysisData.titles.length > 1) {
      setCurrentTitleIndex((prev) => (prev + 1) % analysisData.titles!.length);
    }
  };

  const prevTitle = () => {
    if (analysisData.titles && analysisData.titles.length > 1) {
      setCurrentTitleIndex((prev) => (prev - 1 + analysisData.titles!.length) % analysisData.titles!.length);
    }
  };

  const nextDescription = () => {
    if (analysisData.descriptions && analysisData.descriptions.length > 1) {
      setCurrentDescriptionIndex((prev) => (prev + 1) % analysisData.descriptions!.length);
    }
  };

  const prevDescription = () => {
    if (analysisData.descriptions && analysisData.descriptions.length > 1) {
      setCurrentDescriptionIndex((prev) => (prev - 1 + analysisData.descriptions!.length) % analysisData.descriptions!.length);
    }
  };
  // Use the overall score from the new structure
  const overallScore = analysisData.overall_score || 0;

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
        
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 sm:gap-8">
          <div className="flex-1">
            <h1 className="text-2xl sm:text-3xl font-semibold text-zinc-100">
              Analysis Results
            </h1>
            <p className="text-zinc-400 mt-2 flex flex-wrap items-center gap-2">
              <span className="shrink-0">{analysisData.category}</span>
              <span className="hidden sm:inline text-zinc-700">•</span>
              <span className="shrink-0">
                {createdAt?.toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                }) || new Date().toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </span>
              {isOwner && (
                <span className="flex items-center gap-1 text-xs shrink-0">
                  <span className="hidden sm:inline text-zinc-700">•</span>
                  {currentIsPublic ? (
                    <span className="flex items-center gap-1 transition-colors">
                      <Globe className="h-3 w-3" />
                      Public
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 transition-colors">
                      <Lock className="h-3 w-3" />
                      Private
                    </span>
                  )}
                </span>
              )}
            </p>
          </div>
          <div className="flex sm:flex-col items-center sm:items-end justify-start gap-4 sm:gap-0 sm:justify-end min-h-[60px] sm:min-h-[100px]">
            <div className="text-4xl sm:text-6xl font-bold text-zinc-100 leading-none">
              {overallScore}
            </div>
            <div className="text-zinc-400 text-sm sm:mt-2">Overall Score</div>
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

      {/* Overview Section */}
      {analysisData.overview && (
        <Card className="bg-black/40 border-zinc-800 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-lg font-medium text-zinc-100">Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-zinc-300 leading-relaxed">{analysisData.overview}</p>
          </CardContent>
        </Card>
      )}

      {/* Analysis Summary - Remarks Section */}
      {analysisData.remarks && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          <Card className="bg-gradient-to-br from-blue-500/10 via-purple-500/10 to-indigo-500/10 border-blue-500/30 backdrop-blur-xl relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 via-transparent to-purple-500/5 animate-pulse" />
            <CardHeader className="relative">
              <CardTitle className="text-xl font-semibold text-blue-100 flex items-center gap-3">
                <div className="p-2 bg-blue-500/20 rounded-lg">
                  <CheckCircle className="h-5 w-5 text-blue-400" />
                </div>
                Analysis Summary
                <div className="flex-1 h-px bg-gradient-to-r from-blue-500/30 to-transparent ml-4" />
              </CardTitle>
              <p className="text-blue-300/70 text-sm mt-2">
                Key insights and conclusions from the complete analysis
              </p>
            </CardHeader>
            <CardContent className="relative">
              <div className="bg-black/20 rounded-lg p-6 border border-blue-500/20">
                <p className="text-zinc-200 leading-relaxed text-lg font-medium">
                  {analysisData.remarks}
                </p>
              </div>
              <div className="flex items-center justify-end mt-4">
                <button
                  onClick={() => handleCopy(analysisData.remarks!, 'analysis-summary')}
                  className="inline-flex items-center gap-2 px-3 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 hover:text-blue-200 border border-blue-500/30 hover:border-blue-500/50 rounded-lg transition-all duration-200 text-sm"
                >
                  {copiedItems.has('analysis-summary') ? (
                    <>
                      <Check className="h-3 w-3" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      Copy Summary
                    </>
                  )}
                </button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* AI-Generated Titles and Descriptions */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
        {/* Titles Section */}
        {analysisData.titles && analysisData.titles.length > 0 && (
          <Card className="bg-black/40 border-zinc-800 backdrop-blur-xl lg:col-span-2 self-start">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-medium text-zinc-100 flex items-center justify-between">
                Recommended Titles
                {analysisData.titles.length > 1 && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowAllTitles(!showAllTitles)}
                      className="text-xs text-zinc-400 hover:text-zinc-300 transition-colors"
                    >
                      {showAllTitles ? 'Show One' : `Show All (${analysisData.titles.length})`}
                    </button>
                  </div>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <AnimatePresence mode="wait">
                {showAllTitles ? (
                  <motion.div
                    key="all-titles"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                    className="space-y-3"
                  >
                    {analysisData.titles.map((title, index) => (
                      <div key={index} className="p-3 bg-black/20 rounded-lg group hover:bg-black/30 transition-colors">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-zinc-300 leading-relaxed flex-1 text-sm">{title}</p>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => handleCopy(title, `title-${index}`)}
                              className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-zinc-700 transition-all duration-200"
                              title="Copy title"
                            >
                              {copiedItems.has(`title-${index}`) ? (
                                <Check className="h-3 w-3 text-green-400" />
                              ) : (
                                <Copy className="h-3 w-3 text-zinc-400" />
                              )}
                            </button>
                            <span className="text-xs text-zinc-500">#{index + 1}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </motion.div>
                ) : (
                  <motion.div
                    key="single-title"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                    className="space-y-3"
                  >
                    <div className="p-3 bg-black/20 rounded-lg group hover:bg-black/30 transition-colors">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-zinc-300 leading-relaxed flex-1 text-sm">{analysisData.titles[currentTitleIndex]}</p>
                        <button
                          onClick={() => handleCopy(analysisData.titles[currentTitleIndex], `current-title`)}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-zinc-700 transition-all duration-200 shrink-0"
                          title="Copy title"
                        >
                          {copiedItems.has(`current-title`) ? (
                            <Check className="h-3 w-3 text-green-400" />
                          ) : (
                            <Copy className="h-3 w-3 text-zinc-400" />
                          )}
                        </button>
                      </div>
                    </div>
                    {analysisData.titles.length > 1 && (
                      <div className="flex justify-between items-center">
                        <button
                          onClick={prevTitle}
                          className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-300 transition-colors"
                        >
                          <ChevronLeft className="h-3 w-3" />
                          Previous
                        </button>
                        <span className="text-xs text-zinc-500">
                          {currentTitleIndex + 1} of {analysisData.titles.length}
                        </span>
                        <button
                          onClick={nextTitle}
                          className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-300 transition-colors"
                        >
                          Next
                          <ChevronRight className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </CardContent>
          </Card>
        )}

        {/* Descriptions Section */}
        {analysisData.descriptions && analysisData.descriptions.length > 0 && (
          <Card className="bg-black/40 border-zinc-800 backdrop-blur-xl lg:col-span-3 self-start">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-medium text-zinc-100 flex items-center justify-between">
                Recommended Descriptions
                {analysisData.descriptions.length > 1 && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowAllDescriptions(!showAllDescriptions)}
                      className="text-xs text-zinc-400 hover:text-zinc-300 transition-colors"
                    >
                      {showAllDescriptions ? 'Show One' : `Show All (${analysisData.descriptions.length})`}
                    </button>
                  </div>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <AnimatePresence mode="wait">
                {showAllDescriptions ? (
                  <motion.div
                    key="all-descriptions"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                    className="space-y-4"
                  >
                    {analysisData.descriptions.map((description, index) => (
                      <div key={index} className="p-4 bg-black/20 rounded-lg group hover:bg-black/30 transition-colors">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <p className="text-zinc-300 leading-relaxed text-sm">
                              {formatDescription(description)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => handleCopy(description, `description-${index}`)}
                              className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-zinc-700 transition-all duration-200"
                              title="Copy description"
                            >
                              {copiedItems.has(`description-${index}`) ? (
                                <Check className="h-3 w-3 text-green-400" />
                              ) : (
                                <Copy className="h-3 w-3 text-zinc-400" />
                              )}
                            </button>
                            <span className="text-xs text-zinc-500">#{index + 1}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </motion.div>
                ) : (
                  <motion.div
                    key="single-description"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                    className="space-y-3"
                  >
                    <div className="p-4 bg-black/20 rounded-lg group hover:bg-black/30 transition-colors">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="text-zinc-300 leading-relaxed text-sm">
                            {formatDescription(analysisData.descriptions[currentDescriptionIndex])}
                          </p>
                        </div>
                        <button
                          onClick={() => handleCopy(analysisData.descriptions[currentDescriptionIndex], `current-description`)}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-zinc-700 transition-all duration-200 shrink-0"
                          title="Copy description"
                        >
                          {copiedItems.has(`current-description`) ? (
                            <Check className="h-3 w-3 text-green-400" />
                          ) : (
                            <Copy className="h-3 w-3 text-zinc-400" />
                          )}
                        </button>
                      </div>
                    </div>
                    {analysisData.descriptions.length > 1 && (
                      <div className="flex justify-between items-center">
                        <button
                          onClick={prevDescription}
                          className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-300 transition-colors"
                        >
                          <ChevronLeft className="h-3 w-3" />
                          Previous
                        </button>
                        <span className="text-xs text-zinc-500">
                          {currentDescriptionIndex + 1} of {analysisData.descriptions.length}
                        </span>
                        <button
                          onClick={nextDescription}
                          className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-300 transition-colors"
                        >
                          Next
                          <ChevronRight className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Target Audience Section */}
      {analysisData.target_audience && (
        <Card className="bg-black/40 border-zinc-800 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-lg font-medium text-zinc-100">Target Audience</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-zinc-300 leading-relaxed">{analysisData.target_audience}</p>
          </CardContent>
        </Card>
      )}

      {/* Main Grid - Masonry Layout */}
      <div className="columns-1 lg:columns-2 gap-6 space-y-6">
        {Object.entries(analysisData).map(([section, data]) => {
          // Skip fields that are handled separately or are not metric groups
          if (section === "category" ||
              section === "creator_feedback" ||
              section === "overall_score" ||
              section === "overview" ||
              section === "titles" ||
              section === "descriptions" ||
              section === "target_audience")
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
              className="bg-black/40 border-zinc-800 backdrop-blur-xl break-inside-avoid mb-6"
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
                          {/* {section === "compliance_risks" ? (
                            value.score ? (
                              <ScoreIndicator score={value.score} invert />
                            ) : null
                          )}: */}
                          { value.score ? (
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
              Areas for Improvement
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
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 sm:gap-8 pb-8 mb-8 border-b border-zinc-800">
        <div className="flex-1">
          <Link
            href="/dashboard/alyzitron"
            className="inline-flex items-center text-zinc-400 hover:text-zinc-300 mb-4 transition-colors"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Link>
          <h1 className="text-2xl sm:text-3xl font-semibold text-zinc-100">
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
        <div className="flex sm:flex-col items-center sm:items-end justify-start gap-4 sm:gap-0 sm:justify-end min-h-[60px] sm:min-h-[100px]">
          <AlertTriangle className="h-10 w-10 sm:h-16 sm:w-16 text-red-400 mb-0 sm:mb-2" />
          <div className="text-zinc-500 font-medium tracking-tight sm:mt-2">Failed</div>
        </div>
      </div>

      {/* Error Information */}
      <Card className="bg-red-500/5 border-red-500/20 backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="text-lg font-medium text-red-300 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            OOPS! Something went wrong
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
            <div className="text-sm font-medium text-red-200 mb-2">
             Looks like something’s missing — check the video requirements and try again 😊
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-4 pt-2 mb-4float-end">
            <Link
              href="/dashboard/alyzitron"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-xl transition-all shadow-lg shadow-red-500/20 hover:shadow-red-500/40 active:scale-95 group"
            >
              <RotateCcw className="h-5 w-5 group-hover:rotate-180 transition-transform duration-500" />
              Try Again
            </Link>
          </div>

          {videoUrl && (
            <div className="mt-6 pt-6 border-t border-red-500/10">
              <h3 className="text-sm font-medium text-zinc-300 mb-3">
                Video Information
              </h3>
              <div className="bg-black/20 rounded-lg p-4 space-y-2">
                <div className="flex flex-col sm:flex-row justify-between gap-1">
                  <span className="text-zinc-500 text-sm">Video Title:</span>
                  <span className="text-zinc-300 text-sm font-medium">{videoTitle || "Unknown"}</span>
                </div>
                <div className="flex flex-col sm:flex-row justify-between gap-1">
                  <span className="text-zinc-500 text-sm">Video URL:</span>
                  <a
                    href={videoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 text-sm truncate max-w-xs sm:max-w-md"
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
                The video may be unavailable, private, or in an unsupported format.
              Recheck the link and try again. 
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
