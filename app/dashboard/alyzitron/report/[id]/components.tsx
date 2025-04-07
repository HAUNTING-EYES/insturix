"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, CheckCircle, AlertCircle } from "lucide-react";
import Link from "next/link";
import type { AnalysisData, MetricData } from '../../types';

const ScoreIndicator = ({ score, invert }: { score: number, invert?: boolean }) => {
  let colorClass;
  const effectiveScore = invert ? 100 - score : score;
  
  if (effectiveScore >= 80) colorClass = "bg-green-500/10 text-green-400";
  else if (effectiveScore >= 60) colorClass = "bg-yellow-500/10 text-yellow-400";
  else colorClass = "bg-red-500/10 text-red-400";

  return (
    <div className={`text-xl font-bold px-3.5 py-1.5 rounded-lg ${colorClass}`}>
      {score}
    </div>
  );
};

interface AnalysisDetailsProps {
  analysisData: AnalysisData;
}

export function AnalysisDetails({ analysisData }: AnalysisDetailsProps) {
  // Calculate overall score from all metrics that have scores
  const scores: number[] = [];
  Object.entries(analysisData).forEach(([key, value]) => {
    if (key !== 'category' && key !== 'creator_feedback' && typeof value === 'object') {
      Object.values(value as Record<string, MetricData>).forEach(metric => {
        if (metric && typeof metric.score === 'number') {
          // Don't include compliance risk scores in overall score
          if (key !== 'compliance') {
            scores.push(metric.score);
          }
        }
      });
    }
  });
  const overallScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

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
          <h1 className="text-3xl font-semibold text-zinc-100">Analysis Results</h1>
          <p className="text-zinc-400 mt-2">{analysisData.category} • {new Date().toLocaleDateString('en-US', { 
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          })}</p>
        </div>
        <div className="text-right flex flex-col justify-end min-h-[100px]">
          <div className="text-6xl font-bold text-zinc-100 leading-none">{overallScore}</div>
          <div className="text-zinc-400 mt-2">Overall Score</div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Object.entries(analysisData).map(([section, data]) => {
          // Skip category and creator_feedback as they're handled separately
          if (section === 'category' || section === 'creator_feedback') return null;
          
          // Ensure data is a metrics object
          if (typeof data !== 'object' || data === null || Array.isArray(data)) {
            return null;
          }

          return (
            <Card key={section} className="bg-black/40 border-zinc-800 backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="text-lg font-medium text-zinc-100 capitalize">
                  {section.replace(/_/g, " ")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
               {Object.entries(data as Record<string, MetricData>).map(([key, value]) => (
                  <div key={key} className="px-4 py-3.5 bg-black/20 rounded-lg hover:bg-black/30 transition-colors">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="text-sm font-medium text-zinc-200 capitalize tracking-wide mb-1.5">
                          {key.replace(/_/g, " ")}
                        </div>
                        <p className="text-sm text-zinc-400 leading-relaxed">{value.description}</p>
                      </div>
                      <div className="flex items-center ml-4 shrink-0">
                       {section === 'compliance_risks' ? (
                          value.score ? (
                            <ScoreIndicator score={value.score} invert />
                          ) : null
                       ) : value.score ? (
                         <ScoreIndicator score={value.score} />
                       ) : null}
                     </div>
                   </div>
                 </div>
               ))}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Creator Feedback */}
      <Card className="bg-black/40 border-zinc-800 backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="text-lg font-medium text-zinc-100">Creator Feedback</CardTitle>
        </CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-8">
          <div>
            <h3 className="text-sm font-medium text-zinc-300 mb-4">Strengths</h3>
            <ul className="space-y-3">
              {analysisData?.creator_feedback?.strengths?.map((strength: string, index: number) => (
                <li key={index} className="flex items-center gap-2 text-sm text-zinc-400 bg-black/20 p-3 rounded-lg">
                  <CheckCircle className="h-5 w-5 text-green-400 shrink-0" />
                  <span className="leading-relaxed">{strength}</span>
                </li>
              )) || []}
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-medium text-zinc-300 mb-4">Improvements</h3>
            <ul className="space-y-3">
              {analysisData?.creator_feedback?.improvements?.map((improvement: string, index: number) => (
                <li key={index} className="flex items-center gap-2 text-sm text-zinc-400 bg-black/20 p-3 rounded-lg">
                  <AlertCircle className="h-5 w-5 text-yellow-400 shrink-0" />
                  <span className="leading-relaxed">{improvement}</span>
                </li>
              )) || []}
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}