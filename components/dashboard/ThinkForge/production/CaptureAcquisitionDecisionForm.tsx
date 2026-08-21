"use client";

import * as React from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

import type {
  CaptureAcquisitionDecisionInput,
} from "@/lib/thinkforge/production/capture-acquisition-decisions";
import type { TreatmentCapturePlan } from "@/lib/thinkforge/production/semantic-capture-plan";

type CaptureAcquisitionRequirement = TreatmentCapturePlan["unclassifiedRequirements"][number];
type AcquisitionKind = CaptureAcquisitionDecisionInput["acquisitionKind"];
type SelectionMap = Record<string, AcquisitionKind | undefined>;

const ACQUISITION_OPTIONS: Array<{ value: AcquisitionKind; label: string }> = [
  { value: "physical-camera", label: "Film it with a camera" },
  { value: "screen-recording", label: "Capture it on screen" },
  { value: "source-asset", label: "Use approved source material" },
];

function initialSelections(requirements: readonly CaptureAcquisitionRequirement[]): SelectionMap {
  return Object.fromEntries(requirements.map((requirement) => [requirement.id, undefined]));
}

/**
 * Maps a deliberate user selection to the narrow transport contract. It never
 * claims a specific device, source asset, or production capability.
 */
export function buildCaptureAcquisitionDecisions(
  requirements: readonly CaptureAcquisitionRequirement[],
  selections: Readonly<SelectionMap>,
): CaptureAcquisitionDecisionInput[] {
  return requirements.flatMap((requirement) => {
    const acquisitionKind = selections[requirement.id];
    if (!acquisitionKind) return [];
    return [{
      requirementId: requirement.id,
      acquisitionKind,
      requiredCapabilities: acquisitionKind === "physical-camera" ? ["camera"] : [],
    }];
  });
}

interface CaptureAcquisitionDecisionFormProps {
  requirements: readonly CaptureAcquisitionRequirement[];
  submitting?: boolean;
  onSubmit: (decisions: CaptureAcquisitionDecisionInput[]) => void;
}

export function CaptureAcquisitionDecisionForm({
  requirements,
  submitting = false,
  onSubmit,
}: CaptureAcquisitionDecisionFormProps) {
  const requirementKey = requirements.map((requirement) => requirement.id).join("|");
  const [selections, setSelections] = React.useState<SelectionMap>(() => initialSelections(requirements));

  React.useEffect(() => {
    setSelections(initialSelections(requirements));
  }, [requirementKey, requirements]);

  const decisions = buildCaptureAcquisitionDecisions(requirements, selections);
  const complete = decisions.length === requirements.length;

  if (requirements.length === 0) return null;

  return (
    <section className="rounded-[7px] border border-[#D4A65233] bg-[#D4A6520A] p-3">
      <h3 className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-[#D4A652]">
        Evidence acquisition
      </h3>
      <form
        className="mt-3 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (complete && !submitting) onSubmit(decisions);
        }}
      >
        {requirements.map((requirement) => (
          <fieldset key={requirement.id} className="rounded-[6px] border border-[#282724] bg-[#0F0F0E] p-3">
            <legend className="sr-only">Evidence acquisition for {requirement.objective}</legend>
            <p className="text-[12px] font-medium text-[#ECE9E1]">{requirement.objective}</p>
            {requirement.subjectOrEvidence && (
              <p className="mt-1 text-[11px] leading-relaxed text-[#B5B2A8]">{requirement.subjectOrEvidence}</p>
            )}
            <label className="mt-3 block">
              <span className="sr-only">How will this evidence be acquired?</span>
              <select
                aria-label={`Evidence acquisition for ${requirement.objective}`}
                value={selections[requirement.id] ?? ""}
                disabled={submitting}
                onChange={(event) => {
                  const value = event.target.value as AcquisitionKind | "";
                  setSelections((current) => ({
                    ...current,
                    [requirement.id]: value || undefined,
                  }));
                }}
                className="h-9 w-full rounded-[5px] border border-[#282724] bg-[#131312] px-2 text-[12px] text-[#ECE9E1] outline-none transition-colors focus:border-[#D4A65266] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">Choose an evidence path</option>
                {ACQUISITION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          </fieldset>
        ))}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={!complete || submitting}
            className="inline-flex items-center gap-1.5 rounded-[6px] border border-[#D4A65255] px-3 py-1.5 text-[11px] text-[#D4A652] transition-colors hover:bg-[#D4A65212] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            Save choices
          </button>
        </div>
      </form>
    </section>
  );
}
