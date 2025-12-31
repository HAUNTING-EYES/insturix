"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, MessageSquare, Clock, User, Bot, Loader2, ChevronRight } from "lucide-react";
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
  projectMeta?: any;
}

interface ChatHistoryPanelProps {
  open: boolean;
  onClose: () => void;
  sessionId: string | null;
  currentMessages: ChatMessage[];
  onSwitchSession?: (sessionId: string) => void;
}

export function ChatHistoryPanel({ 
  open, 
  onClose, 
  sessionId,
  currentMessages,
  onSwitchSession
}: ChatHistoryPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [viewMode, setViewMode] = useState<'messages' | 'sessions'>('sessions');

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
            name: it?.name || it?.projectMeta?.idea || it?.projectMeta?.purpose || `Session ${String(it?.id || '').slice(-6)}`,
            tone: it?.tone || it?.projectMeta?.tone || 'blue',
            lastEdited: it?.lastEdited || (it?.updatedAt ? new Date(it.updatedAt).getTime() : Date.now()),
            projectMeta: it?.projectMeta || {}
          }));
          setSessions(mapped);
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

  // Load chat history from backend when panel opens and sessionId changes
  useEffect(() => {
    if (!open || !sessionId || viewMode !== 'messages') return;
    
    let cancelled = false;
    
    async function loadHistory() {
      setLoading(true);
      setError(null);
      
      try {
        const res = await fetch(
          `/api/services/thinkforge/chat/list?sessionId=${encodeURIComponent(sessionId)}&limit=100&offset=0`,
          { cache: 'no-store' }
        );
        
        if (!res.ok) throw new Error('Failed to load chat history');
        
        const data = await res.json();
        const items = Array.isArray(data?.items) ? data.items : [];
        
        if (!cancelled) {
          const normalized: ChatMessage[] = items.map((m: any) => ({
            id: m._id || m.id || crypto.randomUUID(),
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: m.content || '',
            timestamp: m.timestamp ? new Date(m.timestamp) : new Date(m.createdAt || Date.now()),
          }));
          setMessages(normalized);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || 'Failed to load');
          // Fall back to current messages
          setMessages(currentMessages);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    
    loadHistory();
    return () => { cancelled = true; };
  }, [open, sessionId, currentMessages, viewMode]);

  const formatTime = useCallback((date: Date) => {
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, []);

  const truncateContent = useCallback((content: string, maxLength: number = 200) => {
    if (content.length <= maxLength) return content;
    return content.slice(0, maxLength) + '...';
  }, []);

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

  const handleSessionClick = useCallback((sessionId: string) => {
    if (onSwitchSession) {
      onSwitchSession(sessionId);
      setViewMode('messages');
    }
  }, [onSwitchSession]);

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
                <h2 className="text-sm font-semibold text-white/90">
                  {viewMode === 'sessions' ? 'All Sessions' : 'Chat History'}
                </h2>
                {viewMode === 'messages' && sessionId && (
                  <span className="text-[10px] text-white/40 bg-white/5 px-2 py-0.5 rounded">
                    {sessionId.slice(-8)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {viewMode === 'messages' && (
                  <button
                    onClick={() => setViewMode('sessions')}
                    className="text-xs text-white/60 hover:text-white/90 px-2 py-1 rounded hover:bg-white/10 transition-colors"
                  >
                    Back
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            
            {/* Content */}
            <ScrollArea className="flex-1">
              <div className="p-3 space-y-2">
                {viewMode === 'sessions' ? (
                  <>
                    {loadingSessions ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-6 w-6 animate-spin text-white/40" />
                      </div>
                    ) : sessions.length === 0 ? (
                      <div className="text-center py-12">
                        <MessageSquare className="h-8 w-8 mx-auto mb-2 text-white/20" />
                        <p className="text-sm text-white/40">No sessions yet</p>
                        <p className="text-xs text-white/30 mt-1">
                          Start a new chat to create a session
                        </p>
                      </div>
                    ) : (
                      sessions.map((session) => {
                        const isActive = session.id === sessionId;
                        const toneColors: Record<string, string> = {
                          red: 'bg-red-500/20 border-red-500/30',
                          blue: 'bg-blue-500/20 border-blue-500/30',
                          green: 'bg-green-500/20 border-green-500/30',
                          yellow: 'bg-yellow-500/20 border-yellow-500/30',
                          white: 'bg-white/20 border-white/30',
                          black: 'bg-zinc-500/20 border-zinc-500/30',
                        };
                        const toneColor = toneColors[session.tone] || 'bg-white/10 border-white/20';
                        
                        const toneDotColors: Record<string, string> = {
                          red: 'bg-red-500',
                          blue: 'bg-blue-500',
                          green: 'bg-green-500',
                          yellow: 'bg-yellow-500',
                          white: 'bg-white',
                          black: 'bg-zinc-500',
                        };
                        const toneDotColor = toneDotColors[session.tone] || 'bg-white/30';
                        
                        return (
                          <motion.div
                            key={session.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            onClick={() => handleSessionClick(session.id)}
                            className={`
                              p-3 rounded-lg border cursor-pointer transition-all
                              ${isActive ? `${toneColor} ring-2 ring-offset-2 ring-offset-neutral-950` : 'bg-white/5 border-white/10 hover:bg-white/10'}
                            `}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-start gap-2 flex-1 min-w-0">
                                <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${isActive ? toneDotColor : 'bg-white/30'}`} />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-white/90 truncate">
                                    {session.name}
                                  </p>
                                  <p className="text-[10px] text-white/40 mt-0.5">
                                    {formatDate(session.lastEdited)}
                                  </p>
                                </div>
                              </div>
                              <ChevronRight className="h-4 w-4 text-white/30 shrink-0" />
                            </div>
                          </motion.div>
                        );
                      })
                    )}
                  </>
                ) : (
                  <>
                    {loading ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-6 w-6 animate-spin text-white/40" />
                      </div>
                    ) : error ? (
                      <div className="text-center py-12">
                        <p className="text-sm text-red-400">{error}</p>
                      </div>
                    ) : messages.length === 0 ? (
                      <div className="text-center py-12">
                        <MessageSquare className="h-8 w-8 mx-auto mb-2 text-white/20" />
                        <p className="text-sm text-white/40">No messages yet</p>
                        <p className="text-xs text-white/30 mt-1">
                          Start chatting to build history
                        </p>
                      </div>
                    ) : (
                      messages.map((msg) => (
                        <motion.div
                          key={msg.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={`
                            p-3 rounded-xl text-sm
                            ${msg.role === 'user' 
                              ? 'bg-red-950/30 border border-red-900/30 ml-4' 
                              : 'bg-white/5 border border-white/5 mr-4'
                            }
                          `}
                        >
                          {/* Role indicator */}
                          <div className="flex items-center gap-2 mb-1.5">
                            {msg.role === 'user' ? (
                              <>
                                <User className="h-3 w-3 text-red-400" />
                                <span className="text-[10px] font-medium text-red-400 uppercase">You</span>
                              </>
                            ) : (
                              <>
                                <Bot className="h-3 w-3 text-blue-400" />
                                <span className="text-[10px] font-medium text-blue-400 uppercase">ForgeAI</span>
                              </>
                            )}
                            <span className="text-[10px] text-white/30 ml-auto flex items-center gap-1">
                              <Clock className="h-2.5 w-2.5" />
                              {formatTime(msg.timestamp)}
                            </span>
                          </div>
                          
                          {/* Content */}
                          <p className="text-white/80 whitespace-pre-wrap wrap-break-word leading-relaxed">
                            {truncateContent(msg.content)}
                          </p>
                        </motion.div>
                      ))
                    )}
                  </>
                )}
              </div>
            </ScrollArea>
            
            {/* Footer */}
            <div className="px-4 py-3 border-t border-white/5 text-center">
              <p className="text-[10px] text-white/30">
                {viewMode === 'sessions' 
                  ? `${sessions.length} session${sessions.length !== 1 ? 's' : ''} total`
                  : `${messages.length} message${messages.length !== 1 ? 's' : ''} in this session`
                }
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
