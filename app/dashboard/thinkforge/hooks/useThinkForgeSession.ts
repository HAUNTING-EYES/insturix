"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/hooks/use-toast";
import { sanitizeServerScript, ensureBlockIds } from "@/lib/thinkforge/json";
import type { ScriptModel } from "./useThinkForgeClient";

const LS_CURRENT_SESSION = "thinkforge_current_session";
const LS_SESSION_PREFIX = "thinkforge_session_";

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
    } catch {}
  }, []);

  const hydrate = useCallback(async (payload?: HydratePayload): Promise<HydrateResponse | null> => {
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
      if (isCreateNew) {
        try { localStorage.removeItem(LS_CURRENT_SESSION); } catch {}
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
      }
      setSessionId(null);
      setPreferences({});
      setProjectMeta({});
    } catch {}
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

  return {
    sessionId,
    preferences,
    projectMeta,
    isHydrating,
    hydrate,
    closeSession,
    getSessionsCount,
    getSessionsList,
  } as const;
}

