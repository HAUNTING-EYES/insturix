"use client";
import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Pencil, Trash2, Check, X } from "lucide-react";
import { useThinkForgeClient } from "@/app/dashboard/thinkforge/hooks/useThinkForgeClient";

export interface SessionMeta {
  id: string;
  name: string;
  tone: string;
  lastEdited: number; // epoch ms
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

  // Destructure only the stable, memoized method to avoid changing deps every render
  const { getSessionsList } = useThinkForgeClient();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

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
      white: 'bg-white text-black', red: 'bg-red-500 text-white', black: 'bg-black text-white border border-white/30', yellow: 'bg-yellow-400 text-black', green: 'bg-green-500 text-white', blue: 'bg-blue-500 text-white'
    };
    return map[tone] || 'bg-zinc-600 text-white';
  };

  // Handle delete with confirmation and backend call
  const requestDelete = (id: string) => {
    setConfirmingId(id);
  };

  const cancelDelete = () => setConfirmingId(null);

  const confirmDelete = async (id: string) => {
    setDeletingId(id);
    setLoadError(null);
    try {
      const res = await fetch(`/api/services/thinkforge/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message || body?.error || `Failed (${res.status})`);
      }
      // Remove from local list
      setLoaded(prev => prev.filter(s => s.id !== id));
      // Bubble up if parent wants to maintain a list
      onDeleteSession?.(id);
    } catch (e: any) {
      setLoadError(e?.message || 'Failed to delete session');
    } finally {
      setDeletingId(null);
      setConfirmingId(null);
    }
  };

  // fetch sessions on open if not provided
  const hasExternalSessions = !!(sessions && sessions.length > 0);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!open) return;
      if (hasExternalSessions) return; // external sessions provided
      setLoading(true);
      setLoadError(null);
      try {
        const res = await getSessionsList(50, 0);
        const items = Array.isArray(res?.sessions) ? res.sessions : [];
        const mapped: SessionMeta[] = items.map((it: any) => {
          const id = it?.id || it?._id || "";
          const pm = it?.projectMeta || {};
          const name: string = pm?.idea || pm?.purpose || `Session ${String(id).slice(-6)}`;
          const tone: string = pm?.tone || "blue";
          const lastEdited: number = (it?.updatedAt ? Date.parse(it.updatedAt) : Date.now()) || Date.now();
          return { id, name, tone, lastEdited };
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
  }, [open, hasExternalSessions, getSessionsList]);

  const displaySessions = useMemo(() => (hasExternalSessions ? (sessions as SessionMeta[]) : loaded), [hasExternalSessions, sessions, loaded]);

  return (
  <AnimatePresence>
    {open && (
      <motion.aside
        className="fixed right-0 top-0 z-40 flex h-full w-[min(420px,90vw)] flex-col border-l border-white/10 bg-neutral-950/80 pb-6 pt-4 backdrop-blur-2xl"
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", stiffness: 140, damping: 24 }}
        ref={panelRef as any}
      >
        <div className="flex items-center justify-between px-5 pb-3">
          <h2 className="text-sm font-semibold tracking-wide text-white/80">Library</h2>
          <button
            onClick={onClose}
            className="rounded-full bg-white/5 px-3 py-1 text-[11px] font-medium text-white/60 hover:bg-white/10"
          >
            Close
          </button>
        </div>
        <div className="custom-scrollbar mx-4 flex-1 space-y-4 overflow-y-auto rounded-xl border border-white/5 bg-white/[0.03] p-4 text-xs text-white/60">
          <p className="mb-2 text-[11px] uppercase tracking-wide text-white/40">Sessions</p>
          {loading && (
            <div className="rounded-lg bg-white/5 p-4 text-[11px] text-white/60 animate-pulse">Loading sessions…</div>
          )}
          {!loading && displaySessions.length === 0 && (
            <div className="rounded-lg bg-white/5 p-4 text-[11px] text-white/50">No sessions yet. Generate ideas and proceed to chat to create one.</div>
          )}
          {!!loadError && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-[11px] text-red-300">{loadError}</div>
          )}
          <ul className="space-y-2">
            {displaySessions.map(s => (
              <li
                key={s.id}
                className={[
                  "group relative rounded-xl border px-3 py-2 transition flex flex-col gap-1 cursor-pointer",
                  s.id === activeSessionId
                    ? "border-white/10 bg-red-600/20 hover:bg-red-600/25"
                    : "border-white/10 bg-white/5 hover:bg-white/10"
                ].join(' ')}
                onClick={(e) => {
                  // Avoid triggering when clicking action buttons
                  const target = e.target as HTMLElement;
                  if (target.closest('button')) return;
                  // If already active, do nothing
                  if (s.id === activeSessionId) return;
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
                        className="flex-1 min-w-0 bg-black/40 border border-white/20 rounded-md px-2 py-1 text-[12px] text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-red-500/40"
                        placeholder="Session name"/>
                    ) : (
                      <span className="truncate text-[12px] font-medium text-white/80 flex items-center gap-2">{s.name}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                    {editingId === s.id ? (
                      <>
                        <button onMouseDown={e=>{e.preventDefault(); commitEdit();}} className="p-1 rounded-md bg-green-500/60 hover:bg-green-500 text-white"><Check className="h-3 w-3"/></button>
                        <button onMouseDown={e=>{e.preventDefault(); cancelEdit();}} className="p-1 rounded-md bg-zinc-600/60 hover:bg-zinc-600 text-white"><X className="h-3 w-3"/></button>
                      </>
                    ) : (
                      <>
                        <button onClick={()=>startEdit(s)} className="p-1 rounded-md bg-white/10 hover:bg-white/20 text-white/80 hover:text-white"><Pencil className="h-3 w-3"/></button>
                        {confirmingId === s.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              disabled={deletingId === s.id}
                              onMouseDown={e=>{e.preventDefault(); void confirmDelete(s.id);}}
                              className="px-2 py-1 rounded-md bg-red-600 hover:bg-red-700 text-white text-[11px]"
                            >
                              {deletingId === s.id ? 'Deleting…' : 'Confirm'}
                            </button>
                            <button
                              onMouseDown={e=>{e.preventDefault(); cancelDelete();}}
                              className="px-2 py-1 rounded-md bg-zinc-700 hover:bg-zinc-600 text-white text-[11px]"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button onClick={()=>requestDelete(s.id)} className="p-1 rounded-md bg-red-600/70 hover:bg-red-600 text-white"><Trash2 className="h-3 w-3"/></button>
                        )}
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-white/40 tracking-wide">Last edit: {formatTime(s.lastEdited)}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </motion.aside>
    )}
  </AnimatePresence>
  );
};
