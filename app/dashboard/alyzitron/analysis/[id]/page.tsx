"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, AlertTriangle, CheckCircle, AlertCircle } from "lucide-react";
import Link from "next/link";
import type { AnalysisData, MetricData } from '../../types';

const defaultAnalysisData: AnalysisData = {
  "category": "Educational Video",
  "engagement_metrics": {
    "value_proposition_clarity": {
      "score": 78,
      "description": "The video demonstrates the value of understanding financial terms in business negotiations."
    },
    "information_clarity": {
      "score": 70,
      "description": "The information is presented clearly, but could benefit from additional context and explanations."
    }
  },
  "technical_quality": {
    "screen_recording_quality": {
      "score": 70,
      "description": "The screen recording quality is adequate, but could be improved for better viewing on larger screens."
    },
    "voice_clarity": {
      "score": 85,
      "description": "The voice clarity is good, and the audio is easy to understand."
    }
  },
  "creator_feedback": {
    "strengths": [
      "The video features engaging clips from Shark Tank.",
      "It presents a real-world example of business negotiation."
    ],
    "improvements": [
      "Add timestamps to allow viewers to easily navigate to specific moments in the video.",
      "Include a brief summary of the key takeaways from the negotiation."
    ]
  }
};

const ScoreIndicator = ({ score }: { score: number }) => {
  let colorClass;
  if (score >= 80) colorClass = "bg-green-500/10 text-green-400";
  else if (score >= 60) colorClass = "bg-yellow-500/10 text-yellow-400";
  else colorClass = "bg-red-500/10 text-red-400";

  return (
    <div className={`text-xl font-bold px-3 py-1 rounded-lg ${colorClass}`}>
      {score}
    </div>
  );
};

interface AnalysisDetailsProps {
  params: { 
    id: string;
  };
  analysisData?: AnalysisData;
}

export default function AnalysisDetails({ params, analysisData = defaultAnalysisData }: AnalysisDetailsProps) {
  console.log('🎯 AnalysisDetails component props:', {
    id: params.id,
    hasAnalysisData: !!analysisData,
    category: analysisData.category,
    metricGroups: Object.keys(analysisData).filter(k => k !== 'category' && k !== 'creator_feedback'),
    feedbackStats: {
      strengths: analysisData.creator_feedback.strengths.length,
      improvements: analysisData.creator_feedback.improvements.length
    }
  });

  // Calculate overall score from all metrics that have scores
  const scores: number[] = [];
  Object.entries(analysisData).forEach(([key, value]) => {
    if (key !== 'category' && key !== 'creator_feedback' && typeof value === 'object') {
      Object.values(value as Record<string, MetricData>).forEach(metric => {
        if (metric && typeof metric.score === 'number') {
          scores.push(metric.score);
          console.log(`📊 Found score in ${key}:`, metric.score);
        }
      });
    }
  });
  const overallScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  console.log('📈 Calculated overall score:', { scores, overallScore });

  return (
    <div className="container mx-auto p-8 space-y-8">
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {Object.entries(analysisData).map(([section, data]) => {
          // Skip category and creator_feedback as they're handled separately
          if (section === 'category' || section === 'creator_feedback') return null;
          
          // Ensure data is a metrics object
          if (typeof data !== 'object' || data === null || Array.isArray(data)) {
            console.log(`⚠️ Skipping invalid section ${section}:`, data);
            return null;
          }

          console.log(`📋 Rendering metrics for ${section}:`, Object.keys(data));

          return (
            <Card key={section} className="bg-black/40 border-zinc-800 backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="text-lg font-medium text-zinc-100 capitalize">
                  {section.replace(/_/g, " ")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
               {Object.entries(data as Record<string, MetricData>).map(([key, value]) => (
                  <div key={key} className="p-5 bg-black/20 rounded-lg hover:bg-black/30 transition-colors">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="text-sm font-medium text-zinc-200 capitalize tracking-wide mb-2">
                          {key.replace(/_/g, " ")}
                        </div>
                        <p className="text-sm text-zinc-400 leading-relaxed">{value.description}</p>
                      </div>
                      <div className="flex items-center ml-0.5 shrink-0">
                       {section === 'compliance_risks' ? (
                         <div className="flex items-center gap-2">
                           {value.score && (
                             <>
                               {value.score < 40 ? (
                                 <CheckCircle className="h-5 w-5 text-green-400" />
                               ) : value.score < 70 ? (
                                 <AlertCircle className="h-5 w-5 text-yellow-400" />
                               ) : (
                                 <AlertTriangle className="h-5 w-5 text-red-400" />
                               )}
                               <div className="text-sm font-medium text-zinc-400">
                                 {value.score}%
                               </div>
                             </>
                           )}
                         </div>
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
              {analysisData.creator_feedback.strengths.map((strength: string, index: number) => (
                <li key={index} className="flex items-center gap-2 text-sm text-zinc-400 bg-black/20 p-3 rounded-lg">
                  <CheckCircle className="h-5 w-5 text-green-400 shrink-0" />
                  <span className="leading-relaxed">{strength}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-medium text-zinc-300 mb-4">Improvements</h3>
            <ul className="space-y-3">
              {analysisData.creator_feedback.improvements.map((improvement: string, index: number) => (
                <li key={index} className="flex items-center gap-2 text-sm text-zinc-400 bg-black/20 p-3 rounded-lg">
                  <AlertCircle className="h-5 w-5 text-yellow-400 shrink-0" />
                  <span className="leading-relaxed">{improvement}</span>
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}