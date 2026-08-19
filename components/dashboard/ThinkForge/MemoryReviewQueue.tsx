"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, RefreshCw, ShieldAlert, Sparkles, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface MemoryReviewCandidate {
  _id: string;
  type: string;
  title: string;
  content?: Record<string, unknown>;
  sourceUrl?: string;
}

type LoadState = "loading" | "ready" | "forbidden" | "error";

function parseCandidate(value: unknown): MemoryReviewCandidate | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record._id !== "string" || !record._id.trim()) return null;
  if (typeof record.type !== "string" || !record.type.trim()) return null;
  if (typeof record.title !== "string" || !record.title.trim()) return null;
  const content = record.content && typeof record.content === "object" && !Array.isArray(record.content)
    ? record.content as Record<string, unknown>
    : undefined;
  return {
    _id: record._id,
    type: record.type,
    title: record.title,
    ...(content ? { content } : {}),
    ...(typeof record.sourceUrl === "string" ? { sourceUrl: record.sourceUrl } : {}),
  };
}

function candidatePreview(candidate: MemoryReviewCandidate): string | null {
  for (const field of ["claim", "summary", "description"] as const) {
    const value = candidate.content?.[field];
    if (typeof value === "string" && value.trim()) return value.trim().slice(0, 240);
  }
  return null;
}

function sourceHost(sourceUrl: string | undefined): string | null {
  if (!sourceUrl) return null;
  try {
    return new URL(sourceUrl).hostname;
  } catch {
    return null;
  }
}

async function responseError(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json() as { error?: unknown };
    return typeof body.error === "string" && body.error.trim() ? body.error : fallback;
  } catch {
    return fallback;
  }
}

export function MemoryReviewQueue({ sessionId }: { sessionId?: string | null }) {
  const [entries, setEntries] = useState<MemoryReviewCandidate[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoadState("loading");
    setErrorMessage(null);
    const query = new URLSearchParams({ reviewStatus: "pending", limit: "50" });
    if (sessionId) query.set("sessionId", sessionId);

    try {
      const response = await fetch(`/api/services/thinkforge/databank?${query.toString()}`, { signal });
      if (response.status === 403) {
        setEntries([]);
        setLoadState("forbidden");
        return;
      }
      if (!response.ok) throw new Error(await responseError(response, "Learning review could not be loaded."));
      const body = await response.json() as { entries?: unknown };
      setEntries(Array.isArray(body.entries)
        ? body.entries.flatMap((entry) => {
            const parsed = parseCandidate(entry);
            return parsed ? [parsed] : [];
          })
        : []);
      setLoadState("ready");
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setLoadState("error");
      setErrorMessage(error instanceof Error ? error.message : "Learning review could not be loaded.");
    }
  }, [sessionId]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const review = async (candidate: MemoryReviewCandidate, decision: "approved" | "rejected") => {
    setActingId(candidate._id);
    try {
      const response = await fetch("/api/services/thinkforge/databank", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: candidate._id, action: "review", decision }),
      });
      if (response.status === 404 || response.status === 409) {
        await load();
        throw new Error("This learning item was already changed. The queue has been refreshed.");
      }
      if (!response.ok) throw new Error(await responseError(response, "Learning review failed."));
      setEntries((current) => current.filter((entry) => entry._id !== candidate._id));
      toast({ title: decision === "approved" ? "Learning approved" : "Learning rejected" });
    } catch (error) {
      toast({
        title: "Review was not saved",
        description: error instanceof Error ? error.message : "Please retry.",
        variant: "destructive",
      });
    } finally {
      setActingId(null);
    }
  };

  if (loadState === "loading") {
    return (
      <div className="flex items-center gap-2 border-b border-white/[0.06] pb-4 text-xs text-[#7A776E]">
        <Loader2 size={13} className="animate-spin" />
        Checking learning reviews...
      </div>
    );
  }

  if (loadState === "forbidden") {
    return (
      <div className="flex items-start gap-2 border-b border-white/[0.06] pb-4 text-xs text-[#7A776E]">
        <ShieldAlert size={14} className="mt-0.5 shrink-0 text-[#D4A652]" />
        Workspace administrators review generated learning.
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] pb-4">
        <p className="text-xs text-red-300">{errorMessage}</p>
        <button
          type="button"
          title="Retry learning review"
          aria-label="Retry learning review"
          onClick={() => void load()}
          className="p-1.5 text-[#7A776E] transition-colors hover:text-[#ECE9E1]"
        >
          <RefreshCw size={14} />
        </button>
      </div>
    );
  }

  if (entries.length === 0) return null;

  return (
    <section className="space-y-3 border-b border-white/[0.06] pb-5" aria-label="Learning review">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-[#D4A652]" />
          <h3 className="text-xs font-semibold text-[#ECE9E1]">Learning review</h3>
        </div>
        <span className="text-[10px] text-[#7A776E]">{entries.length} pending</span>
      </div>

      <div className="space-y-2">
        {entries.map((candidate) => {
          const preview = candidatePreview(candidate);
          const host = sourceHost(candidate.sourceUrl);
          const busy = actingId === candidate._id;
          return (
            <article key={candidate._id} className="rounded-lg border border-white/[0.08] bg-white/[0.025] p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="truncate text-xs font-medium text-[#ECE9E1]">{candidate.title}</p>
                  <p className="text-[10px] uppercase text-[#5F5E5A]">
                    {candidate.type.replaceAll("_", " ")}{host ? ` / ${host}` : ""}
                  </p>
                  {preview ? <p className="line-clamp-3 text-[11px] leading-relaxed text-[#9A978F]">{preview}</p> : null}
                </div>
                {busy ? <Loader2 size={14} className="shrink-0 animate-spin text-[#D4A652]" /> : null}
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={actingId !== null}
                  onClick={() => void review(candidate, "rejected")}
                  className="flex items-center gap-1.5 rounded-md border border-white/[0.08] px-2.5 py-1.5 text-[11px] text-[#9A978F] transition-colors hover:border-red-400/30 hover:text-red-300 disabled:opacity-40"
                >
                  <X size={12} /> Reject
                </button>
                <button
                  type="button"
                  disabled={actingId !== null}
                  onClick={() => void review(candidate, "approved")}
                  className="flex items-center gap-1.5 rounded-md border border-[#D4A652]/20 bg-[#D4A652]/10 px-2.5 py-1.5 text-[11px] text-[#D4A652] transition-colors hover:bg-[#D4A652]/20 disabled:opacity-40"
                >
                  <Check size={12} /> Approve
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
