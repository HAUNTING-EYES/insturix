"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/hooks/use-toast";

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

// --------- Sanitization & Safety Utilities ---------
const MAX_STRING_LEN = 8 * 1024; // 8KB per string for runtime rendering safety
const MAX_BLOCKS = 200; // limit blocks to a sane count for client rendering
const MAX_KEYS_PER_OBJECT = 64;
const MAX_DEPTH = 8;

const MAX_STRING_LEN_LOCAL = 16 * 1024; // 16KB per string for local cache
const MAX_BLOCKS_LOCAL = 50; // keep localStorage lightweight

function clampString(value: any, maxLen: number): string {
  if (typeof value !== "string") return String(value ?? "");
  return value.length > maxLen ? value.slice(0, maxLen) : value;
}

function sanitizeUnknownDeep<T = any>(value: T, options: { depth?: number; maxDepth?: number; maxKeys?: number; maxArr?: number; maxStr?: number }, stats?: { trimmed: number }): any {
  const { depth = 0, maxDepth = MAX_DEPTH, maxKeys = MAX_KEYS_PER_OBJECT, maxArr = MAX_BLOCKS, maxStr = MAX_STRING_LEN } = options || {} as any;
  const s = stats || { trimmed: 0 };
  if (value == null) return value;
  if (depth >= maxDepth) {
    s.trimmed++;
    return undefined;
  }
  const t = typeof value;
  if (t === "string") return clampString(value, maxStr);
  if (t === "number" || t === "boolean") return value;
  if (t === "bigint") return Number(value);
  if (t === "function" || t === "symbol") { s.trimmed++; return undefined; }
  if (Array.isArray(value)) {
    const out: any[] = [];
    const lim = Math.min(value.length, maxArr);
    if (value.length > lim) s.trimmed += (value.length - lim);
    for (let i = 0; i < lim; i++) out.push(sanitizeUnknownDeep(value[i], { depth: depth + 1, maxDepth, maxKeys, maxArr, maxStr }, s));
    return out;
  }
  if (t === "object") {
    const out: Record<string, any> = {};
    const keys = Object.keys(value as any).slice(0, maxKeys);
    if (Object.keys(value as any).length > keys.length) s.trimmed += (Object.keys(value as any).length - keys.length);
    for (const k of keys) {
      out[k] = sanitizeUnknownDeep((value as any)[k], { depth: depth + 1, maxDepth, maxKeys, maxArr, maxStr }, s);
    }
    return out;
  }
  return undefined;
}

function sanitizeBlocks(blocks: Block[] | null | undefined, forLocal = false): { blocks: Block[] | null; trimmed: number } {
  if (!Array.isArray(blocks)) return { blocks: null, trimmed: 0 };
  const maxBlocks = forLocal ? MAX_BLOCKS_LOCAL : MAX_BLOCKS;
  const stats = { trimmed: 0 };
  const lim = Math.min(blocks.length, maxBlocks);
  if (blocks.length > lim) stats.trimmed += (blocks.length - lim);
  const sanitized = new Array(lim).fill(null).map((_, i) => sanitizeUnknownDeep(blocks[i], {
    maxArr: maxBlocks,
    maxDepth: MAX_DEPTH,
    maxKeys: MAX_KEYS_PER_OBJECT,
    maxStr: forLocal ? MAX_STRING_LEN_LOCAL : MAX_STRING_LEN,
  }, stats));
  return { blocks: sanitized, trimmed: stats.trimmed };
}

function sanitizeScriptModel(input: ScriptModel | null | undefined, forLocal = false): { script: ScriptModel | null; trimmed: number } {
  if (!input) return { script: null, trimmed: 0 };
  let trimmed = 0;
  const maxStr = forLocal ? MAX_STRING_LEN_LOCAL : MAX_STRING_LEN;
  const title = input.title != null ? clampString(input.title, 512) : null;
  if (input.title && title !== input.title) trimmed++;
  const outline = input.outline != null ? clampString(input.outline, maxStr) : null;
  if (input.outline && outline !== input.outline) trimmed++;
  const content = input.content != null ? clampString(input.content, maxStr) : null;
  if (input.content && content !== input.content) trimmed++;
  const { blocks, trimmed: t2 } = sanitizeBlocks(input.blocks, forLocal);
  trimmed += t2;
  const script: ScriptModel = { title, outline, content, blocks };
  return { script, trimmed };
}

function saveLocal(sessionId: string, data: Partial<HydrateResponse & { script: ScriptModel }>) {
  try {
    const key = `${LS_SESSION_PREFIX}${sessionId}`;
    const prev = JSON.parse(localStorage.getItem(key) || "{}");
    // Compress script portion for localStorage to avoid quota issues
    const toStore = { ...prev, ...data } as any;
    if (toStore.script) {
      const { script } = sanitizeScriptModel(toStore.script, true);
      toStore.script = script;
    }
    localStorage.setItem(key, JSON.stringify(toStore));
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
      setSessionId(data.sessionId);
      const sanitized = sanitizeScriptModel(data.script || null);
      if (sanitized.trimmed > 0) console.warn("ThinkForge hydrate: sanitized script payload", { trimmed: sanitized.trimmed });
      setScript(sanitized.script);
      setChat(data.chat || []);
      setPreferences(data.preferences || {});
      setProjectMeta(data.projectMeta || {});
      // Cache
      localStorage.setItem(LS_CURRENT_SESSION, data.sessionId);
      // Normalize null script to undefined for typing
      const cachePayload: Partial<HydrateResponse & { script: ScriptModel }> = {
        ...data,
        script: (sanitized.script ?? undefined) as any,
      };
      saveLocal(data.sessionId, cachePayload);
      return data;
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
          const sanitizedCached = sanitizeScriptModel(cached.script || null);
          if (sanitizedCached.trimmed > 0) console.warn("ThinkForge hydrate fallback: sanitized cached script", { trimmed: sanitizedCached.trimmed });
          setScript(sanitizedCached.script);
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

  const setScriptAndQueueSave = useCallback((updater: ScriptModel | null | ((prev: ScriptModel | null) => ScriptModel | null)) => {
    setScript((prev) => {
      const next = typeof updater === "function" ? (updater as any)(prev) : updater;
      // Local cache immediately for resilience
      if (sessionId) {
        // Store a compressed version in localStorage
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

  // Guardrail appended to LLM-bound instructions to ensure complete JSON responses
  const JSON_GUARDRAIL = `\n\nConstraints (MANDATORY):\n- Return a complete, well-formed JSON object for the script update.\n- The JSON MUST include: title (string), content (string), and blocks (array of Block objects).\n- Never stream or output partial JSON. If token budget is tight, shorten prose but keep the JSON syntactically valid.\n- Do not omit closing brackets/braces or cut properties mid-structure.\n- If no changes, return the previous values unchanged, but still as valid JSON.`;

  const runEdit = useCallback(async (instruction: string) => {
    const res = await fetch("/api/services/thinkforge/script/edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ instruction: instruction + JSON_GUARDRAIL, script, sessionId }),
    });
    if (!res.ok) throw new Error(`Edit failed: ${res.status}`);
    const data = await res.json();
    // Apply returned script and queue autosave (sanitize first)
    const updated: ScriptModel = {
      title: data?.title ?? script?.title ?? null,
      outline: data?.outline ?? script?.outline ?? null,
      content: data?.content ?? script?.content ?? null,
      blocks: data?.blocks ?? script?.blocks ?? null,
    };
    const sanitized = sanitizeScriptModel(updated);
    if (sanitized.trimmed > 0) console.warn("ThinkForge edit: sanitized script update", { trimmed: sanitized.trimmed });
    setScriptAndQueueSave(sanitized.script);
    return data;
  }, [script, sessionId, setScriptAndQueueSave]);

  const runEditBlocks = useCallback(async (instruction: string, selection?: string, indices?: number[]) => {
    const payload = {
      instruction: instruction + JSON_GUARDRAIL,
      script,
      sessionId,
      // Prefer selection; backend maps to indices; indices optional override
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
    const updated: ScriptModel = {
      title: data?.title ?? script?.title ?? null,
      outline: data?.outline ?? script?.outline ?? null,
      content: data?.content ?? script?.content ?? null,
      blocks: data?.blocks ?? script?.blocks ?? null,
    };
    const sanitized = sanitizeScriptModel(updated);
    if (sanitized.trimmed > 0) console.warn("ThinkForge edit-blocks: sanitized script update", { trimmed: sanitized.trimmed });
    setScriptAndQueueSave(sanitized.script);
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
  } as const;
}
