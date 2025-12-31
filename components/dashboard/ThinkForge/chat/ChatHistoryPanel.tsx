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

interface SessionInfo {
  id: string;
  name: string;
  tone: string;
  lastEdited: number;
  projectMeta?: {
    idea?: string;
    purpose?: string;
    tone?: string;
    projectName?: string;
  };
}

interface ChatHistoryPanelProps {
  open: boolean;
  onClose: () => void;
  sessionId: string | null;
  currentMessages: ChatMessage[];
  onSwitchSession?: (sessionId: string) => void;
  /** Current project metadata to filter sessions by project */
  currentProjectMeta?: {
    idea?: string;
    purpose?: string;
    tone?: string;
    projectName?: string;
  };
  onNewChat?: () => void;
}

export function ChatHistoryPanel({ 
  open, 
  onClose, 
  sessionId,
  currentMessages,
  onSwitchSession,
  currentProjectMeta,
  onNewChat
}: ChatHistoryPanelProps) {
  const [allSessions, setAllSessions] = useState<SessionInfo[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);

  // Filter sessions to only show those from the current project
  const projectSessions = useMemo(() => {
    if (!currentProjectMeta?.idea) return allSessions;
    
    // Filter sessions that belong to the same project (matching idea text)
    return allSessions.filter(session => {
      const sessionIdea = session.projectMeta?.idea || '';
      const currentIdea = currentProjectMeta.idea || '';
      // Match by idea text (primary identifier for a project)
      return sessionIdea.trim().toLowerCase() === currentIdea.trim().toLowerCase();
    });
  }, [allSessions, currentProjectMeta]);

  // Load all sessions for the user
  useEffect(() => {
    if (!open) return;
    
    let cancelled = false;
    
    async function loadSessions() {
      setLoadingSessions(true);
      try {
        const res = await fetch('/api/services/thinkforge/sessions/metadata?limit=50&offset=0', {
          cache: 'no-store'
        });
        
        if (!res.ok) throw new Error('Failed to load sessions');
        
        const data = await res.json();
        const items = Array.isArray(data?.sessions) ? data.sessions : [];
        
        if (!cancelled) {
          const mapped: SessionInfo[] = items.map((it: any) => ({
            id: it?.id || it?._id || "",
            name: it?.projectMeta?.projectName || it?.name || it?.projectMeta?.idea || it?.projectMeta?.purpose || `Session ${String(it?.id || '').slice(-6)}`,
            tone: it?.tone || it?.projectMeta?.tone || 'blue',
            lastEdited: it?.lastEdited || (it?.updatedAt ? new Date(it.updatedAt).getTime() : Date.now()),
            projectMeta: it?.projectMeta || {}
          }));
          setAllSessions(mapped);
        }
      } catch (e: any) {
        console.error('Failed to load sessions:', e);
      } finally {
        if (!cancelled) setLoadingSessions(false);
      }
    }
    
    loadSessions();
    return () => { cancelled = true; };
  }, [open]);

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

  const handleSessionClick = useCallback((clickedSessionId: string) => {
    if (onSwitchSession) {
      onSwitchSession(clickedSessionId);
      onClose(); // Close panel after selection
    }
  }, [onSwitchSession, onClose]);

  const toneBadgeColors: Record<string, string> = {
    red: 'bg-red-500',
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    yellow: 'bg-yellow-400',
    white: 'bg-white',
    black: 'bg-zinc-700',
  };

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
                <h2 className="text-sm font-semibold text-white/90">Chat Sessions</h2>
                <span className="text-[10px] text-white/40 bg-white/5 px-2 py-0.5 rounded">
                  {projectSessions.length} session{projectSessions.length !== 1 ? 's' : ''}
                </span>
              </div>
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
                {loadingSessions ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-white/40" />
                  </div>
                ) : projectSessions.length === 0 ? (
                  <div className="text-center py-12">
                    <MessageSquare className="h-8 w-8 mx-auto mb-2 text-white/20" />
                    <p className="text-sm text-white/40">No chat sessions found</p>
                    <p className="text-xs text-white/30 mt-1">
                      Start chatting to create your first session
                    </p>
                  </div>
                ) : (
                  projectSessions.map((session, idx) => {
                    const isActive = session.id === sessionId;
                    const toneColor = toneBadgeColors[session.tone] || 'bg-blue-500';
                    
                    return (
                      <motion.div
                        key={session.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.03 }}
                        onClick={() => handleSessionClick(session.id)}
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
                            {/* Tone indicator */}
                            <div className={`w-3 h-3 rounded-full mt-0.5 shrink-0 ${toneColor} ring-1 ring-black/30`} />
                            
                            <div className="flex-1 min-w-0">
                              {/* Session name */}
                              <p className="text-sm font-medium text-white/90 truncate">
                                {session.name}
                              </p>
                              
                              {/* Last edited */}
                              <p className="text-[10px] text-white/40 mt-1">
                                {isActive ? (
                                  <span className="text-red-400">Active now</span>
                                ) : (
                                  formatDate(session.lastEdited)
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
                Showing {projectSessions.length} session{projectSessions.length !== 1 ? 's' : ''} in this project
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
