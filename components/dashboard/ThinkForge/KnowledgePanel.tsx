"use client";

import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Brain,
  X,
  Loader2,
  Save,
  Sparkles,
  Upload,
  Fingerprint,
  Trash2,
  Pin,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";

/* ─── Types ─── */

interface VoiceFingerprint {
  avgWordsPerSentence: number;
  sentenceLengthVariance: number;
  passiveVoiceRatio: number;
  questionFrequency: number;
  openingPattern: string;
  transitionStyle: string;
  closingPattern: string;
  listStyle: string;
  extractedFromCount: number;
}

interface VoiceExemplar {
  id: string;
  text: string;
  signalProfile: Record<string, number>;
  contentType: string;
  pinned: boolean;
  weight: number;
}

interface BrandDNA {
  voiceLock?: string;
  nicheMap?: string;
  killList?: string[];
  hookArchetypes?: string[];
  structuralHabits?: string[];
  recurringAssets?: string[];
  voiceFingerprint?: VoiceFingerprint;
  voiceExemplars?: VoiceExemplar[];
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
      <label className="text-[11px] font-semibold text-[#B5B2A8] uppercase tracking-wider">
        {label}
      </label>
      {description && (
        <p className="text-[11px] text-[#5F5E5A] leading-relaxed">{description}</p>
      )}
      <textarea
        className="w-full rounded-xl bg-white/[0.03] border border-white/[0.08] px-4 py-3 text-sm text-[#ECE9E1] placeholder:text-[#454340] focus:outline-none focus:ring-1 focus:ring-[#D4A652]/40 focus:border-[#D4A652]/30 resize-none transition-all"
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
      <label className="text-[11px] font-semibold text-[#B5B2A8] uppercase tracking-wider">
        {label}
      </label>
      {description && (
        <p className="text-[11px] text-[#5F5E5A] leading-relaxed">{description}</p>
      )}
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {items.map((item) => (
            <Badge
              key={item}
              variant="secondary"
              className="text-[11px] h-6 px-2.5 bg-white/[0.05] text-[#B5B2A8] gap-1.5 cursor-pointer hover:bg-[#D4A652]/20 hover:text-[#D4A652] transition-colors rounded-lg"
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
          className="flex-1 rounded-xl bg-white/[0.03] border border-white/[0.08] px-3 py-2 text-sm text-[#ECE9E1] placeholder:text-[#454340] focus:outline-none focus:ring-1 focus:ring-[#D4A652]/40 transition-all"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
          placeholder="Type and press Enter"
        />
      </div>
    </div>
  );
}

function VoiceFingerprintSection({
  fingerprint,
  onExtracted,
  sessionId,
}: {
  fingerprint?: VoiceFingerprint;
  onExtracted: (fp: VoiceFingerprint) => void;
  sessionId?: string | null;
}) {
  const [refTexts, setRefTexts] = useState("");
  const [extracting, setExtracting] = useState(false);

  const extract = async () => {
    const pieces = refTexts.split(/\n{2,}/).map(t => t.trim()).filter(t => t.length > 20);
    if (pieces.length < 5) {
      toast({ title: "Need at least 5 reference pieces", description: "Separate each piece with a blank line.", variant: "destructive" });
      return;
    }
    setExtracting(true);
    try {
      const res = await fetch("/api/services/thinkforge/brand-dna/extract-fingerprint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          referenceTexts: pieces,
          ...(sessionId ? { sessionId } : {}),
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      onExtracted(data.voiceFingerprint);
      toast({ title: `Voice fingerprint extracted from ${pieces.length} samples` });
      setRefTexts("");
    } catch {
      toast({ title: "Extraction failed", variant: "destructive" });
    } finally {
      setExtracting(false);
    }
  };

  return (
    <div className="space-y-2 pt-3 border-t border-white/[0.06]">
      <div className="flex items-center gap-2">
        <Fingerprint size={13} className="text-[#D4A652]" />
        <label className="text-[11px] font-semibold text-[#B5B2A8] uppercase tracking-wider">Voice Fingerprint</label>
      </div>
      <p className="text-[11px] text-[#5F5E5A] leading-relaxed">
        Paste 5+ samples of your writing (separate with blank lines). We extract your rhythm, sentence patterns, and style automatically.
      </p>

      {fingerprint && (
        <div className="rounded-xl bg-white/[0.03] border border-white/[0.08] p-3 space-y-1 text-[11px] text-[#B5B2A8]">
          <div className="flex justify-between"><span>Avg sentence</span><span className="text-[#ECE9E1]">{fingerprint.avgWordsPerSentence} words</span></div>
          <div className="flex justify-between"><span>Rhythm variance</span><span className="text-[#ECE9E1]">{fingerprint.sentenceLengthVariance}</span></div>
          <div className="flex justify-between"><span>Passive voice</span><span className="text-[#ECE9E1]">{Math.round(fingerprint.passiveVoiceRatio * 100)}%</span></div>
          <div className="flex justify-between"><span>Questions</span><span className="text-[#ECE9E1]">{fingerprint.questionFrequency}/100 sentences</span></div>
          <div className="flex justify-between"><span>Opens with</span><span className="text-[#ECE9E1]">{fingerprint.openingPattern}</span></div>
          <div className="flex justify-between"><span>Transitions</span><span className="text-[#ECE9E1]">{fingerprint.transitionStyle}</span></div>
          <div className="flex justify-between"><span>Closes with</span><span className="text-[#ECE9E1]">{fingerprint.closingPattern}</span></div>
          <div className="pt-1 text-[10px] text-[#5F5E5A]">Extracted from {fingerprint.extractedFromCount} samples</div>
        </div>
      )}

      <textarea
        className="w-full rounded-xl bg-white/[0.03] border border-white/[0.08] px-4 py-3 text-sm text-[#ECE9E1] placeholder:text-[#454340] focus:outline-none focus:ring-1 focus:ring-[#D4A652]/40 resize-none transition-all"
        rows={4}
        value={refTexts}
        onChange={(e) => setRefTexts(e.target.value)}
        placeholder={"Paste your writing samples here.\n\nSeparate each piece with a blank line.\n\nMinimum 5 pieces for meaningful extraction."}
      />
      <button
        onClick={extract}
        disabled={extracting}
        className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-white/[0.04] text-[#B5B2A8] border border-white/[0.08] hover:bg-[#D4A652]/10 hover:text-[#D4A652] hover:border-[#D4A652]/20 transition-all text-[12px] font-medium"
      >
        {extracting ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
        {fingerprint ? "Re-extract Fingerprint" : "Extract Voice Fingerprint"}
      </button>
    </div>
  );
}

function VoiceExemplarSection({
  exemplars,
  onChange,
}: {
  exemplars: VoiceExemplar[];
  onChange: (exs: VoiceExemplar[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const [contentType, setContentType] = useState("linkedin_post");

  const add = () => {
    const text = draft.trim();
    if (!text || text.length < 20) {
      toast({ title: "Exemplar too short", description: "Paste a meaningful reference piece (20+ characters).", variant: "destructive" });
      return;
    }
    if (exemplars.length >= 10) {
      toast({ title: "Maximum 10 exemplars", variant: "destructive" });
      return;
    }
    onChange([
      ...exemplars,
      { id: crypto.randomUUID(), text: text.slice(0, 2000), signalProfile: {}, contentType, pinned: false, weight: 1.0 },
    ]);
    setDraft("");
  };

  const remove = (id: string) => onChange(exemplars.filter(e => e.id !== id));
  const togglePin = (id: string) => onChange(exemplars.map(e => e.id === id ? { ...e, pinned: !e.pinned } : e));

  if (exemplars.length === 0 && !draft) {
    return (
      <div className="space-y-2 pt-3 border-t border-white/[0.06]">
        <div className="flex items-center gap-2">
          <Pin size={13} className="text-[#D4A652]" />
          <label className="text-[11px] font-semibold text-[#B5B2A8] uppercase tracking-wider">Voice Exemplars</label>
        </div>
        <p className="text-[11px] text-[#5F5E5A] leading-relaxed">
          Pin reference pieces the AI should mimic. These get injected as style examples when generating similar content.
        </p>
        <button
          onClick={() => setDraft(" ")}
          className="w-full py-2 rounded-xl border border-dashed border-white/[0.1] text-[11px] text-[#5F5E5A] hover:border-[#D4A652]/30 hover:text-[#D4A652] transition-all"
        >
          + Add first exemplar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2 pt-3 border-t border-white/[0.06]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Pin size={13} className="text-[#D4A652]" />
          <label className="text-[11px] font-semibold text-[#B5B2A8] uppercase tracking-wider">Voice Exemplars</label>
        </div>
        <span className="text-[10px] text-[#5F5E5A]">{exemplars.length}/10</span>
      </div>

      {exemplars.map((ex) => (
        <div key={ex.id} className="rounded-xl bg-white/[0.03] border border-white/[0.08] p-3 space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[11px] text-[#B5B2A8] leading-relaxed line-clamp-3">{ex.text}</p>
            <div className="flex gap-1 shrink-0">
              <button onClick={() => togglePin(ex.id)} className={`p-1 rounded transition-colors ${ex.pinned ? "text-[#D4A652]" : "text-[#5F5E5A] hover:text-[#B5B2A8]"}`}>
                <Pin size={11} />
              </button>
              <button onClick={() => remove(ex.id)} className="p-1 rounded text-[#5F5E5A] hover:text-red-400 transition-colors">
                <Trash2 size={11} />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-[10px] h-5 px-2 bg-white/[0.05] text-[#7A776E] rounded-md">{ex.contentType}</Badge>
            {ex.pinned && <Badge variant="secondary" className="text-[10px] h-5 px-2 bg-[#D4A652]/10 text-[#D4A652] rounded-md">Pinned</Badge>}
          </div>
        </div>
      ))}

      <textarea
        className="w-full rounded-xl bg-white/[0.03] border border-white/[0.08] px-4 py-3 text-sm text-[#ECE9E1] placeholder:text-[#454340] focus:outline-none focus:ring-1 focus:ring-[#D4A652]/40 resize-none transition-all"
        rows={3}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Paste a reference piece the AI should mimic..."
      />
      <div className="flex gap-2">
        <select
          value={contentType}
          onChange={(e) => setContentType(e.target.value)}
          className="rounded-xl bg-white/[0.03] border border-white/[0.08] px-3 py-2 text-[11px] text-[#B5B2A8] focus:outline-none focus:ring-1 focus:ring-[#D4A652]/40"
        >
          <option value="linkedin_post">LinkedIn Post</option>
          <option value="twitter">Tweet</option>
          <option value="instagram">Instagram</option>
          <option value="video_script">Video Script</option>
          <option value="blog_post">Blog Post</option>
          <option value="newsletter">Newsletter</option>
        </select>
        <button
          onClick={add}
          disabled={!draft.trim()}
          className="flex-1 py-2 rounded-xl bg-white/[0.04] text-[#B5B2A8] border border-white/[0.08] hover:bg-[#D4A652]/10 hover:text-[#D4A652] hover:border-[#D4A652]/20 transition-all text-[12px] font-medium disabled:opacity-40"
        >
          Add Exemplar
        </button>
      </div>
    </div>
  );
}

function BrandDNAEditor({ sessionId }: { sessionId?: string | null }) {
  const [dna, setDna] = useState<BrandDNA>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    setDna({});
    setLoading(true);
    (async () => {
      try {
        const endpoint = sessionId
          ? `/api/services/thinkforge/brand-dna?sessionId=${encodeURIComponent(sessionId)}`
          : "/api/services/thinkforge/brand-dna";
        const res = await fetch(endpoint);
        if (!res.ok) throw new Error("Voice memory could not be loaded.");
        const data = await res.json();
        if (active) setDna(data.brandDNA ?? {});
      } catch {
        if (active) toast({ title: "Failed to load voice memory", variant: "destructive" });
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [sessionId]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/services/thinkforge/brand-dna", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...dna,
          ...(sessionId ? { sessionId } : {}),
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      toast({ title: data.pendingBrandDNA ? "Voice update sent for Brand Vault review" : "Voice memory saved" });
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-[#5F5E5A]">
        <Loader2 size={18} className="animate-spin mr-2" />
        Loading your brand profile...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Intro */}
      <div className="rounded-xl bg-gradient-to-br from-[#D4A652]/[0.08] to-transparent border border-[#D4A652]/[0.12] px-4 py-3">
        <div className="flex items-center gap-2 mb-1.5">
          <Sparkles size={14} className="text-[#D4A652]" />
          <span className="text-[11px] font-semibold text-[#D4A652]">How it works</span>
        </div>
        <p className="text-[11px] text-[#7A776E] leading-relaxed">
          Tune ThinkForge's writing voice below. These preferences sync as brand evidence without replacing the platform Brand Vault.
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

      {/* ─── Voice Fingerprint (Layer 2) ─── */}
      <VoiceFingerprintSection
        fingerprint={dna.voiceFingerprint}
        onExtracted={(fp) => setDna({ ...dna, voiceFingerprint: fp })}
        sessionId={sessionId}
      />

      {/* ─── Voice Exemplars (Layer 3) ─── */}
      <VoiceExemplarSection
        exemplars={dna.voiceExemplars ?? []}
        onChange={(exs) => setDna({ ...dna, voiceExemplars: exs })}
      />

      <button
        onClick={save}
        disabled={saving}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#D4A652]/20 text-[#D4A652] border border-[#D4A652]/20 hover:bg-[#D4A652]/30 transition-all text-sm font-medium"
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
  sessionId,
}: KnowledgePanelProps) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-[#0B0B0A] backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-[#0B0B0A] border-l border-[#1C1B19] flex flex-col shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08]">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-[#D4A652]/10">
                  <Brain size={16} className="text-[#D4A652]" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-[#ECE9E1]">Voice Memory</h2>
                  <p className="text-[11px] text-[#5F5E5A]">ThinkForge writing voice and examples</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-[#1C1B19] transition-colors text-[#7A776E] hover:text-[#ECE9E1]"
              >
                <X size={16} />
              </button>
            </div>

            {/* Content */}
            <ScrollArea className="flex-1">
              <div className="p-5">
                <BrandDNAEditor sessionId={sessionId} />
              </div>
            </ScrollArea>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
