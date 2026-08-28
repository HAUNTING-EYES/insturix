"use client";

import React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  Pencil,
  ShieldCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { ProductionCapabilityProfile } from "@/lib/thinkforge/production/production-capability-profile";
import type {
  ApprovedTechnicalCaptureSnapshot,
} from "@/lib/thinkforge/schemas/capture-calibration-approval";
import type { PhysicalCaptureDesign } from "@/lib/thinkforge/schemas/physical-capture-design";
import type {
  CaptureCalibrationCategorySchema,
  TechnicalCapturePlan,
} from "@/lib/thinkforge/schemas/technical-capture-plan";
import type { z } from "zod";

type CalibrationCategory = z.infer<typeof CaptureCalibrationCategorySchema>;
type CalibrationMethod = "live-preview" | "test-recording" | "measured" | "reference-frame";

interface TechnicalCapturePlanResultProps {
  design: PhysicalCaptureDesign;
  plan: TechnicalCapturePlan;
  profile: ProductionCapabilityProfile;
  approval?: ApprovedTechnicalCaptureSnapshot;
  submitting?: boolean;
  onEditInputs: () => void;
  onApprove: (confirmations: Array<{
    setupId: string;
    checkId: string;
    category: CalibrationCategory;
    status: "passed";
    method: CalibrationMethod;
  }>) => void;
}

const LABEL = "font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-[#5F5E5A]";
const METHODS: Array<{ id: CalibrationMethod; label: string }> = [
  { id: "live-preview", label: "Live preview" },
  { id: "test-recording", label: "Test recording + playback" },
  { id: "measured", label: "Measured" },
  { id: "reference-frame", label: "Reference frame" },
];

function resourceLabel(profile: ProductionCapabilityProfile, id: string): string {
  const equipment = profile.equipment.find((item) => item.id === id);
  if (equipment) return equipment.label;
  const space = profile.spaces.find((item) => item.id === id);
  if (space) return space.label;
  for (const candidate of profile.spaces) {
    const light = candidate.naturalLightSources.find((item) => item.id === id);
    if (light) return `${candidate.label}: ${light.kind}`;
  }
  return id;
}

function selectedResources(
  profile: ProductionCapabilityProfile,
  setup: TechnicalCapturePlan["setups"][number],
): string[] {
  return [
    setup.cameraId,
    setup.spaceId,
    ...setup.supportIds,
    ...setup.lightIds,
    ...setup.naturalLightSourceIds,
    ...setup.modifierIds,
    ...(setup.audioId ? [setup.audioId] : []),
    ...setup.accessoryIds,
  ].map((id) => resourceLabel(profile, id));
}

function defaultMethod(category: CalibrationCategory): CalibrationMethod {
  return category === "sound" ? "test-recording" : "live-preview";
}

export function TechnicalCapturePlanResult({
  design,
  plan,
  profile,
  approval,
  submitting = false,
  onEditInputs,
  onApprove,
}: TechnicalCapturePlanResultProps) {
  const [confirmed, setConfirmed] = React.useState<Record<string, boolean>>({});
  const [methods, setMethods] = React.useState<Record<string, CalibrationMethod>>({});

  React.useEffect(() => {
    const approved = new Map(
      approval?.confirmations.map((item) => [`${item.setupId}:${item.checkId}`, item]) ?? [],
    );
    const nextConfirmed: Record<string, boolean> = {};
    const nextMethods: Record<string, CalibrationMethod> = {};
    plan.setups.forEach((setup) => setup.calibrationChecks.forEach((check) => {
      const key = `${setup.id}:${check.id}`;
      const confirmation = approved.get(key);
      nextConfirmed[key] = Boolean(confirmation);
      nextMethods[key] = confirmation?.method ?? defaultMethod(check.category);
    }));
    setConfirmed(nextConfirmed);
    setMethods(nextMethods);
  }, [approval, plan.planHash, plan.setups]);

  const checks = plan.setups.flatMap((setup) => setup.calibrationChecks.map((check) => ({
    setupId: setup.id,
    ...check,
  })));
  const allConfirmed = checks.length > 0 && checks.every((check) => (
    confirmed[`${check.setupId}:${check.id}`]
  ));
  const canApprove = !approval && plan.unresolvedQuestions.length === 0 && allConfirmed && !submitting;

  const approve = () => {
    if (!canApprove) return;
    onApprove(checks.map((check) => ({
      setupId: check.setupId,
      checkId: check.id,
      category: check.category,
      status: "passed" as const,
      method: methods[`${check.setupId}:${check.id}`] ?? defaultMethod(check.category),
    })));
  };

  return (
    <div className="space-y-4">
      <section className={`rounded-[7px] border p-3 ${approval
        ? "border-[#5FA36A33] bg-[#5FA36A0D]"
        : "border-[#4C93A233] bg-[#4C93A20A]"}`}
      >
        <div className="flex items-start gap-2">
          {approval
            ? <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#8DD49A]" />
            : <CircleDot className="mt-0.5 h-4 w-4 shrink-0 text-[#9ED4DE]" />}
          <div className="min-w-0">
            <h3 className="text-[13px] font-medium text-[#ECE9E1]">
              {approval ? "Calibrated setup approved" : "Technical setup ready for calibration"}
            </h3>
            <p className="mt-1 text-[11px] leading-relaxed text-[#B5B2A8]">{plan.overallApproach}</p>
          </div>
        </div>
      </section>

      <section className="space-y-1">
        <h3 className={LABEL}>Capture strategy</h3>
        <p className="text-[11px] leading-relaxed text-[#B5B2A8]">{design.globalCaptureStrategy}</p>
      </section>

      {plan.unresolvedQuestions.length > 0 && (
        <section className="rounded-[7px] border border-[#D4A65233] bg-[#D4A6520A] p-3">
          <div className="flex items-center gap-2 text-[#E1BF72]">
            <AlertTriangle className="h-3.5 w-3.5" />
            <h3 className="text-[12px] font-medium">Resolve before approval</h3>
          </div>
          <ul className="mt-2 space-y-1 pl-4">
            {plan.unresolvedQuestions.map((question) => (
              <li key={question} className="list-disc text-[11px] leading-relaxed text-[#B5B2A8]">{question}</li>
            ))}
          </ul>
        </section>
      )}

      {plan.setups.map((setup, index) => {
        const intents = setup.coverageIntentIds.flatMap((id) => {
          const intent = design.coverageIntents.find((candidate) => candidate.id === id);
          return intent ? [intent] : [];
        });
        return (
          <article key={setup.id} className="rounded-[7px] border border-[#282724] bg-[#0F0F0E] p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className={LABEL}>Setup {index + 1}</p>
                <h3 className="mt-1 text-[13px] font-medium text-[#ECE9E1]">
                  {intents.map((intent) => intent.narrativeObjective).join(" / ")}
                </h3>
              </div>
              <span className="rounded-[4px] border border-[#282724] px-1.5 py-0.5 font-mono text-[10px] text-[#7A776E]">
                {setup.orientation} / {setup.cameraOperation}
              </span>
            </div>

            <div className="mt-3 border-t border-[#1C1B19] pt-2">
              <p className={LABEL}>Use</p>
              <p className="mt-1 text-[11px] leading-relaxed text-[#B5B2A8]">
                {selectedResources(profile, setup).join(" / ")}
              </p>
            </div>

            <div className="mt-3 grid gap-2 border-t border-[#1C1B19] pt-2 sm:grid-cols-2">
              {[
                ["Frame", setup.framingInstruction],
                ["Viewpoint", setup.viewpointInstruction],
                ["Camera behavior", setup.cameraBehaviorInstruction],
                ["Focus", setup.focusInstruction],
                ["Light", setup.lightingInstruction],
                ["Sound", setup.soundInstruction],
                ...(setup.performanceInstruction ? [["Performance", setup.performanceInstruction]] : []),
              ].map(([label, instruction]) => (
                <div key={label}>
                  <p className={LABEL}>{label}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-[#B5B2A8]">{instruction}</p>
                </div>
              ))}
            </div>

            {setup.safetyInstructions.length > 0 && (
              <div className="mt-3 border-t border-[#1C1B19] pt-2">
                <p className={LABEL}>Safety</p>
                <ul className="mt-1 space-y-1 pl-4">
                  {setup.safetyInstructions.map((instruction) => (
                    <li key={instruction} className="list-disc text-[11px] leading-relaxed text-[#B5B2A8]">{instruction}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-3 space-y-2 border-t border-[#1C1B19] pt-2">
              <p className={LABEL}>Calibrate and confirm</p>
              {setup.calibrationChecks.map((check) => {
                const key = `${setup.id}:${check.id}`;
                return (
                  <div key={check.id} className="grid gap-2 border-t border-[#1C1B19] py-2 first:border-t-0 sm:grid-cols-[1fr_150px]">
                    <label className="flex min-w-0 items-start gap-2">
                      <Checkbox
                        checked={confirmed[key] ?? false}
                        disabled={Boolean(approval)}
                        onCheckedChange={(value) => setConfirmed((current) => ({
                          ...current,
                          [key]: value === true,
                        }))}
                        aria-label={`Confirm ${check.category}`}
                        className="mt-0.5 border-[#4C4A45] data-[state=checked]:border-[#5FA36A] data-[state=checked]:bg-[#5FA36A]"
                      />
                      <span>
                        <span className="block text-[11px] font-medium text-[#ECE9E1]">{check.instruction}</span>
                        <span className="mt-0.5 block text-[10px] leading-relaxed text-[#7A776E]">Pass when: {check.passCondition}</span>
                      </span>
                    </label>
                    <select
                      value={methods[key] ?? defaultMethod(check.category)}
                      disabled={Boolean(approval) || check.category === "sound"}
                      onChange={(event) => setMethods((current) => ({
                        ...current,
                        [key]: event.target.value as CalibrationMethod,
                      }))}
                      aria-label={`Evidence method for ${check.category}`}
                      className="h-8 rounded-[4px] border border-[#282724] bg-[#131312] px-2 text-[10px] text-[#B5B2A8] focus:outline-none focus-visible:shadow-[0_0_0_2px_#D4A65240]"
                    >
                      {METHODS.map((method) => (
                        <option key={method.id} value={method.id}>{method.label}</option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </article>
        );
      })}

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="neutral" size="sm" onClick={onEditInputs} disabled={submitting}>
          <Pencil className="h-3 w-3" /> Edit resources
        </Button>
        {!approval && (
          <Button type="button" variant="success" size="sm" onClick={approve} disabled={!canApprove}>
            <CheckCircle2 className="h-3 w-3" /> Approve calibrated setup
          </Button>
        )}
      </div>
    </div>
  );
}
