"use client";

import * as React from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

import type {
  CaptureAcquisitionDecisionInput,
} from "@/lib/thinkforge/production/capture-acquisition-decisions";
import type { TreatmentCapturePlan } from "@/lib/thinkforge/production/semantic-capture-plan";
import type { CaptureRequirementCapability } from "@/lib/thinkforge/schemas/video-treatment";

type AcquisitionRequest = TreatmentCapturePlan["decisionRequests"][number];
type AcquisitionKind = CaptureAcquisitionDecisionInput["acquisitionKind"];
type RightsBasis = "user-provided" | "project-approved";

export interface CaptureAcquisitionDraft {
  acquisitionKind?: AcquisitionKind;
  requiredCapabilities: CaptureRequirementCapability[];
  screenLabel: string;
  screenScope: string;
  screenUrl: string;
  screenAuthorizationConfirmed: boolean;
  sourceRights: Record<string, RightsBasis | undefined>;
}

export type CaptureAcquisitionDraftMap = Record<string, CaptureAcquisitionDraft | undefined>;

const ACQUISITION_LABELS: Record<AcquisitionKind, string> = {
  "physical-camera": "Capture with a camera",
  "screen-recording": "Record an authorized screen target",
  "source-asset": "Use authorized source material",
};

const OPTIONAL_PHYSICAL_CAPABILITIES: Array<{
  value: Exclude<CaptureRequirementCapability, "camera">;
  label: string;
}> = [
  { value: "performer", label: "Visible performer" },
  { value: "space", label: "Controlled space" },
  { value: "audio", label: "Recorded audio" },
  { value: "lighting", label: "Controlled lighting" },
];

function initialDraft(request: AcquisitionRequest): CaptureAcquisitionDraft {
  const acquisitionKind = request.allowedAcquisitionKinds.length === 1
    ? request.allowedAcquisitionKinds[0]
    : undefined;
  return {
    acquisitionKind,
    requiredCapabilities: acquisitionKind === "physical-camera" ? ["camera"] : [],
    screenLabel: "",
    screenScope: "",
    screenUrl: "",
    screenAuthorizationConfirmed: false,
    sourceRights: {},
  };
}

function initialDrafts(requests: readonly AcquisitionRequest[]): CaptureAcquisitionDraftMap {
  return Object.fromEntries(requests.map((request) => [request.requirementId, initialDraft(request)]));
}

export function buildCaptureAcquisitionDecisions(
  requests: readonly AcquisitionRequest[],
  drafts: Readonly<CaptureAcquisitionDraftMap>,
): CaptureAcquisitionDecisionInput[] {
  return requests.flatMap((request): CaptureAcquisitionDecisionInput[] => {
    const draft = drafts[request.requirementId];
    if (!draft?.acquisitionKind || !request.allowedAcquisitionKinds.includes(draft.acquisitionKind)) return [];

    if (draft.acquisitionKind === "physical-camera") {
      if (!draft.requiredCapabilities.includes("camera")) return [];
      return [{
        requirementId: request.requirementId,
        acquisitionKind: draft.acquisitionKind,
        requiredCapabilities: [...new Set(draft.requiredCapabilities)],
      }];
    }

    if (draft.acquisitionKind === "screen-recording") {
      const label = draft.screenLabel.trim();
      const captureScope = draft.screenScope.trim();
      const sourceUrl = draft.screenUrl.trim();
      if (!label || !captureScope || !draft.screenAuthorizationConfirmed) return [];
      return [{
        requirementId: request.requirementId,
        acquisitionKind: draft.acquisitionKind,
        requiredCapabilities: [],
        screenTarget: {
          label,
          captureScope,
          ...(sourceUrl ? { sourceUrl } : {}),
          authorizationConfirmed: true,
        },
      }];
    }

    const eligibleIds = new Set(request.sourceCandidates.map((candidate) => candidate.referenceId));
    const sourceSelections = Object.entries(draft.sourceRights).flatMap(([referenceId, rightsBasis]) => (
      rightsBasis && eligibleIds.has(referenceId) ? [{ referenceId, rightsBasis }] : []
    ));
    if (sourceSelections.length === 0) return [];
    return [{
      requirementId: request.requirementId,
      acquisitionKind: draft.acquisitionKind,
      requiredCapabilities: [],
      sourceSelections,
    }];
  });
}

interface CaptureAcquisitionDecisionFormProps {
  requests: readonly AcquisitionRequest[];
  submitting?: boolean;
  onSubmit: (decisions: CaptureAcquisitionDecisionInput[]) => void;
}

export function CaptureAcquisitionDecisionForm({
  requests,
  submitting = false,
  onSubmit,
}: CaptureAcquisitionDecisionFormProps) {
  const requestKey = JSON.stringify(requests.map((request) => ({
    id: request.requirementId,
    kinds: request.allowedAcquisitionKinds,
    sources: request.sourceCandidates.map((candidate) => candidate.referenceId),
  })));
  const [drafts, setDrafts] = React.useState<CaptureAcquisitionDraftMap>(() => initialDrafts(requests));

  React.useEffect(() => {
    setDrafts(initialDrafts(requests));
  }, [requestKey, requests]);

  const updateDraft = React.useCallback((
    requirementId: string,
    update: (draft: CaptureAcquisitionDraft) => CaptureAcquisitionDraft,
  ) => {
    const request = requests.find((candidate) => candidate.requirementId === requirementId);
    if (!request) return;
    setDrafts((current) => ({
      ...current,
      [requirementId]: update(current[requirementId] ?? initialDraft(request)),
    }));
  }, [requests]);

  const decisions = buildCaptureAcquisitionDecisions(requests, drafts);
  const complete = decisions.length === requests.length;

  if (requests.length === 0) return null;

  return (
    <section className="mt-3 rounded-[7px] border border-[#D4A65233] bg-[#D4A6520A] p-3">
      <h3 className="font-mono text-[10px] font-medium uppercase tracking-normal text-[#D4A652]">
        Evidence acquisition
      </h3>
      <form
        className="mt-3 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (complete && !submitting) onSubmit(decisions);
        }}
      >
        {requests.map((request) => {
          const draft = drafts[request.requirementId] ?? initialDraft(request);
          return (
            <fieldset key={request.requirementId} className="rounded-[6px] border border-[#282724] bg-[#0F0F0E] p-3">
              <legend className="sr-only">Evidence acquisition decision</legend>
              <p className="text-[12px] font-medium leading-relaxed text-[#ECE9E1]">{request.prompt}</p>

              <label className="mt-3 block">
                <span className="sr-only">Acquisition path</span>
                <select
                  aria-label={`Acquisition path for ${request.requirementId}`}
                  value={draft.acquisitionKind ?? ""}
                  disabled={submitting || request.allowedAcquisitionKinds.length === 1}
                  onChange={(event) => {
                    const acquisitionKind = event.target.value as AcquisitionKind | "";
                    updateDraft(request.requirementId, (current) => ({
                      ...current,
                      acquisitionKind: acquisitionKind || undefined,
                      requiredCapabilities: acquisitionKind === "physical-camera" ? ["camera"] : [],
                    }));
                  }}
                  className="h-9 w-full rounded-[5px] border border-[#282724] bg-[#131312] px-2 text-[12px] text-[#ECE9E1] outline-none transition-colors focus:border-[#D4A65266] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <option value="">Choose an acquisition path</option>
                  {request.allowedAcquisitionKinds.map((kind) => (
                    <option key={kind} value={kind}>{ACQUISITION_LABELS[kind]}</option>
                  ))}
                </select>
              </label>

              {draft.acquisitionKind === "physical-camera" && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <label className="flex items-center gap-2 text-[11px] text-[#B5B2A8]">
                    <input type="checkbox" checked disabled /> Camera
                  </label>
                  {OPTIONAL_PHYSICAL_CAPABILITIES.map((capability) => (
                    <label key={capability.value} className="flex items-center gap-2 text-[11px] text-[#B5B2A8]">
                      <input
                        type="checkbox"
                        checked={draft.requiredCapabilities.includes(capability.value)}
                        disabled={submitting}
                        onChange={(event) => updateDraft(request.requirementId, (current) => ({
                          ...current,
                          requiredCapabilities: event.target.checked
                            ? [...new Set([...current.requiredCapabilities, capability.value])]
                            : current.requiredCapabilities.filter((value) => value !== capability.value),
                        }))}
                      />
                      {capability.label}
                    </label>
                  ))}
                </div>
              )}

              {draft.acquisitionKind === "screen-recording" && (
                <div className="mt-3 space-y-2">
                  <input
                    aria-label={`Screen target for ${request.requirementId}`}
                    value={draft.screenLabel}
                    disabled={submitting}
                    placeholder="Authorized product or system"
                    onChange={(event) => updateDraft(request.requirementId, (current) => ({
                      ...current,
                      screenLabel: event.target.value,
                    }))}
                    className="h-9 w-full rounded-[5px] border border-[#282724] bg-[#131312] px-2 text-[12px] text-[#ECE9E1] outline-none focus:border-[#D4A65266]"
                  />
                  <textarea
                    aria-label={`Screen capture scope for ${request.requirementId}`}
                    value={draft.screenScope}
                    disabled={submitting}
                    placeholder="Exact flow, states, and boundaries to record"
                    onChange={(event) => updateDraft(request.requirementId, (current) => ({
                      ...current,
                      screenScope: event.target.value,
                    }))}
                    className="min-h-20 w-full resize-y rounded-[5px] border border-[#282724] bg-[#131312] px-2 py-2 text-[12px] text-[#ECE9E1] outline-none focus:border-[#D4A65266]"
                  />
                  <input
                    aria-label={`Screen target URL for ${request.requirementId}`}
                    type="url"
                    value={draft.screenUrl}
                    disabled={submitting}
                    placeholder="Target URL (optional)"
                    onChange={(event) => updateDraft(request.requirementId, (current) => ({
                      ...current,
                      screenUrl: event.target.value,
                    }))}
                    className="h-9 w-full rounded-[5px] border border-[#282724] bg-[#131312] px-2 text-[12px] text-[#ECE9E1] outline-none focus:border-[#D4A65266]"
                  />
                  <label className="flex items-start gap-2 text-[11px] leading-relaxed text-[#B5B2A8]">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={draft.screenAuthorizationConfirmed}
                      disabled={submitting}
                      onChange={(event) => updateDraft(request.requirementId, (current) => ({
                        ...current,
                        screenAuthorizationConfirmed: event.target.checked,
                      }))}
                    />
                    I am authorized to capture the named target and states.
                  </label>
                </div>
              )}

              {draft.acquisitionKind === "source-asset" && (
                <div className="mt-3 space-y-2">
                  {request.sourceCandidates.length === 0 ? (
                    <p className="text-[11px] leading-relaxed text-[#D4A652]">
                      No authorized source material is bound to this requirement.
                    </p>
                  ) : request.sourceCandidates.map((candidate) => (
                    <label key={candidate.referenceId} className="grid gap-1 text-[11px] text-[#B5B2A8]">
                      <span>{candidate.title}</span>
                      <select
                        aria-label={`Rights basis for ${candidate.title}`}
                        value={draft.sourceRights[candidate.referenceId] ?? ""}
                        disabled={submitting}
                        onChange={(event) => {
                          const rightsBasis = event.target.value as RightsBasis | "";
                          updateDraft(request.requirementId, (current) => ({
                            ...current,
                            sourceRights: {
                              ...current.sourceRights,
                              [candidate.referenceId]: rightsBasis || undefined,
                            },
                          }));
                        }}
                        className="h-9 w-full rounded-[5px] border border-[#282724] bg-[#131312] px-2 text-[12px] text-[#ECE9E1] outline-none focus:border-[#D4A65266]"
                      >
                        <option value="">Do not use</option>
                        <option value="user-provided">I provided this material</option>
                        <option value="project-approved">Approved for this project</option>
                      </select>
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
          );
        })}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={!complete || submitting}
            className="inline-flex items-center gap-1.5 rounded-[6px] border border-[#D4A65255] px-3 py-1.5 text-[11px] text-[#D4A652] transition-colors hover:bg-[#D4A65212] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            Save evidence
          </button>
        </div>
      </form>
    </section>
  );
}
