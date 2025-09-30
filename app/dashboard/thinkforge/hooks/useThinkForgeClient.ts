"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { sanitizeServerScript } from "@/lib/thinkforge/json";
import { toast } from "@/hooks/use-toast";
import { sanitizeServerScript, applyBlockPatches, ensureBlockIds } from "@/lib/thinkforge/json";

// Lightweight script model
export type Block = any;
export type ScriptModel = {
  title?: string | null;
  outline?: string | null;
  content?: string | null;
  blocks?: Block[] | null;
};

export type HydratePayload = {
  userId?: string;
  sessionId?: string;
  projectMeta?: Record<string, any>;
};

export type HydrateResponse = {
  userId: string;
  sessionId: string;
  preferences: Record<string, any>;
  projectMeta: Record<string, any>;
  script?: ScriptModel | null;
  chat: any[];
};

const LS_CURRENT_SESSION = "thinkforge_current_session";
const LS_SESSION_PREFIX = "thinkforge_session_";

function saveLocal(sessionId: string, data: Partial<HydrateResponse & { script: ScriptModel }>) {
  try {
    const key = `${LS_SESSION_PREFIX}${sessionId}`;
    const prev = JSON.parse(localStorage.getItem(key) || "{}");
    localStorage.setItem(key, JSON.stringify({ ...prev, ...data }));
  } catch {}
}

function getLocal(sessionId: string): Partial<HydrateResponse & { script: ScriptModel }> | null {
  try {
    const key = `${LS_SESSION_PREFIX}${sessionId}`;
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function useThinkForgeClient() {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [script, setScript] = useState<ScriptModel | null>(null);
  const [chat, setChat] = useState<any[]>([]);
  const [preferences, setPreferences] = useState<Record<string, any>>({});
  const [projectMeta, setProjectMeta] = useState<Record<string, any>>({});

  const [isHydrating, setIsHydrating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedSnapshotRef = useRef<string>("");

  // Recover last session on mount
  useEffect(() => {
    try {
      const last = localStorage.getItem(LS_CURRENT_SESSION);
      if (last) {
        const cached = getLocal(last);
        if (cached) {
          setSessionId(last);
          setScript(cached.script || null);
          setChat((cached as any).chat || []);
          setPreferences(cached.preferences || {});
          setProjectMeta(cached.projectMeta || {});
        }
      }
    } catch {}
  }, []);

  const hydrate = useCallback(async (payload?: HydratePayload) => {
    setIsHydrating(true);
    const isCreateNew = !!(payload && !payload.sessionId && payload.projectMeta);
    try {
      const res = await fetch("/api/services/thinkforge/hydrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify(payload || {}),
      });
      if (!res.ok) {
        // Handle limit reached (429) gracefully for create-new flows
        if (isCreateNew && res.status === 429) {
          try {
            const data = await res.json();
            const message = data?.error || "Max ThinkForge sessions reached. Please upgrade your plan.";
            toast({
              title: "Limit reached",
              description: message,
              variant: "destructive",
            });
          } catch {}
          // Soft navigate to dashboard to preserve toast
          router.push('/dashboard');
          return null;
        }
        throw new Error(`Hydrate failed: ${res.status}`);
      }
      const data: HydrateResponse = await res.json();
      const sanitized = data?.script ? sanitizeServerScript(data.script) : null;
      if (sanitized && Array.isArray(sanitized.blocks)) {
        sanitized.blocks = ensureBlockIds(sanitized.blocks as any);
      }
      setSessionId(data.sessionId);
      setScript(sanitized);
      setChat(data.chat || []);
      setPreferences(data.preferences || {});
      setProjectMeta(data.projectMeta || {});
      // Cache
      localStorage.setItem(LS_CURRENT_SESSION, data.sessionId);
      const cachePayload: Partial<HydrateResponse & { script: ScriptModel }> = {
        ...data,
        script: (sanitized ?? undefined) as any,
      };
      saveLocal(data.sessionId, cachePayload);
      return { ...data, script: sanitized } as HydrateResponse;
    } catch (e) {
      // If this was a brand-new session creation attempt, do NOT fallback to old cached session; start clean
      if (isCreateNew) {
        try { localStorage.removeItem(LS_CURRENT_SESSION); } catch {}
        setSessionId(null);
        setScript(null);
        setChat([]);
        setPreferences({});
        setProjectMeta({});
        return null;
      }
      // Otherwise, fallback to local cache if present for the requested/last session
      const sid = payload?.sessionId || localStorage.getItem(LS_CURRENT_SESSION) || null;
      if (sid) {
        const cached = getLocal(sid);
        if (cached) {
          setSessionId(sid);
          setScript(cached.script || null);
          setChat((cached as any).chat || []);
          setPreferences(cached.preferences || {});
          setProjectMeta(cached.projectMeta || {});
        }
      }
      return null;
    } finally {
      setIsHydrating(false);
    }
  }, []);

  const setScriptAndQueueSave = useCallback((updater: ScriptModel | ((prev: ScriptModel | null) => ScriptModel)) => {
    setScript((prev) => {
      const next = typeof updater === "function" ? (updater as any)(prev) : updater;
      // Local cache immediately for resilience
      if (sessionId) {
        saveLocal(sessionId, { script: next });
      }
      // Queue autosave
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        void autosave(next);
      }, 800);
      return next;
    });
  }, [sessionId]);

  const autosave = useCallback(async (scriptToSave?: ScriptModel | null) => {
    if (!sessionId) return;
    const payloadScript = scriptToSave ?? script;
    const snapshot = JSON.stringify(payloadScript || {});
    if (snapshot === lastSavedSnapshotRef.current) return;
    lastSavedSnapshotRef.current = snapshot;
    setIsSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/services/thinkforge/script/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ sessionId, script: payloadScript }),
      });
      if (!res.ok) throw new Error(`Save failed: ${res.status}`);
      // No-op on success; backend returns scriptId
    } catch (e: any) {
      setSaveError(e?.message || "Failed to save");
    } finally {
      setIsSaving(false);
    }
  }, [sessionId, script]);

  const runEdit = useCallback(async (instruction: string) => {
    const res = await fetch("/api/services/thinkforge/script/edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ instruction, script, sessionId }),
    });
    if (!res.ok) throw new Error(`Edit failed: ${res.status}`);
    const data = await res.json();
    const sanitized = sanitizeServerScript(data);
    const updated: ScriptModel = {
      title: sanitized?.title ?? script?.title ?? null,
      outline: sanitized?.outline ?? script?.outline ?? null,
      content: sanitized?.content ?? script?.content ?? null,
      blocks: sanitized?.blocks ?? script?.blocks ?? null,
    };
    setScriptAndQueueSave(updated);
    return sanitized;
  }, [script, sessionId, setScriptAndQueueSave]);

  const runEditBlocks = useCallback(async (instruction: string, selection?: string, indices?: number[]) => {
    const payload = {
      instruction,
      script,
      sessionId,
      selection: selection && selection.trim().length > 0 ? selection : undefined,
      indices: Array.isArray(indices) && indices.length > 0 ? indices : undefined,
    } as any;
    const res = await fetch("/api/services/thinkforge/script/edit-blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Edit-blocks failed: ${res.status}`);
    const data = await res.json();
    // Minimal patch via ids; fall back to sanitized full replace
    const sanitized = sanitizeServerScript(data);
    const nextBlocks = applyBlockPatches((script?.blocks as any[]) || [], {
      title: sanitized?.title ?? undefined,
      outline: sanitized?.outline ?? undefined,
      content: sanitized?.content ?? undefined,
      blocks: sanitized?.blocks as any[] | undefined,
      replacements: Array.isArray((data as any)?.replacements) ? (data as any).replacements : undefined,
    });
    const updated: ScriptModel = {
      title: sanitized?.title ?? script?.title ?? null,
      outline: sanitized?.outline ?? script?.outline ?? null,
      content: sanitized?.content ?? script?.content ?? null,
      blocks: nextBlocks,
    };
    setScriptAndQueueSave(updated);
    return sanitized;
  }, [script, sessionId, setScriptAndQueueSave]);

  const refreshChat = useCallback(async () => {
    if (!sessionId) return [] as any[];
    const res = await fetch(`/api/services/thinkforge/chat/list?sessionId=${encodeURIComponent(sessionId)}&limit=100`, { cache: "no-store" });
    if (!res.ok) return chat;
    const data = await res.json();
    const items = data?.items || [];
    setChat(items);
    saveLocal(sessionId, { chat: items } as any);
    return items;
  }, [sessionId, chat]);

  // Import/replace current script from user-provided JSON (title + blocks)
  const importScript = useCallback((data: any) => {
    try {
      const scriptLike: ScriptModel = {
        title: typeof data?.title === 'string' ? data.title : (script?.title ?? 'Untitled Script'),
        outline: null,
        content: null,
        blocks: Array.isArray(data?.blocks) ? data.blocks : [],
      };
      const sanitized = sanitizeServerScript(scriptLike) as ScriptModel;
      setScriptAndQueueSave(sanitized);
      return { ok: true, applied: sanitized } as const;
    } catch (e: any) {
      return { ok: false, error: e?.message || 'Invalid script JSON' } as const;
    }
  }, [script, setScriptAndQueueSave]);

  // Convenience: replace just the blocks (optionally title)
  const replaceBlocks = useCallback((blocks: Block[], title?: string) => {
    return importScript({ title: title ?? script?.title, blocks });
  }, [importScript, script?.title]);

  const getSessionsCount = useCallback(async () => {
    const res = await fetch(`/api/services/thinkforge/sessions/count`, { cache: "no-store" });
    if (!res.ok) return { count: 0 };
    return res.json();
  }, []);

  const getSessionsList = useCallback(async (limit = 50, offset = 0) => {
    const res = await fetch(`/api/services/thinkforge/sessions/list?limit=${limit}&offset=${offset}`, { cache: "no-store" });
    if (!res.ok) return { sessions: [], count: 0 };
    return res.json();
  }, []);

  // Paginated chat listing for infinite scroll
  const listChats = useCallback(async (limit = 10, offset = 0) => {
    if (!sessionId) return { items: [] as any[], total: 0 };
    const res = await fetch(`/api/services/thinkforge/chat/list?sessionId=${encodeURIComponent(sessionId)}&limit=${limit}&offset=${offset}`, { cache: "no-store" });
    if (!res.ok) return { items: chat, total: chat.length } as any;
    return res.json();
  }, [sessionId, chat]);

  // Close session locally (frontend-only cleanup)
  const closeSession = useCallback(async () => {
    try {
      if (sessionId) {
        localStorage.removeItem(LS_CURRENT_SESSION);
        // Keep cached data in LS_SESSION_PREFIX for future re-open
      }
      setSessionId(null);
      setScript(null);
      setChat([]);
      setPreferences({});
      setProjectMeta({});
    } catch {}
  }, [sessionId]);

  // Cleanup timer on unmount
  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); }, []);

  return {
    // state
    sessionId, script, chat, preferences, projectMeta,
    isHydrating, isSaving, saveError,
    // actions
    hydrate, setScriptAndQueueSave, autosave, runEdit, refreshChat,
    runEditBlocks,
    getSessionsCount, getSessionsList, listChats, closeSession,
    // importers
    importScript, replaceBlocks,
  } as const;
}
