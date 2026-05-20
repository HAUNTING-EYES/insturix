"use client";

import React, { useState } from "react";
import clsx from "clsx";
import { Brain } from "lucide-react";
import { PromptPanel, UrlBriefResult } from "@/components/dashboard/ThinkForge/PromptPanel";
import { IdeaGrid, IdeaCardData } from "@/components/dashboard/ThinkForge/IdeaGrid";
import SessionMetadataSettings from "@/components/dashboard/ThinkForge/SessionMetadataSettings";
import { KnowledgePanel } from "@/components/dashboard/ThinkForge/KnowledgePanel";

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
  onProceedToChat: (updatedIdea?: IdeaCardData) => void;
  onGoBackToIdeas: () => void;
  onUpdateIdea: (updated: IdeaCardData) => void;
  onManualSetup: () => void;
  isVisible: boolean;
  sessionCount?: number;
  onUrlSubmit?: (urls: string[], originalPrompt: string) => void;
  briefLoading?: boolean;
  briefResults?: UrlBriefResult[] | null;
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
  sessionCount = 0,
  onUrlSubmit,
  briefLoading,
  briefResults,
}: IdeationModeProps) {
  const [brandVaultOpen, setBrandVaultOpen] = useState(false);

  return (
    <div style={{ display: isVisible ? 'flex' : 'none', flexDirection: 'column', flex: 1, width: '100%' }}>
      {(phase === 'PROMPT' || phase === 'IDEAS') && (
        <>
          {/* Brand Vault access from ideation screen */}
          <div className="flex justify-end px-6 pt-3">
            <button
              onClick={() => setBrandVaultOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-[#7A776E] hover:text-[#D4A652] hover:bg-[#D4A652]/10 transition-all"
            >
              <Brain size={13} />
              Brand Vault
            </button>
          </div>
          <KnowledgePanel open={brandVaultOpen} onClose={() => setBrandVaultOpen(false)} />
          <PromptPanel
            prompt={prompt}
            setPrompt={setPrompt}
            loading={loading}
            hasSubmitted={hasSubmitted}
            onSubmit={onSubmit}
            onRegenerate={onRegenerate}
            onManualSetup={onManualSetup}
            onUrlSubmit={onUrlSubmit}
            briefLoading={briefLoading}
            briefResults={briefResults}
          />
          <IdeaGrid ideas={ideas} loading={loading} hasSubmitted={hasSubmitted} prompt={prompt} onSelect={onSelectIdea} />
        </>
      )}

      {phase === 'SELECTED' && selectedIdea && (
        <div className="relative w-full px-4 pb-32 pt-8 h-full overflow-y-auto z-50 bg-[#0B0B0A]">
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
            onProceedToChat={(upd) => onProceedToChat(upd ? { ...upd, id: String(upd.id) } : undefined)}
            onGoBack={onGoBackToIdeas}
            onUpdateIdea={(upd) => onUpdateIdea({ ...upd, id: String(upd.id) })}
            sessionCount={sessionCount}
          />
        </div>
      )}
    </div>
  );
}
