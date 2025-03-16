"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, AlertTriangle, CheckCircle, AlertCircle } from "lucide-react";
import Link from "next/link";

type MetricData = {
  score?: number;
  description: string;
};

type AnalysisData = {
  category: string;
  engagement_metrics: Record<string, MetricData>;
  technical_quality: Record<string, MetricData>;
  seo_optimization: Record<string, MetricData>;
  compliance_risks: Record<string, MetricData>;
  creator_feedback: {
    strengths: string[];
    improvements: string[];
  };
};

// Mock data - replace with real API call
const analysisData: AnalysisData = {
  "category": "Educational Video",
  "engagement_metrics": {
    "value_proposition_clarity": {
      "score": 78,
      "description": "The video demonstrates the value of understanding financial terms in business negotiations."
    },
    "information_clarity": {
      "score": 70,
      "description": "The information is presented clearly, but could benefit from additional context and explanations."
    },
    "structure_organization": {
      "score": 80,
      "description": "The video is structured around a specific negotiation, which provides a clear narrative."
    },
    "comprehensibility": {
      "score": 75,
      "description": "The video is generally comprehensible, but some viewers may need background knowledge of business terms."
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
    },
    "visual_aids_usage": {
      "score": 80,
      "description": "The video effectively uses text overlays to highlight key information."
    }
  },
  "seo_optimization": {
    "title_keyword_relevance": {
      "score": 70,
      "description": "The title is relevant but could be more optimized by including specific keywords related to negotiation and Shark Tank."
    },
    "description_richness_clarity": {
      "score": 65,
      "description": "The description could be improved by adding more relevant keywords and a call to action."
    },
    "content_categorization_accuracy": {
      "description": "The video is accurately categorized as business and finance education content."
    }
  },
  "creator_feedback": {
    "strengths": [
      "The video features engaging clips from Shark Tank.",
      "It presents a real-world example of business negotiation.",
      "The editing is concise and keeps the viewer's attention.",
      "The focus on financial terms like royalty and equity is educational."
    ],
    "improvements": [
      "Add timestamps to allow viewers to easily navigate to specific moments in the video.",
      "Include a brief summary of the key takeaways from the negotiation.",
      "Add annotations or on-screen text to highlight important financial terms and concepts.",
      "Incorporate more diverse examples of negotiation strategies to broaden the video's appeal.",
      "Consider adding background music to enhance the viewing experience"
    ]
  },
  "compliance_risks": {
    "copyright_risk": {
      "score": 65,
      "description": "The video appears to use clips from Shark Tank, which may pose a copyright risk depending on the permissions and context of use. Need to ensure fair use or obtain necessary licenses."
    },
    "guidelines_compliance": {
      "score": 85,
      "description": "The video does not appear to violate YouTube's community guidelines. The content is related to business and investment, and there is no explicit sexual content, promotion of harmful activities, or hateful content."
    },
    "social_risk": {
      "score": 75,
      "description": "The video is unlikely to cause significant social backlash. While it involves negotiations and financial decisions, the tone remains professional and respectful. There are no apparent controversial topics or offensive stereotypes."
    }
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

export default function AnalysisDetails({ params }: { params: { id: string } }) {
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
          <p className="text-zinc-400 mt-2">Educational Video • March 16, 2024</p>
        </div>
        <div className="text-right flex flex-col justify-end min-h-[100px]">
          <div className="text-6xl font-bold text-zinc-100 leading-none">76</div>
          <div className="text-zinc-400 mt-2">Overall Score</div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {Object.entries(analysisData).map(([section, data]) => {
          // Skip creator_feedback and category as they're handled separately
          if (section === 'creator_feedback' || section === 'category') return null;
          
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
              {analysisData.creator_feedback.strengths.map((strength, index) => (
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
              {analysisData.creator_feedback.improvements.map((improvement, index) => (
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