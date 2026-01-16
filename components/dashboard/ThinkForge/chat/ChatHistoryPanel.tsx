"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, MessageSquare, Loader2, ChevronRight } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ThreadInfo {
  id: string;
  name: string;
  lastEdited: number;
  lastMessage?: string;
}

interface ChatHistoryPanelProps {
  open: boolean;
  onClose: () => void;
  sessionId: string | null;
  currentThreadId: string | null;
  localThreads?: ThreadInfo[];
  onSwitchThread?: (threadId: string) => void;
  onNewChat?: () => void;
}

export function ChatHistoryPanel({ 
  open, 
  onClose, 
  sessionId,
  currentThreadId,
  localThreads = [],
  onSwitchThread,
  onNewChat
}: ChatHistoryPanelProps) {
  const [threads, setThreads] = useState<ThreadInfo[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(false);

  // Load threads for this session
  useEffect(() => {
    if (!open || !sessionId) return;
    
    let cancelled = false;
    
    async function loadThreads() {
      setLoadingThreads(true);
      try {
        const res = await fetch(`/api/services/thinkforge/chat/threads?sessionId=${encodeURIComponent(sessionId)}`, { cache: 'no-store' });
        if (!res.ok) throw new Error('Failed to load threads');
        const data = await res.json();
        const items = Array.isArray(data?.threads) ? data.threads : [];
        if (!cancelled) {
          const mapped: ThreadInfo[] = items.map((it: any) => ({
            id: it?.threadId || 'default',
            name: it?.name || `Chat ${String(it?.threadId || 'default').slice(-6)}`,
            lastEdited: it?.lastEdited ? new Date(it.lastEdited).getTime() : Date.now(),
            lastMessage: it?.lastMessage || ''
          }));
          setThreads(mapped);
        }
      } catch (e: any) {
        console.error('Failed to load threads:', e);
      } finally {
        if (!cancelled) setLoadingThreads(false);
      }
    }
    
    loadThreads();
    return () => { cancelled = true; };
  }, [open, sessionId]);

  const displayThreads = useMemo(() => {
    const merged = [...threads];
    for (const local of localThreads) {
      if (!merged.some((t) => t.id === local.id)) {
        merged.push(local);
      }
    }
    return merged.sort((a, b) => (b.lastEdited || 0) - (a.lastEdited || 0));
  }, [threads, localThreads]);

  const formatDate = useCallback((timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return 'Today';
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
    }
  }, []);

  const handleThreadClick = useCallback((clickedThreadId: string) => {
    if (onSwitchThread) {
      onSwitchThread(clickedThreadId);
      onClose();
    }
  }, [onSwitchThread, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          
          {/* Panel */}
          <motion.div
            initial={{ x: "-100%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "-100%", opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed left-0 top-0 bottom-0 z-50 w-[min(400px,90vw)] bg-neutral-950/95 border-r border-white/10 backdrop-blur-xl flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-white/60" />
                <h2 className="text-sm font-semibold text-white/90">Chat Tabs</h2>
                <span className="text-[10px] text-white/40 bg-white/5 px-2 py-0.5 rounded">
                  {displayThreads.length} tab{displayThreads.length !== 1 ? 's' : ''}
                </span>
              </div>
              {onNewChat && (
                <button
                  onClick={onNewChat}
                  className="text-[10px] px-2 py-1 rounded bg-white/5 text-white/60 hover:bg-white/10 hover:text-white transition-colors"
                >
                  New Chat
                </button>
              )}
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            
            {/* Content */}
            <ScrollArea className="flex-1">
              <div className="p-3 space-y-2">
                {loadingThreads ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-white/40" />
                  </div>
                ) : displayThreads.length === 0 ? (
                  <div className="text-center py-12">
                    <MessageSquare className="h-8 w-8 mx-auto mb-2 text-white/20" />
                    <p className="text-sm text-white/40">No chat tabs found</p>
                    <p className="text-xs text-white/30 mt-1">
                      Start chatting to create your first tab
                    </p>
                  </div>
                ) : (
                  displayThreads.map((thread, idx) => {
                    const isActive = thread.id === currentThreadId;
                    
                    return (
                      <motion.div
                        key={thread.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.03 }}
                        onClick={() => handleThreadClick(thread.id)}
                        className={`
                          group p-3 rounded-xl border cursor-pointer transition-all
                          ${isActive 
                            ? 'border-red-500/30 bg-red-500/10 ring-1 ring-red-500/20' 
                            : 'border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20'
                          }
                        `}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            <div className={`w-3 h-3 rounded-full mt-0.5 shrink-0 ${isActive ? 'bg-red-400' : 'bg-zinc-600'} ring-1 ring-black/30`} />
                            
                            <div className="flex-1 min-w-0">
                              {/* Session name */}
                              <p className="text-sm font-medium text-white/90 truncate">
                                {thread.name || `Chat ${String(thread.id).slice(-6)}`}
                              </p>
                              
                              {/* Last edited */}
                              <p className="text-[10px] text-white/40 mt-1">
                                {isActive ? (
                                  <span className="text-red-400">Active now</span>
                                ) : (
                                  formatDate(thread.lastEdited)
                                )}
                              </p>
                            </div>
                          </div>
                          
                          <ChevronRight className={`h-4 w-4 shrink-0 transition-colors ${isActive ? 'text-red-400' : 'text-white/20 group-hover:text-white/40'}`} />
                        </div>
                      </motion.div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
            
            {/* Footer */}
            <div className="px-4 py-3 border-t border-white/5 text-center">
              <p className="text-[10px] text-white/30">
                Showing {displayThreads.length} chat tab{displayThreads.length !== 1 ? 's' : ''}
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
