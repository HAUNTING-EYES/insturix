"use client";

import React from "react";
import { TrendingUp } from "lucide-react";
import { useState } from "react";
import { PromptPanel } from "@/components/dashboard/ThinkForge/PromptPanel";
import { IdeaGrid } from "@/components/dashboard/ThinkForge/IdeaGrid";
import { TrendWorkflowPanel, type TrendTarget } from "@/components/dashboard/ThinkForge/TrendWorkflowPanel";
import type { SelectedTrend } from "@/lib/thinkforge/trends/selected-trend";
import type { TrendCandidate } from "@/lib/thinkforge/trends/trend-evidence";
import type { IdeaCardData } from "@/lib/thinkforge/state/types";
import type { ThinkForgeAuthoringRequest } from "@/lib/thinkforge/schemas/authoring-request";

interface IdeationModeProps {
  phase: 'PROMPT' | 'IDEAS';
  prompt: string;
  setPrompt: (value: string) => void;
  loading: boolean;
  hasSubmitted: boolean;
  ideas: IdeaCardData[];
  authoringRequest: ThinkForgeAuthoringRequest | null;
  onSubmit: (e: React.FormEvent, authoringRequest: ThinkForgeAuthoringRequest) => void;
  onRegenerate: () => void;
  onSelectIdea: (idea: IdeaCardData) => void;
  sessionId?: string | null;
  onEnsureTrendSession?: (candidate: TrendCandidate, authoringRequest: ThinkForgeAuthoringRequest) => Promise<string | null>;
  onTrendDraft?: (input: { prompt: string; sessionId: string; target: TrendTarget; selectedTrend: SelectedTrend; authoringRequest: ThinkForgeAuthoringRequest }) => void;
  isVisible: boolean;
  onUrlSubmit?: (urls: string[], originalPrompt: string, authoringRequest: ThinkForgeAuthoringRequest) => void;
  briefLoading?: boolean;
}

export default function IdeationMode({
  phase,
  prompt,
  setPrompt,
  loading,
  hasSubmitted,
  ideas,
  authoringRequest,
  onSubmit,
  onRegenerate,
  onSelectIdea,
  sessionId,
  onEnsureTrendSession,
  onTrendDraft,
  isVisible,
  onUrlSubmit,
  briefLoading,
}: IdeationModeProps) {
  const [trendWorkflowOpen, setTrendWorkflowOpen] = useState(false);

  return (
    <div style={{ display: isVisible ? 'flex' : 'none', flexDirection: 'column', flex: 1, width: '100%' }}>
      {(phase === 'PROMPT' || phase === 'IDEAS') && (
        <>
          <div className="flex justify-end px-4 pt-4">
            <button type="button" onClick={() => setTrendWorkflowOpen(true)} className="inline-flex items-center gap-2 rounded-lg border border-[#D4A652]/50 px-3 py-2 text-xs font-semibold text-[#D4A652] hover:bg-[#D4A652]/10">
              <TrendingUp className="h-3.5 w-3.5" />
              Use a trend
            </button>
          </div>
          <PromptPanel
            prompt={prompt}
            setPrompt={setPrompt}
            loading={loading}
            hasSubmitted={hasSubmitted}
            authoringRequest={authoringRequest}
            onSubmit={onSubmit}
            onUrlSubmit={onUrlSubmit}
            briefLoading={briefLoading}
          />
          <IdeaGrid ideas={ideas} loading={loading} hasSubmitted={hasSubmitted} prompt={prompt} onSelect={onSelectIdea} onRegenerate={onRegenerate} />
          <TrendWorkflowPanel
            open={trendWorkflowOpen}
            sessionId={sessionId}
            initialAuthoringRequest={authoringRequest}
            onClose={() => setTrendWorkflowOpen(false)}
            onEnsureSession={onEnsureTrendSession}
            onGenerate={(draftPrompt, trendSessionId, target, selectedTrend, trendAuthoringRequest) => {
              onTrendDraft?.({ prompt: draftPrompt, sessionId: trendSessionId, target, selectedTrend, authoringRequest: trendAuthoringRequest });
              setTrendWorkflowOpen(false);
            }}
          />
        </>
      )}
    </div>
  );
}
