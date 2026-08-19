"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { sanitizeServerScript } from "@/lib/thinkforge/json";
import type { HydratedScriptSnapshot, ScriptModel } from "./useThinkForgeSession";
import {
  matchesThinkForgeDocumentIdentity,
  readThinkForgeDocumentIdentity,
  stampThinkForgeDocumentIdentity,
} from "@/lib/thinkforge/client-document-identity";

const LS_SESSION_PREFIX = "thinkforge_session_";
const DEBOUNCE_MS = 800;
const SAVE_TIMEOUT_MS = 8000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

export class ThinkForgeDocumentConflictError extends Error {
  readonly currentVersion: number | null;

  constructor(currentVersion: number | null) {
    super('A newer document version exists. Reload it or explicitly replace it before saving again.');
    this.name = 'ThinkForgeDocumentConflictError';
    this.currentVersion = currentVersion;
  }
}

function saveLocal(sessionId: string, scriptId: string, data: Partial<{ script: ScriptModel }>) {
  try {
    const key = `${LS_SESSION_PREFIX}${sessionId}_${scriptId}`;
    const prev = JSON.parse(localStorage.getItem(key) || "{}");
    localStorage.setItem(key, JSON.stringify({ ...prev, ...data }));
  } catch (e) {
    console.warn('[useThinkForgeScript] saveLocal failed:', e);
  }
}

type DocumentIdentity = { sessionId: string; scriptId: string };

function readProvidedIdentityField(
  value: unknown,
  field: keyof DocumentIdentity,
): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const carrier = value as Record<string, any>;
  const metadata = carrier.metadata && typeof carrier.metadata === 'object' && !Array.isArray(carrier.metadata)
    ? carrier.metadata as Record<string, any>
    : {};
  const candidate = carrier[field] ?? metadata[field];
  return typeof candidate === 'string' && candidate.trim().length > 0 ? candidate.trim() : null;
}

function assertCompatibleDocumentIdentity(
  value: unknown,
  expected: DocumentIdentity,
  label: string,
): void {
  const providedSessionId = readProvidedIdentityField(value, 'sessionId');
  const providedScriptId = readProvidedIdentityField(value, 'scriptId');
  if (
    (providedSessionId && providedSessionId !== expected.sessionId)
    || (providedScriptId && providedScriptId !== expected.scriptId)
  ) {
    throw new Error(`${label} targets a different document`);
  }
}

export function mergeThinkForgeScriptDocument(
  current: ScriptModel | null | undefined,
  update: ScriptModel,
  expected: DocumentIdentity,
): ScriptModel {
  assertCompatibleDocumentIdentity(current, expected, 'Current document');
  assertCompatibleDocumentIdentity(update, expected, 'Document update');
  const updateIdentity = readThinkForgeDocumentIdentity(update);
  if (!current && !updateIdentity) {
    throw new Error('Cannot create a document without a server-owned identity');
  }

  const definedUpdate = Object.fromEntries(
    Object.entries(update).filter(([, value]) => value !== undefined),
  ) as ScriptModel;

  return stampThinkForgeDocumentIdentity({
    ...(current || {}),
    ...definedUpdate,
  }, expected) as ScriptModel;
}

export function parseThinkForgeLoadedDocument(
  input: unknown,
  expected: DocumentIdentity,
): ScriptModel {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Document load returned an invalid response');
  }

  const data = input as Record<string, any>;
  if (typeof data.version !== 'number' || !Number.isFinite(data.version)) {
    throw new Error(`Document ${expected.scriptId} was not found`);
  }

  const sanitized = sanitizeServerScript(data);
  const documentType = typeof data.documentType === 'string' && data.documentType.trim().length > 0
    ? data.documentType
    : undefined;
  const contentContract = data.contentContract
    && typeof data.contentContract === 'object'
    && !Array.isArray(data.contentContract)
    ? data.contentContract as Record<string, any>
    : undefined;

  return stampThinkForgeDocumentIdentity({
    ...sanitized,
    content: typeof data.content === 'string' ? data.content : null,
    blocks: sanitized.blocks ?? null,
    richText: data.richText && typeof data.richText === 'object' && !Array.isArray(data.richText)
      ? data.richText
      : null,
    metadata: data.metadata && typeof data.metadata === 'object' && !Array.isArray(data.metadata)
      ? data.metadata
      : null,
    ...(documentType ? { documentType } : {}),
    ...(contentContract ? { contentContract } : {}),
  }, expected) as ScriptModel;
}

async function buildResponseError(response: Response, operation: string): Promise<Error> {
  let detail = '';
  try {
    const body = await response.json();
    if (typeof body?.error === 'string' && body.error.trim()) {
      detail = `: ${body.error.trim()}`;
    }
  } catch {
    // The HTTP status remains authoritative when the response has no JSON body.
  }
  return new Error(`${operation} failed (${response.status})${detail}`);
}

export function resolveHydratedScriptSnapshot(
  snapshot: HydratedScriptSnapshot | null | undefined,
  expected: { sessionId: string; scriptId: string },
): { key: string; script: ScriptModel | null } | undefined {
  if (!snapshot || snapshot.sessionId !== expected.sessionId || snapshot.scriptId !== expected.scriptId) {
    return undefined;
  }
  if (snapshot.script && !matchesThinkForgeDocumentIdentity(snapshot.script, expected)) return undefined;
  return {
    key: `${snapshot.sessionId}:${snapshot.scriptId}:${snapshot.revision}`,
    script: snapshot.script,
  };
}

export function useThinkForgeScript(
  sessionId: string | null,
  scriptId: string | null,
  hydratedScriptSnapshot?: HydratedScriptSnapshot | null,
) {
  const [script, setScript] = useState<ScriptModel | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [loadAttempt, setLoadAttempt] = useState(0);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedSnapshotRef = useRef<string>("");
  const currentAbortControllerRef = useRef<AbortController | null>(null);
  const pendingSaveRef = useRef<ScriptModel | null>(null);
  const isSavingRef = useRef(false);
  const sessionIdRef = useRef<string | null>(sessionId);
  const scriptIdRef = useRef<string | null>(scriptId);
  const consumedHydrationSnapshotsRef = useRef(new Set<string>());

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

  // Load the exact document identity. A fresh hydrate snapshot wins once; cache paints while the server revalidates.
  useEffect(() => {
    sessionIdRef.current = sessionId;
    scriptIdRef.current = scriptId;
    if (!sessionId) {
      setScript(null);
      setIsLoading(false);
      setLoadError(null);
      lastSavedSnapshotRef.current = "";
      resetPendingSaves();
      return;
    }

    // Clear stale script immediately when switching
    setScript(null);
    setIsLoading(true);
    setLoadError(null);
    lastSavedSnapshotRef.current = "";
    resetPendingSaves();

    const effectiveScriptId = scriptId || 'default';
    const activeIdentity = { sessionId, scriptId: effectiveScriptId };
    const hydratedSnapshot = resolveHydratedScriptSnapshot(hydratedScriptSnapshot, activeIdentity);
    if (hydratedSnapshot && !consumedHydrationSnapshotsRef.current.has(hydratedSnapshot.key)) {
      consumedHydrationSnapshotsRef.current.add(hydratedSnapshot.key);
      setScript(hydratedSnapshot.script);
      setIsLoading(false);
      setLoadError(null);
      lastSavedSnapshotRef.current = JSON.stringify(hydratedSnapshot.script || {});
      if (hydratedSnapshot.script) {
        saveLocal(sessionId, effectiveScriptId, { script: hydratedSnapshot.script });
      }
      return;
    }

    let cachedScript: ScriptModel | null = null;

    try {
      const key = `${LS_SESSION_PREFIX}${sessionId}_${effectiveScriptId}`;
      const raw = localStorage.getItem(key);
      if (raw) {
        const cached = JSON.parse(raw);
        if (cached?.script) {
          cachedScript = stampThinkForgeDocumentIdentity(
            cached.script as Record<string, any>,
            activeIdentity,
          ) as ScriptModel;
        }
      }
    } catch {
      // Ignore malformed cache entries. Server remains the source of truth.
    }

    if (cachedScript) {
      setScript(cachedScript);
      setIsLoading(false);
      lastSavedSnapshotRef.current = JSON.stringify(cachedScript);
    }

    let cancelled = false;
    (async () => {
      try {
        const url = `/api/services/thinkforge/script/blocks?sessionId=${encodeURIComponent(sessionId)}&scriptId=${encodeURIComponent(effectiveScriptId)}`;
        const res = await fetch(url, { cache: 'no-store' });
        if (cancelled) return;
        if (!res.ok) throw await buildResponseError(res, 'Document load');
        const data = await res.json();
        if (cancelled) return;
        if (sessionIdRef.current !== sessionId || scriptIdRef.current !== scriptId) return;

        const identifiedServerScript = parseThinkForgeLoadedDocument(data, activeIdentity);
        setScript(identifiedServerScript);
        setLoadError(null);
        lastSavedSnapshotRef.current = JSON.stringify(identifiedServerScript);
        saveLocal(sessionId, effectiveScriptId, { script: identifiedServerScript });
      } catch (error) {
        if (!cancelled && sessionIdRef.current === sessionId && scriptIdRef.current === scriptId) {
          const message = error instanceof Error ? error.message : 'Document load failed';
          setLoadError(message);
          if (cachedScript) {
            setScript(cachedScript);
            lastSavedSnapshotRef.current = JSON.stringify(cachedScript);
          } else {
            setScript(null);
            lastSavedSnapshotRef.current = "";
          }
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId, scriptId, hydratedScriptSnapshot, loadAttempt, resetPendingSaves]);

  const retryLoad = useCallback(() => {
    if (!sessionId) return;
    setLoadError(null);
    setLoadAttempt((attempt) => attempt + 1);
  }, [sessionId]);

  const performSave = useCallback(async (
    scriptToSave: ScriptModel | null,
    attempt: number = 1
  ): Promise<boolean> => {
    if (!sessionId) return false;
    const targetSessionId = sessionId;
    const targetScriptId = scriptId || 'default';
    if (sessionIdRef.current !== targetSessionId) return false;
    if ((scriptIdRef.current || 'default') !== targetScriptId) return false;

    const activeIdentity = { sessionId: targetSessionId, scriptId: targetScriptId };
    if (!scriptToSave || !matchesThinkForgeDocumentIdentity(scriptToSave, activeIdentity)) {
      throw new Error('Cannot save before the server-owned document is loaded');
    }
    const identifiedScript = mergeThinkForgeScriptDocument(scriptToSave, scriptToSave, activeIdentity);

    const snapshot = JSON.stringify(identifiedScript);
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
          sessionId: targetSessionId,
          baseVersion: typeof identifiedScript.version === 'number' ? identifiedScript.version : 0,
          source: "user",
          payload: {
            scriptId: targetScriptId,
            title: identifiedScript.title || 'Untitled Script',
            content: identifiedScript.content || '',
            blocks: identifiedScript.blocks || [],
            richText: identifiedScript.richText ?? null,
            metadata: identifiedScript.metadata ?? undefined,
            documentType: identifiedScript.documentType,
            contentContract: identifiedScript.contentContract,
          }
        }),
      });
      
      clearTimeout(timeoutId);
      if (sessionIdRef.current !== targetSessionId) return false;
      if ((scriptIdRef.current || 'default') !== targetScriptId) return false;

      
      if (!res.ok) {
        if (res.status === 409) {
          let currentVersion: number | null = null;
          try {
            const data = await res.json();
            if (typeof data?.currentVersion === 'number') {
              currentVersion = data.currentVersion;
            }
          } catch {
            // The HTTP 409 remains authoritative even if its diagnostic body is malformed.
          }
          throw new ThinkForgeDocumentConflictError(currentVersion);
        }
        throw await buildResponseError(res, 'Document save');
      }

      const data = await res.json();
      if (data?.script && typeof data.script.version === 'number') {
        const merged = mergeThinkForgeScriptDocument(identifiedScript, data.script, activeIdentity);
        setScript(merged);
        lastSavedSnapshotRef.current = JSON.stringify(merged);
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
      if (e instanceof ThinkForgeDocumentConflictError) {
        throw e;
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
  }, [sessionId, scriptId]);

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
    let conflictDetected = false;
    
    try {
      await performSave(payloadScript);
    } catch (e: any) {
      conflictDetected = e instanceof ThinkForgeDocumentConflictError;
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
      if (conflictDetected) {
        pendingSaveRef.current = null;
      } else if (pendingSaveRef.current) {
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
  }, [sessionId, scriptId, script, performSave]);

  const setScriptAndQueueSave = useCallback((updater: ScriptModel | ((prev: ScriptModel | null) => ScriptModel)) => {
    setScript((prev) => {
      if (!sessionId || sessionIdRef.current !== sessionId || scriptIdRef.current !== scriptId) return prev;
      const rawNext = typeof updater === "function" ? (updater as any)(prev) : updater;
      const activeScriptId = scriptId || 'default';
      let next: ScriptModel;
      try {
        next = mergeThinkForgeScriptDocument(prev, rawNext, {
          sessionId,
          scriptId: activeScriptId,
        });
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : 'Document update was rejected');
        return prev;
      }
      
      // Always save to local storage first (synchronous, reliable)
      saveLocal(sessionId, activeScriptId, { script: next });
      
      // Clear any pending debounced save
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      
      // Queue server save with debounce
      const scheduledSessionId = sessionId;
      const scheduledScriptId = activeScriptId;
      saveTimerRef.current = setTimeout(() => {
        if (sessionIdRef.current !== scheduledSessionId) return;
        if ((scriptIdRef.current || 'default') !== scheduledScriptId) return;
        void autosave(next);
      }, DEBOUNCE_MS);
      
      return next;
    });
  }, [sessionId, scriptId, autosave]);

  // Update script state without triggering a server save
  // Use this when the save is already handled elsewhere (e.g., by ScriptEditor)
  const setScriptWithoutSave = useCallback((updater: ScriptModel | ((prev: ScriptModel | null) => ScriptModel)) => {
    setScript((prev) => {
      if (!sessionId || sessionIdRef.current !== sessionId || scriptIdRef.current !== scriptId) return prev;
      const rawNext = typeof updater === "function" ? (updater as any)(prev) : updater;
      const activeScriptId = scriptId || 'default';
      const activeIdentity = { sessionId, scriptId: activeScriptId };
      let next: ScriptModel;
      try {
        next = mergeThinkForgeScriptDocument(prev, rawNext, activeIdentity);
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : 'Document update was rejected');
        return prev;
      }
      
      // Save to local storage for consistency
      saveLocal(sessionId, activeScriptId, { script: next });
      
      // Update lastSavedSnapshot to prevent autosave from saving again
      lastSavedSnapshotRef.current = JSON.stringify(next || {});
      setLoadError(null);
      
      return next;
    });
  }, [sessionId, scriptId]);

  const resetSessionState = useCallback(() => {
    resetPendingSaves();
    setScript(null);
    setIsLoading(true);
    setLoadError(null);
    lastSavedSnapshotRef.current = "";
    setSaveError(null);
    setRetryCount(0);
  }, [resetPendingSaves]);

  const runEdit = useCallback(async (instruction: string) => {
    if (!sessionId || !script) {
      throw new Error('Open a server-backed document before editing');
    }
    const activeIdentity = { sessionId, scriptId: scriptId || 'default' };
    if (!matchesThinkForgeDocumentIdentity(script, activeIdentity)) {
      throw new Error('The active document identity is stale');
    }
    const res = await fetch("/api/services/thinkforge/script/edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ instruction, script, sessionId, scriptId: scriptId || 'default' }),
    });
    if (!res.ok) throw await buildResponseError(res, 'Document edit');
    const data = await res.json();
    const sanitized = sanitizeServerScript(data);
    const updated = mergeThinkForgeScriptDocument(script, {
      title: data.title !== undefined ? sanitized.title : undefined,
      outline: data.outline !== undefined ? sanitized.outline : undefined,
      content: typeof data.content === 'string' ? data.content : undefined,
      blocks: Array.isArray(data.blocks) ? sanitized.blocks : undefined,
      richText: data.richText && typeof data.richText === 'object' ? data.richText : undefined,
      version: typeof data.version === 'number' ? data.version : undefined,
      metadata: data.metadata && typeof data.metadata === 'object'
        ? { ...(script.metadata || {}), ...data.metadata }
        : undefined,
      documentType: typeof data.documentType === 'string' ? data.documentType : undefined,
      contentContract: data.contentContract && typeof data.contentContract === 'object'
        ? data.contentContract
        : undefined,
    }, activeIdentity);
    setScriptAndQueueSave(updated);
    return updated;
  }, [script, sessionId, scriptId, setScriptAndQueueSave]);

  const runEditBlocks = useCallback(async (instruction: string, selection?: string, indices?: number[]) => {
    if (!sessionId || !script) {
      throw new Error('Open a server-backed document before editing');
    }
    const activeIdentity = { sessionId, scriptId: scriptId || 'default' };
    if (!matchesThinkForgeDocumentIdentity(script, activeIdentity)) {
      throw new Error('The active document identity is stale');
    }
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
    if (!res.ok) throw await buildResponseError(res, 'Block edit');
    const data = await res.json();
    const sanitized = sanitizeServerScript(data);
    const updated = mergeThinkForgeScriptDocument(script, {
      title: data.title !== undefined ? sanitized.title : undefined,
      outline: data.outline !== undefined ? sanitized.outline : undefined,
      content: typeof data.content === 'string' ? data.content : undefined,
      blocks: Array.isArray(data.blocks) ? sanitized.blocks : undefined,
      richText: data.richText && typeof data.richText === 'object' ? data.richText : undefined,
      version: typeof data.version === 'number' ? data.version : undefined,
      metadata: data.metadata && typeof data.metadata === 'object'
        ? { ...(script.metadata || {}), ...data.metadata }
        : undefined,
      documentType: typeof data.documentType === 'string' ? data.documentType : undefined,
      contentContract: data.contentContract && typeof data.contentContract === 'object'
        ? data.contentContract
        : undefined,
    }, activeIdentity);
    setScriptAndQueueSave(updated);
    return updated;
  }, [script, sessionId, scriptId, setScriptAndQueueSave]);

  const importScript = useCallback((data: any) => {
    try {
      if (!sessionId || !script) {
        throw new Error('Open a server-backed document before importing content');
      }
      const activeIdentity = { sessionId, scriptId: scriptId || 'default' };
      if (!matchesThinkForgeDocumentIdentity(script, activeIdentity)) {
        throw new Error('The active document identity is stale');
      }
      const scriptLike: ScriptModel = {
        title: typeof data?.title === 'string' ? data.title : (script?.title ?? 'Untitled Script'),
        outline: null,
        content: null,
        blocks: Array.isArray(data?.blocks) ? data.blocks : [],
        richText: null,
      };
      const sanitized = sanitizeServerScript(scriptLike) as ScriptModel;
      const imported = mergeThinkForgeScriptDocument(script, {
        title: sanitized.title,
        outline: null,
        content: null,
        blocks: sanitized.blocks,
        richText: null,
      }, activeIdentity);
      setScriptAndQueueSave(imported);
      return { ok: true, applied: imported } as const;
    } catch (e: any) {
      return { ok: false, error: e?.message || 'Invalid script JSON' } as const;
    }
  }, [script, sessionId, scriptId, setScriptAndQueueSave]);

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
    loadError,
    saveError,
    retryCount,
    retryLoad,
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
