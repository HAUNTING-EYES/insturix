"use client";

import { useEffect, useState } from "react";

/**
 * Shared source for the Director Mode scan surfaces (briefing, scan panel,
 * timeline markers). Fetches the project doc and — battle-lane P1 — POLLS until
 * an assist project reaches ready_for_chat, so a surface that mounted mid-scan
 * (e.g. via the processing screen's "Skip") isn't silently blank for the whole
 * session. Stops immediately for auto projects (one fetch, no polling) and once
 * a terminal status is reached. A short module cache dedupes the concurrent
 * fetches from the three consumers.
 */
const POLL_MS = 3000;
const MAX_ATTEMPTS = 40; // ~2 min of polling, then give up
const CACHE_TTL_MS = 2000;

const docCache = new Map<string, { doc: unknown; at: number }>();

async function fetchProjectDoc(projectId: string): Promise<unknown> {
  const cached = docCache.get(projectId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.doc;
  let doc: unknown = null;
  try {
    const res = await fetch(`/api/services/editron/projects/${projectId}`);
    if (res.ok) {
      const d = await res.json();
      doc = d?.project ?? d;
    }
  } catch {
    doc = null;
  }
  docCache.set(projectId, { doc, at: Date.now() });
  return doc;
}

function statusOf(doc: unknown): { editMode?: unknown; status?: unknown } {
  if (!doc || typeof doc !== "object") return {};
  return { editMode: (doc as { editMode?: unknown }).editMode, status: (doc as { autoEditStatus?: unknown }).autoEditStatus };
}

export function useAssistScanDoc(projectId: string | undefined): unknown {
  const [doc, setDoc] = useState<unknown>(null);

  useEffect(() => {
    if (!projectId) { setDoc(null); return; }
    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      const next = await fetchProjectDoc(projectId);
      if (cancelled) return;
      setDoc(next);
      const { editMode, status } = statusOf(next);
      // Keep polling ONLY while an assist project is still scanning.
      const stillScanning = editMode === "assist" && status !== "ready_for_chat" && status !== "scan_failed";
      if (stillScanning && attempts < MAX_ATTEMPTS) {
        attempts += 1;
        timer = setTimeout(() => { void tick(); }, POLL_MS);
      }
    };

    void tick();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [projectId]);

  return doc;
}
