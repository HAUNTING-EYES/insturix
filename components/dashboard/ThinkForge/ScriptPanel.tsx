"use client";
import React from 'react';
import ScriptEditor from '@/components/dashboard/ThinkForge/ScriptEditor';
import { Idea, Script } from '@/app/dashboard/thinkforge/types';

interface ScriptPanelProps {
  selectedIdea: Idea;
  script: Script | null;
  onUpdate: (s: Script | null) => void;
  onBack: () => void;
  sessionId?: string | null;
  isSaving?: boolean;
  onImportScript?: (data: any) => Promise<{ ok: boolean; applied?: any; error?: string } | { ok: boolean; applied?: any; error?: string }> | { ok: boolean; applied?: any; error?: string };
}

export const ScriptPanel: React.FC<ScriptPanelProps> = ({ selectedIdea, script, onUpdate, onBack, sessionId, isSaving, onImportScript }) => {
  return (
    <div className="flex-1 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4">
      <ScriptEditor
        script={script}
        selectedIdea={selectedIdea}
        sessionId={sessionId || undefined}
        onBackToChat={onBack}
        onEditScript={onUpdate}
        isSaving={isSaving}
        onImportScript={onImportScript}
      />
    </div>
  );
};
