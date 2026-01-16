'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { History, X, FileText, Loader2, ChevronRight, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ScriptTab {
  scriptId: string;
  title: string;
  updatedAt: string | number | Date;
  createdAt: string | number | Date;
}

interface ScriptHistoryPanelProps {
  sessionId: string | null;
  activeScriptId: string | null;
  onSwitchScript: (scriptId: string) => void;
  onNewScript?: () => void;
  onClose: () => void;
}

export const ScriptHistoryPanel: React.FC<ScriptHistoryPanelProps> = ({
  sessionId,
  activeScriptId,
  onSwitchScript,
  onNewScript,
  onClose,
}) => {
  const [scripts, setScripts] = useState<ScriptTab[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/services/thinkforge/script/list?sessionId=${encodeURIComponent(sessionId)}`, { cache: 'no-store' });
        if (!res.ok) throw new Error('Failed to load scripts');
        const data = await res.json();
        const items = Array.isArray(data?.scripts) ? data.scripts : [];
        if (!cancelled) {
          setScripts(items);
        }
      } catch {
        if (!cancelled) setScripts([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [sessionId]);

  const ordered = useMemo(() => {
    return [...scripts].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [scripts]);

  const formatDate = useCallback((value: string | number | Date) => {
    const date = new Date(value);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }, []);

  return (
    <div className="flex flex-col h-full min-h-[400px] bg-zinc-950/50 backdrop-blur-xl border-l border-white/5">
      <div className="flex items-center justify-between p-5 border-b border-white/5 bg-zinc-950/30 sticky top-0 z-10 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-linear-to-br from-red-500/10 to-orange-500/10 flex items-center justify-center border border-white/5 shadow-inner shadow-white/5">
            <History className="h-4 w-4 text-red-400" />
          </div>
          <div>
            <h2 className="text-sm font-medium text-zinc-200">Script Tabs</h2>
            <p className="text-[10px] text-zinc-500 font-medium">
              {ordered.length} tab{ordered.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-5">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
            </div>
          ) : ordered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="h-16 w-16 rounded-full bg-zinc-900/50 flex items-center justify-center mb-4 ring-1 ring-white/5 shadow-2xl">
                <FileText className="h-8 w-8 text-zinc-600" />
              </div>
              <h3 className="text-sm font-medium text-zinc-300 mb-1">No scripts yet</h3>
              <p className="text-xs text-zinc-500 max-w-60 leading-relaxed">
                Create a new script to start a fresh tab in this session.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {ordered.map((item) => {
                const isActive = item.scriptId === (activeScriptId || 'default');
                return (
                  <button
                    key={item.scriptId}
                    onClick={() => onSwitchScript(item.scriptId)}
                    className={
                      `w-full text-left rounded-xl border p-4 transition-all duration-300 ${
                        isActive
                          ? 'border-red-500/30 bg-red-500/10 ring-1 ring-red-500/20'
                          : 'border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20'
                      }`
                    }
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className={`w-3 h-3 rounded-full mt-0.5 shrink-0 ${isActive ? 'bg-red-400' : 'bg-zinc-600'} ring-1 ring-black/30`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white/90 truncate">
                            {item.title || `Script ${String(item.scriptId).slice(-6)}`}
                          </p>
                          <p className="text-[10px] text-white/40 mt-1">
                            {isActive ? 'Active now' : formatDate(item.updatedAt)}
                          </p>
                        </div>
                      </div>
                      <ChevronRight className={`h-4 w-4 shrink-0 transition-colors ${isActive ? 'text-red-400' : 'text-white/20 group-hover:text-white/40'}`} />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};
