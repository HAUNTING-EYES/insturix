"use client";
import React, { useState, useEffect, useCallback, useRef } from 'react';
import ScriptEditor from '@/components/dashboard/ThinkForge/ScriptEditor';
import { DocumentTabs, type DocumentTab } from '@/components/dashboard/ThinkForge/DocumentTabs';
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
  tabsRefreshTrigger?: number;
  isSaving?: boolean;
  onImportScript?: (data: any) => Promise<{ ok: boolean; applied?: any; error?: string } | { ok: boolean; applied?: any; error?: string }> | { ok: boolean; applied?: any; error?: string };
  onScriptCreated?: (scriptId: string) => void;
  onSwitchScript?: (scriptId: string) => void;
  onTabClose?: (scriptId: string) => void;
  onTokenStream?: (callback: (tokens: string) => void) => void;
  onGetSelection?: (callback: () => { blocks: any[]; blockIds: string[]; range: { from: number; to: number } | null } | null) => void;
  onEditSelection?: (text: string, range: { from: number; to: number }, blocks: any[]) => void;
  generatingScript?: boolean;
  onModeChange?: (mode: PanelMode) => void;
  documentTabs?: DocumentTab[];
}

type PanelMode = 'scripting' | 'whiteboard';

const CLOSED_TABS_KEY = 'thinkforge_closed_tabs_';

function getClosedTabIds(sessionId: string): Set<string> {
  try {
    const raw = localStorage.getItem(`${CLOSED_TABS_KEY}${sessionId}`);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch { return new Set(); }
}

function persistClosedTabIds(sessionId: string, ids: Set<string>) {
  try {
    localStorage.setItem(`${CLOSED_TABS_KEY}${sessionId}`, JSON.stringify([...ids]));
  } catch { /* silent */ }
}

export const ScriptPanel: React.FC<ScriptPanelProps> = ({ selectedIdea, script, onUpdate, onBack, sessionId, scriptId, tabsRefreshTrigger, isSaving, onImportScript, onScriptCreated, onSwitchScript, onTabClose, onTokenStream, onGetSelection, onEditSelection, generatingScript, onModeChange, documentTabs }) => {
  const [mode, setMode] = useState<PanelMode>('scripting');
  const [tabs, setTabs] = useState<DocumentTab[]>(documentTabs || []);
  const [tabOrder, setTabOrder] = useState<string[]>([]);
  const closedTabsRef = useRef<Set<string>>(new Set());

  // Load closed tabs from localStorage on session change
  useEffect(() => {
    closedTabsRef.current = sessionId ? getClosedTabIds(sessionId) : new Set();
  }, [sessionId]);

  useEffect(() => {
    if (documentTabs && documentTabs.length > 0) {
      setTabs(documentTabs);
    }
  }, [documentTabs]);

  const fetchTabs = useCallback(async () => {
    if (!sessionId) return;
    try {
      const res = await fetch('/api/services/thinkforge/script/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      if (!res.ok) return;
      const data = await res.json();
      const scripts = Array.isArray(data?.scripts) ? data.scripts : [];
      if (scripts.length > 0) {
        const closed = closedTabsRef.current;
        // Filter out closed tabs, but always keep the active tab and 'default'
        const newTabs = scripts
          .map((s: any) => ({
            scriptId: s.scriptId || 'default',
            title: s.title || 'Untitled',
            documentType: s.documentType || 'screenplay',
          }))
          .filter((t: DocumentTab) => t.scriptId === 'default' || t.scriptId === scriptId || !closed.has(t.scriptId));

        setTabs(newTabs);
        setTabOrder(prev => {
          const existing = new Set(prev);
          const newIds = newTabs.map((t: DocumentTab) => t.scriptId).filter((id: string) => !existing.has(id));
          return [...prev.filter(id => newTabs.some((t: DocumentTab) => t.scriptId === id)), ...newIds];
        });
      }
    } catch { /* silent */ }
  }, [sessionId, scriptId]);

  // Fetch tabs from API when session loads or tabsRefreshTrigger changes
  useEffect(() => {
    fetchTabs();
  }, [fetchTabs, tabsRefreshTrigger]);

  // When the active scriptId changes (e.g., via history), re-open it as a tab
  useEffect(() => {
    if (sessionId && scriptId && scriptId !== 'default' && closedTabsRef.current.has(scriptId)) {
      closedTabsRef.current.delete(scriptId);
      persistClosedTabIds(sessionId, closedTabsRef.current);
      fetchTabs();
    }
  }, [scriptId, sessionId, fetchTabs]);

  const handleTabClick = useCallback((tabScriptId: string) => {
    if (tabScriptId !== scriptId && onSwitchScript) {
      // Re-open the tab if it was previously closed
      if (sessionId && closedTabsRef.current.has(tabScriptId)) {
        closedTabsRef.current.delete(tabScriptId);
        persistClosedTabIds(sessionId, closedTabsRef.current);
      }
      onSwitchScript(tabScriptId);
    }
  }, [scriptId, onSwitchScript, sessionId]);

  const handleTabClose = useCallback((closedId: string) => {
    // Don't allow closing the 'default' script
    if (closedId === 'default') return;
    setTabs(prev => prev.filter(t => t.scriptId !== closedId));
    setTabOrder(prev => prev.filter(id => id !== closedId));
    // Persist the closed tab so it doesn't reappear on fetch
    if (sessionId) {
      closedTabsRef.current.add(closedId);
      persistClosedTabIds(sessionId, closedTabsRef.current);
    }
    if (onTabClose) onTabClose(closedId);
  }, [onTabClose, sessionId]);

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

       {/* Document Tabs (multi-document support) */}
       {tabs.length > 0 && (
         <DocumentTabs
           tabs={tabOrder.length > 0 ? tabOrder.map(id => tabs.find(t => t.scriptId === id)).filter(Boolean) as DocumentTab[] : tabs}
           activeTabId={scriptId || 'default'}
           onTabClick={handleTabClick}
           onTabClose={onTabClose && tabs.length > 1 ? handleTabClose : undefined}
           onTabReorder={(newOrder) => setTabOrder(newOrder.map(t => t.scriptId))}
         />
       )}

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
