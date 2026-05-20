"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { sanitizeServerScript } from "@/lib/thinkforge/json";
import type { ScriptModel } from "./useThinkForgeSession";

const LS_SESSION_PREFIX = "thinkforge_session_";
const DEBOUNCE_MS = 800;
const SAVE_TIMEOUT_MS = 8000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

function saveLocal(sessionId: string, scriptId: string, data: Partial<{ script: ScriptModel }>) {
  try {
    const key = `${LS_SESSION_PREFIX}${sessionId}_${scriptId}`;
    const prev = JSON.parse(localStorage.getItem(key) || "{}");
    localStorage.setItem(key, JSON.stringify({ ...prev, ...data }));
  } catch (e) {
    console.warn('[useThinkForgeScript] saveLocal failed:', e);
  }
}

export function useThinkForgeScript(sessionId: string | null, scriptId: string | null) {
  const [script, setScript] = useState<ScriptModel | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedSnapshotRef = useRef<string>("");
  const currentAbortControllerRef = useRef<AbortController | null>(null);
  const pendingSaveRef = useRef<ScriptModel | null>(null);
  const isSavingRef = useRef(false);
  const sessionIdRef = useRef<string | null>(sessionId);
  const scriptIdRef = useRef<string | null>(scriptId);

  const resetPendingSaves = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (currentAbortControllerRef.current) {
      currentAbortControllerRef.current.abort();
      currentAbortControllerRef.current = null;
    }
    pendingSaveRef.current = null;
    isSavingRef.current = false;
    setIsSaving(false);
  }, []);

  // Load script from local storage (then server) when sessionId/scriptId changes
  useEffect(() => {
    sessionIdRef.current = sessionId;
    scriptIdRef.current = scriptId;
    if (!sessionId) {
      setScript(null);
      setIsLoading(false);
      lastSavedSnapshotRef.current = "";
      resetPendingSaves();
      return;
    }

    // Clear stale script immediately when switching
    setScript(null);
    setIsLoading(true);
    lastSavedSnapshotRef.current = "";
    resetPendingSaves();

    const effectiveScriptId = scriptId || 'default';
    let foundLocal = false;

    // Try to load script from local storage first
    try {
      const key = `${LS_SESSION_PREFIX}${sessionId}_${effectiveScriptId}`;
      const raw = localStorage.getItem(key);
      if (raw) {
        const cached = JSON.parse(raw);
        if (cached?.script && cached.script.title && cached.script.title !== 'Untitled Script') {
          setScript(cached.script);
          setIsLoading(false);
          lastSavedSnapshotRef.current = JSON.stringify(cached.script);
          foundLocal = true;
        }
      }
    } catch {
      // Ignore errors
    }

    // If no valid local cache, fetch from server to get the real title & content
    if (!foundLocal) {
      let cancelled = false;
      (async () => {
        try {
          const url = `/api/services/thinkforge/script/blocks?sessionId=${encodeURIComponent(sessionId)}&scriptId=${encodeURIComponent(effectiveScriptId)}`;
          const res = await fetch(url, { cache: 'no-store' });
          if (!res.ok || cancelled) return;
          const data = await res.json();
          if (cancelled) return;
          if (sessionIdRef.current !== sessionId || scriptIdRef.current !== scriptId) return;

          const serverScript: ScriptModel = {
            title: data.title || null,
            outline: null,
            content: data.content || null,
            blocks: data.blocks || null,
            version: data.version,
          };
          setScript(serverScript);
          lastSavedSnapshotRef.current = JSON.stringify(serverScript);
          saveLocal(sessionId, effectiveScriptId, { script: serverScript });
        } catch {
          // Silent - ScriptEditor will also try to load from API
        } finally {
          if (!cancelled) setIsLoading(false);
        }
      })();
      return () => { cancelled = true; };
    }
  }, [sessionId, scriptId, resetPendingSaves]);

  const performSave = useCallback(async (
    scriptToSave: ScriptModel | null,
    attempt: number = 1
  ): Promise<boolean> => {
    if (!sessionId || sessionIdRef.current !== sessionId) return false;
    if (scriptIdRef.current !== scriptId) return false;
    
    const snapshot = JSON.stringify(scriptToSave || {});
    if (snapshot === lastSavedSnapshotRef.current) return true; // Already saved
    
    // Cancel any in-flight save
    if (currentAbortControllerRef.current) {
      currentAbortControllerRef.current.abort();
    }
    
    const controller = new AbortController();
    currentAbortControllerRef.current = controller;
    
    try {
      const timeoutId = setTimeout(() => controller.abort(), SAVE_TIMEOUT_MS);
      
      const res = await fetch("/api/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        signal: controller.signal,
        body: JSON.stringify({
          type: "ReplaceDocument",
          sessionId,
          baseVersion: typeof (scriptToSave as any)?.version === 'number' ? (scriptToSave as any).version : 0,
          source: "user",
          payload: {
            scriptId: scriptId || 'default',
            title: scriptToSave?.title || 'Untitled Script',
            content: scriptToSave?.content || '',
            blocks: scriptToSave?.blocks || [],
            richText: (scriptToSave as any)?.richText
          }
        }),
      });
      
      clearTimeout(timeoutId);
      
      if (!res.ok) {
        if (res.status === 409) {
          try {
            const data = await res.json();
            if (typeof data?.currentVersion === 'number') {
              const merged = { ...(scriptToSave || {}), version: data.currentVersion } as any;
              setScript(merged);
            }
          } catch (e) {
            console.warn('[useThinkForgeScript] Failed to parse 409 conflict response:', e);
          }
          return false;
        }
        throw new Error(`Save failed: ${res.status}`);
      }

      const data = await res.json();
      if (data?.script && typeof data.script.version === 'number') {
        const merged = { ...(scriptToSave || {}), version: data.script.version } as any;
        setScript(merged);
        lastSavedSnapshotRef.current = JSON.stringify(merged || {});
      } else {
        // Success - update last saved snapshot
        lastSavedSnapshotRef.current = snapshot;
      }
      setRetryCount(0);
      return true;
    } catch (e: any) {
      if (e.name === 'AbortError') {
        // Aborted - might have been cancelled by a newer save
        return false;
      }
      
      // Retry logic
      if (attempt < MAX_RETRIES) {
        setRetryCount(attempt);
        // Wait before retry with exponential backoff
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * attempt));
        return performSave(scriptToSave, attempt + 1);
      }
      
      // Max retries reached
      throw e;
    }
  }, [sessionId]);

  const autosave = useCallback(async (scriptToSave?: ScriptModel | null) => {
    if (!sessionId || sessionIdRef.current !== sessionId) return;
    if (scriptIdRef.current !== scriptId) return;
    const payloadScript = scriptToSave ?? script;
    
    // If already saving, queue this save for later
    if (isSavingRef.current) {
      pendingSaveRef.current = payloadScript;
      return;
    }
    
    isSavingRef.current = true;
    setIsSaving(true);
    setSaveError(null);
    
    try {
      await performSave(payloadScript);
    } catch (e: any) {
      setSaveError(e?.message || "Failed to save");
      // Store in local storage as backup
      if (sessionId && payloadScript) {
        saveLocal(sessionId, scriptId || 'default', { script: payloadScript });
      }
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
      currentAbortControllerRef.current = null;
      
      // Check if there's a pending save
      if (pendingSaveRef.current) {
        const pendingScript = pendingSaveRef.current;
        pendingSaveRef.current = null;
        // Schedule the pending save
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        const scheduledSessionId = sessionId;
        saveTimerRef.current = setTimeout(() => {
          if (sessionIdRef.current !== scheduledSessionId) return;
          void autosave(pendingScript);
        }, 100); // Short delay to prevent immediate re-save
      }
    }
  }, [sessionId, script, performSave]);

  const setScriptAndQueueSave = useCallback((updater: ScriptModel | ((prev: ScriptModel | null) => ScriptModel)) => {
    setScript((prev) => {
      const next = typeof updater === "function" ? (updater as any)(prev) : updater;
      
      // Always save to local storage first (synchronous, reliable)
      if (sessionId) {
        saveLocal(sessionId, scriptId || 'default', { script: next });
      }
      
      // Clear any pending debounced save
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      
      // Queue server save with debounce
      const scheduledSessionId = sessionId;
      saveTimerRef.current = setTimeout(() => {
        if (sessionIdRef.current !== scheduledSessionId) return;
        void autosave(next);
      }, DEBOUNCE_MS);
      
      return next;
    });
  }, [sessionId, scriptId, autosave]);

  // Update script state without triggering a server save
  // Use this when the save is already handled elsewhere (e.g., by ScriptEditor)
  const setScriptWithoutSave = useCallback((updater: ScriptModel | ((prev: ScriptModel | null) => ScriptModel)) => {
    setScript((prev) => {
      const next = typeof updater === "function" ? (updater as any)(prev) : updater;
      
      // Save to local storage for consistency
      if (sessionId) {
        saveLocal(sessionId, scriptId || 'default', { script: next });
      }
      
      // Update lastSavedSnapshot to prevent autosave from saving again
      lastSavedSnapshotRef.current = JSON.stringify(next || {});
      
      return next;
    });
  }, [sessionId, scriptId]);

  const resetSessionState = useCallback(() => {
    resetPendingSaves();
    setScript(null);
    setIsLoading(true);
    lastSavedSnapshotRef.current = "";
    setSaveError(null);
    setRetryCount(0);
  }, [resetPendingSaves]);

  const runEdit = useCallback(async (instruction: string) => {
    const res = await fetch("/api/services/thinkforge/script/edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ instruction, script, sessionId, scriptId: scriptId || 'default' }),
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
  }, [script, sessionId, scriptId, setScriptAndQueueSave]);

  const runEditBlocks = useCallback(async (instruction: string, selection?: string, indices?: number[]) => {
    const payload = {
      instruction,
      script,
      sessionId,
      scriptId: scriptId || 'default',
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
    const sanitized = sanitizeServerScript(data);
    const nextBlocks = sanitized?.blocks ?? script?.blocks ?? null;
    const updated: ScriptModel = {
      title: sanitized?.title ?? script?.title ?? null,
      outline: sanitized?.outline ?? script?.outline ?? null,
      content: sanitized?.content ?? script?.content ?? null,
      blocks: nextBlocks,
      metadata: sanitized?.metadata ?? script?.metadata ?? null,
    };
    setScriptAndQueueSave(updated);
    return sanitized;
  }, [script, sessionId, scriptId, setScriptAndQueueSave]);

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

  const replaceBlocks = useCallback((blocks: any[], title?: string) => {
    return importScript({ title: title ?? script?.title, blocks });
  }, [importScript, script?.title]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (currentAbortControllerRef.current) {
        currentAbortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    script,
    isLoading,
    isSaving,
    saveError,
    retryCount,
    setScriptAndQueueSave,
    setScriptWithoutSave,
    autosave,
    runEdit,
    runEditBlocks,
    importScript,
    replaceBlocks,
    resetSessionState,
  } as const;
}

