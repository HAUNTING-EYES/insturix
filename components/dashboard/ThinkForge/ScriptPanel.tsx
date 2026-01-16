"use client";
import React, { useState } from 'react';
import ScriptEditor from '@/components/dashboard/ThinkForge/ScriptEditor';
import { Idea, Script } from '@/app/dashboard/thinkforge/types';
import WhiteboardPlaceholder from './WhiteboardPlaceholder';
import { FileText, Brain } from 'lucide-react';
import clsx from 'clsx';

interface ScriptPanelProps {
  selectedIdea: Idea;
  script: Script | null;
  onUpdate: (s: Script | null) => void;
  onBack: () => void;
  sessionId?: string | null;
   scriptId?: string | null;
  isSaving?: boolean;
  onImportScript?: (data: any) => Promise<{ ok: boolean; applied?: any; error?: string } | { ok: boolean; applied?: any; error?: string }> | { ok: boolean; applied?: any; error?: string };
  onNewScript?: () => void;
   onSwitchScript?: (scriptId: string) => void;
  onTokenStream?: (callback: (tokens: string) => void) => void; // Callback setter for token streaming
   onGetSelection?: (callback: () => { blocks: any[]; blockIds: string[]; range: { from: number; to: number } | null } | null) => void; // Callback setter for getting selection
  onEditSelection?: (text: string, range: { from: number; to: number }, blocks: any[]) => void;
  generatingScript?: boolean;
   onModeChange?: (mode: PanelMode) => void;
}

type PanelMode = 'scripting' | 'whiteboard';

export const ScriptPanel: React.FC<ScriptPanelProps> = ({ selectedIdea, script, onUpdate, onBack, sessionId, scriptId, isSaving, onImportScript, onNewScript, onSwitchScript, onTokenStream, onGetSelection, onEditSelection, generatingScript, onModeChange }) => {
  const [mode, setMode] = useState<PanelMode>('scripting');

   React.useEffect(() => {
      if (onModeChange) onModeChange(mode);
   }, [mode, onModeChange]);

  return (
    <div className="flex flex-col h-full bg-neutral-950/50">
       {/* Header / Mode Switcher */}
       <div className="flex items-center justify-center px-6 py-3 border-b border-white/5 shrink-0 bg-neutral-900/30 backdrop-blur-sm">
          <div className="flex items-center gap-1 p-1 bg-black/40 rounded-lg border border-white/5">
             <button
                onClick={() => setMode('scripting')}
                className={clsx(
                   "flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200",
                   mode === 'scripting' 
                      ? "bg-neutral-800 text-white shadow-sm ring-1 ring-white/10" 
                      : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
                )}
             >
                <FileText className="w-3.5 h-3.5" />
                Scripting
             </button>
             <button
                onClick={() => setMode('whiteboard')}
                className={clsx(
                   "flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200",
                   mode === 'whiteboard' 
                      ? "bg-neutral-800 text-white shadow-sm ring-1 ring-white/10" 
                      : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
                )}
             >
                <Brain className="w-3.5 h-3.5" />
                Whiteboard
             </button>
          </div>
       </div>

       {/* Content Area */}
       <div className="flex-1 relative overflow-hidden">
          {mode === 'scripting' ? (
             <div className="absolute inset-0 overflow-hidden">
                <ScriptEditor
                  script={script}
                  selectedIdea={selectedIdea}
                  sessionId={sessionId || undefined}
                           scriptId={scriptId || undefined}
                  onBackToChat={onBack}
                  onEditScript={onUpdate}
                  isSaving={isSaving}
                  onImportScript={onImportScript}
                  onNewScript={onNewScript}
                           onSwitchScript={onSwitchScript}
                  onTokenStream={(callback) => {
                    // Register callback with parent
                    if (onTokenStream) {
                      onTokenStream(callback);
                    }
                  }}
                  onGetSelection={(callback) => {
                    // Register selection getter with parent
                    if (onGetSelection) {
                      onGetSelection(callback);
                    }
                  }}
                  onEditSelection={onEditSelection}
                generatingScript={generatingScript}
                />
             </div>
          ) : (
             <WhiteboardPlaceholder />
          )}
       </div>
    </div>
  );
};
