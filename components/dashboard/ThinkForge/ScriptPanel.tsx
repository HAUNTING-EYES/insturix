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
  isSaving?: boolean;
  onImportScript?: (data: any) => Promise<{ ok: boolean; applied?: any; error?: string } | { ok: boolean; applied?: any; error?: string }> | { ok: boolean; applied?: any; error?: string };
  onNewScript?: () => void;
}

type PanelMode = 'scripting' | 'whiteboard';

export const ScriptPanel: React.FC<ScriptPanelProps> = ({ selectedIdea, script, onUpdate, onBack, sessionId, isSaving, onImportScript, onNewScript }) => {
  const [mode, setMode] = useState<PanelMode>('scripting');

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
                  onBackToChat={onBack}
                  onEditScript={onUpdate}
                  isSaving={isSaving}
                  onImportScript={onImportScript}
                  onNewScript={onNewScript}
                />
             </div>
          ) : (
             <WhiteboardPlaceholder />
          )}
       </div>
    </div>
  );
};
