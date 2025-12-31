"use client";

import React, { useState, useEffect, useRef } from "react";
import clsx from "clsx";
import { FileText, MessageSquare, X } from "lucide-react";
import { ChatPanel } from "@/components/dashboard/ThinkForge/ChatPanel";
import { ScriptPanel } from "@/components/dashboard/ThinkForge/ScriptPanel";
import { IdeaCardData } from "@/components/dashboard/ThinkForge/IdeaGrid";
import { Script } from "@/app/dashboard/thinkforge/types";
import ProjectMetadataSettings from "./ProjectMetadataSettings";
import { AnimatePresence, motion } from "framer-motion";

interface StoryboardingModeProps {
  isVisible: boolean;
  selectedIdea: IdeaCardData | null;
  sessionId: string | null;
  script: Script | null;
  isSaving: boolean;
  onApplyEdit: (updated: Script) => void;
  onRunEdit: (instruction: string, selection?: string) => Promise<any>;
  onUpdateScript: (updated: Script | null) => void;
  onBack: () => Promise<void>;
  onImportScript: (data: any) => Promise<{ ok: boolean; applied?: any; error?: string }>;
  onGoToIdeation: () => void;
  onUpdateIdea?: (idea: IdeaCardData) => void;
  onSwitchSession?: (sessionId: string) => Promise<void>;
  onNewScript?: () => void;
}

const MIN_WIDTH = 300;
const MAX_WIDTH = 800;
const DEFAULT_WIDTH = 420;
const LS_CHAT_WIDTH = "thinkforge_chat_width";

export default function StoryboardingMode({
  isVisible,
  selectedIdea,
  sessionId,
  script,
  isSaving,
  onApplyEdit,
  onRunEdit,
  onUpdateScript,
  onBack,
  onImportScript,
  onGoToIdeation,
  onUpdateIdea,
  onSwitchSession,
  onNewScript
}: StoryboardingModeProps) {
  const [chatWidth, setChatWidth] = useState(DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showSettings, setShowSettings] = useState(false);
  
  // Mobile tab state
  const [activeMobileTab, setActiveMobileTab] = useState<'chat' | 'script'>('script');

  useEffect(() => {
    const saved = localStorage.getItem(LS_CHAT_WIDTH);
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed)) setChatWidth(Math.min(Math.max(parsed, MIN_WIDTH), MAX_WIDTH));
    }
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !containerRef.current) return;
      
      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidth = e.clientX - containerRect.left;
      
      setChatWidth(Math.min(Math.max(newWidth, MIN_WIDTH), MAX_WIDTH));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      localStorage.setItem(LS_CHAT_WIDTH, chatWidth.toString());
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, chatWidth]);

  const handleOpenSettings = () => setShowSettings(true);
  const handleCloseSettings = () => setShowSettings(false);

  return (
    <div className={clsx("w-full h-full transition-opacity duration-300", isVisible ? "opacity-100 block" : "opacity-0 hidden absolute inset-0 pointer-events-none")}>
      {selectedIdea ? (
        <div className="relative w-full h-full overflow-hidden flex flex-col" ref={containerRef}>
          
          {/* Mobile Tab Switcher */}
          <div className="lg:hidden flex border-b border-neutral-800 bg-neutral-900/50">
            <button
              onClick={() => setActiveMobileTab('chat')}
              className={clsx(
                "flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2",
                activeMobileTab === 'chat' ? "text-red-400 border-b-2 border-red-500 bg-red-500/5" : "text-neutral-400"
              )}
            >
              <MessageSquare size={16} /> Chat
            </button>
            <button
              onClick={() => setActiveMobileTab('script')}
              className={clsx(
                "flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2",
                activeMobileTab === 'script' ? "text-red-400 border-b-2 border-red-500 bg-red-500/5" : "text-neutral-400"
              )}
            >
              <FileText size={16} /> Script
            </button>
          </div>

          <div className="flex-1 flex overflow-hidden relative">
            {/* Chat Panel - Responsive visibility */}
            <div 
              className={clsx(
                "shrink-0 flex flex-col border-r border-neutral-800 relative bg-neutral-900/50 transition-all duration-300",
                // Mobile: full width if active
                "w-full absolute inset-0 z-10 lg:static lg:z-auto lg:w-auto",
                // Visibility
                activeMobileTab === 'chat' ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
              )}
              style={{ width: typeof window !== 'undefined' && window.innerWidth >= 1024 ? chatWidth : '100%' }}
            >
              <ChatPanel 
                key={(sessionId || 'no-session')} 
                selectedIdea={{
                  id: Number(selectedIdea.id),
                  idea: selectedIdea.idea,
                  purpose: selectedIdea.purpose,
                  style: selectedIdea.style,
                  format: selectedIdea.format,
                  platform: selectedIdea.platform,
                  tone: selectedIdea.tone as any
                }}
                script={script}
                onApplyEdit={onApplyEdit}
                onRunEdit={onRunEdit}
                sessionId={sessionId}
                onOpenSettings={handleOpenSettings}
                onSwitchSession={onSwitchSession}
              />
              
              {/* Resize Handle - Desktop only */}
              <div 
                className="hidden lg:flex absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-red-500/50 transition-colors z-10 items-center justify-center group"
                onMouseDown={() => setIsResizing(true)}
              >
                 <div className="h-8 w-1 group-hover:bg-red-500 rounded-full transition-colors" />
              </div>
            </div>
            
            {/* Script Panel - Responsive visibility */}
            <div className={clsx(
              "flex-1 min-w-0 overflow-hidden flex flex-col bg-neutral-950",
              // Mobile: full width if active (using absolute/z-index to stack or standard flow)
              "w-full h-full lg:w-auto",
              activeMobileTab === 'script' ? "block" : "hidden lg:flex"
            )}>
              <ScriptPanel
                selectedIdea={{
                  id: Number(selectedIdea.id),
                  idea: selectedIdea.idea,
                  purpose: selectedIdea.purpose,
                  style: selectedIdea.style,
                  format: selectedIdea.format,
                  platform: selectedIdea.platform,
                  tone: selectedIdea.tone as any
                }}
                script={script}
                sessionId={sessionId}
                isSaving={isSaving}
                onUpdate={onUpdateScript}
                onBack={onBack}
                onImportScript={onImportScript}
                onNewScript={onNewScript}
              />
            </div>
          </div>
          
          {/* Settings Panel Overlay */}
          <AnimatePresence>
            {showSettings && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center overflow-y-auto"
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
                  {/* Close button */}
                  <button
                    onClick={handleCloseSettings}
                    className="absolute -top-2 -right-2 z-10 flex items-center justify-center w-10 h-10 rounded-full bg-neutral-900 border border-white/10 text-white/70 hover:text-white hover:bg-neutral-800 transition-colors shadow-lg"
                  >
                    <X className="w-5 h-5" />
                  </button>
                  
                  <div className="bg-neutral-950 rounded-3xl border border-white/10 p-6 shadow-2xl">
                    <ProjectMetadataSettings
                      idea={{
                        id: Number(selectedIdea.id),
                        idea: selectedIdea.idea,
                        purpose: selectedIdea.purpose,
                        style: selectedIdea.style,
                        format: selectedIdea.format,
                        platform: selectedIdea.platform,
                        tone: selectedIdea.tone as any,
                        projectName: selectedIdea.projectName
                      }}
                      onProceedToChat={handleCloseSettings}
                      onGoBack={onGoToIdeation}
                      onUpdateIdea={(updatedIdea) => {
                        if (onUpdateIdea) {
                          onUpdateIdea({
                            ...selectedIdea,
                            ...updatedIdea,
                            id: String(updatedIdea.id)
                          });
                        }
                      }}
                      hideNavigation={true}
                    />
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-full text-neutral-400">
          <FileText size={48} className="mb-4 opacity-50" />
          <p className="text-lg font-medium">No script selected</p>
          <p className="text-sm mt-2">Start by creating an idea in Ideation mode or opening a session from the Library.</p>
          <button 
            onClick={onGoToIdeation}
            className="mt-6 px-4 py-2 bg-red-600/20 text-red-200 border border-red-500/30 rounded-lg hover:bg-red-600/30 transition-colors"
          >
            Go to Ideation
          </button>
        </div>
      )}
    </div>
  );
}
