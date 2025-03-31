"use client";

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ShareButton } from './ShareButton';
import { motion } from 'framer-motion';

interface Metrics {
  duration?: number;
  engagement_score?: number;
  quality_score?: number;
  [key: string]: number | string | undefined;
}

interface ReportContentProps {
  id: string;
  title: string;
  date: string;
  type: string;
  fileSize?: number;
  mimeType: string;
  metrics: Metrics;
  score: number;
  insights: string[];
  results: any;
}

function formatMetricValue(value: number | string | undefined): string {
  if (typeof value === 'undefined') return 'N/A';
  if (typeof value === 'number') return value.toFixed(2);
  return value.toString();
}

export function ReportContent({
  id,
  title,
  date,
  type,
  fileSize,
  mimeType,
  metrics,
  score,
  insights,
  results,
}: ReportContentProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      {/* Header */}
      <div className="mb-8 flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-semibold text-zinc-100">
            Analysis Report
          </h1>
          <p className="text-zinc-400 mt-2">{title}</p>
          <p className="text-sm text-zinc-500 mt-1">Analyzed on {date}</p>
        </div>
        <ShareButton analysisId={id} />
      </div>

      {/* Content */}
      <div className="grid gap-6">
        {/* Video Overview */}
        <Card className="bg-black/40 border-zinc-800 backdrop-blur-xl">
          <CardHeader>
            <CardTitle>Video Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-zinc-500">Type</p>
                <p className="text-zinc-100">{type}</p>
              </div>
              <div>
                <p className="text-sm text-zinc-500">Duration</p>
                <p className="text-zinc-100">
                  {metrics.duration ? `${formatMetricValue(metrics.duration)} seconds` : 'Not available'}
                </p>
              </div>
              <div>
                <p className="text-sm text-zinc-500">File Size</p>
                <p className="text-zinc-100">
                  {fileSize 
                    ? `${Math.round(fileSize / 1024 / 1024)} MB`
                    : 'Not available'
                  }
                </p>
              </div>
              <div>
                <p className="text-sm text-zinc-500">Format</p>
                <p className="text-zinc-100">{mimeType}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Analysis Results */}
        <Card className="bg-black/40 border-zinc-800 backdrop-blur-xl">
          <CardHeader>
            <CardTitle>Analysis Results</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="p-4 bg-black/20 rounded-lg"
              >
                <div className="text-sm font-medium text-zinc-400 mb-1">
                  Overall Score
                </div>
                <div className="text-3xl font-semibold text-zinc-100">
                  {score.toFixed(1)}
                </div>
              </motion.div>

              {insights.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-zinc-100">Key Insights</h3>
                  <div className="space-y-2">
                    {insights.map((insight: string, index: number) => (
                      <motion.div
                        key={index}
                        initial={{ x: -20, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ delay: 0.4 + index * 0.1 }}
                        className="p-3 bg-black/20 rounded-lg text-zinc-300"
                      >
                        {insight}
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

              {/* Detailed Metrics */}
              {Object.keys(metrics).length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-zinc-100">Detailed Metrics</h3>
                  <div className="grid sm:grid-cols-2 gap-4">
                    {Object.entries(metrics).map(([key, value], index) => (
                      key !== 'duration' && (
                        <motion.div
                          key={key}
                          initial={{ y: 20, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          transition={{ delay: 0.5 + index * 0.1 }}
                          className="p-3 bg-black/20 rounded-lg"
                        >
                          <p className="text-sm text-zinc-400 capitalize">
                            {key.replace(/_/g, ' ')}
                          </p>
                          <p className="text-zinc-100 mt-1">
                            {formatMetricValue(value)}
                          </p>
                        </motion.div>
                      )
                    ))}
                  </div>
                </div>
              )}
              
              {/* Raw Results (for debugging) */}
              {process.env.NODE_ENV === 'development' && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.8 }}
                  className="mt-8 p-4 bg-black/20 rounded-lg"
                >
                  <p className="text-sm font-medium text-zinc-400 mb-2">Debug Info</p>
                  <pre className="text-xs text-zinc-500 overflow-auto">
                    {JSON.stringify(results, null, 2)}
                  </pre>
                </motion.div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}