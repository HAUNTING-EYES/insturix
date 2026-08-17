"use client";

/**
 * ShootKitDialog — the Shoot Kit entry surface.
 *
 * Owns ONLY the network round-trips and view routing. All planning, geometry, cost,
 * and optimization come from the deterministic backend at
 * /api/services/thinkforge/production/shot-plan. The dialog edits capability inputs
 * (via ShootKitProfileForm) and displays the returned ShotPlan (via ShootKitResult).
 *
 * Robustness: every request is abortable and aborted on close / session / script
 * change; the last valid server response is preserved while refreshing; submits are
 * guarded against double firing.
 */

import React from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clapperboard,
  Loader2,
  RefreshCw,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ProductionCapabilityProfile } from "@/lib/thinkforge/production/production-capability-profile";
import type { ScriptShotPlanIssue } from "@/lib/thinkforge/production/build-script-shot-plan";
import type { ShotPlan } from "@/lib/thinkforge/production/shot-plan";
import { ShootKitProfileForm, type ShootKitSettings } from "./ShootKitProfileForm";
import { ShootKitResult } from "./ShootKitResult";

const ENDPOINT = "/api/services/thinkforge/production/shot-plan";

type ShotPlanResponse = (
  | { status: "needs-profile"; profile: null; settings: ShootKitSettings | null; plan: null; issues: [] }
  | { status: "needs-user-input"; profile: ProductionCapabilityProfile | null; settings: ShootKitSettings | null; plan: null; issues: ScriptShotPlanIssue[] }
  | { status: "ready"; profile: ProductionCapabilityProfile; settings: ShootKitSettings; plan: ShotPlan; issues: [] }
) & {
  documentVersion: number;
  approval:
    | { status: "preview"; reason: string }
    | { status: "approved"; snapshotHash: string; approvedAt: string; approvedBy: string };
};

interface HttpError {
  message: string;
  status?: number;
  detail?: string;
}

interface ShootKitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId?: string;
  scriptId?: string;
}

function isShotPlanResponse(value: unknown): value is ShotPlanResponse {
  return Boolean(value) && typeof value === "object" && typeof (value as { status?: unknown }).status === "string";
}

function httpErrorFrom(status: number, body: unknown): HttpError {
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const serverMessage = typeof record.error === "string" ? record.error : undefined;
  const detail = typeof record.details === "string"
    ? record.details
    : Array.isArray(record.details) && record.details.length > 0
      ? `${record.details.length} field issue${record.details.length > 1 ? "s" : ""}`
      : undefined;
  const base: Record<number, string> = {
    400: serverMessage || "The request was rejected. Adjust your inputs and try again.",
    401: "Your session expired. Refresh the page and sign in again.",
    409: serverMessage || "The script changed. Reload the Shoot Kit before approving it.",
    404: "This ThinkForge session could not be found.",
    422: serverMessage || "The production plan could not be validated.",
  };
  return { status, detail, message: base[status] || serverMessage || `Request failed (${status}).` };
}

export function ShootKitDialog({ open, onOpenChange, sessionId, scriptId }: ShootKitDialogProps) {
  const [data, setData] = React.useState<ShotPlanResponse | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<HttpError | null>(null);
  const [editing, setEditing] = React.useState(false);
  const [formEpoch, setFormEpoch] = React.useState(0);

  const abortRef = React.useRef<AbortController | null>(null);
  const submitLockRef = React.useRef(false);
  const dataRef = React.useRef<ShotPlanResponse | null>(null);
  dataRef.current = data;

  const request = React.useCallback(async (init: RequestInit & { url: string }) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const hasData = dataRef.current !== null;
    if (hasData) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const res = await fetch(init.url, { ...init, signal: controller.signal });
      const body = await res.json().catch(() => ({}));
      if (controller.signal.aborted) return { aborted: true as const };
      if (!res.ok) {
        setError(httpErrorFrom(res.status, body));
        return { ok: false as const };
      }
      if (isShotPlanResponse(body)) {
        setData(body);
        return { ok: true as const, body };
      }
      setError({ message: "The server returned an unexpected response." });
      return { ok: false as const };
    } catch (err) {
      if (controller.signal.aborted || (err instanceof DOMException && err.name === "AbortError")) {
        return { ok: false as const };
      }
      setError({ message: "Network error. Check your connection and retry." });
      return { ok: false as const };
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  const loadPlan = React.useCallback(async () => {
    if (!sessionId) {
      setError({ message: "No active session. Open a script first." });
      return;
    }
    const params = new URLSearchParams({ sessionId });
    if (scriptId) params.set("scriptId", scriptId);
    const result = await request({ url: `${ENDPOINT}?${params.toString()}`, method: "GET" });
    if (result.ok) setFormEpoch((e) => e + 1);
  }, [request, scriptId, sessionId]);

  const submitPlan = React.useCallback(async (profile: ProductionCapabilityProfile, settings: ShootKitSettings) => {
    if (submitLockRef.current || !sessionId) return;
    const current = dataRef.current;
    if (!current || !Number.isInteger(current.documentVersion) || current.documentVersion < 1) {
      setError({ message: "Reload the Shoot Kit before approving this plan." });
      return;
    }
    submitLockRef.current = true;
    setSubmitting(true);
    try {
      const result = await request({
        url: ENDPOINT,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          scriptId,
          expectedDocumentVersion: current.documentVersion,
          profile,
          settings,
        }),
      });
      if (result.ok && result.body.status === "ready") setEditing(false);
    } finally {
      submitLockRef.current = false;
      setSubmitting(false);
    }
  }, [request, scriptId, sessionId]);

  // Load on open and whenever the target session/script changes while open. Abort on close/unmount.
  React.useEffect(() => {
    if (!open) return;
    void loadPlan();
    return () => abortRef.current?.abort();
  }, [open, sessionId, scriptId, loadPlan]);

  // Reset transient state after the dialog closes so a reopen starts clean.
  React.useEffect(() => {
    if (open) return;
    abortRef.current?.abort();
    setData(null);
    setError(null);
    setEditing(false);
    setLoading(false);
    setRefreshing(false);
    setSubmitting(false);
  }, [open]);

  const showResult = data?.status === "ready" && !editing;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[88vh] w-full overflow-y-auto text-[#ECE9E1] rounded-md sm:max-w-[720px]"
        style={{ background: "#131312", borderColor: "#282724" }}
      >
        <DialogHeader className="sticky top-0 z-10 border-b px-4 py-3" style={{ borderColor: "#1C1B19", background: "#131312" }}>
          <div className="flex items-center gap-2">
            <Clapperboard className="h-4 w-4 shrink-0 text-[#B5B2A8]" />
            <DialogTitle className="text-[14px] font-medium text-[#ECE9E1]">Shoot Kit</DialogTitle>
            {refreshing && <Loader2 className="h-3.5 w-3.5 animate-spin text-[#7A776E]" aria-label="Refreshing" />}
          </div>
          <DialogDescription className="sr-only">
            Turn this script into a deterministic, capability-aware shot plan.
          </DialogDescription>
        </DialogHeader>

        <div className="px-4 py-4">
          {/* Non-fatal error while a plan/form is already visible */}
          {error && data && (
            <div className="mb-3 flex items-start justify-between gap-2 rounded-[7px] px-3 py-2" style={{ background: "#D46A5C14" }}>
              <p className="text-[11px] leading-relaxed text-[#D46A5C]">
                {error.message}{error.detail ? ` (${error.detail})` : ""}
              </p>
              <button
                type="button"
                onClick={() => void loadPlan()}
                className="shrink-0 text-[11px] text-[#B5B2A8] underline transition-colors duration-[250ms] ease-[cubic-bezier(0.16,1,0.3,1)] hover:text-[#ECE9E1] focus:outline-none focus-visible:shadow-[0_0_0_2px_#D4A65240]"
              >
                Retry
              </button>
            </div>
          )}

          {loading && !data ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-[#7A776E]">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-[11px]">Reading your production profile</span>
            </div>
          ) : error && !data ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <AlertCircle className="h-6 w-6 text-[#D46A5C]" />
              <p className="max-w-sm text-[11px] leading-relaxed text-[#B5B2A8]">
                {error.message}{error.detail ? ` (${error.detail})` : ""}
              </p>
              <button
                type="button"
                onClick={() => void loadPlan()}
                className="inline-flex items-center gap-1 rounded-[7px] border border-[#282724] px-3 py-1 text-[11px] text-[#ECE9E1] transition-colors duration-[250ms] ease-[cubic-bezier(0.16,1,0.3,1)] hover:text-[#D4A652] focus:outline-none focus-visible:shadow-[0_0_0_2px_#D4A65240]"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Retry
              </button>
            </div>
          ) : showResult && data.status === "ready" ? (
            <>
              <div
                className="mb-3 flex items-center justify-between gap-3 border-y px-3 py-2"
                style={{ borderColor: "#282724", background: data.approval.status === "approved" ? "#5FA36A12" : "#D4A65210" }}
              >
                <div className="flex min-w-0 items-center gap-2">
                  {data.approval.status === "approved" ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-[#5FA36A]" />
                  ) : (
                    <AlertCircle className="h-4 w-4 shrink-0 text-[#D4A652]" />
                  )}
                  <span className="text-[11px] text-[#B5B2A8]">
                    {data.approval.status === "approved"
                      ? `Approved for document v${data.documentVersion}`
                      : `Preview for document v${data.documentVersion}`}
                  </span>
                </div>
                {data.approval.status !== "approved" && (
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => void submitPlan(data.profile, data.settings)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-[7px] border border-[#D4A65255] px-3 py-1.5 text-[11px] text-[#D4A652] transition-colors duration-[250ms] hover:bg-[#D4A65212] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Approve plan
                  </button>
                )}
              </div>
              <ShootKitResult plan={data.plan} onEditInputs={() => setEditing(true)} refreshing={refreshing} />
            </>
          ) : (
            <ShootKitProfileForm
              key={formEpoch}
              initialProfile={data?.profile ?? null}
              initialSettings={data?.settings ?? null}
              issues={data?.status === "needs-user-input" ? data.issues : []}
              submitting={submitting}
              onGenerate={(profile, settings) => void submitPlan(profile, settings)}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
