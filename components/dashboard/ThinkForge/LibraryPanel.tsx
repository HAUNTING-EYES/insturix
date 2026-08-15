"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Pencil, Trash2, Check, X, FileText } from "lucide-react";
import { deleteThinkForgeSessionWhenDurable } from "./session-deletion";

export interface SessionMeta {
  id: string;
  name: string;
  tone: string;
  lastEdited: number; // epoch ms
  createdByName?: string;
}

interface LibraryPanelProps {
  open: boolean;
  onClose: () => void;
  panelRef?: React.Ref<HTMLElement>;
  sessions?: SessionMeta[];
  activeSessionId?: string | null;
  onRenameSession?: (id: string, name: string) => void;
  onDeleteSession?: (id: string) => void;
  onOpenSession?: (id: string) => void;
}

export const LibraryPanel: React.FC<LibraryPanelProps> = ({ open, onClose, panelRef, sessions, activeSessionId, onRenameSession, onDeleteSession, onOpenSession }) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [loaded, setLoaded] = useState<SessionMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const deletionAbortRef = useRef<AbortController | null>(null);

  useEffect(() => () => deletionAbortRef.current?.abort(), []);
  useEffect(() => {
    if (!open) deletionAbortRef.current?.abort();
  }, [open]);

  const startEdit = (s: SessionMeta) => {
    setEditingId(s.id);
    setDraftName(s.name);
  };
  const cancelEdit = () => { setEditingId(null); setDraftName(""); };
  const commitEdit = () => {
    if (editingId && draftName.trim()) {
      onRenameSession?.(editingId, draftName.trim());
    }
    cancelEdit();
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleString(undefined, { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  const toneBadge = (tone: string) => {
    const map: Record<string,string> = {
      white: 'bg-white text-black', red: 'bg-[#D4A652] text-[#ECE9E1]', black: 'bg-black text-white border border-white/30', yellow: 'bg-yellow-400 text-black', green: 'bg-green-500 text-[#ECE9E1]', blue: 'bg-blue-500 text-[#ECE9E1]'
    };
    return map[tone] || 'bg-[#454340] text-[#ECE9E1]';
  };

  // Handle delete with confirmation and backend call
  const requestDelete = (id: string) => {
    setConfirmingId(id);
  };

  const cancelDelete = () => setConfirmingId(null);

  const confirmDelete = async (id: string) => {
    deletionAbortRef.current?.abort();
    const controller = new AbortController();
    deletionAbortRef.current = controller;
    setDeletingId(id);
    setLoadError(null);
    try {
      await deleteThinkForgeSessionWhenDurable(id, { signal: controller.signal });
      setLoaded(prev => prev.filter(s => s.id !== id));
      onDeleteSession?.(id);
    } catch (error: unknown) {
      const failure = error instanceof Error ? error : new Error('Failed to delete session');
      if (failure.name !== 'AbortError') setLoadError(failure.message);
    } finally {
      if (deletionAbortRef.current === controller) {
        deletionAbortRef.current = null;
        setDeletingId(null);
        setConfirmingId(null);
      }
    }
  };

  // fetch sessions on open if not provided
  const hasExternalSessions = !!(sessions && sessions.length > 0);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!open) return;
      if (hasExternalSessions) return;
      setLoading(true);
      setLoadError(null);
      try {
        const res = await fetch('/api/services/thinkforge/sessions/metadata?limit=50&offset=0', {
          cache: 'no-store'
        });
        if (!res.ok) throw new Error(`Failed to load: ${res.status}`);
        const data = await res.json();
        const items = Array.isArray(data?.sessions) ? data.sessions : [];
        const mapped: SessionMeta[] = items.map((it: any) => {
          const id = it?.id || it?._id || "";
          const pm = it?.projectMeta || it?.sessionMeta || {};
          const name: string = it?.name || pm?.sessionName || pm?.idea || pm?.purpose || `Session ${String(id).slice(-6)}`;
          const tone: string = it?.tone || pm?.tone || "blue";
          const lastEdited: number = (it?.updatedAt ? new Date(it.updatedAt).getTime() : Date.now());
          const createdByName: string = it?.createdByName || "";
          return { id, name, tone, lastEdited, createdByName };
        });
        if (!cancelled) setLoaded(mapped);
      } catch (e: any) {
        if (!cancelled) setLoadError(e?.message || "Failed to load sessions");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run();
    return () => { cancelled = true; };
  }, [open, hasExternalSessions]);

  const displaySessions = useMemo(() => (hasExternalSessions ? (sessions as SessionMeta[]) : loaded), [hasExternalSessions, sessions, loaded]);

  return (
  <AnimatePresence>
    {open && (
      <motion.aside
        className="fixed right-0 top-0 z-40 flex h-full w-[min(420px,90vw)] flex-col border-l border-[#1C1B19] bg-[#0B0B0A]/98 backdrop-blur-xl"
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", stiffness: 200, damping: 25 }}
        ref={panelRef as any}
      >
        <div className="flex items-center justify-between border-b border-[#1C1B19] px-6 py-4">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-[#7A776E]" />
            <h2 className="text-sm font-semibold tracking-wide text-[#ECE9E1]">Library</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg bg-[#1C1B19] px-3 py-1.5 text-[11px] font-medium text-[#B5B2A8] hover:bg-[#282724] hover:text-[#ECE9E1] transition-colors"
          >
            Close
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <p className="mb-3 text-[10px] uppercase tracking-wider text-[#5F5E5A] font-medium">Sessions</p>
          {loading && (
            <div className="rounded-xl bg-[#0F0F0E] p-6 text-center">
              <div className="h-4 w-4 mx-auto mb-2 border-2 border-[#282724] border-t-[#D4A652] rounded-full animate-spin" />
              <p className="text-[11px] text-[#7A776E]">Loading sessions...</p>
            </div>
          )}
          {!loading && displaySessions.length === 0 && (
            <div className="rounded-xl bg-[#0F0F0E] p-6 text-center border border-[#1C1B19]">
              <FileText className="h-8 w-8 mx-auto mb-2 text-[#282724]" />
              <p className="text-[11px] text-[#7A776E]">No sessions yet</p>
              <p className="text-[10px] text-[#454340] mt-1">Generate ideas to create your first session</p>
            </div>
          )}
          {!!loadError && (
            <div className="rounded-xl bg-[#D4A652]/10 border border-[#D4A652]/20 p-4 text-[11px] text-[#D4A652] mb-4">
              {loadError}
            </div>
          )}
          <ul className="space-y-2">
            {displaySessions.map((s, idx) => (
              <motion.li
                key={s.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.03 }}
                className={[
                  "group relative rounded-xl border px-4 py-3 transition-all flex flex-col gap-2 cursor-pointer",
                  s.id === activeSessionId
                    ? "border-[#D4A652]/30 bg-[#D4A652]/5 hover:bg-[#D4A652]/10"
                    : "border-[#1C1B19] bg-[#0F0F0E] hover:bg-[#131312] hover:border-[#282724]"
                ].join(' ')}
                onClick={(e) => {
                  const target = e.target as HTMLElement;
                  if (target.closest('button')) return;
                  onOpenSession?.(s.id);
                }}
                title="Open session"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span
                      className={`inline-block h-3.5 w-3.5 rounded-full ring-0 ring-black ${toneBadge(s.tone)}`}
                      title={s.tone}
                      aria-label={`${s.tone} tone`}
                    />
                    {editingId === s.id ? (
                      <input
                        autoFocus
                        value={draftName}
                        onChange={e=>setDraftName(e.target.value)}
                        onKeyDown={e=>{ if(e.key==='Enter') { e.preventDefault(); commitEdit(); } else if (e.key==='Escape') { cancelEdit(); } }}
                        onBlur={commitEdit}
                        className="flex-1 min-w-0 bg-[#0B0B0A] border border-[#282724] rounded-lg px-2.5 py-1.5 text-[11px] text-white placeholder:text-[#454340] focus:outline-none focus:ring-2 focus:ring-[#D4A652]/40"
                        placeholder="Session name"/>
                    ) : (
                      <span className="truncate text-[11px] font-medium text-[#ECE9E1]">{s.name}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                    {editingId === s.id ? (
                      <>
                        <button onMouseDown={e=>{e.preventDefault(); commitEdit();}} className="p-1 rounded-md bg-green-500/60 hover:bg-green-500 text-[#ECE9E1]"><Check className="h-3 w-3"/></button>
                        <button onMouseDown={e=>{e.preventDefault(); cancelEdit();}} className="p-1 rounded-md bg-[#454340]/60 hover:bg-[#454340] text-[#ECE9E1]"><X className="h-3 w-3"/></button>
                      </>
                    ) : (
                      <>
                        <button onClick={()=>startEdit(s)} className="p-1 rounded-md bg-[#1C1B19] hover:bg-[#282724] text-[#ECE9E1] hover:text-[#ECE9E1]"><Pencil className="h-3 w-3"/></button>
                        {confirmingId === s.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              disabled={deletingId === s.id}
                              onMouseDown={e=>{e.preventDefault(); void confirmDelete(s.id);}}
                              className="px-2 py-1 rounded-md bg-[#D4A652] hover:bg-[#D4A652] text-white text-[11px]"
                            >
                              {deletingId === s.id ? 'Deleting...' : 'Confirm'}
                            </button>
                            <button
                              onMouseDown={e=>{e.preventDefault(); cancelDelete();}}
                              className="px-2 py-1 rounded-md bg-[#282724] hover:bg-[#454340] text-white text-[11px]"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button onClick={()=>requestDelete(s.id)} className="p-1 rounded-md bg-[#D4A652]/70 hover:bg-[#D4A652] text-[#ECE9E1]"><Trash2 className="h-3 w-3"/></button>
                        )}
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-[#5F5E5A] tracking-wide">Last edit: {formatTime(s.lastEdited)}</span>
                  {s.createdByName && (
                    <span className="text-[9px] text-[#454340] font-medium uppercase truncate pl-4">by {s.createdByName}</span>
                  )}
                </div>
              </motion.li>
            ))}
          </ul>
        </div>
      </motion.aside>
    )}
  </AnimatePresence>
  );
};
