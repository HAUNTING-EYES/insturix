"use client";

import React from "react";
import clsx from "clsx";
import { PromptPanel } from "@/components/dashboard/ThinkForge/PromptPanel";
import { IdeaGrid, IdeaCardData } from "@/components/dashboard/ThinkForge/IdeaGrid";
import SessionMetadataSettings from "@/components/dashboard/ThinkForge/SessionMetadataSettings";

interface IdeationModeProps {
  phase: 'PROMPT' | 'IDEAS' | 'SELECTED';
  prompt: string;
  setPrompt: (value: string) => void;
  loading: boolean;
  hasSubmitted: boolean;
  ideas: IdeaCardData[];
  selectedIdea: IdeaCardData | null;
  onSubmit: (e: React.FormEvent) => void;
  onRegenerate: () => void;
  onSelectIdea: (idea: IdeaCardData) => void;
  onProceedToChat: () => void;
  onGoBackToIdeas: () => void;
  onUpdateIdea: (updated: IdeaCardData) => void;
  onManualSetup: () => void;
  isVisible: boolean;
  /** Total session count for default naming */
  sessionCount?: number;
}

export default function IdeationMode({
  phase,
  prompt,
  setPrompt,
  loading,
  hasSubmitted,
  ideas,
  selectedIdea,
  onSubmit,
  onRegenerate,
  onSelectIdea,
  onProceedToChat,
  onGoBackToIdeas,
  onUpdateIdea,
  onManualSetup,
  isVisible,
  sessionCount = 0
}: IdeationModeProps) {
  return (
    <div className={clsx("w-full h-full transition-opacity duration-300", isVisible ? "opacity-100 block" : "opacity-0 hidden absolute inset-0 pointer-events-none")}>
      {(phase === 'PROMPT' || phase === 'IDEAS') && (
        <div
          className={clsx(
            'relative mx-auto flex w-full max-w-7xl flex-col items-center px-4 sm:px-8 h-full overflow-y-auto',
            hasSubmitted ? 'pb-32 pt-8' : 'justify-center pb-20 pt-8'
          )}
        >
          <PromptPanel
            prompt={prompt}
            setPrompt={setPrompt}
            loading={loading}
            hasSubmitted={hasSubmitted}
            onSubmit={onSubmit}
            onRegenerate={onRegenerate}
            onManualSetup={onManualSetup}
          />
          <IdeaGrid ideas={ideas} loading={loading} hasSubmitted={hasSubmitted} prompt={prompt} onSelect={onSelectIdea} />
        </div>
      )}

      {phase === 'SELECTED' && selectedIdea && (
        <div className="relative w-full px-4 pb-32 pt-8 h-full overflow-y-auto">
          <SessionMetadataSettings
            idea={{
              id: Number(selectedIdea.id),
              idea: selectedIdea.idea,
              purpose: selectedIdea.purpose,
              style: selectedIdea.style,
              format: selectedIdea.format,
              platform: selectedIdea.platform,
              tone: selectedIdea.tone as any,
              sessionName: selectedIdea.sessionName
            }}
            onProceedToChat={onProceedToChat}
            onGoBack={onGoBackToIdeas}
            onUpdateIdea={(upd) => onUpdateIdea({ ...upd, id: String(upd.id) })}
            sessionCount={sessionCount}
          />
        </div>
      )}
    </div>
  );
}
