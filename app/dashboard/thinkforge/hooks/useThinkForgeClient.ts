"use client";
/**
 * @deprecated This hook is DEPRECATED and will be removed in a future release.
 * Use `useThinkForgeSession` instead as the single source of truth for session state.
 * 
 * Migration guide:
 * - Import ScriptModel, HydratePayload, HydrateResponse from './useThinkForgeSession'
 * - Replace useThinkForgeClient() with useThinkForgeSession()
 * 
 * This file is kept temporarily for backwards compatibility but should not be used
 * in new code. All session state should flow through useThinkForgeSession to prevent
 * split-brain state issues.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/hooks/use-toast";
import { sanitizeServerScript, applyBlockPatches } from "@/lib/thinkforge/json";

// Re-export types from canonical source for backwards compatibility
export type { ScriptModel, Block } from "./useThinkForgeSession";
import type { ScriptModel, Block } from "./useThinkForgeSession";

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

  const hydrate = useCallback(async (payload?: HydratePayload) => {
    setIsHydrating(true);
    const isCreateNew = !!(payload && !payload.sessionId && payload.projectMeta);
    try {
      const res = await fetch("/api/services/thinkforge/session", {
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
      setSessionId(data.sessionId);
      setScript(sanitized);
      setChat(data.chat || []);
      setPreferences(data.preferences || {});
      setProjectMeta(data.projectMeta || {});
      // Cache only the explicitly opened session; there is no browser-wide current-session pointer.
      const cachePayload: Partial<HydrateResponse & { script: ScriptModel }> = {
        ...data,
        script: (sanitized ?? undefined) as any,
      };
      saveLocal(data.sessionId, cachePayload);
      return { ...data, script: sanitized } as HydrateResponse;
    } catch (e) {
      // If this was a brand-new session creation attempt, do NOT fallback to old cached session; start clean
      if (isCreateNew) {
        setSessionId(null);
        setScript(null);
        setChat([]);
        setPreferences({});
        setProjectMeta({});
        return null;
      }
      // Otherwise, fallback only for the session the caller explicitly requested.
      const sid = payload?.sessionId || null;
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
      // Optimistic: Local cache immediately for resilience (instant UI update)
      if (sessionId) {
        saveLocal(sessionId, { script: next });
      }
      // Debounced autosave (800ms as per plan)
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
    if (snapshot === lastSavedSnapshotRef.current) return; // Skip if unchanged
    lastSavedSnapshotRef.current = snapshot;
    
    // Optimistic: Show saving state immediately
    setIsSaving(true);
    setSaveError(null);
    
    try {
      // Use AbortController for request cancellation if needed
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout
      
      const res = await fetch("/api/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        signal: controller.signal,
        body: JSON.stringify({
          type: "ReplaceDocument",
          sessionId,
          baseVersion: typeof (payloadScript as any)?.version === 'number' ? (payloadScript as any).version : 0,
          source: "user",
          payload: {
            title: payloadScript?.title || 'Untitled Script',
            content: payloadScript?.content || '',
            blocks: payloadScript?.blocks || [],
            richText: (payloadScript as any)?.richText,
          }
        }),
      });
      
      clearTimeout(timeoutId);
      
      if (!res.ok) {
        if (res.status === 409) {
          try {
            const data = await res.json();
            if (typeof data?.currentVersion === 'number') {
              setScript((prev) => ({ ...(prev || {}), version: data.currentVersion }));
            }
          } catch {}
          return;
        }
        throw new Error(`Save failed: ${res.status}`);
      }
      const data = await res.json();
      if (data?.script && typeof data.script.version === 'number') {
        setScript((prev) => ({ ...(prev || {}), version: data.script.version }));
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        setSaveError(e?.message || "Failed to save");
      }
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
      metadata: sanitized?.metadata ?? script?.metadata ?? null,
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
      metadata: sanitized?.metadata ?? script?.metadata ?? null,
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
      setSessionId(null);
      setScript(null);
      setChat([]);
      setPreferences({});
      setProjectMeta({});
    } catch {}
  }, []);

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
