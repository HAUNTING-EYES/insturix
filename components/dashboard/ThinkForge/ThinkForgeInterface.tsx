"use client";

import { useEffect, useCallback, useState } from "react";
import { useThinkForgeWorkflow } from "@/app/dashboard/thinkforge/hooks/useThinkForgeWorkflow";
import PromptInput from "./PromptInput";
import IdeaSelection from "./IdeaSelection";
import SelectedIdeaDisplay from "./SelectedIdeaDisplay";
import ChatInterface from "./ChatInterface";
import ScriptEditor from "./ScriptEditor";
import SessionRecoveryLoader from "./SessionRecoveryLoader";

export interface ThinkForgeInterfaceProps {
  onPhaseChange?: (phase: 'PROMPT' | 'IDEAS' | 'SELECTED' | 'CHAT' | 'SCRIPT') => void;
  onLoadSession?: (loadSessionFn: (sessionId: string) => Promise<boolean>) => void;
}

export default function ThinkForgeInterface({ onPhaseChange, onLoadSession }: ThinkForgeInterfaceProps) {
  const {
    // State
    workflowPhase,
    prompt,
    loading,
    sendingMessage,
    generatingScript,
    goingHome,
    error,
    selectedIdea,
    ideas,
    generatedScript,
    chatMessages,
    suggestions,
    isRecovering,
    isCreatingSession,
    sessionId,
    
    // Actions
    generateIdeas,
    createCustomIdea,
    shuffleIdeas,
    selectIdea,
    updateSelectedIdea,
    goBackToIdeas,
    proceedToChat,
    sendMessage,
    selectSuggestion,
    generateScript,
    startNewSession: goHome,
    editScript: updateScript,
    exportScript,
    backToChat,
    loadSession,
    setError,
  } = useThinkForgeWorkflow();

  // Pass loadSession function to parent when it becomes available
  useEffect(() => {
    if (onLoadSession && loadSession) {
      onLoadSession(loadSession);
    }
  }, [onLoadSession, loadSession]);

  // Notify parent when phase changes
  useEffect(() => {
    if (onPhaseChange) {
      onPhaseChange(workflowPhase);
    }
  }, [workflowPhase, onPhaseChange]);

  // Handle go home: save current session and start new one
  const handleGoHome = useCallback(async () => {
    try {
      // The goingHome state is now managed in useThinkForgeWorkflow
      // Give a brief moment for auto-save to complete if it's in progress
      // The workflow hook automatically saves state changes
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Start new session (this also handles cleanup)
      goHome();
      
      console.log('Successfully saved session and started new one');
    } catch (error) {
      console.error('Failed to save session during go home:', error);
      // Still proceed with starting new session even if save fails
      goHome();
    }
  }, [goHome]);

  // Show recovery loader only when actually restoring a session (not creating new or going home)
  if (isRecovering && !isCreatingSession && !goingHome) {
    return <SessionRecoveryLoader />;
  }

  return (
    <div className="space-y-6">
      {/* Error Display */}
      {error && (
        <div className={`${
          error.includes('limit exceeded') || error.includes('sessions this week') || error.includes('session limit') 
            ? 'bg-yellow-500/20 border border-yellow-500/50' 
            : 'bg-red-500/20 border border-red-500/50'
        } rounded-lg p-4 flex items-start justify-between`}>
          <div className="flex-1">
            <div className="flex items-start gap-2">
              {error.includes('limit exceeded') || error.includes('sessions this week') || error.includes('session limit') ? (
                <div className="flex-shrink-0 w-5 h-5 bg-yellow-500 rounded-full flex items-center justify-center text-xs font-bold text-black">!</div>
              ) : null}
              <div>
                <p className={`${
                  error.includes('limit exceeded') || error.includes('sessions this week') || error.includes('session limit')
                    ? 'text-yellow-400' 
                    : 'text-red-400'
                } text-sm`}>
                  {error}
                </p>
                {error.includes('limit exceeded') || error.includes('sessions this week') || error.includes('session limit') ? (
                  <p className="text-yellow-300 text-xs mt-1">
                    Upgrade your plan to get more sessions or wait for your weekly limit to reset.
                  </p>
                ) : null}
              </div>
            </div>
          </div>
                     {error.includes('Failed to send message') || error.includes('Network error') ? (
             <button
               onClick={() => setError(null)}
               className="ml-3 px-3 py-1 text-xs bg-red-500 hover:bg-red-600 text-white rounded transition-colors"
             >
               Retry
             </button>
           ) : error.includes('Session error') ? (
             <button
               onClick={() => window.location.reload()}
               className="ml-3 px-3 py-1 text-xs bg-red-500 hover:bg-red-600 text-white rounded transition-colors"
             >
               Refresh
             </button>
           ) : (
             <button
               onClick={() => setError(null)}
               className="ml-3 px-2 py-1 text-xs text-red-400 hover:text-red-300 transition-colors"
               aria-label="Dismiss error"
             >
               ✕
             </button>
           )}
        </div>
      )}

      {/* Workflow Phases */}
      {workflowPhase === 'PROMPT' && (
        <PromptInput 
          onSubmit={generateIdeas} 
          onCustomIdeaSubmit={createCustomIdea}
          loading={loading} 
        />
      )}

      {workflowPhase === 'IDEAS' && (
        <IdeaSelection
          ideas={ideas}
          onSelectIdea={selectIdea}
          onShuffle={shuffleIdeas}
          loading={loading}
          prompt={prompt}
        />
      )}

      {workflowPhase === 'SELECTED' && selectedIdea && (
        <SelectedIdeaDisplay
          idea={selectedIdea}
          onProceedToChat={proceedToChat}
          onGoBack={goBackToIdeas}
          onUpdateIdea={updateSelectedIdea}
        />
      )}

      {workflowPhase === 'CHAT' && selectedIdea && (
        <ChatInterface
          messages={chatMessages}
          onSendMessage={sendMessage}
          onGenerateScript={generateScript}
          selectedIdea={selectedIdea}
          suggestions={suggestions}
          onSelectSuggestion={selectSuggestion}
          loading={loading}
          sendingMessage={sendingMessage}
          generatingScript={generatingScript}
          goingHome={goingHome}
          onGoHome={handleGoHome}
        />
      )}

      {workflowPhase === 'SCRIPT' && selectedIdea && (
        <ScriptEditor
          script={generatedScript || undefined}
          selectedIdea={selectedIdea}
          sessionId={sessionId || undefined}
          onBackToChat={backToChat || goBackToIdeas}
          onEditScript={updateScript}
          onExportScript={exportScript || updateScript}
          loading={loading}
          generatingScript={generatingScript}
        />
      )}

      {/* Removed Start New Session button to streamline interface */}
    </div>
  );
} 