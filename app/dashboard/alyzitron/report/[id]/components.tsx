"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowLeft,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  Lock,
  Shield,
  Share2,
  Copy,
  Check,
  Globe,
  X,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
} from "lucide-react";
import Link from "next/link";
import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { AnalysisData, MetricData } from "../../../../../lib/types";
import ChatToggleButton from "@/components/dashboard/Alyzitron/chat/Chattogglebutton";
import ChatPanel from "@/components/dashboard/Alyzitron/chat/ChatPanel";
import { ExportPDFButton } from "@/components/dashboard/Alyzitron/ExportPDFButton";

// ─── palette (mirrors Alyzitron.jsx exactly) ─────────────────────────────────
const C = {
  bg: "#0B0B0A",
  s1: "#0F0F0E",
  s2: "#131312",
  border: "#1C1B19",
  borderL: "#282724",
  text: "#ECE9E1",
  soft: "#B5B2A8",
  muted: "#7A776E",
  dim: "#5F5E5A",
  faint: "#454340",
  accent: "#D4A652",
  green: "#5EC97E",
  red: "#D46A5C",
};

// ─── helpers ─────────────────────────────────────────────────────────────────

const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

const timestampToSeconds = (timestamp: string): number => {
  const parts = timestamp.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] ?? 0;
};

const TimestampText = ({
  text,
  onTimestampClick,
}: {
  text: string;
  onTimestampClick: (ts: string) => void;
}) => {
  const timestampRegex = /\[(\d{1,2}:\d{2}:\d{2}|\d{1,2}:\d{2})\]/g;
  const parts: { type: string; content: string; key: string }[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = timestampRegex.exec(text)) !== null) {
    if (match.index > lastIndex)
      parts.push({ type: "text", content: text.substring(lastIndex, match.index), key: `t-${lastIndex}` });
    parts.push({ type: "timestamp", content: match[1], key: `ts-${match.index}` });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length)
    parts.push({ type: "text", content: text.substring(lastIndex), key: `t-${lastIndex}` });

  return (
    <>
      {parts.map((p) =>
        p.type === "timestamp" ? (
          <button
            key={p.key}
            onClick={() => onTimestampClick(p.content)}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
              color: C.accent,
              padding: "0 2px",
              transition: "opacity 0.2s ease",
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.opacity = "0.7")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.opacity = "1")}
            title={`Jump to ${p.content}`}
          >
            {p.content}
          </button>
        ) : (
          <span key={p.key}>{p.content}</span>
        )
      )}
    </>
  );
};

// Score colour helper (matches boss's design: green ≥ 85, amber ≥ 70, red otherwise)
const scoreColor = (score: number, invert?: boolean) => {
  const eff = invert ? 100 - score : score;
  if (eff >= 85) return C.green;
  if (eff >= 70) return C.accent;
  return C.red;
};

// ─── Share button (logic unchanged, styled to match) ─────────────────────────

interface ShareButtonProps {
  analysisId: string;
  isPublic: boolean;
  isOwner: boolean;
  onPrivacyChange: (v: boolean) => void;
}

function ShareButton({ analysisId, isPublic, isOwner, onPrivacyChange }: ShareButtonProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/dashboard/alyzitron/report/${analysisId}`
      : `/dashboard/alyzitron/report/${analysisId}`;

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { }
  };

  const updatePrivacy = async (val: boolean) => {
    if (!isOwner) return;
    setIsUpdating(true);
    try {
      const res = await fetch(`/api/services/alyzitron/analyses/${analysisId}/privacy`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublic: val }),
      });
      if (res.ok) onPrivacyChange(val);
    } finally {
      setIsUpdating(false);
    }
  };

  if (!isOwner) return null;

  return (
    <>
      <button
        onClick={() => setShowDialog(true)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 14px",
          background: C.s1,
          border: `1px solid ${C.borderL}`,
          borderRadius: 7,
          color: C.soft,
          fontSize: 11,
          fontWeight: 500,
          cursor: "pointer",
          fontFamily: "inherit",
          transition: "border-color 0.2s ease, color 0.2s ease",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = C.faint;
          (e.currentTarget as HTMLElement).style.color = C.text;
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = C.borderL;
          (e.currentTarget as HTMLElement).style.color = C.soft;
        }}
      >
        <Share2 size={13} />
        Share
      </button>

      {showDialog && (
        <AnimatePresence>
          <motion.div
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.6)",
              backdropFilter: "blur(4px)",
              zIndex: 50,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 16,
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              style={{
                background: C.s1,
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                padding: 24,
                width: "100%",
                maxWidth: 400,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Share Analysis</span>
                <button onClick={() => setShowDialog(false)} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted }}>
                  <X size={16} />
                </button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
                {[{ val: false, Icon: Lock, label: "Private", sub: "Only you can view this" }, { val: true, Icon: Globe, label: "Public", sub: "Anyone with the link" }].map(({ val, Icon, label, sub }) => (
                  <button
                    key={label}
                    onClick={() => updatePrivacy(val)}
                    disabled={isUpdating}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "12px 14px",
                      background: isPublic === val ? C.s2 : "transparent",
                      border: `1px solid ${isPublic === val ? C.faint : C.border}`,
                      borderRadius: 8,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      textAlign: "left",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <Icon size={15} color={isPublic === val ? C.text : C.muted} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: isPublic === val ? C.text : C.muted }}>{label}</div>
                      <div style={{ fontSize: 11, color: C.dim }}>{sub}</div>
                    </div>
                  </button>
                ))}
              </div>

              <div>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 8, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.04em" }}>SHARE LINK</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    readOnly
                    value={shareUrl}
                    style={{
                      flex: 1,
                      padding: "9px 12px",
                      background: C.s2,
                      border: `1px solid ${C.border}`,
                      borderRadius: 7,
                      color: C.soft,
                      fontSize: 11,
                      fontFamily: "'JetBrains Mono', monospace",
                    }}
                  />
                  <button
                    onClick={handleCopyUrl}
                    style={{
                      padding: "9px 12px",
                      background: C.s2,
                      border: `1px solid ${C.border}`,
                      borderRadius: 7,
                      cursor: "pointer",
                      color: C.soft,
                      transition: "border-color 0.2s ease",
                    }}
                  >
                    {copied ? <Check size={13} color={C.green} /> : <Copy size={13} />}
                  </button>
                </div>
                {!isPublic && (
                  <p style={{ fontSize: 11, color: C.accent, marginTop: 6 }}>
                    ⚠ Make this public so others can view it
                  </p>
                )}
              </div>
            </motion.div>
          </motion.div>
        </AnimatePresence>
      )}
    </>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

interface AnalysisDetailsProps {
  analysisData: AnalysisData;
  videoUrl?: string;
  signedUrl?: string;
  videoTitle?: string;
  createdAt?: Date;
  analysisId?: string;
  isOwner?: boolean;
  isPublic?: boolean;
  userId?: string;
  taskId?: string;
}

export function AnalysisDetails({
  analysisData,
  videoUrl,
  signedUrl,
  videoTitle,
  createdAt,
  analysisId,
  isOwner,
  isPublic,
  userId,
  taskId,
}: AnalysisDetailsProps) {
  const [currentIsPublic, setCurrentIsPublic] = useState(isPublic || false);
  const [currentTitleIndex, setCurrentTitleIndex] = useState(0);
  const [currentDescriptionIndex, setCurrentDescriptionIndex] = useState(0);
  const [showAllTitles, setShowAllTitles] = useState(false);
  const [showAllDescriptions, setShowAllDescriptions] = useState(false);
  const [copiedItems, setCopiedItems] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [expandedDetail, setExpandedDetail] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const togglePanel = useCallback(() => setOpen((v) => !v), []);
  const closePanel = useCallback(() => setOpen(false), []);

  const handleCopy = async (text: string, id: string) => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedItems((prev) => new Set(prev).add(id));
      setTimeout(() => setCopiedItems((prev) => { const s = new Set(prev); s.delete(id); return s; }), 2000);
    }
  };

  const handleTimestampClick = (timestamp: string) => {
    if (!timestamp || timestamp === "00:00:00") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const seconds = timestampToSeconds(timestamp);
    if (isYouTubeUrl && youtubeVideoId && iframeRef.current) {
      const base = iframeRef.current.src.split("?")[0];
      iframeRef.current.src = `${base}?start=${Math.floor(seconds)}&autoplay=1`;
      iframeRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    } else if (!isYouTubeUrl && !isInstagramUrl && videoRef.current) {
      videoRef.current.currentTime = seconds;
      videoRef.current.play().catch(() => { });
      videoRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const extractYouTubeVideoId = (url: string): string | null => {
    const regexes = [
      /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
      /(?:https?:\/\/)?(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]{11})/,
      /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
      /(?:https?:\/\/)?(?:www\.)?youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
      /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    ];
    for (const r of regexes) { const m = url.match(r); if (m?.[1]) return m[1]; }
    return null;
  };

  const extractInstagramVideoId = (url: string): string | null => {
    const m = url.match(/(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:p|reel|reels)\/([a-zA-Z0-9_-]+)/);
    return m ? m[1] : null;
  };

  const isYouTubeUrl = videoUrl && (videoUrl.includes("youtube.com") || videoUrl.includes("youtu.be"));
  const youtubeVideoId = isYouTubeUrl ? extractYouTubeVideoId(videoUrl) : null;
  const isInstagramUrl = videoUrl && videoUrl.includes("instagram.com");
  const instagramVideoId = isInstagramUrl ? extractInstagramVideoId(videoUrl) : null;
  const isEmbeddable = isYouTubeUrl || isInstagramUrl;

  const overallScore = analysisData.overall_score || 0;
  const sc = scoreColor(overallScore);

  // Collect all metrics for the inline list
  const allMetrics: { category: string; name: string; score?: number; description: string }[] = [];
  if (analysisData.analysis && Array.isArray(analysisData.analysis)) {
    (analysisData.analysis as any[]).forEach((section) => {
      section.metrics?.forEach((m: any) => {
        allMetrics.push({ category: section.category_name, name: m.name, score: m.score, description: m.description });
      });
    });
  } else {
    Object.entries(analysisData).forEach(([section, data]) => {
      if (["category", "creator_feedback", "overall_score", "overview", "titles", "descriptions", "target_audience", "content_intent", "brand_fit_summary", "applicable_takeaways", "analysis", "compliance_risks", "strengths", "weaknesses"].includes(section)) return;
      if (typeof data !== "object" || data === null || Array.isArray(data)) return;
      Object.entries(data as Record<string, MetricData>).forEach(([key, val]) => {
        allMetrics.push({ category: section, name: key.replace(/_/g, " "), score: val.score, description: val.description });
      });
    });
  }

  const dateStr = createdAt?.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) || new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  return (
    <div style={{ fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, system-ui, sans-serif", WebkitFontSmoothing: "antialiased" }}>
      <style>{`
        .mono { font-family: 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideDown { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
        .report-root { animation: fadeIn 0.45s ease; }
        .fix-ts-btn:hover { opacity: 0.65 !important; }
        .metric-row { transition: background 0.15s ease; }
        .metric-row:hover { background: rgba(255,255,255,0.03) !important; }
      `}</style>

      <div className="report-root" style={{ maxWidth: 1040, margin: "0 auto", padding: "0 28px 80px" }}>

        {/* ── Top nav bar ────────────────────────────────────────────── */}
        <div style={{ height: 52, display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${C.border}`, marginBottom: 52 }}>
          <Link
            href="/dashboard/alyzitron"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, color: C.muted, fontSize: 11, textDecoration: "none", transition: "color 0.2s ease" }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = C.soft)}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = C.muted)}
          >
            <ArrowLeft size={13} />
            Dashboard
          </Link>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {analysisId && (
              <>
                <ExportPDFButton analysisData={analysisData} videoTitle={videoTitle || "Analysis Video"} filename={`analysis-${analysisId}`} />
                <ShareButton analysisId={analysisId} isPublic={currentIsPublic} isOwner={isOwner || false} onPrivacyChange={setCurrentIsPublic} />
              </>
            )}
            <ChatToggleButton open={open} onClick={togglePanel} />
          </div>
        </div>

        {/* ── Hero: video + giant score ───────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 52, alignItems: "center", marginBottom: 56 }}>

          {/* Video */}
          <div>
            {isYouTubeUrl && youtubeVideoId ? (
              <div style={{ position: "relative", width: "100%", paddingBottom: "56.25%", borderRadius: 10, overflow: "hidden", background: C.s1 }}>
                <iframe
                  ref={iframeRef}
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }}
                  src={`https://www.youtube.com/embed/${youtubeVideoId}`}
                  title="YouTube video player"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              </div>
            ) : isInstagramUrl && instagramVideoId ? (
              <div style={{ position: "relative", width: "100%", maxWidth: 380, margin: "0 auto", paddingBottom: "130%", borderRadius: 10, overflow: "hidden", background: C.s1 }}>
                <iframe
                  ref={iframeRef}
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none", background: "#fff" }}
                  src={`https://www.instagram.com/p/${instagramVideoId}/embed/`}
                  title="Instagram video player"
                  allowFullScreen
                />
              </div>
            ) : (
              <div style={{ position: "relative", width: "100%", paddingBottom: "56.25%", borderRadius: 10, overflow: "hidden", background: "#000" }}>
                <video
                  ref={videoRef}
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }}
                  controls
                  playsInline
                  preload="metadata"
                >
                  <source src={signedUrl} type="video/mp4" />
                </video>
              </div>
            )}
          </div>

          {/* Score + verdict */}
          <div>
            <div
              className="mono"
              style={{ fontSize: 100, fontWeight: 500, color: sc, lineHeight: 0.88, letterSpacing: "-0.06em" }}
            >
              {overallScore}
            </div>
            <div style={{ marginTop: 24, fontSize: 18, color: C.text, lineHeight: 1.35, fontWeight: 400, letterSpacing: "-0.01em" }}>
              {analysisData.remarks || analysisData.overview || "Analysis complete."}
            </div>
            <div
              className="mono"
              style={{ marginTop: 16, fontSize: 10, color: C.dim, letterSpacing: "0.04em", display: "flex", gap: 10, alignItems: "center" }}
            >
              <span>{analysisData.category}</span>
              <span style={{ color: C.faint }}>·</span>
              <span>{dateStr}</span>
              {isOwner && (
                <>
                  <span style={{ color: C.faint }}>·</span>
                  <span style={{ color: currentIsPublic ? C.green : C.muted, display: "flex", alignItems: "center", gap: 4 }}>
                    {currentIsPublic ? <Globe size={10} /> : <Lock size={10} />}
                    {currentIsPublic ? "Public" : "Private"}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── Target Audience ─────────────────────────────────────────── */}
        {analysisData.target_audience && (
          <div style={{ marginBottom: 48, paddingBottom: 48, borderBottom: `1px solid ${C.border}` }}>
            <div className="mono" style={{ fontSize: 10, color: C.dim, letterSpacing: "0.08em", marginBottom: 12 }}>TARGET AUDIENCE</div>
            <p style={{ fontSize: 14, color: C.soft, lineHeight: 1.65 }}>{analysisData.target_audience}</p>
          </div>
        )}

        {/* ── Analysis lens ────────────────────────────────── */}
        {(analysisData.content_intent || analysisData.brand_fit_summary || analysisData.applicable_takeaways?.length) && (
          <div style={{ marginBottom: 48, paddingBottom: 48, borderBottom: `1px solid ${C.border}` }}>
            <div className="mono" style={{ fontSize: 10, color: C.dim, letterSpacing: "0.08em", marginBottom: 16 }}>ANALYSIS LENS</div>
            {analysisData.content_intent && (
              <div className="mono" style={{ display: "inline-flex", marginBottom: 18, padding: "6px 9px", border: `1px solid ${C.borderL}`, borderRadius: 6, color: C.accent, fontSize: 10, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                {analysisData.content_intent.replace(/_/g, " ")}
              </div>
            )}
            {analysisData.brand_fit_summary && (
              <p style={{ marginBottom: analysisData.applicable_takeaways?.length ? 20 : 0, fontSize: 14, color: C.soft, lineHeight: 1.7 }}>
                <TimestampText text={analysisData.brand_fit_summary} onTimestampClick={handleTimestampClick} />
              </p>
            )}
            {analysisData.applicable_takeaways?.length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {analysisData.applicable_takeaways.map((takeaway: string, i: number) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 0", borderBottom: `1px solid ${C.border}` }}>
                    <CheckCircle size={14} color={C.accent} style={{ marginTop: 2, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: C.soft, lineHeight: 1.6 }}>
                      <TimestampText text={takeaway} onTimestampClick={handleTimestampClick} />
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        )}

        {/* Strengths + Improvements */}
        {analysisData.creator_feedback && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, marginBottom: 48, paddingBottom: 48, borderBottom: `1px solid ${C.border}` }}>
            {/* Strengths */}
            <div>
              <div className="mono" style={{ fontSize: 10, color: C.dim, letterSpacing: "0.08em", marginBottom: 16 }}>STRENGTHS</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {analysisData.creator_feedback.strengths?.map((s: string, i: number) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "14px 0", borderBottom: `1px solid ${C.border}` }}>
                    <CheckCircle size={14} color={C.green} style={{ marginTop: 2, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: C.soft, lineHeight: 1.6 }}>
                      <TimestampText text={s} onTimestampClick={handleTimestampClick} />
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Improvements */}
            <div>
              <div className="mono" style={{ fontSize: 10, color: C.dim, letterSpacing: "0.08em", marginBottom: 16 }}>AREAS TO IMPROVE</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {analysisData.creator_feedback.improvements?.map((s: string, i: number) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "14px 0", borderBottom: `1px solid ${C.border}` }}>
                    <AlertCircle size={14} color={C.accent} style={{ marginTop: 2, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: C.soft, lineHeight: 1.6 }}>
                      <TimestampText text={s} onTimestampClick={handleTimestampClick} />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Expandable: Titles · Descriptions · Metrics ────────────── */}
        <div>
          <button
            onClick={() => setExpandedDetail((e) => !e)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              width: "100%",
              padding: "14px 0",
              background: "transparent",
              border: "none",
              borderBottom: `1px solid ${C.border}`,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            <span className="mono" style={{ fontSize: 10, color: C.faint, letterSpacing: "0.04em" }}>
              Titles · Descriptions · Per-metric scores
            </span>
            <span className="mono" style={{ fontSize: 11, color: C.accent }}>
              {expandedDetail ? "Hide ↑" : "Show everything ↓"}
            </span>
          </button>

          {expandedDetail && (
            <div style={{ animation: "slideDown 0.35s cubic-bezier(.16,1,.3,1) both", paddingTop: 36, display: "flex", flexDirection: "column", gap: 44 }}>

              {/* Titles */}
              {analysisData.titles && analysisData.titles.length > 0 && (
                <div>
                  <div className="mono" style={{ fontSize: 10, color: C.dim, letterSpacing: "0.08em", marginBottom: 14 }}>TITLES</div>
                  <div>
                    {analysisData.titles.map((title: string, i: number) => (
                      <div
                        key={i}
                        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "13px 0", borderBottom: `1px solid ${C.border}` }}
                      >
                        <span style={{ fontSize: 14, color: i === 0 ? C.text : C.soft, fontWeight: i === 0 ? 500 : 400, lineHeight: 1.5, flex: 1 }}>
                          {title}
                        </span>
                        <button
                          onClick={() => handleCopy(title, `title-${i}`)}
                          className="mono"
                          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 10, color: copiedItems.has(`title-${i}`) ? C.green : C.dim, flexShrink: 0 }}
                        >
                          {copiedItems.has(`title-${i}`) ? "copied" : "copy"}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Descriptions */}
              {analysisData.descriptions && analysisData.descriptions.length > 0 && (
                <div>
                  <div className="mono" style={{ fontSize: 10, color: C.dim, letterSpacing: "0.08em", marginBottom: 14 }}>DESCRIPTIONS</div>
                  {analysisData.descriptions.map((desc: string, i: number) => (
                    <div key={i} style={{ padding: "16px 0", borderBottom: `1px solid ${C.border}`, display: "flex", gap: 16, alignItems: "flex-start" }}>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 14, color: C.soft, lineHeight: 1.7 }}>
                          {desc.split(/(#\w+)/g).map((part, idx) =>
                            part.startsWith("#") ? <span key={idx} style={{ color: C.dim }}>{part}</span> : part
                          )}
                        </p>
                      </div>
                      <button
                        onClick={() => handleCopy(desc, `desc-${i}`)}
                        className="mono"
                        style={{ background: "none", border: "none", cursor: "pointer", fontSize: 10, color: copiedItems.has(`desc-${i}`) ? C.green : C.dim, flexShrink: 0 }}
                      >
                        {copiedItems.has(`desc-${i}`) ? "copied" : "copy"}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Metrics */}
              {allMetrics.length > 0 && (
                <div>
                  <div className="mono" style={{ fontSize: 10, color: C.dim, letterSpacing: "0.08em", marginBottom: 14 }}>METRICS</div>
                  {allMetrics.map((m, i) => {
                    const mc = m.score !== undefined ? scoreColor(m.score) : C.muted;
                    return (
                      <div
                        key={i}
                        className="metric-row"
                        style={{ display: "grid", gridTemplateColumns: "200px 1fr auto", gap: 20, alignItems: "center", padding: "13px 6px", borderBottom: `1px solid ${C.border}` }}
                      >
                        <span style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>{m.name}</span>
                        <span style={{ fontSize: 11, color: C.muted, lineHeight: 1.55 }}>
                          <TimestampText text={m.description} onTimestampClick={handleTimestampClick} />
                        </span>
                        {m.score !== undefined && (
                          <span className="mono" style={{ fontSize: 13, fontWeight: 500, color: mc, minWidth: 28, textAlign: "right" }}>
                            {m.score}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Chat panel */}
      <ChatPanel
        taskId={taskId as string}
        videoUrl={videoUrl || (signedUrl as string)}
        videoAnalysis={analysisData}
        videoTitle={videoTitle}
        userId={userId}
        open={open}
        onClose={closePanel}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// PRIVATE VIEW
// ═══════════════════════════════════════════════════════════════════════

export function PrivateAnalysisView() {
  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "0 28px" }}>
        <div style={{ height: 52, display: "flex", alignItems: "center", borderBottom: `1px solid ${C.border}`, marginBottom: 52 }}>
          <Link href="/dashboard/alyzitron" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: C.muted, fontSize: 11, textDecoration: "none" }}>
            <ArrowLeft size={13} />
            Dashboard
          </Link>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 32, alignItems: "flex-start", marginBottom: 48 }}>
          <div>
            <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-0.03em", margin: "0 0 8px" }}>Private Analysis</h1>
            <p style={{ fontSize: 14, color: C.muted }}>This analysis is not accessible to you</p>
          </div>
          <Lock size={40} color={C.muted} />
        </div>

        <div style={{ background: C.s1, border: `1px solid ${C.border}`, borderRadius: 10, padding: 32 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 20, marginBottom: 32 }}>
            <Shield size={20} color={C.muted} style={{ marginTop: 2, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 8 }}>Access Restricted</div>
              <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.65, maxWidth: 480 }}>
                This report has been set to private by its creator and can only be viewed by the account that created it.
              </p>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 32 }}>
            {["Want to create your own analysis? Upload your video to Alyzitron.", "All analyses are private by default. Creators can make them public anytime."].map((tip, i) => (
              <div key={i} style={{ padding: "12px 16px", background: C.s2, borderRadius: 7, fontSize: 13, color: C.soft, lineHeight: 1.55 }}>
                {tip}
              </div>
            ))}
          </div>

          <Link
            href="/dashboard/alyzitron"
            style={{ display: "inline-block", padding: "10px 22px", background: C.accent, color: C.bg, borderRadius: 8, fontSize: 13, fontWeight: 700, textDecoration: "none" }}
          >
            Try Alyzitron
          </Link>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// ERROR VIEW
// ═══════════════════════════════════════════════════════════════════════

interface AnalysisErrorProps {
  errorCode: string;
  errorMessage: string;
  videoUrl?: string;
  videoTitle?: string;
  createdAt?: Date;
}

export function AnalysisError({ errorCode, errorMessage, videoUrl, videoTitle, createdAt }: AnalysisErrorProps) {
  const dateStr = createdAt?.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) || new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  return (
    <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", maxWidth: 1040, margin: "0 auto", padding: "0 28px 80px" }}>
      <div style={{ height: 52, display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${C.border}`, marginBottom: 52 }}>
        <Link href="/dashboard/alyzitron" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: C.muted, fontSize: 11, textDecoration: "none" }}>
          <ArrowLeft size={13} />
          Dashboard
        </Link>
        <AlertTriangle size={20} color={C.red} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 52, alignItems: "center", marginBottom: 56 }}>
        <div>
          <div className="mono" style={{ fontSize: 100, fontWeight: 500, color: C.red, lineHeight: 0.88, letterSpacing: "-0.06em" }}>—</div>
        </div>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 10, letterSpacing: "-0.02em" }}>Analysis Failed</div>
          <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.55 }}>
            Looks like something's missing — check the video requirements and try again.
          </p>
          <div className="mono" style={{ marginTop: 16, fontSize: 10, color: C.dim, letterSpacing: "0.04em" }}>
            {videoTitle || "Unknown"} · {dateStr}
          </div>
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 32, marginBottom: 32 }}>
        {["Try uploading the video again — this might be a temporary issue.", "Check that your video meets the requirements (file size, format, duration).", "The video may be unavailable, private, or in an unsupported format."].map((step, i) => (
          <div key={i} style={{ display: "flex", gap: 20, padding: "18px 0", borderBottom: `1px solid ${C.border}` }}>
            <span className="mono" style={{ fontSize: 11, color: C.accent, minWidth: 20 }}>{i + 1}.</span>
            <span style={{ fontSize: 14, color: C.soft, lineHeight: 1.55 }}>{step}</span>
          </div>
        ))}
      </div>

      {videoUrl && (
        <div style={{ marginBottom: 32, padding: 20, background: C.s1, border: `1px solid ${C.border}`, borderRadius: 8 }}>
          <div className="mono" style={{ fontSize: 10, color: C.dim, letterSpacing: "0.08em", marginBottom: 12 }}>VIDEO INFO</div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: C.dim }}>Title</span>
            <span style={{ fontSize: 11, color: C.soft }}>{videoTitle || "Unknown"}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
            <span style={{ fontSize: 11, color: C.dim }}>URL</span>
            <a href={videoUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: C.accent, maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {videoUrl}
            </a>
          </div>
        </div>
      )}

      <Link
        href="/dashboard/alyzitron"
        style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "11px 22px", background: "transparent", border: `1px solid ${C.red}40`, borderRadius: 8, color: C.red, fontSize: 13, fontWeight: 600, textDecoration: "none" }}
      >
        <RotateCcw size={13} />
        {/* Honest label: this navigates to the upload page — it does NOT re-run
            the failed analysis (no retry endpoint exists yet). */}
        Start a new analysis
      </Link>
    </div>
  );
}