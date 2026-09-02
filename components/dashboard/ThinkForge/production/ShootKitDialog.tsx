"use client";

/**
 * ShootKitDialog — the Shoot Kit entry surface.
 *
 * Owns ONLY the network round-trips and view routing. The backend returns a
 * semantic V3 capture brief. This dialog edits only
 * explicit capability inputs and never infers camera geometry or creative form.
 *
 * Robustness: every request is abortable and aborted on close / session / script
 * change; the last valid server response is preserved while refreshing; submits are
 * guarded against double firing.
 */

import React from "react";
import {
  AlertCircle,
  Clapperboard,
  Loader2,
  RefreshCw,
  WandSparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ProductionCapabilityProfile } from "@/lib/thinkforge/production/production-capability-profile";
import type { ScriptShotPlanIssue } from "@/lib/thinkforge/production/build-script-shot-plan";
import type { CaptureAcquisitionDecisionInput } from "@/lib/thinkforge/production/capture-acquisition-decisions";
import type { TreatmentCapturePlan } from "@/lib/thinkforge/production/semantic-capture-plan";
import type { PhysicalCaptureDesign } from "@/lib/thinkforge/schemas/physical-capture-design";
import type { TechnicalCapturePlan } from "@/lib/thinkforge/schemas/technical-capture-plan";
import type {
  ApprovedTechnicalCaptureSnapshot,
  CaptureCalibrationConfirmationSchema,
} from "@/lib/thinkforge/schemas/capture-calibration-approval";
import type { z } from "zod";
import { ShootKitProfileForm, type ShootKitSettings } from "./ShootKitProfileForm";
import { CaptureAcquisitionDecisionForm } from "./CaptureAcquisitionDecisionForm";
import { TreatmentCapturePlanResult } from "./TreatmentCapturePlanResult";
import { TechnicalCapturePlanResult } from "./TechnicalCapturePlanResult";

const ENDPOINT = "/api/services/thinkforge/production/shot-plan";

type TechnicalCaptureState =
  | { status: "not-required" }
  | { status: "needs-profile" }
  | { status: "not-generated"; design?: PhysicalCaptureDesign; staleReason?: string }
  | { status: "needs-calibration"; design: PhysicalCaptureDesign; plan: TechnicalCapturePlan; staleReason?: string }
  | { status: "approved"; design: PhysicalCaptureDesign; plan: TechnicalCapturePlan; approval: ApprovedTechnicalCaptureSnapshot };

type ShotPlanResponse = (
  | { status: "needs-profile"; profile: null; settings: ShootKitSettings | null; plan: null; issues: [] }
  | { status: "needs-user-input"; profile: ProductionCapabilityProfile | null; settings: ShootKitSettings | null; plan: null; issues: ScriptShotPlanIssue[] }
  | { status: "capture-projection"; profile: ProductionCapabilityProfile | null; settings: ShootKitSettings | null; plan: null; capturePlan: TreatmentCapturePlan; issues: [] }
) & {
  documentVersion: number;
  acquisitionDecisionSetHash: string | null;
  approval: { status: "preview"; reason: string };
  technicalCapture?: TechnicalCaptureState;
};

type CalibrationConfirmation = z.infer<typeof CaptureCalibrationConfirmationSchema>;

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
      setError({ message: "Reload the Shoot Kit before updating this capture brief." });
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
      if (result.ok && result.body.status === "capture-projection") {
        setEditing(false);
      }
    } finally {
      submitLockRef.current = false;
      setSubmitting(false);
    }
  }, [request, scriptId, sessionId]);

  const submitCaptureAcquisition = React.useCallback(async (
    decisions: CaptureAcquisitionDecisionInput[],
  ) => {
    if (submitLockRef.current || !sessionId || !scriptId) return;
    const current = dataRef.current;
    if (
      !current
      || current.status !== "capture-projection"
      || current.capturePlan.decisionRequests.length === 0
      || !Number.isInteger(current.documentVersion)
      || current.documentVersion < 1
    ) {
      setError({ message: "Reload the Shoot Kit before saving an evidence acquisition choice." });
      return;
    }
    submitLockRef.current = true;
    setSubmitting(true);
    try {
      await request({
        url: ENDPOINT,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save-capture-acquisition",
          sessionId,
          scriptId,
          expectedDocumentVersion: current.documentVersion,
          expectedAcquisitionDecisionSetHash: current.acquisitionDecisionSetHash,
          decisions,
        }),
      });
    } finally {
      submitLockRef.current = false;
      setSubmitting(false);
    }
  }, [request, scriptId, sessionId]);

  const submitTechnicalCapture = React.useCallback(async () => {
    if (submitLockRef.current || !sessionId || !scriptId) return;
    const current = dataRef.current;
    if (
      !current
      || current.status !== "capture-projection"
      || current.capturePlan.status !== "capture-brief-ready"
    ) {
      setError({ message: "Resolve the listed acquisition and calibration inputs before building a technical setup." });
      return;
    }
    submitLockRef.current = true;
    setSubmitting(true);
    try {
      await request({
        url: ENDPOINT,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate-technical-capture",
          sessionId,
          scriptId,
          expectedDocumentVersion: current.documentVersion,
        }),
      });
    } finally {
      submitLockRef.current = false;
      setSubmitting(false);
    }
  }, [request, scriptId, sessionId]);

  const submitCalibration = React.useCallback(async (
    confirmations: CalibrationConfirmation[],
  ) => {
    if (submitLockRef.current || !sessionId || !scriptId) return;
    const current = dataRef.current;
    if (
      !current
      || current.status !== "capture-projection"
      || current.capturePlan.status !== "capture-brief-ready"
    ) {
      setError({ message: "Resolve the listed acquisition and calibration inputs before approving a technical setup." });
      return;
    }
    submitLockRef.current = true;
    setSubmitting(true);
    try {
      await request({
        url: ENDPOINT,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "approve-technical-capture",
          sessionId,
          scriptId,
          expectedDocumentVersion: current.documentVersion,
          confirmations,
        }),
      });
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

  const showResult = data?.status === "capture-projection" && !editing;
  const technicalCapture: TechnicalCaptureState | null = data?.status === "capture-projection"
    ? data.technicalCapture ?? (
        data.capturePlan.physicalCaptureRequirements.length === 0
          ? { status: "not-required" }
          : data.profile && data.settings
            ? { status: "not-generated" }
            : { status: "needs-profile" }
      )
    : null;
  const formIssues: ScriptShotPlanIssue[] = data?.status === "needs-user-input"
    ? data.issues
    : data?.status === "capture-projection"
      ? data.capturePlan.calibrationQuestions.map((message, index) => ({
          code: `capture_calibration_${index + 1}`,
          message,
          questions: [],
        }))
      : [];
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
            Review this script's semantic capture requirements or capability-aware physical shot plan.
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
          ) : showResult && data.status === "capture-projection" ? (
            <>
              <div
                className="mb-3 flex items-start gap-2 border-y px-3 py-2"
                style={{ borderColor: "#282724", background: "#D4A65210" }}
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#D4A652]" />
                <span className="text-[11px] leading-relaxed text-[#B5B2A8]">
                  {data.capturePlan.status === "capture-brief-ready"
                    ? `Capture requirements confirmed for document v${data.documentVersion}. Technical setup is not approved until measured camera, subject, space, light, and audio evidence is resolved.`
                    : `Capture planning preview for document v${data.documentVersion}. Resolve the listed decisions or calibration inputs before technical planning.`}
                </span>
              </div>
              <TreatmentCapturePlanResult
                plan={data.capturePlan}
                onEditInputs={data.capturePlan.physicalCaptureRequirements.length > 0 ? () => setEditing(true) : undefined}
                refreshing={refreshing}
              />
              <CaptureAcquisitionDecisionForm
                requests={data.capturePlan.decisionRequests}
                submitting={submitting}
                onSubmit={(decisions) => void submitCaptureAcquisition(decisions)}
              />
              {technicalCapture?.status === "not-generated"
                && data.capturePlan.status === "capture-brief-ready"
                && (
                  <section className="flex flex-wrap items-center justify-between gap-3 border-t border-[#1C1B19] pt-3">
                    <div className="min-w-0">
                      <p className="text-[12px] font-medium text-[#ECE9E1]">Build the real setup from confirmed resources</p>
                      <p className="mt-1 text-[10px] leading-relaxed text-[#7A776E]">
                        This explicit action creates a document-bound technical plan. Opening Shoot Kit never starts generation.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="gold"
                      size="sm"
                      disabled={submitting || refreshing}
                      onClick={() => void submitTechnicalCapture()}
                    >
                      {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <WandSparkles className="h-3 w-3" />}
                      Build technical setup
                    </Button>
                  </section>
                )}
              {technicalCapture?.status === "needs-profile" && (
                <section className="flex justify-end border-t border-[#1C1B19] pt-3">
                  <Button type="button" variant="neutral" size="sm" onClick={() => setEditing(true)}>
                    Confirm available resources
                  </Button>
                </section>
              )}
              {(technicalCapture?.status === "needs-calibration" || technicalCapture?.status === "approved")
                && data.profile
                && (
                  <TechnicalCapturePlanResult
                    design={technicalCapture.design}
                    plan={technicalCapture.plan}
                    profile={data.profile}
                    approval={technicalCapture.status === "approved" ? technicalCapture.approval : undefined}
                    submitting={submitting}
                    onEditInputs={() => setEditing(true)}
                    onApprove={(confirmations) => void submitCalibration(confirmations)}
                  />
                )}
            </>
          ) : (
            <ShootKitProfileForm
              key={formEpoch}
              initialProfile={data?.profile ?? null}
              initialSettings={data?.settings ?? null}
              issues={formIssues}
              submitting={submitting}
              onGenerate={(profile, settings) => void submitPlan(profile, settings)}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
