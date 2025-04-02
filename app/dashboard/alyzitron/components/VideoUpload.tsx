"use client";

import React, { useCallback, useState, useEffect } from 'react';
import { Analysis } from '../hooks/useAnalysisState';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Upload, Link2, X } from 'lucide-react';
import { useVideoAnalysis } from '../hooks/useVideoAnalysis';
import { useAnalysisState } from '../hooks/useAnalysisState';
import { formatFileSize, formatSpeed } from '../utils/progress';

interface VideoUploadProps {
  onSubmit: (analysisId: string, analysis: Analysis) => void;
  onComplete: (analysisId: string, analysis: Analysis) => void;
}

import { VideoType } from '@/app/api/services/alyzitron/types';

const VIDEO_TYPES: { label: string; value: VideoType }[] = [
  { label: 'Short Form', value: 'SHORT_FORM' },
  { label: 'Educational', value: 'EDUCATIONAL' },
  { label: 'Entertainment', value: 'ENTERTAINMENT' },
  { label: 'Music', value: 'MUSIC' },
  { label: 'Product Review', value: 'PRODUCT_REVIEW' },
  { label: 'Vlog', value: 'VLOG' }
];

export function VideoUpload({ onComplete, onSubmit }: VideoUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [selectedType, setSelectedType] = useState<VideoType | ''>('');
  const [currentAnalysisId, setCurrentAnalysisId] = useState<string | null>(null);

  const {
    uploadState,
    analysisState,
    analyzeFile,
    submitAnalysis,
    resetState,
  } = useVideoAnalysis();

  const {
    analysis,
    startProgressTracking,
    startQueueTracking,
  } = useAnalysisState(currentAnalysisId || undefined);

  // Start progress tracking when analysis begins
  useEffect(() => {
    if (analysis?.status === 'processing' && analysis.estimatedTime) {
      startProgressTracking(analysis.estimatedTime);
    }
  }, [analysis?.status, analysis?.estimatedTime, startProgressTracking]);

  // Start queue tracking when queued
  useEffect(() => {
    if (analysis?.status === 'queued' && analysis.queuePosition) {
      startQueueTracking(analysis.queuePosition);
    }
  }, [analysis?.status, analysis?.queuePosition, startQueueTracking]);

  // Handle completion state
  useEffect(() => {
    if (!currentAnalysisId || !analysis) return;

    if (analysis.status === 'completed') {
      onComplete(currentAnalysisId, analysis);
      // Reset states immediately since queries are handled by AnalysisList
      setSelectedFile(null);
      setVideoUrl('');
      setSelectedType('');
      setCurrentAnalysisId(null);
      resetState();
    }
  }, [analysis?.status, currentAnalysisId, onComplete, resetState]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setVideoUrl('');
    }
  };

  const handleSubmit = useCallback(async () => {
    if (!selectedType) return;
    
    try {
      let result;
      if (selectedFile) {
        result = await analyzeFile(selectedFile, selectedType);
      } else if (videoUrl) {
        result = await submitAnalysis(videoUrl, selectedType);
      }

      if (result?.analysisId) {
        setCurrentAnalysisId(result.analysisId);
        // Trigger immediate optimistic update
        onSubmit(result.analysisId, {
          analysisId: result.analysisId,
          taskId: result.taskId,
          type: selectedType,
          title: selectedFile?.name || videoUrl,
          videoUrl: videoUrl || selectedFile?.name || '',
          status: 'queued',
          progress: 0,
          estimatedTime: result.estimatedTime || 60,
          queuePosition: 1
        });
      }
    } catch (err) {
      console.error('Submission failed:', err);
    }
  }, [selectedFile, videoUrl, selectedType, analyzeFile, submitAnalysis, onSubmit]);

  const clearFile = () => {
    setSelectedFile(null);
    setVideoUrl('');
  };

  const isValid = (selectedFile || videoUrl) && selectedType && analysisState.status === 'idle';
  const isProcessing = analysisState.status !== 'idle';
  const isUploading = !!uploadState;
  const showProgress = isProcessing || isUploading;

  return (
    <Card className="bg-black/40 border-zinc-800 backdrop-blur-xl">
      <CardContent className="pt-6">
        <Tabs defaultValue="upload" className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-black/20">
            <TabsTrigger
              value="upload"
              disabled={showProgress}
              className="data-[state=active]:bg-zinc-100 data-[state=active]:text-zinc-900"
            >
              <Upload className="mr-2 h-4 w-4" />
              Upload Video
            </TabsTrigger>
            <TabsTrigger
              value="link"
              disabled={showProgress}
              className="data-[state=active]:bg-zinc-100 data-[state=active]:text-zinc-900"
            >
              <Link2 className="mr-2 h-4 w-4" />
              Video Link
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="mt-6">
            <div className={`
              relative border border-dashed rounded-lg p-10 text-center
              ${selectedFile
                ? 'border-zinc-700 bg-black/20'
                : 'border-zinc-800 hover:border-zinc-700 transition-colors duration-300 group'
              }
            `}>
              {selectedFile ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <Upload className="h-8 w-8 text-zinc-500 mr-3" />
                    <div className="text-left">
                      <p className="text-zinc-300 font-medium">{selectedFile.name}</p>
                      <p className="text-zinc-500 text-sm">
                        {formatFileSize(selectedFile.size)}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={clearFile}
                    disabled={showProgress}
                    className="text-zinc-500 hover:text-zinc-300"
                  >
                    <X className="h-5 w-5" />
                  </Button>
                </div>
              ) : (
                <>
                  <Input
                    type="file"
                    className="hidden"
                    id="video-upload"
                    accept="video/*"
                    onChange={handleFileChange}
                    disabled={showProgress}
                  />
                  <label
                    htmlFor="video-upload"
                    className="flex flex-col items-center cursor-pointer"
                  >
                    <Upload className="h-12 w-12 mb-4 text-zinc-700 group-hover:text-zinc-500 transition-colors duration-300" />
                    <p className="text-zinc-500 group-hover:text-zinc-400 transition-colors duration-300 max-w-md mx-auto">
                      Upload your video file or drag and drop here
                    </p>
                  </label>
                </>
              )}

              {uploadState && (
                <div className="mt-4">
                  <div className="h-1 bg-black/40 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-zinc-100 transition-all duration-300"
                      style={{ width: `${uploadState.progress * 100}%` }}
                    />
                  </div>
                  <div className="mt-2 flex justify-between text-sm">
                    <span className="text-zinc-500">
                      {Math.round(uploadState.progress * 100)}%
                    </span>
                    <span className="text-zinc-500">
                      {formatSpeed(uploadState.speed)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="link" className="mt-6">
            <Input
              type="url"
              placeholder="Enter YouTube URL"
              className="bg-black/20 border-zinc-800 focus:border-zinc-700 h-12"
              value={videoUrl}
              onChange={(e) => {
                setVideoUrl(e.target.value);
                setSelectedFile(null);
              }}
              disabled={showProgress}
            />
          </TabsContent>
        </Tabs>

        {/* Video Type Selection */}
        <div className="mt-8">
          <label className="block text-sm font-medium text-zinc-400 mb-4 uppercase tracking-wider">
            Content Category
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {VIDEO_TYPES.map((type) => (
              <button
                key={type.value}
                onClick={() => setSelectedType(type.value)}
                disabled={showProgress}
                className={`
                  px-4 py-3 rounded-lg text-sm font-medium tracking-wide transition-all duration-300
                  ${selectedType === type.value
                    ? 'bg-zinc-100 text-zinc-900'
                    : 'bg-black/20 text-zinc-400 hover:bg-black/40 hover:text-zinc-300'
                  }
                `}
              >
                {type.label}
              </button>
            ))}
          </div>
        </div>

        {/* Submit Button */}
        <div className="mt-8">
          <Button
            size="lg"
            className={`
              w-full h-14 text-base font-medium tracking-wide
              ${!isValid
                ? 'bg-zinc-800 text-zinc-500'
                : 'bg-zinc-100 text-zinc-900 hover:bg-zinc-200'
              }
              transition-all duration-300
            `}
            onClick={handleSubmit}
            disabled={!isValid || showProgress}
          >
            {showProgress ? (
              <div className="flex items-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                <span>
                  {analysisState.status === 'uploading' ? 'Uploading...' : 'Analyzing...'}
                </span>
              </div>
            ) : (
              "Begin Analysis"
            )}
          </Button>
        </div>

        {/* Error Display */}
        {analysisState.error && (
          <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
            <p className="text-red-500 text-sm">
              {analysisState.error.message}
            </p>
            {analysisState.error.action && (
              <p className="text-red-400 text-sm mt-1">
                {analysisState.error.action}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}