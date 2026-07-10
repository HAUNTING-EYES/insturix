'use client';

/**
 * Client hooks for the PREMIUM SaaS explainer studio (script → render → result).
 *
 * Talks to three routes (all under /api/services/editron/saas-explainer):
 *   POST /plan               → editable script + craft-worker plan/model (no draft project)
 *   POST /finalize           → enqueue the render job from the edited script beats
 *   GET  /status/[jobId]     → poll render progress until done/error
 *
 * Type-only imports of the server contracts are erased at compile time (no server code enters the bundle).
 */
import { useMutation, useQuery } from '@tanstack/react-query';
import type { ScriptPlanScene } from '@/lib/editron/saas-explainer/script-plan';
import type { ExplainerProductModel } from '@/lib/editron/saas-explainer/director-to-plan';
import type { SaasDirectorContract } from '@/lib/editron/saas-explainer/director-contract';
import type { SaasProductEvidencePack } from '@/lib/editron/saas-explainer/product-evidence-pack';

export type { ScriptPlanScene };

export interface SaasExplainerIntakePayload {
  brandId?: string;
  productName?: string;
  audience?: string;
  outcome?: string;
  script?: string;
  durationSec: number;
  aspectRatio: '16:9' | '9:16' | '1:1';
  productUrl?: string;
  /** Extracted text from an uploaded doc/PDF — the video's topic/source material (understood, not verbatim). */
  sourceMaterial?: string;
}

export interface SaasExplainerIngestDocResult {
  success: true;
  name: string;
  text: string;
  chars: number;
  warnings?: string[];
}

/** Upload a PDF/DOCX/PPTX/TXT and get its extracted text (POST /ingest-doc, multipart). */
export function useSaasExplainerIngestDoc() {
  return useMutation<SaasExplainerIngestDocResult, Error, File>({
    mutationFn: async (file) => {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${BASE}/ingest-doc`, { method: 'POST', body: form, credentials: 'include' });
      const payload = (await res.json().catch(() => null)) as (SaasExplainerIngestDocResult & { error?: string }) | null;
      if (!res.ok || !payload || (payload as { success?: boolean }).success === false) {
        throw new Error(payload?.error || `Upload failed (${res.status}).`);
      }
      return payload;
    },
  });
}

export interface SaasExplainerPlanResult {
  success: true;
  scenes: ScriptPlanScene[];
  productModel: ExplainerProductModel;
  directorContract: SaasDirectorContract;
  productEvidencePack: SaasProductEvidencePack;
  message: string;
  warnings?: string[];
}

export interface SaasExplainerFinalizePayload {
  scriptScenes: ScriptPlanScene[];
  productModel: ExplainerProductModel;
  message: string;
  voice?: string;
  brandId?: string;
}

export interface SaasExplainerFinalizeResult {
  success: true;
  jobId: string;
  videoId: string;
  status: 'queued' | 'rendering' | 'done' | 'error';
  scenes: number;
}

export type SaasExplainerJobStatus = 'queued' | 'rendering' | 'done' | 'error';

export interface SaasExplainerStatusResult {
  success: true;
  status: SaasExplainerJobStatus;
  progress: number;
  videoId: string;
  outputUrl: string | null;
  costUsd: number | null;
  error: string | null;
}

const BASE = '/api/services/editron/saas-explainer';

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'include',
  });
  const payload = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !payload || (payload as { success?: boolean }).success === false) {
    throw new Error(payload?.error || `Request failed (${res.status}).`);
  }
  return payload;
}

/** Generate the editable script for a brief (POST /plan). */
export function useSaasExplainerPlan() {
  return useMutation<SaasExplainerPlanResult, Error, SaasExplainerIntakePayload>({
    mutationFn: (intake) => postJson<SaasExplainerPlanResult>(`${BASE}/plan`, intake),
  });
}

/** Enqueue the render from the (edited) script beats (POST /finalize). */
export function useSaasExplainerFinalize() {
  return useMutation<SaasExplainerFinalizeResult, Error, SaasExplainerFinalizePayload>({
    mutationFn: (payload) => postJson<SaasExplainerFinalizeResult>(`${BASE}/finalize`, payload),
  });
}

export interface SaasExplainerChatEditPayload {
  message: string;
  scenes: ScriptPlanScene[];
  videoMessage?: string;
  sceneIndex?: number;
}

export type SaasExplainerEditOp = 'script' | 'visual' | 'voice' | 'pacing' | 'music' | 'refuse' | 'unknown';

export interface SaasExplainerChatEditResult {
  success: true;
  op: SaasExplainerEditOp;
  reply: string;
  scenes: ScriptPlanScene[];
  /** Set when op === 'voice' — the new voice id to apply. */
  voice?: string;
  /** true when the change only shows after a re-render (visual/voice/pacing). */
  needsRerender: boolean;
}

/** Natural-language edit of the script beats (POST /chat-edit). */
export function useSaasExplainerChatEdit() {
  return useMutation<SaasExplainerChatEditResult, Error, SaasExplainerChatEditPayload>({
    mutationFn: (payload) => postJson<SaasExplainerChatEditResult>(`${BASE}/chat-edit`, payload),
  });
}

/** Poll a render job's status until it's done or errored. */
export function useSaasExplainerStatus(jobId: string | null) {
  return useQuery<SaasExplainerStatusResult, Error>({
    queryKey: ['saas-explainer-status', jobId],
    enabled: Boolean(jobId),
    queryFn: async () => {
      const res = await fetch(`${BASE}/status/${encodeURIComponent(jobId as string)}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const payload = (await res.json().catch(() => null)) as
        | (Omit<Partial<SaasExplainerStatusResult>, 'success'> & { success?: boolean; error?: string })
        | null;
      if (!res.ok || !payload || payload.success === false) {
        throw new Error(payload?.error || `Status check failed (${res.status}).`);
      }
      return payload as SaasExplainerStatusResult;
    },
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'queued' || status === 'rendering' ? 2500 : false;
    },
  });
}
