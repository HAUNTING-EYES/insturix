"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/hooks/use-toast";
import { sanitizeServerScript, type ScriptModel } from "@/lib/thinkforge/json";
import { stampThinkForgeDocumentIdentity } from "@/lib/thinkforge/client-document-identity";

export type Block = any;
export type { ScriptModel } from "@/lib/thinkforge/json";

const LS_CURRENT_SESSION = "thinkforge_current_session";
const LS_SESSION_PREFIX = "thinkforge_session_";
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours TTL for cached sessions

export type HydratePayload = {
  userId?: string;
  sessionId?: string;
  scriptId?: string;
  projectMeta?: Record<string, any>;
  /** Initial resume must prove the session against the server before reopening it. */
  allowCachedFallback?: boolean;
};

export type HydrateResponse = {
  userId: string;
  sessionId: string;
  preferences: Record<string, any>;
  projectMeta: Record<string, any>;
  script?: ScriptModel | null;
  chat: any[];
};

export type HydratedScriptSnapshot = {
  sessionId: string;
  scriptId: string;
  revision: number;
  script: ScriptModel | null;
};

export type HydratedChatSnapshot = {
  sessionId: string;
  threadId: 'default';
  messages: any[];
};

type CachedSession = Partial<HydrateResponse & { script: ScriptModel }> & {
  cachedAt?: number;
};

function saveLocal(sessionId: string, data: Partial<HydrateResponse & { script: ScriptModel }>) {
  try {
    const key = `${LS_SESSION_PREFIX}${sessionId}`;
    const prev = JSON.parse(localStorage.getItem(key) || "{}");
    localStorage.setItem(key, JSON.stringify({ ...prev, ...data, cachedAt: Date.now() }));
  } catch (e) {
    console.error('[useThinkForgeSession] saveLocal failed:', e);
  }
}

function getLocal(sessionId: string): Partial<HydrateResponse & { script: ScriptModel }> | null {
  try {
    const key = `${LS_SESSION_PREFIX}${sessionId}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    
    const cached: CachedSession = JSON.parse(raw);
    
    if (cached.cachedAt && Date.now() - cached.cachedAt > SESSION_TTL_MS) {
      console.warn(`[useThinkForgeSession] Discarding stale cached session ${sessionId} (expired after 24h)`);
      localStorage.removeItem(key);
      return null;
    }
    
    return cached;
  } catch (e) {
    console.error('[useThinkForgeSession] getLocal failed:', e);
    return null;
  }
}

export function useThinkForgeSession() {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<Record<string, any>>({});
  const [projectMeta, setProjectMeta] = useState<Record<string, any>>({});
  const [isHydrating, setIsHydrating] = useState(false);
  const [hydratedScriptSnapshot, setHydratedScriptSnapshot] = useState<HydratedScriptSnapshot | null>(null);
  const [hydratedChatSnapshot, setHydratedChatSnapshot] = useState<HydratedChatSnapshot | null>(null);
  const [restoredSessionId, setRestoredSessionId] = useState<string | null>(null);
  const [isRestoringCurrentSession, setIsRestoringCurrentSession] = useState(true);
  const hydrationRevisionRef = useRef(0);
  const hydrationAbortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => {
    hydrationAbortControllerRef.current?.abort();
  }, []);

  const hydrate = useCallback(async (payload?: HydratePayload): Promise<HydrateResponse | null> => {
    hydrationAbortControllerRef.current?.abort();
    const controller = new AbortController();
    hydrationAbortControllerRef.current = controller;
    setIsHydrating(true);
    setHydratedScriptSnapshot(null);
    const isCreateNew = !!(payload && !payload.sessionId && payload.projectMeta);

    // If we're explicitly creating a new session, clear any stale state before requesting
    if (isCreateNew) {
      try {
        localStorage.removeItem(LS_CURRENT_SESSION);
      } catch (e) {
        console.warn('[useThinkForgeSession] Failed to clear localStorage on new session:', e);
      }
      setSessionId(null);
      setPreferences({});
      setProjectMeta({});
      setHydratedChatSnapshot(null);
      setRestoredSessionId(null);
    }

    try {
      const res = await fetch("/api/services/thinkforge/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        signal: controller.signal,
        body: JSON.stringify(payload || {}),
      });
      if (!res.ok) {
        if (isCreateNew && res.status === 429) {
          try {
            const data = await res.json();
            const message = data?.error || "Max ThinkForge sessions reached. Please upgrade your plan.";
            toast({
              title: "Limit reached",
              description: message,
              variant: "destructive",
            });
          } catch (e) {
            console.error('[useThinkForgeSession] Failed to parse 429 response:', e);
            toast({
              title: "Limit reached",
              description: "Max ThinkForge sessions reached. Please upgrade your plan.",
              variant: "destructive",
            });
          }
          router.push('/dashboard');
          return null;
        }
        throw new Error(`Hydrate failed: ${res.status}`);
      }
      const rawData: HydrateResponse = await res.json();
      if (controller.signal.aborted || hydrationAbortControllerRef.current !== controller) return null;

      const effectiveScriptId = rawData.script?.scriptId || payload?.scriptId || 'default';
      const sanitizedScript = rawData.script
        ? stampThinkForgeDocumentIdentity({
            ...sanitizeServerScript(rawData.script),
            content: typeof rawData.script.content === 'string' ? rawData.script.content : null,
            richText: rawData.script.richText ?? null,
            documentType: rawData.script.documentType,
            contentContract: rawData.script.contentContract,
          }, {
            sessionId: rawData.sessionId,
            scriptId: effectiveScriptId,
          }) as ScriptModel
        : null;
      const data: HydrateResponse = { ...rawData, script: sanitizedScript };
      setSessionId(data.sessionId);
      setPreferences(data.preferences || {});
      setProjectMeta(data.projectMeta || {});
      hydrationRevisionRef.current += 1;
      setHydratedScriptSnapshot({
        sessionId: data.sessionId,
        scriptId: effectiveScriptId,
        revision: hydrationRevisionRef.current,
        script: sanitizedScript,
      });
      setHydratedChatSnapshot({
        sessionId: data.sessionId,
        threadId: 'default',
        messages: Array.isArray(data.chat) ? data.chat : [],
      });
      
      localStorage.setItem(LS_CURRENT_SESSION, data.sessionId);
      const cachePayload: Partial<HydrateResponse & { script: ScriptModel }> = {
        ...data,
        script: data.script ?? undefined as any,
      };
      saveLocal(data.sessionId, cachePayload);
      return data;
    } catch (e) {
      if (controller.signal.aborted || hydrationAbortControllerRef.current !== controller) return null;
      console.error('[useThinkForgeSession] Hydration error:', e);
      if (isCreateNew) {
        try { localStorage.removeItem(LS_CURRENT_SESSION); } catch (lsErr) { console.warn('[useThinkForgeSession] localStorage cleanup failed:', lsErr); }
        setSessionId(null);
        setPreferences({});
        setProjectMeta({});
        return null;
      }
      const sid = payload?.sessionId || localStorage.getItem(LS_CURRENT_SESSION) || null;
      if (sid && payload?.allowCachedFallback !== false) {
        const cached = getLocal(sid);
        if (cached) {
          setSessionId(sid);
          if (Array.isArray(cached.chat)) {
            setHydratedChatSnapshot({ sessionId: sid, threadId: 'default', messages: cached.chat });
          }
          setPreferences(cached.preferences || {});
          setProjectMeta(cached.projectMeta || {});
        }
      }
      return null;
    } finally {
      if (hydrationAbortControllerRef.current === controller) {
        hydrationAbortControllerRef.current = null;
        setIsHydrating(false);
      }
    }
  }, [router]);

  useEffect(() => {
    let cancelled = false;

    const restoreCurrentSession = async () => {
      let lastSessionId: string | null = null;
      try {
        lastSessionId = localStorage.getItem(LS_CURRENT_SESSION)?.trim() || null;
      } catch (error) {
        console.error('[useThinkForgeSession] Failed to read the last session:', error);
      }

      try {
        if (!lastSessionId) return;

        const data = await hydrate({
          sessionId: lastSessionId,
          scriptId: 'default',
          allowCachedFallback: false,
        });

        if (!cancelled && data?.sessionId === lastSessionId) {
          setRestoredSessionId(data.sessionId);
        }
      } finally {
        if (!cancelled) setIsRestoringCurrentSession(false);
      }
    };

    void restoreCurrentSession();
    return () => {
      cancelled = true;
    };
  }, [hydrate]);

  const closeSession = useCallback(async () => {
    try {
      hydrationAbortControllerRef.current?.abort();
      hydrationAbortControllerRef.current = null;
      if (sessionId) {
        localStorage.removeItem(LS_CURRENT_SESSION);
        try { localStorage.removeItem(`${LS_SESSION_PREFIX}${sessionId}`); } catch (e) { console.warn('[useThinkForgeSession] Failed to remove session cache:', e); }
      }
      setSessionId(null);
      setPreferences({});
      setProjectMeta({});
      setHydratedScriptSnapshot(null);
      setHydratedChatSnapshot(null);
      setRestoredSessionId(null);
      setIsHydrating(false);
    } catch (e) {
      console.error('[useThinkForgeSession] closeSession error:', e);
    }
  }, [sessionId]);

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

  const verifySession = useCallback(async (sid?: string): Promise<{ valid: boolean; error?: string }> => {
    const targetSessionId = sid || sessionId;
    if (!targetSessionId) {
      return { valid: false, error: 'No session to verify' };
    }

    try {
      const res = await fetch(`/api/services/thinkforge/session/verify?sessionId=${encodeURIComponent(targetSessionId)}`, {
        method: 'GET',
        cache: 'no-store',
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const errorMsg = data?.error || `Verification failed: ${res.status}`;
        console.warn(`[useThinkForgeSession] Session verification failed for ${targetSessionId}:`, errorMsg);
        
        // If session doesn't exist, clear local state
        if (res.status === 404) {
          try {
            localStorage.removeItem(LS_CURRENT_SESSION);
            localStorage.removeItem(`${LS_SESSION_PREFIX}${targetSessionId}`);
          } catch (e) {
            console.warn('[useThinkForgeSession] Failed to clear invalid session from localStorage:', e);
          }
          if (sessionId === targetSessionId) {
            setSessionId(null);
            setPreferences({});
            setProjectMeta({});
            setHydratedScriptSnapshot(null);
            setHydratedChatSnapshot(null);
          }
        }
        
        return { valid: false, error: errorMsg };
      }

      const data = await res.json();
      return { valid: data.valid === true };
    } catch (e: any) {
      console.error('[useThinkForgeSession] Session verification error:', e);
      return { valid: false, error: e?.message || 'Verification request failed' };
    }
  }, [sessionId]);

  return {
    sessionId,
    preferences,
    projectMeta,
    setProjectMeta,
    hydratedScriptSnapshot,
    hydratedChatSnapshot,
    isHydrating,
    restoredSessionId,
    isRestoringCurrentSession,
    hydrate,
    closeSession,
    verifySession,
    getSessionsCount,
    getSessionsList,
  } as const;
}

