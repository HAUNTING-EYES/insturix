"use client";

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Image from 'next/image';
import type { AlyzitronAnalysis, AnalysisStatus } from '@/app/api/services/alyzitron/types';
import { useTaskUpdater } from '@/hooks/useTaskUpdater';
import {
  Loader2,
  History,
  FileVideo,
  ChevronLeft,
  ChevronRight,
  ChevronRight as ChevronRightIcon,
  Calendar,
  Clock,
  AlertCircle
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AlyzitronTaskHistoryProps {
  itemsPerPage?: number;
}

interface AnalysisDisplay extends AlyzitronAnalysis {
  _id: string; // Ensure _id is always a string for frontend display
  expectedWaitSeconds?: number;
  completedAt?: Date; // Add completedAt to the interface
}

interface PaginatedAnalysisResponse {
  data: AnalysisDisplay[];
  pagination: {
    totalItems: number;
    totalPages: number;
    currentPage: number;
    itemsPerPage: number;
  };
}

const DEFAULT_ITEMS_PER_PAGE = 6;


interface AnalysisCardProps {
  analysis: AnalysisDisplay;
  onClick: () => void;
}

function AnalysisCard({ analysis, onClick }: AnalysisCardProps) {
  const displayTitle = analysis.metadata?.originalFilename || `Analysis #${analysis._id?.toString().slice(-6)}`;
  const isClickable = analysis.status === 'completed' || analysis.status === 'failed';

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

  const isYouTubeUrl = analysis.videoUrl && (analysis.videoUrl.includes('youtube.com') || analysis.videoUrl.includes('youtu.be'));
  const youtubeVideoId = isYouTubeUrl ? extractYouTubeVideoId(analysis.videoUrl) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
    >
      <Card
        className={cn(
          "relative bg-black/40 border-zinc-800 backdrop-blur-xl",
          analysis.status === 'processing' || analysis.status === 'queued' || analysis.status === 'listed' ? 'ring-1 ring-zinc-700' : '',
          (analysis.status === 'completed' || analysis.status === 'failed') ? 'cursor-pointer hover:bg-black/50 transition-colors duration-300' : ''
        )}
        onClick={isClickable ? onClick : undefined}
      >
        <CardContent className="flex items-center p-4">
          {/* Thumbnail Preview */}
          <div className="h-12 w-12 rounded-lg bg-black/40 flex items-center justify-center mr-4 overflow-hidden">
            {youtubeVideoId ? (
              <Image
                src={`https://img.youtube.com/vi/${youtubeVideoId}/hqdefault.jpg`}
                alt={displayTitle || 'Video thumbnail'}
                fill
                sizes="48px"
                className="object-cover"
                onError={() => {
                  /* Fallback icon is rendered just after this component */
                }}
                priority={false}
              />
            ) : null}
            <FileVideo
              className={cn(
                "h-6 w-6 text-zinc-400",
                youtubeVideoId ? "hidden" : ""
              )}
              style={{ display: youtubeVideoId ? 'none' : 'block' }}
            />
          </div>

          {/* Analysis Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-sm font-medium text-zinc-100 truncate" title={displayTitle}>
                {displayTitle}
              </h3>
            </div>
            <div className="flex items-center gap-3 text-xs text-zinc-500">
              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {new Date(analysis.createdAt).toLocaleDateString()}
              </div>
              {analysis.completedAt && (
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {new Date(analysis.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              )}
              {analysis.status === 'failed' && analysis.error && (
                <div className="flex items-center gap-1 text-red-400">
                  <AlertCircle className="h-3 w-3" />
                  Error
                </div>
              )}
            </div>
          </div>

          {/* Status and Action */}
          <div className="ml-4 flex items-center gap-4">
            <div className="text-right min-h-[40px] flex flex-col items-end justify-center">
              <AnimatePresence mode="wait" initial={false}>
                {analysis.status === 'listed' && (
                  <motion.div
                    key="listed"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="text-xs text-zinc-400"
                  >
                    Listed
                  </motion.div>
                )}
                {analysis.status === 'queued' && (
                  <motion.div
                    key="queued"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="text-sm text-zinc-400"
                  >
                    {analysis.queuePosition != null ? `Queue: #${analysis.queuePosition}` : 'Queued'}
                  </motion.div>
                )}
                {analysis.status === 'processing' && (
                  <motion.div
                    key="processing"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="flex items-center gap-2 text-sm text-zinc-200"
                  >
                    <Loader2 className="h-4 w-4 animate-spin text-zinc-300" />
                    <span>Processing</span>
                  </motion.div>
                )}
                {analysis.status === 'completed' && (
                  <motion.div
                    key="completed"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="flex items-center gap-2"
                  >
                    <div className={`h-10 w-10 rounded-lg ${analysis.unread ? 'bg-white text-black':'text-white'} flex items-center justify-center`}>
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        className="h-6 w-6"
                      >
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    </div>
                    <ChevronRightIcon className="h-5 w-5 text-zinc-500" />
                  </motion.div>
                )}
                {analysis.status === 'failed' && (
                  <motion.div
                    key="failed"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="flex items-center gap-2"
                  >
                    <div className="text-right">
                      <div className="text-sm font-medium text-red-400">Failed</div>
                      {analysis.error?.code && (
                        <div className="text-sm text-zinc-500">{analysis.error.code}</div>
                      )}
                    </div>
                    <ChevronRightIcon className="h-5 w-5 text-zinc-500" />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export function AlyzitronTaskHistory({ itemsPerPage = DEFAULT_ITEMS_PER_PAGE }: AlyzitronTaskHistoryProps) {
  const router = useRouter();
  const [currentPage, setCurrentPage] = useState(1);

  // Align with Musitron/Clickatron: RTDB-driven invalidation only
  useTaskUpdater();

  // SERVER pagination: trust API metadata, no client slicing for history
  const { data: pageData, isLoading } = useQuery<PaginatedAnalysisResponse>({
    // Standardized per-service key: ['alyzitron-tasks', page, limit]
    queryKey: ['alyzitron-tasks', currentPage, itemsPerPage],
    queryFn: async () => {
      const response = await fetch(`/api/services/alyzitron/analyses?page=${currentPage}&limit=${itemsPerPage}`);
      if (!response.ok) throw new Error('Failed to fetch analyses');
      return response.json();
    },
    placeholderData: (previousData) => previousData,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false,
  });

  const pageItems = Array.isArray(pageData?.data) ? pageData!.data : [];
  const inProgressStatuses: AnalysisStatus[] = ['listed', 'queued', 'processing'];
  const inProgressAnalyses: AnalysisDisplay[] = pageItems.filter(a => inProgressStatuses.includes(a.status));
  const completedFailedAnalyses: AnalysisDisplay[] = pageItems.filter(a => !inProgressStatuses.includes(a.status));

  const totalPages = Math.max(1, Number(pageData?.pagination?.totalPages) || 1);
  const totalItems = Number(pageData?.pagination?.totalItems) || pageItems.length;
  const processingAnalysesCount = inProgressAnalyses.length;

  const handlePreviousPage = () => {
    setCurrentPage((prev) => Math.max(prev - 1, 1));
  };

  const handleNextPage = () => {
    setCurrentPage((prev) => Math.min(prev + 1, totalPages));
  };

  const handleAnalysisClick = (analysisId: string) => {
    router.push(`/dashboard/alyzitron/report/${analysisId}`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <History className="h-5 w-5 text-blue-400" />
          <h2 className="text-lg sm:text-xl font-medium text-zinc-100">Analysis History</h2>
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <span className="px-2 py-1 bg-zinc-800/50 rounded-full text-xs">
              {totalItems} total
            </span>
            {processingAnalysesCount > 0 && (
              <span className="px-2 py-1 bg-blue-500/20 text-blue-300 rounded-full text-xs animate-pulse">
                {processingAnalysesCount} processing
              </span>
            )}
          </div>
        </div>
      </div>

      {/* In Progress Section */}
      {inProgressAnalyses && inProgressAnalyses.length > 0 && (
        <div className="mb-6">
          <h3 className="text-md font-semibold text-blue-300 mb-2">In Progress</h3>
          <div className="space-y-3 sm:space-y-4">
            {inProgressAnalyses.map((analysis: AnalysisDisplay) => (
              <AnalysisCard key={analysis._id} analysis={analysis} onClick={() => handleAnalysisClick(analysis._id)} />
            ))}
          </div>
        </div>
      )}

      {/* Completed Section */}
      <div className="space-y-3 sm:space-y-4 min-h-[400px] relative">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
          </div>
        ) : completedFailedAnalyses.length === 0 && inProgressAnalyses.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-zinc-700 bg-black/20 py-24 px-6">
            <FileVideo className="h-12 w-12 text-zinc-500 mb-4" />
            <p className="text-zinc-400 text-center mb-2">No analyses found yet</p>
            <p className="text-zinc-500 text-sm text-center">
              Start an analysis using the form above to see it appear here.
            </p>
          </div>
        ) : (
          <>
            <h3 className="text-md font-semibold text-blue-300 mb-2">Completed</h3>
            {completedFailedAnalyses.map((analysis) => (
              <AnalysisCard
                key={analysis._id}
                analysis={analysis}
                onClick={() => handleAnalysisClick(analysis._id)}
              />
            ))}

            {/* Empty state for current page */}
            {completedFailedAnalyses.length === 0 && !isLoading && (
              <div className="text-center py-8 text-zinc-500">
                No analyses on this page.
              </div>
            )}
          </>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 mt-6">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePreviousPage}
            disabled={currentPage === 1 || isLoading}
            className="w-full sm:w-auto order-2 sm:order-1"
          >
            <ChevronLeft className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
            <span className="text-xs sm:text-sm">Previous</span>
          </Button>
          <span className="text-xs sm:text-sm text-zinc-400 order-1 sm:order-2 text-center">
            Page {currentPage} of {totalPages}
            <span className="hidden sm:inline"> ({totalItems} total)</span>
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={handleNextPage}
            disabled={currentPage >= totalPages || isLoading}
            className="w-full sm:w-auto order-3"
          >
            <span className="text-xs sm:text-sm">Next</span>
            <ChevronRight className="ml-1 sm:ml-2 h-3 w-3 sm:h-4 sm:w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}