"use client";
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AVScriptView, type AVScriptPresentationStatus } from '@/components/dashboard/ThinkForge/AVScriptView';
import ScriptEditor from '@/components/dashboard/ThinkForge/ScriptEditor';
import { DocumentTabs, type DocumentTab } from '@/components/dashboard/ThinkForge/DocumentTabs';
import { Idea, Script } from '@/app/dashboard/thinkforge/types';
import { FileText, FileVideo2, RefreshCw } from 'lucide-react';
import clsx from 'clsx';

interface ScriptPanelProps {
  selectedIdea: Idea;
  script: Script | null;
  onUpdate: (s: Script | null) => void;
  sessionId?: string | null;
  scriptId?: string | null;
  tabsRefreshTrigger?: number;
  isSaving?: boolean;
  isScriptLoading?: boolean;
  scriptLoadError?: string | null;
  onRetryScriptLoad?: () => void;
  onImportScript?: (data: any) => Promise<{ ok: boolean; applied?: any; error?: string } | { ok: boolean; applied?: any; error?: string }> | { ok: boolean; applied?: any; error?: string };
  onSwitchScript?: (scriptId: string) => void;
  onTabClose?: (scriptId: string) => void;
  onTokenStream?: (callback: (tokens: string) => void) => void;
  onGetSelection?: (callback: () => { blocks: any[]; blockIds: string[]; range: { from: number; to: number } | null } | null) => void;
  onEditSelection?: (text: string, range: { from: number; to: number }, blocks: any[]) => void;
  generatingScript?: boolean;
  onModeChange?: (mode: ParentWorkspaceMode) => void;
  documentTabs?: DocumentTab[];
}

type PanelMode = 'scripting' | 'av-script';
type ParentWorkspaceMode = 'scripting' | 'whiteboard';

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

export const ScriptPanel: React.FC<ScriptPanelProps> = ({ selectedIdea, script, onUpdate, sessionId, scriptId, tabsRefreshTrigger, isSaving, isScriptLoading, scriptLoadError, onRetryScriptLoad, onImportScript, onSwitchScript, onTabClose, onTokenStream, onGetSelection, onEditSelection, generatingScript, onModeChange, documentTabs }) => {
  const [mode, setMode] = useState<PanelMode>('scripting');
  const [tabs, setTabs] = useState<DocumentTab[]>(documentTabs || []);
  const [tabOrder, setTabOrder] = useState<string[]>([]);
  const [tabsLoadError, setTabsLoadError] = useState<string | null>(null);
  const [avPresentationStatus, setAVPresentationStatus] = useState<AVScriptPresentationStatus>('idle');
  const closedTabsRef = useRef<Set<string>>(new Set());
  const tabsSessionIdRef = useRef<string | null>(sessionId || null);
  const autoSelectedAVDocumentRef = useRef<string | null>(null);
  const activeDocumentIdentity = `${sessionId || 'no-session'}:${scriptId || script?.scriptId || 'default'}`;

  // Load closed tabs from localStorage on session change
  useEffect(() => {
    tabsSessionIdRef.current = sessionId || null;
    closedTabsRef.current = sessionId ? getClosedTabIds(sessionId) : new Set();
    setTabs([]);
    setTabOrder([]);
    setTabsLoadError(null);
  }, [sessionId]);

  useEffect(() => {
    setMode('scripting');
    setAVPresentationStatus('idle');
    autoSelectedAVDocumentRef.current = null;
  }, [activeDocumentIdentity]);

  useEffect(() => {
    if (documentTabs) {
      setTabs(documentTabs);
      setTabOrder(documentTabs.map(tab => tab.scriptId));
    }
  }, [documentTabs]);

  const fetchTabs = useCallback(async () => {
    if (!sessionId) return;
    const requestedSessionId = sessionId;
    setTabsLoadError(null);
    try {
      const res = await fetch('/api/services/thinkforge/script/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      if (!res.ok) {
        let detail = '';
        try {
          const body = await res.json();
          detail = typeof body?.error === 'string' ? `: ${body.error}` : '';
        } catch {
          // The status code is enough when the server does not return JSON.
        }
        throw new Error(`Document list failed (${res.status})${detail}`);
      }
      const data = await res.json();
      if (tabsSessionIdRef.current !== requestedSessionId) return;
      const scripts = Array.isArray(data?.scripts) ? data.scripts : [];
      const closed = closedTabsRef.current;
      // Filter out closed tabs, but always keep the active tab and 'default'.
      const newTabs = scripts
        .map((s: any) => ({
          scriptId: s.scriptId || 'default',
          title: s.title || 'Untitled',
          documentType: typeof s.documentType === 'string' ? s.documentType : '',
        }))
        .filter((t: DocumentTab) => t.scriptId === 'default' || t.scriptId === scriptId || !closed.has(t.scriptId));

      setTabs(newTabs);
      setTabOrder(prev => {
        const existing = new Set(prev);
        const newIds = newTabs.map((t: DocumentTab) => t.scriptId).filter((id: string) => !existing.has(id));
        return [...prev.filter(id => newTabs.some((t: DocumentTab) => t.scriptId === id)), ...newIds];
      });
    } catch (error) {
      if (tabsSessionIdRef.current === requestedSessionId) {
        setTabsLoadError(error instanceof Error ? error.message : 'Unable to load documents');
      }
    }
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

  // AV Script is a read-only surface inside scripting. The parent still sees
  // the scripting workspace, so chat and selection editing never fall into a
  // legacy whiteboard branch.
  React.useEffect(() => {
    onModeChange?.('scripting');
  }, [onModeChange]);

  const handleAVPresentationStatus = useCallback((status: AVScriptPresentationStatus) => {
    setAVPresentationStatus(status);
    if (status === 'available' && autoSelectedAVDocumentRef.current !== activeDocumentIdentity) {
      autoSelectedAVDocumentRef.current = activeDocumentIdentity;
      setMode('av-script');
    }
    if (status === 'not_applicable') {
      setMode((currentMode) => currentMode === 'av-script' ? 'scripting' : currentMode);
    }
  }, [activeDocumentIdentity]);

  const canOpenAVScript = avPresentationStatus === 'available'
    || avPresentationStatus === 'stale'
    || avPresentationStatus === 'invalid_contract';
  const resolvedScriptId = scriptId || script?.scriptId || 'default';
  const documentVersion = typeof script?.version === 'number' ? script.version : undefined;

  return (
    <div className="flex flex-col h-full bg-[#0B0B0A]">
       {/* Header / Mode Switcher */}
       <div className="flex items-center justify-center px-6 py-3 border-b border-[#1C1B19] shrink-0 bg-[#0F0F0E]">
          <div className="flex items-center gap-1 p-1 bg-[#0B0B0A] rounded-lg border border-[#1C1B19]">
             <button
                onClick={() => setMode('scripting')}
                className={clsx(
                   "flex items-center gap-2 px-3 py-1.5 rounded-md text-[11px] font-medium transition-all duration-200",
                   mode === 'scripting' 
                      ? "bg-[#1C1B19] text-[#ECE9E1] shadow-sm ring-1 ring-[#282724]" 
                      : "text-[#5F5E5A] hover:text-[#B5B2A8] hover:bg-[#131312]"
                )}
             >
                <FileText className="w-3.5 h-3.5" />
                Scripting
             </button>
             {canOpenAVScript && (
               <button
                 type="button"
                 onClick={() => setMode('av-script')}
                 className={clsx(
                   "flex items-center gap-2 px-3 py-1.5 rounded-md text-[11px] font-medium transition-all duration-200",
                   mode === 'av-script'
                     ? "bg-[#1C1B19] text-[#ECE9E1] shadow-sm ring-1 ring-[#282724]"
                     : "text-[#5F5E5A] hover:text-[#B5B2A8] hover:bg-[#131312]",
                 )}
               >
                 <FileVideo2 className="w-3.5 h-3.5" />
                 AV Script
               </button>
             )}
             {/* Whiteboard toggle removed: it occupied half the primary
                 mode-switcher and rendered a "Coming Soon" placeholder — a
                 dead end in prime navigation. Reinstate with the feature. */}
          </div>
       </div>

       {tabsLoadError && (
         <div className="flex min-h-9 items-center gap-2 border-b border-red-900/40 bg-red-950/20 px-4 text-xs text-red-300" role="alert">
           <span className="min-w-0 flex-1 truncate">{tabsLoadError}</span>
           <button
             type="button"
             onClick={() => void fetchTabs()}
             className="flex h-7 w-7 shrink-0 items-center justify-center text-red-300 hover:text-red-100"
             aria-label="Retry loading documents"
             title="Retry loading documents"
           >
             <RefreshCw className="h-3.5 w-3.5" />
           </button>
         </div>
       )}

       {scriptLoadError && (
         <div className="flex min-h-9 items-center gap-2 border-b border-red-900/40 bg-red-950/20 px-4 text-xs text-red-300" role="alert">
           <span className="min-w-0 flex-1">{scriptLoadError}</span>
           {onRetryScriptLoad && (
             <button
               type="button"
               onClick={onRetryScriptLoad}
               className="flex h-7 w-7 shrink-0 items-center justify-center text-red-300 hover:text-red-100"
               aria-label="Retry loading document"
               title="Retry loading document"
             >
               <RefreshCw className="h-3.5 w-3.5" />
             </button>
           )}
         </div>
       )}

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
       <div className="flex-1 relative overflow-hidden editor-main" style={{ padding: 0 }}>
             <div className={clsx('absolute inset-0 overflow-hidden', mode === 'scripting' ? '' : 'hidden')} aria-hidden={mode !== 'scripting'}>
                <ScriptEditor
                  script={script}
                  selectedIdea={selectedIdea}
                  sessionId={sessionId || undefined}
                  scriptId={resolvedScriptId}
                  onEditScript={onUpdate}
                  isSaving={isSaving}
                  isDocumentLoading={isScriptLoading}
                  onImportScript={onImportScript ? async (data) => onImportScript(data) : undefined}
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
             <div className={clsx('absolute inset-0 overflow-hidden', mode === 'av-script' ? '' : 'hidden')} aria-hidden={mode !== 'av-script'}>
               <AVScriptView
                 active={mode === 'av-script'}
                 sessionId={sessionId}
                 scriptId={resolvedScriptId}
                 documentVersion={documentVersion}
                 onStatusChange={handleAVPresentationStatus}
                 onEditProse={() => setMode('scripting')}
                 onContractRefreshed={onUpdate}
               />
             </div>
       </div>
    </div>
  );
};
