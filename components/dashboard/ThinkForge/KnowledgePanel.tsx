"use client";

import React, { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Brain,
  Trash2,
  ExternalLink,
  X,
  Loader2,
  ChevronDown,
  ChevronRight,
  Sparkles,
  FileText,
  Link2,
  Tag,
  Save,
  Globe,
  FolderOpen,
  ArrowUpRight,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";

/* ─── Types ─── */

interface DataBankEntry {
  _id: string;
  type: string;
  scope?: "project" | "global";
  title: string;
  content: any;
  sourceUrl?: string;
  tags?: string[];
  createdAt: string;
}

interface BrandDNA {
  voiceLock?: string;
  nicheMap?: string;
  killList?: string[];
  hookArchetypes?: string[];
  structuralHabits?: string[];
  recurringAssets?: string[];
}

interface KnowledgePanelProps {
  open: boolean;
  onClose: () => void;
  sessionId?: string | null;
}

/* ─── Helpers ─── */

const TYPE_LABELS: Record<string, { label: string; icon: typeof Brain }> = {
  url_brief: { label: "URL Brief", icon: Link2 },
  atomic_fact: { label: "Fact", icon: Sparkles },
  note: { label: "Note", icon: FileText },
  reference: { label: "Reference", icon: FileText },
  research: { label: "Research", icon: FileText },
  brand_insight: { label: "Brand Insight", icon: Brain },
  rejection_pattern: { label: "Pattern", icon: Tag },
};

function typeInfo(type: string) {
  return TYPE_LABELS[type] ?? { label: type, icon: FileText };
}

function summarize(content: any): string {
  if (typeof content === "string") return content.slice(0, 200);
  if (content?.claim) return String(content.claim).slice(0, 200);
  if (content?.summary) return String(content.summary).slice(0, 200);
  if (content?.text) return String(content.text).slice(0, 200);
  return "";
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ─── Sub-component: single expandable entry ─── */

function EntryRow({
  entry,
  onDelete,
  onPromote,
}: {
  entry: DataBankEntry;
  onDelete: (id: string) => void;
  onPromote?: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const info = typeInfo(entry.type);
  const Icon = info.icon;

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/services/thinkforge/databank?id=${encodeURIComponent(entry._id)}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error();
      onDelete(entry._id);
    } catch {
      toast({ title: "Failed to delete", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const handlePromote = async () => {
    if (!onPromote) return;
    setPromoting(true);
    try {
      const res = await fetch("/api/services/thinkforge/databank", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: entry._id, action: "promote" }),
      });
      if (!res.ok) throw new Error();
      onPromote(entry._id);
      toast({ title: "Promoted to Global Vault" });
    } catch {
      toast({ title: "Failed to promote", variant: "destructive" });
    } finally {
      setPromoting(false);
    }
  };

  return (
    <div className="border border-white/5 rounded-xl bg-white/2 hover:bg-white/4 transition-colors">
      <button
        className="w-full flex items-start gap-3 px-3 py-2.5 text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <Icon size={14} className="text-red-400 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-zinc-200 truncate">
            {entry.title}
          </p>
          {!expanded && (
            <p className="text-[11px] text-zinc-500 truncate mt-0.5">
              {summarize(entry.content)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Badge
            variant="outline"
            className="text-[10px] h-5 px-1.5 border-white/10 text-zinc-400"
          >
            {info.label}
          </Badge>
          {expanded ? (
            <ChevronDown size={12} className="text-zinc-500" />
          ) : (
            <ChevronRight size={12} className="text-zinc-500" />
          )}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-2 border-t border-white/5 pt-2">
              <p className="text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed">
                {summarize(entry.content)}
              </p>
              {entry.tags && entry.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {entry.tags.map((t) => (
                    <Badge
                      key={t}
                      variant="secondary"
                      className="text-[10px] h-4 px-1.5 bg-white/5 text-zinc-400"
                    >
                      {t}
                    </Badge>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between text-[10px] text-zinc-500 pt-1">
                <span>{formatDate(entry.createdAt)}</span>
                <div className="flex items-center gap-2">
                  {entry.sourceUrl && (
                    <a
                      href={entry.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-red-400 hover:text-red-300"
                    >
                      <ExternalLink size={10} /> Source
                    </a>
                  )}
                  {onPromote && entry.scope === "project" && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePromote();
                      }}
                      disabled={promoting}
                      className="flex items-center gap-1 text-zinc-500 hover:text-emerald-400 transition-colors"
                    >
                      {promoting ? (
                        <Loader2 size={10} className="animate-spin" />
                      ) : (
                        <ArrowUpRight size={10} />
                      )}
                      Make Global
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete();
                    }}
                    disabled={deleting}
                    className="flex items-center gap-1 text-zinc-500 hover:text-red-400 transition-colors"
                  >
                    {deleting ? (
                      <Loader2 size={10} className="animate-spin" />
                    ) : (
                      <Trash2 size={10} />
                    )}
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Sub-component: BrandDNA editor ─── */

function BrandDNASection() {
  const [dna, setDna] = useState<BrandDNA>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/services/thinkforge/brand-dna");
        if (res.ok) {
          const data = await res.json();
          setDna(data.brandDNA ?? {});
        }
      } catch {
        /* silent */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/services/thinkforge/brand-dna", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dna),
      });
      if (!res.ok) throw new Error();
      toast({ title: "Brand DNA saved" });
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-zinc-500">
        <Loader2 size={16} className="animate-spin mr-2" />
        Loading...
      </div>
    );
  }

  return (
    <div className="space-y-3 px-1">
      <DNAField
        label="Voice Lock"
        placeholder="e.g. High-energy tech-nerd, no corporate jargon"
        value={dna.voiceLock ?? ""}
        onChange={(v) => setDna({ ...dna, voiceLock: v })}
      />
      <DNAField
        label="Audience / Niche"
        placeholder="e.g. ECE students who care about placements"
        value={dna.nicheMap ?? ""}
        onChange={(v) => setDna({ ...dna, nicheMap: v })}
      />
      <DNAArrayField
        label="Kill List (never mention)"
        items={dna.killList ?? []}
        onChange={(v) => setDna({ ...dna, killList: v })}
      />
      <DNAArrayField
        label="Hook Archetypes"
        items={dna.hookArchetypes ?? []}
        onChange={(v) => setDna({ ...dna, hookArchetypes: v })}
      />
      <DNAArrayField
        label="Structural Habits"
        items={dna.structuralHabits ?? []}
        onChange={(v) => setDna({ ...dna, structuralHabits: v })}
      />

      <button
        onClick={save}
        disabled={saving}
        className="w-full mt-2 flex items-center justify-center gap-2 py-2 rounded-lg bg-red-600/20 text-red-300 border border-red-500/20 hover:bg-red-600/30 transition-colors text-xs font-medium"
      >
        {saving ? (
          <Loader2 size={12} className="animate-spin" />
        ) : (
          <Save size={12} />
        )}
        Save Brand DNA
      </button>
    </div>
  );
}

function DNAField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
        {label}
      </label>
      <textarea
        className="mt-1 w-full rounded-lg bg-white/3 border border-white/10 px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-red-500/30 resize-none"
        rows={2}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function DNAArrayField({
  label,
  items,
  onChange,
}: {
  label: string;
  items: string[];
  onChange: (v: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  const add = () => {
    const trimmed = draft.trim();
    if (trimmed && !items.includes(trimmed)) {
      onChange([...items, trimmed]);
      setDraft("");
    }
  };

  return (
    <div>
      <label className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
        {label}
      </label>
      <div className="flex flex-wrap gap-1 mt-1">
        {items.map((item) => (
          <Badge
            key={item}
            variant="secondary"
            className="text-[10px] h-5 px-2 bg-white/5 text-zinc-300 gap-1 cursor-pointer hover:bg-red-500/20 hover:text-red-300 transition-colors"
            onClick={() => onChange(items.filter((i) => i !== item))}
          >
            {item}
            <X size={8} />
          </Badge>
        ))}
      </div>
      <div className="flex gap-1 mt-1">
        <input
          className="flex-1 rounded-lg bg-white/3 border border-white/10 px-2 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-red-500/30"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
          placeholder="Type and press Enter"
        />
      </div>
    </div>
  );
}

/* ─── Knowledge entries list with type filter ─── */

function KnowledgeList({
  entries,
  loading,
  typeFilter,
  setTypeFilter,
  onDelete,
  onPromote,
  emptyIcon: EmptyIcon,
  emptyTitle,
  emptyDescription,
}: {
  entries: DataBankEntry[];
  loading: boolean;
  typeFilter: string | null;
  setTypeFilter: (v: string | null) => void;
  onDelete: (id: string) => void;
  onPromote?: (id: string) => void;
  emptyIcon: typeof Brain;
  emptyTitle: string;
  emptyDescription: string;
}) {
  const types = [
    { value: null, label: "All" },
    { value: "url_brief", label: "Briefs" },
    { value: "atomic_fact", label: "Facts" },
    { value: "note", label: "Notes" },
    { value: "research", label: "Research" },
    { value: "brand_insight", label: "Insights" },
  ];

  return (
    <>
      <div className="flex flex-wrap gap-1 mb-3">
        {types.map((t) => (
          <button
            key={t.value ?? "all"}
            onClick={() => setTypeFilter(t.value)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
              typeFilter === t.value
                ? "bg-red-600/20 text-red-300 ring-1 ring-red-500/30"
                : "bg-white/5 text-zinc-400 hover:bg-white/10"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-zinc-500">
          <Loader2 size={16} className="animate-spin mr-2" />
          Loading entries...
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-12 text-zinc-500">
          <EmptyIcon size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">{emptyTitle}</p>
          <p className="text-xs mt-1">{emptyDescription}</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {entries.map((entry) => (
            <EntryRow
              key={entry._id}
              entry={entry}
              onDelete={onDelete}
              onPromote={onPromote}
            />
          ))}
        </div>
      )}
    </>
  );
}

/* ─── Main Panel ─── */

type Tab = "project" | "global" | "brand";

export function KnowledgePanel({
  open,
  onClose,
  sessionId,
}: KnowledgePanelProps) {
  const [tab, setTab] = useState<Tab>("project");
  const [projectEntries, setProjectEntries] = useState<DataBankEntry[]>([]);
  const [globalEntries, setGlobalEntries] = useState<DataBankEntry[]>([]);
  const [loadingProject, setLoadingProject] = useState(false);
  const [loadingGlobal, setLoadingGlobal] = useState(false);
  const [projectTypeFilter, setProjectTypeFilter] = useState<string | null>(null);
  const [globalTypeFilter, setGlobalTypeFilter] = useState<string | null>(null);

  const fetchProjectEntries = useCallback(async () => {
    if (!sessionId) return;
    setLoadingProject(true);
    try {
      const params = new URLSearchParams({ dataScope: "project", sessionId, limit: "100" });
      if (projectTypeFilter) params.set("type", projectTypeFilter);
      const res = await fetch(`/api/services/thinkforge/databank?${params}`);
      if (res.ok) {
        const data = await res.json();
        setProjectEntries(data.entries ?? []);
      } else {
        console.error("[KnowledgePanel] Project fetch failed:", res.status, await res.text().catch(() => ""));
      }
    } catch (err) {
      console.error("[KnowledgePanel] Project fetch error:", err);
    } finally {
      setLoadingProject(false);
    }
  }, [sessionId, projectTypeFilter]);

  const fetchGlobalEntries = useCallback(async () => {
    setLoadingGlobal(true);
    try {
      const params = new URLSearchParams({ dataScope: "global", limit: "100" });
      if (globalTypeFilter) params.set("type", globalTypeFilter);
      const res = await fetch(`/api/services/thinkforge/databank?${params}`);
      if (res.ok) {
        const data = await res.json();
        setGlobalEntries(data.entries ?? []);
      } else {
        console.error("[KnowledgePanel] Global fetch failed:", res.status, await res.text().catch(() => ""));
      }
    } catch (err) {
      console.error("[KnowledgePanel] Global fetch error:", err);
    } finally {
      setLoadingGlobal(false);
    }
  }, [globalTypeFilter]);

  useEffect(() => {
    if (open) {
      fetchProjectEntries();
      fetchGlobalEntries();
    }
  }, [open, fetchProjectEntries, fetchGlobalEntries]);

  useEffect(() => {
    if (open && tab === "project") fetchProjectEntries();
  }, [open, tab, fetchProjectEntries]);

  useEffect(() => {
    if (open && tab === "global") fetchGlobalEntries();
  }, [open, tab, fetchGlobalEntries]);

  const handleProjectDelete = (id: string) =>
    setProjectEntries((prev) => prev.filter((e) => e._id !== id));

  const handleGlobalDelete = (id: string) =>
    setGlobalEntries((prev) => prev.filter((e) => e._id !== id));

  const handlePromote = (id: string) => {
    setProjectEntries((prev) => prev.filter((e) => e._id !== id));
    if (tab === "global" || open) fetchGlobalEntries();
  };

  const totalCount = projectEntries.length + globalEntries.length;

  const tabs: { key: Tab; label: string; icon: typeof Brain }[] = [
    { key: "project", label: "Current Project", icon: FolderOpen },
    { key: "global", label: "Global Vault", icon: Globe },
    { key: "brand", label: "Brand DNA", icon: Brain },
  ];

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-neutral-950 border-l border-white/10 flex flex-col shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Brain size={16} className="text-red-400" />
                <h2 className="text-sm font-semibold text-white">
                  Knowledge Bank
                </h2>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-zinc-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            {/* Tab switcher — 3 tabs */}
            <div className="flex border-b border-white/10">
              {tabs.map(({ key, label, icon: TabIcon }) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`flex-1 py-2.5 text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${
                    tab === key
                      ? "text-red-400 border-b-2 border-red-500"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  <TabIcon size={12} />
                  {label}
                </button>
              ))}
            </div>

            {/* Content */}
            <ScrollArea className="flex-1">
              <div className="p-4">
                {tab === "project" ? (
                  <KnowledgeList
                    entries={projectEntries}
                    loading={loadingProject}
                    typeFilter={projectTypeFilter}
                    setTypeFilter={setProjectTypeFilter}
                    onDelete={handleProjectDelete}
                    onPromote={handlePromote}
                    emptyIcon={FolderOpen}
                    emptyTitle="No project knowledge yet"
                    emptyDescription="Paste URLs in chat or add notes to populate this project's research bank."
                  />
                ) : tab === "global" ? (
                  <KnowledgeList
                    entries={globalEntries}
                    loading={loadingGlobal}
                    typeFilter={globalTypeFilter}
                    setTypeFilter={setGlobalTypeFilter}
                    onDelete={handleGlobalDelete}
                    emptyIcon={Globe}
                    emptyTitle="Global vault is empty"
                    emptyDescription="Promote facts from projects or let the AI learn your patterns over time."
                  />
                ) : (
                  <BrandDNASection />
                )}
              </div>
            </ScrollArea>

            {/* Footer */}
            <div className="px-4 py-2 border-t border-white/10 text-[10px] text-zinc-600 text-center">
              {totalCount} item{totalCount !== 1 ? "s" : ""} in your
              knowledge bank
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
