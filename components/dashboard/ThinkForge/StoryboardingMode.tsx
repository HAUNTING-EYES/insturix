"use client";

import React, { useState, useRef } from "react";
import clsx from "clsx";
import { Clapperboard, FileText, X } from "lucide-react";
import { ChatPanel } from "@/components/dashboard/ThinkForge/ChatPanel";
import { ScriptPanel } from "@/components/dashboard/ThinkForge/ScriptPanel";
import { KnowledgePanel } from "@/components/dashboard/ThinkForge/KnowledgePanel";
import { ExportToEditronDialog } from "@/components/dashboard/ThinkForge/export/ExportToEditronDialog";
import { ClickatronHandoffDialog } from "@/components/dashboard/ThinkForge/export/ClickatronHandoffDialog";
import { ShootKitDialog } from "@/components/dashboard/ThinkForge/production/ShootKitDialog";
import type { IdeaCardData, ProjectMeta } from "@/lib/thinkforge/state/types";
import { Script } from "@/app/dashboard/thinkforge/types";
import SessionMetadataSettings from "./SessionMetadataSettings";
import { AnimatePresence, motion } from "framer-motion";

interface StoryboardingModeProps {
  isVisible: boolean;
  selectedIdea: IdeaCardData | null;
  sessionId: string | null;
  scriptId?: string | null;
  tabsRefreshTrigger?: number;
  script: Script | null;
  isScriptLoading?: boolean;
  initialChatMessages?: any[];
  isSaving: boolean;
  onApplyEdit: (updated: Script) => void;
  onUpdateScript: (updated: Script | null) => void;
  onBack: () => Promise<void>;
  onImportScript: (data: any) => Promise<{ ok: boolean; applied?: any; error?: string }>;
  onGoToIdeation: () => void;
  onUpdateIdea?: (idea: IdeaCardData) => void;
  onScriptCreated?: (scriptId: string) => void;
  onSwitchScript?: (scriptId: string) => void;
  onTabClose?: (scriptId: string) => void;
}

export default function StoryboardingMode({
  isVisible,
  selectedIdea,
  sessionId,
  scriptId,
  tabsRefreshTrigger,
  script,
  isScriptLoading,
  initialChatMessages,
  isSaving,
  onApplyEdit,
  onUpdateScript,
  onBack,
  onImportScript,
  onGoToIdeation,
  onUpdateIdea,
  onScriptCreated,
  onSwitchScript,
  onTabClose
}: StoryboardingModeProps) {
  const [showSettings, setShowSettings] = useState(false);
  const [showKnowledge, setShowKnowledge] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showClickatronDialog, setShowClickatronDialog] = useState(false);
  const [showShootKit, setShowShootKit] = useState(false);

  // Selection editing state
  const [editingSelection, setEditingSelection] = useState<{ text: string, range: { from: number, to: number }, blocks: any[] } | null>(null);
  const [generationState, setGenerationState] = useState<{ intent: string | null; isStreaming: boolean }>({
    intent: null,
    isStreaming: false,
  });
  const [scriptPanelMode, setScriptPanelMode] = useState<'script' | 'whiteboard'>('script');

  const handleEditSelection = (text: string, range: { from: number; to: number }, blocks: any[]) => {
    setEditingSelection({ text, range, blocks });
  };

  // Token streaming callback
  const tokenStreamCallbackRef = useRef<((tokens: string) => void) | null>(null);
  const handleTokenStream = useRef((tokens: string) => {
    if (tokenStreamCallbackRef.current) {
      tokenStreamCallbackRef.current(tokens);
    }
  }).current;

  // Selection getter callback
  const selectionGetterRef = useRef<(() => { blocks: any[]; blockIds: string[]; range: { from: number; to: number } | null } | null) | null>(null);
  const handleGetSelection = useRef(() => {
    if (selectionGetterRef.current) {
      return selectionGetterRef.current();
    }
    return null;
  }).current;

  const handleOpenSettings = () => setShowSettings(true);
  const handleCloseSettings = () => setShowSettings(false);
  const scriptBlocks = Array.isArray(script?.blocks) ? script.blocks : [];
  const scriptText = script?.content || script?.body || "";

  if (!selectedIdea) {
    return (
      <div className={clsx("flex flex-col items-center justify-center h-full text-[#7A776E] transition-opacity duration-300", isVisible ? "opacity-100 block" : "opacity-0 hidden absolute inset-0 pointer-events-none")}>
        <FileText size={48} className="mb-4 opacity-50" />
        <p className="text-lg font-medium text-[#ECE9E1]">No script selected</p>
        <p className="text-sm mt-2">Start by creating an idea in Ideation mode or opening a session from the Library.</p>
        <button
          onClick={onGoToIdeation}
          className="mt-6 px-4 py-2 rounded-[7px] bg-[#D4A652] text-[#0B0B0A] font-extrabold text-sm hover:bg-[#e0b765] transition-colors"
        >
          Go to Ideation
        </button>
      </div>
    );
  }

  const selectedIdeaMeta = selectedIdea as IdeaCardData & Partial<ProjectMeta>;
  const exportProjectMeta: ProjectMeta = {
    idea: selectedIdea.idea,
    title: script?.title || selectedIdea.idea,
    purpose: selectedIdea.purpose,
    style: selectedIdea.style,
    format: selectedIdea.format,
    platform: selectedIdea.platform,
    tone: selectedIdea.tone,
    sessionName: selectedIdea.sessionName,
    brandBrief: selectedIdea.brandBrief,
    brandId: selectedIdeaMeta.brandId,
    clientId: selectedIdeaMeta.clientId,
    clientName: selectedIdeaMeta.clientName,
    campaignId: selectedIdeaMeta.campaignId,
    campaignName: selectedIdeaMeta.campaignName,
    seriesId: selectedIdeaMeta.seriesId,
    calendarItemId: selectedIdeaMeta.calendarItemId,
    contentCardId: selectedIdeaMeta.contentCardId,
  };

  return (
    <div className={clsx("control-view enter", isVisible ? "visible" : "")} id="s3" style={{ display: isVisible ? 'flex' : 'none', flex: 1, height: '100%' }}>
      <div className="control-inner" style={{ flex: 1, height: '100%', display: 'flex' }}>

        {/* LEFT SIDEBAR */}
        <div className="sidebar" style={{ display: 'flex', flexDirection: 'column', padding: '16px', gap: '24px' }}>
          <div className="sidebar-section">
            <div className="mono sidebar-label" style={{ color: 'var(--text-muted)' }}>sessions</div>
            <div className="sidebar-items">
              <button className="sidebar-item active">Current Session</button>
              <button className="sidebar-item" onClick={onGoToIdeation}>+ New Session</button>
              <button className="sidebar-item" onClick={() => setShowSettings(true)}>Settings</button>
            </div>
          </div>
          <div className="sidebar-section">
            <div className="mono sidebar-label" style={{ color: 'var(--text-muted)' }}>production</div>
            <div className="sidebar-items">
              <button
                className="sidebar-item"
                onClick={() => setShowShootKit(true)}
                disabled={!script || !sessionId}
                title="Turn this script into a capability-aware shot plan"
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Clapperboard size={13} className="shrink-0" /> Shoot Kit
              </button>
            </div>
          </div>
          <div className="sidebar-section">
            <div className="mono sidebar-label" style={{ color: 'var(--text-muted)' }}>export</div>
            <div className="sidebar-items">
              <button className="sidebar-item" onClick={() => setShowClickatronDialog(true)} disabled={!script || !sessionId}>-&gt; Clickatron</button>
              <button className="sidebar-item" onClick={() => setShowExportDialog(true)} disabled={!script}>-&gt; Editron</button>
            </div>
          </div>
        </div>

        {/* CENTER — Editor */}
        <div className="editor-col" style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <ScriptPanel
            selectedIdea={{
              id: Number(selectedIdea.id),
              idea: selectedIdea.idea,
              purpose: selectedIdea.purpose,
              style: selectedIdea.style,
              format: selectedIdea.format,
              platform: selectedIdea.platform,
              tone: selectedIdea.tone as any,
              originalPrompt: selectedIdea.originalPrompt,
              brandBrief: selectedIdea.brandBrief,
              authoringRequest: selectedIdea.authoringRequest,
            }}
            script={script}
            sessionId={sessionId}
            scriptId={scriptId}
            tabsRefreshTrigger={tabsRefreshTrigger}
            isSaving={isSaving}
            onTokenStream={(callback) => {
              tokenStreamCallbackRef.current = callback;
            }}
            onGetSelection={(callback) => {
              selectionGetterRef.current = callback;
            }}
            onUpdate={onUpdateScript}
            onBack={onBack}
            onImportScript={onImportScript}
            onScriptCreated={onScriptCreated}
            onSwitchScript={onSwitchScript}
            onTabClose={onTabClose}
            onEditSelection={handleEditSelection}
            onModeChange={(mode) => setScriptPanelMode(mode === 'scripting' ? 'script' : 'whiteboard')}
            generatingScript={
              generationState.isStreaming &&
              (generationState.intent === 'draft' || generationState.intent === 'edit' || generationState.intent === 'hybrid')
            }
          />
        </div>

        {/* RIGHT — AI Chat */}
        <div className="chat-col" style={{ display: 'flex', flexDirection: 'column' }}>
          <ChatPanel
            key={(sessionId || 'no-session')}
            selectedIdea={selectedIdea}
            script={script}
            scriptId={scriptId}
            isScriptLoading={isScriptLoading}
            initialMessages={initialChatMessages}
            onApplyEdit={onApplyEdit}
            sessionId={sessionId}
            onOpenSettings={handleOpenSettings}
            onOpenKnowledge={() => setShowKnowledge(true)}
            onScriptCreated={onScriptCreated}
            onTokenStream={handleTokenStream}
            onGetSelection={handleGetSelection}
            editingSelection={editingSelection}
            onCancelEditSelection={() => setEditingSelection(null)}
            onGenerationStateChange={setGenerationState}
            workspaceMode={scriptPanelMode}
          />
        </div>

      </div>

      {/* Overlays */}
      <KnowledgePanel
        open={showKnowledge}
        onClose={() => setShowKnowledge(false)}
        sessionId={sessionId}
      />

      <ExportToEditronDialog
        open={showExportDialog}
        onOpenChange={setShowExportDialog}
        blocks={scriptBlocks}
        plainText={scriptText}
        sessionId={sessionId || undefined}
        scriptId={scriptId || undefined}
        projectMeta={exportProjectMeta}
      />

      <ClickatronHandoffDialog
        open={showClickatronDialog}
        onOpenChange={setShowClickatronDialog}
        blocks={scriptBlocks}
        sessionId={sessionId || undefined}
        scriptId={scriptId || undefined}
        title={script?.title || selectedIdea.idea}
      />

      <ShootKitDialog
        open={showShootKit}
        onOpenChange={setShowShootKit}
        sessionId={sessionId || undefined}
        scriptId={scriptId || undefined}
      />

      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-start justify-center overflow-y-auto"
            onClick={handleCloseSettings}
          >
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="relative w-full max-w-5xl my-8 mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={handleCloseSettings}
                className="absolute -top-2 -right-2 z-10 flex items-center justify-center w-10 h-10 rounded-full bg-[#0F0F0E] border border-[#1C1B19] text-[#B5B2A8] hover:text-[#ECE9E1] hover:bg-[#1C1B19] transition-colors shadow-lg"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="bg-[#0B0B0A] rounded-3xl border border-[#1C1B19] p-6 shadow-2xl">
                <SessionMetadataSettings
                  idea={{
                    id: Number(selectedIdea.id),
                    idea: selectedIdea.idea,
                    purpose: selectedIdea.purpose,
                    style: selectedIdea.style,
                    format: selectedIdea.format,
                    platform: selectedIdea.platform,
                    tone: selectedIdea.tone as any,
                    sessionName: selectedIdea.sessionName,
                    originalPrompt: selectedIdea.originalPrompt,
                    brandBrief: selectedIdea.brandBrief,
                    authoringRequest: selectedIdea.authoringRequest,
                  }}
                  onProceedToChat={handleCloseSettings}
                  onGoBack={onGoToIdeation}
                  onUpdateIdea={(updatedIdea) => {
                    if (onUpdateIdea) {
                      return onUpdateIdea({
                        ...selectedIdea,
                        ...updatedIdea,
                        id: String(updatedIdea.id)
                      });
                    }
                    return Promise.resolve();
                  }}
                  hideNavigation={true}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
