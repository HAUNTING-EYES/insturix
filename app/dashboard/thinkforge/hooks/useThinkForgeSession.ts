"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/hooks/use-toast";
import { sanitizeServerScript } from "@/lib/thinkforge/json";

// Canonical type definitions - single source of truth for session types
export type Block = any;
export type ScriptModel = {
  title?: string | null;
  outline?: string | null;
  content?: string | null;
  blocks?: Block[] | null;
  version?: number;
  metadata?: {
    workflow?: string;
    thoughts?: string;
    duration_ms?: number;
    canonicalFormat?: 'CIR' | 'canonical';
    agent_steps?: Array<{
      agent?: string;
      step?: string;
      output?: string;
    }>;
    quality_metrics?: {
      score?: number;
      feedback?: string;
    };
    selectionEdit?: {
      applySurgically?: boolean;
      editedBlocks?: any[];
      originalRange?: { from: number; to: number };
    };
  } | null;
};

const LS_CURRENT_SESSION = "thinkforge_current_session";
const LS_SESSION_PREFIX = "thinkforge_session_";
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours TTL for cached sessions

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

type CachedSession = Partial<HydrateResponse & { script: ScriptModel }> & {
  cachedAt?: number;
};

function saveLocal(sessionId: string, data: Partial<HydrateResponse & { script: ScriptModel }>) {
  try {
    const key = `${LS_SESSION_PREFIX}${sessionId}`;
    const prev = JSON.parse(localStorage.getItem(key) || "{}");
    // STEP 2: Add cachedAt timestamp for TTL validation
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
    
    // STEP 2: TTL validation - discard stale sessions older than 24 hours
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

  // Recover last session on mount
  useEffect(() => {
    try {
      const last = localStorage.getItem(LS_CURRENT_SESSION);
      if (last) {
        const cached = getLocal(last);
        if (cached) {
          setSessionId(last);
          setPreferences(cached.preferences || {});
          setProjectMeta(cached.projectMeta || {});
        }
      }
    } catch (err) {
      // STEP 7: Log localStorage errors instead of silent swallow
      console.error('[useThinkForgeSession] Failed to recover session from localStorage:', err);
    }
  }, []);

  const hydrate = useCallback(async (payload?: HydratePayload): Promise<HydrateResponse | null> => {
    setIsHydrating(true);
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
    }

    try {
      const res = await fetch("/api/services/thinkforge/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
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
      const data: HydrateResponse = await res.json();
      setSessionId(data.sessionId);
      setPreferences(data.preferences || {});
      setProjectMeta(data.projectMeta || {});
      
      // Cache
      localStorage.setItem(LS_CURRENT_SESSION, data.sessionId);
      const cachePayload: Partial<HydrateResponse & { script: ScriptModel }> = {
        ...data,
        script: data.script ?? undefined as any,
      };
      saveLocal(data.sessionId, cachePayload);
      return data;
    } catch (e) {
      console.error('[useThinkForgeSession] Hydration error:', e);
      if (isCreateNew) {
        try { localStorage.removeItem(LS_CURRENT_SESSION); } catch (lsErr) { console.warn('[useThinkForgeSession] localStorage cleanup failed:', lsErr); }
        setSessionId(null);
        setPreferences({});
        setProjectMeta({});
        return null;
      }
      const sid = payload?.sessionId || localStorage.getItem(LS_CURRENT_SESSION) || null;
      if (sid) {
        const cached = getLocal(sid);
        if (cached) {
          setSessionId(sid);
          setPreferences(cached.preferences || {});
          setProjectMeta(cached.projectMeta || {});
        }
      }
      return null;
    } finally {
      setIsHydrating(false);
    }
  }, [router]);

  const closeSession = useCallback(async () => {
    try {
      if (sessionId) {
        localStorage.removeItem(LS_CURRENT_SESSION);
        try { localStorage.removeItem(`${LS_SESSION_PREFIX}${sessionId}`); } catch (e) { console.warn('[useThinkForgeSession] Failed to remove session cache:', e); }
      }
      setSessionId(null);
      setPreferences({});
      setProjectMeta({});
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

  // STEP 4: Session verification handshake - verify session exists on backend
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
    isHydrating,
    hydrate,
    closeSession,
    verifySession,
    getSessionsCount,
    getSessionsList,
  } as const;
}

