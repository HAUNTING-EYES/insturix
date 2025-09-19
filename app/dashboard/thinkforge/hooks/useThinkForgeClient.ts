"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
    try {
      const res = await fetch("/api/services/thinkforge/hydrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify(payload || {}),
      });
      if (!res.ok) throw new Error(`Hydrate failed: ${res.status}`);
      const data: HydrateResponse = await res.json();
      setSessionId(data.sessionId);
      setScript(data.script || null);
      setChat(data.chat || []);
      setPreferences(data.preferences || {});
      setProjectMeta(data.projectMeta || {});
      // Cache
      localStorage.setItem(LS_CURRENT_SESSION, data.sessionId);
      // Normalize null script to undefined for typing
      const cachePayload: Partial<HydrateResponse & { script: ScriptModel }> = {
        ...data,
        script: (data.script ?? undefined) as any,
      };
      saveLocal(data.sessionId, cachePayload);
      return data;
    } catch (e) {
      // Fallback to local cache if present
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
    // Apply returned script and queue autosave
    const updated: ScriptModel = {
      title: data?.title ?? script?.title ?? null,
      outline: data?.outline ?? script?.outline ?? null,
      content: data?.content ?? script?.content ?? null,
      blocks: data?.blocks ?? script?.blocks ?? null,
    };
    setScriptAndQueueSave(updated);
    return data;
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

  // Cleanup timer on unmount
  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); }, []);

  return {
    // state
    sessionId, script, chat, preferences, projectMeta,
    isHydrating, isSaving, saveError,
    // actions
    hydrate, setScriptAndQueueSave, autosave, runEdit, refreshChat,
    getSessionsCount, getSessionsList,
  } as const;
}
