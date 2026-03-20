"use client";

import React, { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Brain,
  X,
  Loader2,
  Save,
  Sparkles,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";

/* ─── Types ─── */

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

/* ─── Brand DNA Editor ─── */

function DNAField({
  label,
  value,
  onChange,
  placeholder,
  description,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  description?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider">
        {label}
      </label>
      {description && (
        <p className="text-[11px] text-zinc-500 leading-relaxed">{description}</p>
      )}
      <textarea
        className="w-full rounded-xl bg-white/[0.03] border border-white/[0.08] px-4 py-3 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-red-500/40 focus:border-red-500/30 resize-none transition-all"
        rows={3}
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
  description,
}: {
  label: string;
  items: string[];
  onChange: (v: string[]) => void;
  description?: string;
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
    <div className="space-y-1.5">
      <label className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider">
        {label}
      </label>
      {description && (
        <p className="text-[11px] text-zinc-500 leading-relaxed">{description}</p>
      )}
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {items.map((item) => (
            <Badge
              key={item}
              variant="secondary"
              className="text-[11px] h-6 px-2.5 bg-white/[0.05] text-zinc-300 gap-1.5 cursor-pointer hover:bg-red-500/20 hover:text-red-300 transition-colors rounded-lg"
              onClick={() => onChange(items.filter((i) => i !== item))}
            >
              {item}
              <X size={10} />
            </Badge>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          className="flex-1 rounded-xl bg-white/[0.03] border border-white/[0.08] px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-red-500/40 transition-all"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
          placeholder="Type and press Enter"
        />
      </div>
    </div>
  );
}

function BrandDNAEditor() {
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
      toast({ title: "Brand Vault saved" });
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-zinc-500">
        <Loader2 size={18} className="animate-spin mr-2" />
        Loading your brand profile...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Intro */}
      <div className="rounded-xl bg-gradient-to-br from-red-500/[0.08] to-transparent border border-red-500/[0.12] px-4 py-3">
        <div className="flex items-center gap-2 mb-1.5">
          <Sparkles size={14} className="text-red-400" />
          <span className="text-xs font-semibold text-red-300">How it works</span>
        </div>
        <p className="text-[12px] text-zinc-400 leading-relaxed">
          Fill in your brand identity below. The AI will use this to match your voice, avoid things you hate, and generate content that sounds like <em>you</em>.
        </p>
      </div>

      <DNAField
        label="Voice & Tone"
        description="How should your content sound? Think personality, not formality."
        placeholder="e.g. High-energy tech nerd who explains complex things simply. Never corporate or stuffy."
        value={dna.voiceLock ?? ""}
        onChange={(v) => setDna({ ...dna, voiceLock: v })}
      />
      <DNAField
        label="Audience / Niche"
        description="Who are you making content for? Be specific."
        placeholder="e.g. College students (18-24) interested in side hustles and personal finance"
        value={dna.nicheMap ?? ""}
        onChange={(v) => setDna({ ...dna, nicheMap: v })}
      />
      <DNAArrayField
        label="Kill List"
        description="Words, phrases, or topics the AI should NEVER use in your content."
        items={dna.killList ?? []}
        onChange={(v) => setDna({ ...dna, killList: v })}
      />
      <DNAArrayField
        label="Hook Styles"
        description="Your go-to hook formats that work for your audience."
        items={dna.hookArchetypes ?? []}
        onChange={(v) => setDna({ ...dna, hookArchetypes: v })}
      />
      <DNAArrayField
        label="Content Patterns"
        description="Structural habits you always follow (e.g. always end with a question)."
        items={dna.structuralHabits ?? []}
        onChange={(v) => setDna({ ...dna, structuralHabits: v })}
      />

      <button
        onClick={save}
        disabled={saving}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-600/20 text-red-300 border border-red-500/20 hover:bg-red-600/30 transition-all text-sm font-medium"
      >
        {saving ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <Save size={14} />
        )}
        Save Brand Profile
      </button>
    </div>
  );
}

/* ─── Main Panel ─── */

export function KnowledgePanel({
  open,
  onClose,
}: KnowledgePanelProps) {
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
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08]">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-red-500/10">
                  <Brain size={16} className="text-red-400" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-white">Brand Vault</h2>
                  <p className="text-[11px] text-zinc-500">Your brand identity & preferences</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-zinc-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            {/* Content */}
            <ScrollArea className="flex-1">
              <div className="p-5">
                <BrandDNAEditor />
              </div>
            </ScrollArea>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
