"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, ExternalLink, Loader2, Search, TrendingUp, X } from "lucide-react";
import type { SelectedTrend } from "@/lib/thinkforge/trends/selected-trend";
import type { TrendCandidate, TrendPlatform } from "@/lib/thinkforge/trends/trend-evidence";

export type TrendTarget = "post" | "script";
type WorkflowStage = "discover" | "select" | "source" | "analyzing" | "ready";
type TrendIntakeMode = "discover" | "link";

interface TrendWorkflowPanelProps {
  open: boolean;
  sessionId: string | null | undefined;
  initialTarget?: TrendTarget;
  onClose: () => void;
  onEnsureSession?: (candidate: TrendCandidate, target: TrendTarget) => Promise<string | null>;
  onGenerate: (prompt: string, sessionId: string, target: TrendTarget, selectedTrend: SelectedTrend) => void;
}

const PLATFORM_OPTIONS: Array<{ value: "all" | TrendPlatform; label: string }> = [
  { value: "all", label: "Any platform" },
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
  { value: "youtube", label: "YouTube" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "x", label: "X" },
];
const MAX_ANALYSIS_WAIT_MS = 10 * 60 * 1_000;

function firstSourceUrl(candidate?: TrendCandidate): string {
  return candidate?.evidence.find((evidence) => evidence.sourceUrl)?.sourceUrl || "";
}

export function defaultTrendReferenceVideoUrl(candidate?: TrendCandidate): string {
  return candidate?.nextAction === "analyze_reference_video" ? firstSourceUrl(candidate) : "";
}

async function readJsonResponse(response: Response): Promise<any> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload?.error === "string" ? payload.error : "Request failed (" + response.status + ").");
  }
  return payload;
}

export function TrendWorkflowPanel({ open, sessionId, initialTarget = "script", onClose, onEnsureSession, onGenerate }: TrendWorkflowPanelProps) {
  const [niche, setNiche] = useState("");
  const [intakeMode, setIntakeMode] = useState<TrendIntakeMode>("discover");
  const [platform, setPlatform] = useState<"all" | TrendPlatform>("all");
  const [target, setTarget] = useState<TrendTarget>(initialTarget);
  const [referenceVideoUrl, setReferenceVideoUrl] = useState("");
  const [candidates, setCandidates] = useState<TrendCandidate[]>([]);
  const [selectedTrend, setSelectedTrend] = useState<SelectedTrend | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [stage, setStage] = useState<WorkflowStage>("discover");
  const [workflowSessionId, setWorkflowSessionId] = useState<string | null>(sessionId || null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollStartedAtRef = useRef<number | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open && sessionId) setWorkflowSessionId(sessionId);
  }, [open, sessionId]);

  useEffect(() => {
    if (!open || !workflowSessionId) return;
    let cancelled = false;
    void fetch("/api/services/thinkforge/trends/status?sessionId=" + encodeURIComponent(workflowSessionId))
      .then(readJsonResponse)
      .then((payload) => {
        if (cancelled || !payload.selectedTrend) return;
        const restored = payload.selectedTrend as SelectedTrend;
        setSelectedTrend(restored);
        setNiche(restored.candidate.title);
        setReferenceVideoUrl(defaultTrendReferenceVideoUrl(restored.candidate));
        setTarget(restored.target === "calendar" ? "post" : restored.target);
        setStage(restored.analysis?.status === "completed" ? "ready" : restored.analysis?.status === "queued" ? "analyzing" : "source");
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [open, sessionId]);

  useEffect(() => {
    if (!open || stage !== "analyzing" || !workflowSessionId) return;
    let cancelled = false;
    pollStartedAtRef.current ??= Date.now();
    const poll = async () => {
      try {
        const payload = await readJsonResponse(await fetch("/api/services/thinkforge/trends/status?sessionId=" + encodeURIComponent(workflowSessionId)));
        if (cancelled) return;
        const nextTrend = payload.selectedTrend as SelectedTrend | null;
        if (nextTrend) setSelectedTrend(nextTrend);
        if (nextTrend?.analysis?.status === "completed") {
          pollStartedAtRef.current = null;
          setStage("ready");
          setError(null);
          return;
        }
        if (nextTrend?.analysis?.status === "failed") {
          pollStartedAtRef.current = null;
          setStage("source");
          setError("Trend analysis failed (" + nextTrend.analysis.failureCode + "). Check the reference and try again.");
          return;
        }
        if (Date.now() - (pollStartedAtRef.current || Date.now()) >= MAX_ANALYSIS_WAIT_MS) {
          pollStartedAtRef.current = null;
          setStage("source");
          setError("Trend analysis is taking longer than expected. You can retry from this panel.");
          return;
        }
        pollTimerRef.current = setTimeout(poll, 3_000);
      } catch (pollError) {
        if (cancelled) return;
        pollStartedAtRef.current = null;
        setStage("source");
        setError(pollError instanceof Error ? pollError.message : "Could not read trend analysis status.");
      }
    };
    void poll();
    return () => {
      cancelled = true;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    };
  }, [open, workflowSessionId, stage]);

  if (!open) return null;

  const discover = async () => {
    if (niche.trim().length < 2) {
      setError("Enter a public niche, such as B2B SaaS, recruiting, or skincare.");
      return;
    }
    setBusy(true);
    setError(null);
    setCandidates([]);
    setSelectedTrend(null);
    setStage("discover");
    try {
      const payload = await readJsonResponse(await fetch("/api/services/thinkforge/trends/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ niche: niche.trim(), ...(platform !== "all" ? { platforms: [platform] } : {}) }),
      }));
      setProvider(payload.provider || null);
      setCandidates(Array.isArray(payload.candidates) ? payload.candidates : []);
      setStage("select");
      if (!payload.candidates?.length) setError("No usable public candidates were found. Try a broader niche.");
    } catch (discoverError) {
      setError(discoverError instanceof Error ? discoverError.message : "Trend discovery failed.");
    } finally {
      setBusy(false);
    }
  };

  const selectCandidate = async (candidate: TrendCandidate) => {
    setBusy(true);
    setError(null);
    try {
      const resolvedSessionId = workflowSessionId || await onEnsureSession?.(candidate, target) || null;
      if (!resolvedSessionId) {
        setError("ThinkForge could not create a session for this trend. Please try again.");
        return;
      }
      setWorkflowSessionId(resolvedSessionId);
      const payload = await readJsonResponse(await fetch("/api/services/thinkforge/trends/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: resolvedSessionId, candidate, target }),
      }));
      const persistedTrend = payload.selectedTrend as SelectedTrend;
      setSelectedTrend(persistedTrend);
      setReferenceVideoUrl(defaultTrendReferenceVideoUrl(persistedTrend.candidate));
      setStage("source");
    } catch (selectError) {
      setError(selectError instanceof Error ? selectError.message : "Could not select that trend.");
    } finally {
      setBusy(false);
    }
  };

  const queueAnalysis = async (resolvedSessionId: string, videoUrl: string) => {
    await readJsonResponse(await fetch("/api/services/thinkforge/trends/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: resolvedSessionId, referenceVideoUrl: videoUrl }),
    }));
    pollStartedAtRef.current = Date.now();
    setStage("analyzing");
  };

  const selectDirectReference = async () => {
    const videoUrl = referenceVideoUrl.trim();
    if (!videoUrl) {
      setError("Add a YouTube link or direct public video URL.");
      return;
    }
    setBusy(true);
    setError(null);
    let selectionPersisted = false;
    try {
      const referencePayload = await readJsonResponse(await fetch("/api/services/thinkforge/trends/reference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          referenceVideoUrl: videoUrl,
          ...(platform !== "all" ? { platform } : {}),
        }),
      }));
      const candidate = referencePayload.candidate as TrendCandidate;
      const resolvedSessionId = workflowSessionId || await onEnsureSession?.(candidate, target) || null;
      if (!resolvedSessionId) {
        setError("ThinkForge could not create a session for this trend. Please try again.");
        return;
      }
      setWorkflowSessionId(resolvedSessionId);
      const payload = await readJsonResponse(await fetch("/api/services/thinkforge/trends/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: resolvedSessionId, candidate, target }),
      }));
      const persistedTrend = payload.selectedTrend as SelectedTrend;
      setSelectedTrend(persistedTrend);
      selectionPersisted = true;
      const canonicalVideoUrl = defaultTrendReferenceVideoUrl(persistedTrend.candidate);
      setReferenceVideoUrl(canonicalVideoUrl);
      await queueAnalysis(resolvedSessionId, canonicalVideoUrl);
    } catch (directError) {
      setStage(selectionPersisted ? "source" : "discover");
      setError(directError instanceof Error ? directError.message : "Could not analyze that trend reference.");
    } finally {
      setBusy(false);
    }
  };

  const analyze = async () => {
    if (!workflowSessionId || !selectedTrend) return;
    if (!referenceVideoUrl.trim()) {
      setError("Add a public reference video URL so ThinkForge can learn the format mechanics.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await queueAnalysis(workflowSessionId, referenceVideoUrl.trim());
    } catch (analyzeError) {
      setError(analyzeError instanceof Error ? analyzeError.message : "Could not start trend analysis.");
    } finally {
      setBusy(false);
    }
  };

  const generate = () => {
    if (!workflowSessionId || !selectedTrend) return;
    onGenerate("Create a " + target + " using the analyzed trend selected in this session. Preserve its structural mechanics, timing, and audience pattern, but make the idea original, brand-safe, and specific to my brief. Do not copy the reference's wording, logos, claims, or exact performance.", workflowSessionId, target, selectedTrend);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="trend-workflow-title">
      <div className="max-h-[min(760px,calc(100vh-48px))] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[#282724] bg-[#0B0B0A] shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#282724] bg-[#0B0B0A] px-5 py-4">
          <div>
            <div className="flex items-center gap-2 text-[#D4A652]"><TrendingUp className="h-4 w-4" /><span className="font-mono text-[11px] uppercase tracking-[0.2em]">Trend workflow</span></div>
            <h2 id="trend-workflow-title" className="mt-1 text-lg font-semibold text-[#ECE9E1]">Turn a real trend into an original draft</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-[#7A776E] hover:bg-[#1C1B19] hover:text-[#ECE9E1]" aria-label="Close trend workflow"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-5 p-5">
          {!selectedTrend && <>
            <div className="inline-flex rounded-lg border border-[#282724] bg-[#0F0F0E] p-1" role="group" aria-label="Trend source">
              <button type="button" onClick={() => { setIntakeMode("discover"); setError(null); }} aria-pressed={intakeMode === "discover"} className={`rounded-md px-3 py-1.5 text-xs font-medium ${intakeMode === "discover" ? "bg-[#282724] text-[#ECE9E1]" : "text-[#7A776E] hover:text-[#ECE9E1]"}`}>Find trends</button>
              <button type="button" onClick={() => { setIntakeMode("link"); setError(null); }} aria-pressed={intakeMode === "link"} className={`rounded-md px-3 py-1.5 text-xs font-medium ${intakeMode === "link" ? "bg-[#282724] text-[#ECE9E1]" : "text-[#7A776E] hover:text-[#ECE9E1]"}`}>Use video link</button>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_170px_150px]">
              {intakeMode === "discover"
                ? <label className="text-xs text-[#A7A39A]">Public niche<input value={niche} onChange={(event) => setNiche(event.target.value)} placeholder="e.g. B2B SaaS marketing" className="mt-1.5 w-full rounded-lg border border-[#282724] bg-[#0F0F0E] px-3 py-2.5 text-sm text-[#ECE9E1] outline-none focus:border-[#D4A652]/60" /></label>
                : <label className="text-xs text-[#A7A39A]">Trend video URL<input value={referenceVideoUrl} onChange={(event) => setReferenceVideoUrl(event.target.value)} placeholder="YouTube or direct public video URL" className="mt-1.5 w-full rounded-lg border border-[#282724] bg-[#0F0F0E] px-3 py-2.5 text-sm text-[#ECE9E1] outline-none focus:border-[#D4A652]/60" /></label>}
              <label className="text-xs text-[#A7A39A]">Platform<select value={platform} onChange={(event) => setPlatform(event.target.value as typeof platform)} className="mt-1.5 w-full rounded-lg border border-[#282724] bg-[#0F0F0E] px-3 py-2.5 text-sm text-[#ECE9E1] outline-none focus:border-[#D4A652]/60">{PLATFORM_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
              <label className="text-xs text-[#A7A39A]">Draft type<select value={target} onChange={(event) => setTarget(event.target.value as TrendTarget)} className="mt-1.5 w-full rounded-lg border border-[#282724] bg-[#0F0F0E] px-3 py-2.5 text-sm text-[#ECE9E1] outline-none focus:border-[#D4A652]/60"><option value="script">Script</option><option value="post">Post</option></select></label>
            </div>
            {intakeMode === "discover"
              ? <button type="button" onClick={discover} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-[#D4A652] px-4 py-2.5 text-sm font-semibold text-[#0B0B0A] disabled:cursor-not-allowed disabled:opacity-50">{busy && stage === "discover" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}Find public trends</button>
              : <button type="button" onClick={selectDirectReference} disabled={busy || !referenceVideoUrl.trim()} className="inline-flex items-center gap-2 rounded-lg bg-[#D4A652] px-4 py-2.5 text-sm font-semibold text-[#0B0B0A] disabled:cursor-not-allowed disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <TrendingUp className="h-4 w-4" />}Analyze video link</button>}
          </>}
          {provider && <p className="text-xs text-[#7A776E]">Public evidence supplied by {provider}. Brand Vault data is not sent for discovery.</p>}
          {candidates.length > 0 && (
            <div className="space-y-2">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#7A776E]">Choose a format source</div>
              {candidates.map((candidate) => {
                const sourceUrl = firstSourceUrl(candidate);
                return <div key={candidate.candidateId} className="flex items-start justify-between gap-3 rounded-xl border border-[#282724] bg-[#0F0F0E] p-3"><div className="min-w-0"><div className="font-medium text-[#ECE9E1]">{candidate.title}</div><div className="mt-1 text-xs text-[#A7A39A]">{candidate.summary || "Public trend evidence available for analysis."}</div><div className="mt-2 flex items-center gap-3 text-[11px] text-[#7A776E]"><span>{candidate.platform}</span><span>{candidate.freshness}</span><span>{Math.round(candidate.evidenceCompleteness * 100)}% evidence</span>{sourceUrl && <a href={sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#D4A652] hover:underline">source <ExternalLink className="h-3 w-3" /></a>}</div></div><button type="button" onClick={() => selectCandidate(candidate)} disabled={busy} className="shrink-0 rounded-lg border border-[#D4A652]/50 px-3 py-2 text-xs font-semibold text-[#D4A652] hover:bg-[#D4A652]/10 disabled:opacity-50">Use this</button></div>;
              })}
            </div>
          )}
          {selectedTrend && stage !== "discover" && stage !== "select" && (
            <div className="space-y-4 rounded-xl border border-[#282724] bg-[#0F0F0E] p-4">
              <div className="flex items-center gap-2">{stage === "ready" ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <TrendingUp className="h-4 w-4 text-[#D4A652]" />}<div><div className="font-medium text-[#ECE9E1]">{selectedTrend.candidate.title}</div><div className="text-xs text-[#7A776E]">{stage === "ready" ? "Analyzed and ready for an original draft." : "Selected. Add a reference so ThinkForge can learn its mechanics."}</div></div></div>
              {stage === "source" && <>{selectedTrend.candidate.nextAction === "add_reference_video" && !referenceVideoUrl && <div className="flex items-start gap-2 rounded-lg border border-[#D4A652]/25 bg-[#D4A652]/5 px-3 py-2.5 text-xs leading-relaxed text-[#C9C3B6]"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#D4A652]" />The discovered source is contextual evidence, not a playable video. Add a YouTube link or a direct public video file to analyze its timing.</div>}<label className="block text-xs text-[#A7A39A]">Public reference video URL<input value={referenceVideoUrl} onChange={(event) => setReferenceVideoUrl(event.target.value)} placeholder="YouTube or direct .mp4, .mov, .webm, .m4v URL" className="mt-1.5 w-full rounded-lg border border-[#282724] bg-[#0B0B0A] px-3 py-2.5 text-sm text-[#ECE9E1] outline-none focus:border-[#D4A652]/60" /></label><button type="button" onClick={analyze} disabled={busy || !referenceVideoUrl.trim()} className="inline-flex items-center gap-2 rounded-lg bg-[#D4A652] px-4 py-2.5 text-sm font-semibold text-[#0B0B0A] disabled:cursor-not-allowed disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <TrendingUp className="h-4 w-4" />}Analyze format mechanics</button></>}
              {stage === "analyzing" && <div className="flex items-center gap-2 text-sm text-[#D4A652]"><Loader2 className="h-4 w-4 animate-spin" />Analyzing timing, invariants, variables, and performance pattern...</div>}
              {stage === "ready" && <button type="button" onClick={generate} className="inline-flex items-center gap-2 rounded-lg bg-[#D4A652] px-4 py-2.5 text-sm font-semibold text-[#0B0B0A]"><CheckCircle2 className="h-4 w-4" />Draft with this analyzed trend</button>}
            </div>
          )}
          {error && <div className="flex items-start gap-2 rounded-lg border border-red-400/30 bg-red-400/5 px-3 py-2.5 text-sm text-red-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
          <p className="text-xs leading-relaxed text-[#7A776E]">ThinkForge analyzes the reference into a TrendSpec, then applies the structure to your brand context. It does not copy the source wording, logos, claims, or exact performance.</p>
        </div>
      </div>
    </div>
  );
}
