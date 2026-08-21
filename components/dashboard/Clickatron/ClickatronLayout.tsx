"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Plus, Loader2, Image, Clock, MoreHorizontal, Pencil, Trash2, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import useClickatronStore from "@/stores/useCanvasStore";
import { CreditsCard } from "@/components/shared/CreditsCard";
import { BillingPaymentModal } from "@/components/shared/BillingPaymentModal";
import { CreditCostBadge } from "@/components/shared/CreditCostBadge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";

// ─── Design tokens ─────────────────────────────────────────────
// Values point at design-tokens.css variables (P2.7) so a theme change propagates; keep any NEW key a var(--…) too.
const C = {
  bg: "var(--bg-canvas)", raised: "var(--bg-raised)", deeper: "var(--bg-deeper)", well: "var(--bg-well)",
  border: "var(--border-subtle)", borderL: "var(--border-emphasis)",
  t1: "var(--text-primary)", t2: "var(--text-secondary)", t3: "var(--text-muted)", t4: "var(--text-dim)", t5: "var(--text-faint)",
  gold: "var(--accent-gold)", goldH: "var(--accent-gold-hover)", goldBg: "rgba(212,166,82,.08)", goldBd: "rgba(212,166,82,.16)",
  green: "var(--status-success)", red: "var(--status-danger)",
} as const;
const EASE = "cubic-bezier(.16,1,.3,1)";

interface HistoryItem {
  sessionId: string;
  title: string;
  updatedAt: string;
  variationsCount: number;
  createdByName?: string;
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "Just now";
}

export function ClickatronLayout() {
  const router = useRouter();
  const { toast } = useToast();
  const createSession = useClickatronStore((state) => state.createSession);

  const [showTopup, setShowTopup] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const pageSize = 12;

  // ─── Fetch sessions ──────────────────────────────────────────
  const fetchHistory = useCallback(async (page: number) => {
    setLoadingHistory(true);
    try {
      const offset = (page - 1) * pageSize;
      const res = await fetch(`/api/services/clickatron/history?limit=${pageSize}&offset=${offset}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setHistory(data.history || []);
      setTotal(data.total || 0);
      setTotalPages(Math.ceil((data.total || 0) / pageSize));
    } catch {
      setHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => { fetchHistory(currentPage); }, [currentPage, fetchHistory]);

  // ─── Create new project ──────────────────────────────────────
  const handleCreate = async () => {
    setIsCreating(true);
    try {
      const formData = new FormData();
      const result = await createSession(formData);
      if (result?.sessionId) {
        router.push(`/dashboard/clickatron/lab/${result.sessionId}`);
      } else {
        throw new Error("Session ID not returned");
      }
    } catch {
      toast({ title: "Failed to start", description: "Could not create a session.", variant: "destructive" });
      setIsCreating(false);
    }
  };

  // ─── Rename ──────────────────────────────────────────────────
  const handleRename = async (sessionId: string) => {
    if (!editingTitle.trim()) return;
    try {
      const res = await fetch(`/api/services/clickatron/session/${sessionId}/rename`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editingTitle.trim() }),
      });
      if (!res.ok) throw new Error("Rename failed");
      const data = await res.json();
      setHistory(prev => prev.map(h => h.sessionId === sessionId ? { ...h, title: data.session.title } : h));
      setEditingId(null);
    } catch {
      toast({ title: "Rename failed", variant: "destructive" });
    }
  };

  // ─── Delete ──────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      const res = await fetch(`/api/services/clickatron/session/${deletingId}/delete`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      setHistory(prev => prev.filter(h => h.sessionId !== deletingId));
      setTotal(prev => prev - 1);
      if (history.length === 1 && currentPage > 1) setCurrentPage(p => p - 1);
    } catch {
      toast({ title: "Delete failed", variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div style={{ fontFamily: "var(--font-sans, 'Plus Jakarta Sans', sans-serif)" }}>

      {/* ── Header: title + create button + credits ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: C.t1, letterSpacing: "-.03em", marginBottom: 4 }}>
            Thumbnail Lab
          </h1>
          <p style={{ fontSize: 13, color: C.t3 }}>
            AI-powered canvas. {total} project{total !== 1 ? "s" : ""}.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <CreditCostBadge service="clickatron" action="variation" variant="tooltip" />
          <button
            onClick={handleCreate}
            disabled={isCreating}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              background: C.gold, color: C.bg, border: "none",
              padding: "10px 20px", borderRadius: 8,
              fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
              opacity: isCreating ? 0.6 : 1,
              transition: `all .2s ${EASE}`,
            }}
          >
            {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            New Project
          </button>
        </div>
      </div>

      {/* ── Sessions grid ── */}
      {loadingHistory ? (
        <div style={{ textAlign: "center", padding: 64 }}>
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-3" style={{ color: C.gold }} />
          <span style={{ fontSize: 13, color: C.t4 }}>Loading projects...</span>
        </div>
      ) : history.length === 0 ? (
        /* Empty state — compact, tool-like */
        <div style={{
          border: `1.5px dashed ${C.borderL}`, borderRadius: 12,
          padding: "64px 32px", textAlign: "center",
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14, margin: "0 auto 20px",
            background: C.goldBg, border: `1px solid ${C.goldBd}`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Sparkles className="h-6 w-6" style={{ color: C.gold }} />
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.t1, marginBottom: 6 }}>
            Start your first project
          </div>
          <div style={{ fontSize: 13, color: C.t4, marginBottom: 24 }}>
            Create AI-powered thumbnails for YouTube, Instagram, TikTok, and more.
          </div>
          <button
            onClick={handleCreate}
            disabled={isCreating}
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              background: C.gold, color: C.bg, border: "none",
              padding: "10px 24px", borderRadius: 8,
              fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Create Project
          </button>
        </div>
      ) : (
        <>
          {/* Grid of session cards */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: 12, marginBottom: 24,
          }}>
            {/* New project card — first position */}
            <div
              onClick={handleCreate}
              style={{
                border: `1.5px dashed ${C.borderL}`, borderRadius: 10,
                padding: 20, cursor: "pointer", display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", gap: 10, minHeight: 180,
                transition: `all .3s ${EASE}`,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = C.gold; e.currentTarget.style.borderStyle = "solid"; e.currentTarget.style.background = C.goldBg; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = C.borderL; e.currentTarget.style.borderStyle = "dashed"; e.currentTarget.style.background = "transparent"; }}
            >
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: C.goldBg, border: `1px solid ${C.goldBd}`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Plus className="h-5 w-5" style={{ color: C.gold }} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 500, color: C.t3 }}>New Project</span>
            </div>

            {/* Session cards */}
            {history.map((item, i) => (
              <motion.div
                key={item.sessionId}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}
                onClick={() => router.push(`/dashboard/clickatron/lab/${item.sessionId}`)}
                style={{
                  border: `1px solid ${C.border}`, borderRadius: 10,
                  background: C.raised, cursor: "pointer", overflow: "hidden",
                  transition: `all .25s ${EASE}`,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = C.goldBd; e.currentTarget.style.transform = "translateY(-2px)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.transform = "translateY(0)"; }}
              >
                {/* Thumbnail area */}
                <div style={{
                  height: 120, background: `linear-gradient(135deg, ${C.deeper}, ${C.well})`,
                  display: "flex", alignItems: "center", justifyContent: "center", position: "relative",
                }}>
                  <Image className="h-8 w-8" style={{ color: C.t5, opacity: 0.4 }} />
                  {/* Variation count badge */}
                  {item.variationsCount > 0 && (
                    <span style={{
                      position: "absolute", top: 8, left: 8,
                      fontFamily: "var(--font-mono)", fontSize: 9, color: C.gold,
                      background: C.goldBg, border: `1px solid ${C.goldBd}`,
                      padding: "2px 6px", borderRadius: 4, letterSpacing: ".04em",
                    }}>
                      {item.variationsCount} var{item.variationsCount !== 1 ? "s" : ""}
                    </span>
                  )}
                  {/* Menu */}
                  <div style={{ position: "absolute", top: 6, right: 6 }} onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button style={{
                          width: 28, height: 28, borderRadius: 6, display: "flex",
                          alignItems: "center", justifyContent: "center",
                          background: "rgba(0,0,0,.5)", border: "none", cursor: "pointer",
                          color: C.t4, transition: "color .2s",
                        }}>
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-[#1B1A18] border-[#282724] text-[#ECE9E1]">
                        <DropdownMenuItem onClick={() => { setEditingId(item.sessionId); setEditingTitle(item.title); }} className="text-[#B5B2A8] focus:bg-[#282724] focus:text-[#ECE9E1]">
                          <Pencil className="h-3 w-3 mr-2" /> Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setDeletingId(item.sessionId)} className="text-[#D46A5C] focus:bg-[#D46A5C]/10 focus:text-[#D46A5C]">
                          <Trash2 className="h-3 w-3 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {/* Card body */}
                <div style={{ padding: "12px 14px" }}>
                  {editingId === item.sessionId ? (
                    <Input
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleRename(item.sessionId); if (e.key === "Escape") setEditingId(null); }}
                      onBlur={() => handleRename(item.sessionId)}
                      autoFocus
                      className="h-7 text-xs bg-[#131312] border-[#282724] text-[#ECE9E1]"
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <div style={{ fontSize: 13, fontWeight: 500, color: C.t1, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.title}
                    </div>
                  )}
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Clock className="h-3 w-3" style={{ color: C.t5 }} />
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: C.t5 }}>
                      {formatTimeAgo(item.updatedAt)}
                    </span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                <button
                  key={p}
                  onClick={() => setCurrentPage(p)}
                  style={{
                    width: 32, height: 32, borderRadius: 6, border: "none", cursor: "pointer",
                    fontFamily: "var(--font-mono)", fontSize: 11,
                    background: p === currentPage ? C.goldBg : "transparent",
                    color: p === currentPage ? C.gold : C.t4,
                    transition: `all .2s ${EASE}`,
                  }}
                >
                  {p}
                </button>
              ))}
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: C.t5, marginLeft: 8 }}>
                Showing {Math.min(pageSize, history.length)} of {total} sessions
              </span>
            </div>
          )}
        </>
      )}

      {/* Delete dialog */}
      <AlertDialog open={!!deletingId} onOpenChange={(open) => { if (!open) setDeletingId(null); }}>
        <AlertDialogContent className="bg-[#131312] border-[#1C1B19]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[#ECE9E1]">Delete this project?</AlertDialogTitle>
            <AlertDialogDescription className="text-[#7A776E]">
              This will permanently delete the project and all its variations. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-[#1B1A18] border-[#282724] text-[#B5B2A8] hover:bg-[#282724]">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-[#D46A5C] text-white hover:bg-[#D46A5C]/80">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <BillingPaymentModal isOpen={showTopup} onClose={() => setShowTopup(false)} />
    </div>
  );
}
