"use client";

import {
  CheckCircle2,
  CircleHelp,
  FileVideo2,
  Mic,
  Pencil,
} from "lucide-react";

import type { TreatmentCapturePlan } from "@/lib/thinkforge/production/semantic-capture-plan";

interface TreatmentCapturePlanResultProps {
  plan: TreatmentCapturePlan;
  onEditInputs?: () => void;
  refreshing?: boolean;
}

const MONO_LABEL = "font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-[#5F5E5A]";
const EASE = "transition-colors duration-[250ms] ease-[cubic-bezier(0.16,1,0.3,1)]";

const STATUS_COPY: Record<TreatmentCapturePlan["status"], { title: string; detail: string; tone: string }> = {
  "no-physical-capture": {
    title: "No physical shoot is required",
    detail: "This treatment can be completed from editorial, screen, or approved source material. No camera setup is being assumed.",
    tone: "border-[#4C93A212] bg-[#4C93A20D] text-[#9ED4DE]",
  },
  "needs-acquisition-decision": {
    title: "Choose how to acquire the unresolved evidence",
    detail: "The treatment identifies what must be shown, but it does not invent whether that evidence will be filmed, captured on screen, or supplied as source material.",
    tone: "border-[#D4A65233] bg-[#D4A6520D] text-[#E1BF72]",
  },
  "needs-capture-calibration": {
    title: "Physical capture needs confirmation",
    detail: "The story calls for real capture. Confirm only the equipment, people, space, audio, and lighting you actually have before planning it.",
    tone: "border-[#D4A65233] bg-[#D4A6520D] text-[#E1BF72]",
  },
  "capture-brief-ready": {
    title: "Capture brief ready",
    detail: "The treatment and confirmed production inputs agree. This is a capture brief, not a fabricated camera diagram.",
    tone: "border-[#5FA36A33] bg-[#5FA36A0D] text-[#8DD49A]",
  },
};

const CAPTURE_KIND_LABEL: Record<
  TreatmentCapturePlan["physicalCaptureRequirements"][number]["captureKind"],
  string
> = {
  "physical-camera": "Physical capture",
  "screen-recording": "Screen recording",
  "source-asset": "Approved source material",
  unspecified: "Acquisition decision required",
};

function EvidenceStatus({ status }: { status: "confirmed" | "missing" | "ambiguous" }) {
  const label = status === "confirmed" ? "Confirmed" : status === "missing" ? "Missing" : "Choose one";
  const tone = status === "confirmed"
    ? "border-[#5FA36A44] text-[#8DD49A]"
    : status === "missing"
      ? "border-[#D46A5C44] text-[#E99B90]"
      : "border-[#D4A65244] text-[#E1BF72]";
  return <span className={`rounded-[4px] border px-1.5 py-0.5 font-mono text-[10px] ${tone}`}>{label}</span>;
}

function RequirementList({
  title,
  requirements,
}: {
  title: string;
  requirements: TreatmentCapturePlan["physicalCaptureRequirements"];
}) {
  if (requirements.length === 0) return null;
  return (
    <section className="space-y-2">
      <h3 className={MONO_LABEL}>{title}</h3>
      {requirements.map((requirement) => (
        <article key={requirement.id} className="rounded-[7px] border border-[#1C1B19] bg-[#0F0F0E] p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-[#ECE9E1]">{requirement.objective}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-[#B5B2A8]">{requirement.whyRequired}</p>
            </div>
            <span className="shrink-0 rounded-[4px] border border-[#282724] px-1.5 py-0.5 font-mono text-[10px] text-[#7A776E]">
              {CAPTURE_KIND_LABEL[requirement.captureKind]}
            </span>
          </div>

          {requirement.subjectOrEvidence && (
            <p className="mt-2 border-l-2 border-[#4C93A2] pl-2 text-[11px] leading-relaxed text-[#B5B2A8]">
              <span className="font-medium text-[#ECE9E1]">Show: </span>{requirement.subjectOrEvidence}
            </p>
          )}

          {requirement.capabilityEvidence.length > 0 && (
            <div className="mt-3 space-y-1.5 border-t border-[#1C1B19] pt-2">
              <p className={MONO_LABEL}>Production evidence</p>
              {requirement.capabilityEvidence.map((evidence) => (
                <div key={evidence.capability} className="flex items-start justify-between gap-3 text-[11px] leading-relaxed">
                  <p className="min-w-0 text-[#B5B2A8]">
                    <span className="font-medium capitalize text-[#ECE9E1]">{evidence.capability}: </span>{evidence.detail}
                  </p>
                  <EvidenceStatus status={evidence.status} />
                </div>
              ))}
            </div>
          )}

          {requirement.constraints.length > 0 && (
            <div className="mt-3 border-t border-[#1C1B19] pt-2">
              <p className={MONO_LABEL}>Constraints</p>
              <ul className="mt-1 space-y-1 pl-3">
                {requirement.constraints.map((constraint) => (
                  <li key={constraint} className="list-disc text-[11px] leading-relaxed text-[#B5B2A8]">{constraint}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-3 border-t border-[#1C1B19] pt-2">
            <p className={MONO_LABEL}>Narrative moments</p>
            <ul className="mt-1 space-y-1">
              {requirement.linkedNarrativeMoments.map((moment) => (
                <li key={`${moment.beatId}:${moment.eventId}`} className="text-[11px] leading-relaxed text-[#B5B2A8]">
                  <span className="font-medium text-[#ECE9E1]">{moment.narrativePurpose}</span>
                  {moment.timingNote ? ` ${moment.timingNote}` : ""}
                </li>
              ))}
            </ul>
          </div>
        </article>
      ))}
    </section>
  );
}

export function TreatmentCapturePlanResult({ plan, onEditInputs, refreshing }: TreatmentCapturePlanResultProps) {
  const status = STATUS_COPY[plan.status];
  const canEditInputs = plan.physicalCaptureRequirements.length > 0 && Boolean(onEditInputs);

  return (
    <div className="space-y-4" aria-busy={refreshing || undefined}>
      <section className={`rounded-[7px] border px-3 py-3 ${status.tone}`}>
        <div className="flex items-start gap-2">
          {plan.status === "capture-brief-ready" ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          ) : plan.status === "no-physical-capture" ? (
            <FileVideo2 className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <CircleHelp className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <div className="min-w-0">
            <h3 className="text-[13px] font-medium text-[#ECE9E1]">{status.title}</h3>
            <p className="mt-1 text-[11px] leading-relaxed text-[#B5B2A8]">{status.detail}</p>
          </div>
        </div>
      </section>

      {plan.calibrationQuestions.length > 0 && (
        <section className="rounded-[7px] border border-[#D4A65233] bg-[#D4A6520A] p-3">
          <h3 className={MONO_LABEL}>Decisions to confirm</h3>
          <ul className="mt-2 space-y-1 pl-3">
            {plan.calibrationQuestions.map((question) => (
              <li key={question} className="list-disc text-[11px] leading-relaxed text-[#B5B2A8]">{question}</li>
            ))}
          </ul>
        </section>
      )}

      <RequirementList title="Physical capture" requirements={plan.physicalCaptureRequirements} />
      <RequirementList title="Screen and source acquisition" requirements={plan.nonPhysicalAcquisitionRequirements} />
      <RequirementList title="Unresolved acquisition" requirements={plan.unclassifiedRequirements} />

      {plan.voiceRecording.required && (
        <section className="rounded-[7px] border border-[#1C1B19] bg-[#0F0F0E] p-3">
          <div className="flex items-center gap-2">
            <Mic className="h-3.5 w-3.5 text-[#4C93A2]" />
            <h3 className="text-[13px] font-medium text-[#ECE9E1]">Voice recording</h3>
          </div>
          <div className="mt-2 space-y-2">
            {plan.voiceRecording.speakers.map((speaker) => (
              <div key={speaker.characterId} className="border-t border-[#1C1B19] pt-2 text-[11px] leading-relaxed text-[#B5B2A8] first:border-t-0 first:pt-0">
                <p className="font-medium text-[#ECE9E1]">{speaker.characterName}</p>
                <p>
                  {speaker.languageCodes.join(", ") || "Language not specified"} · {speaker.deliveries.join(", ")}
                </p>
                <p>
                  {speaker.onCameraLineCount} on-camera line{speaker.onCameraLineCount === 1 ? "" : "s"} · {speaker.voiceoverLineCount} voice-over line{speaker.voiceoverLineCount === 1 ? "" : "s"}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {canEditInputs && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onEditInputs}
            className={`inline-flex items-center gap-1 rounded-[7px] border border-[#282724] px-2.5 py-1.5 text-[11px] text-[#B5B2A8] ${EASE} hover:text-[#ECE9E1] focus:outline-none focus-visible:shadow-[0_0_0_2px_#D4A65240]`}
          >
            <Pencil className="h-3 w-3" /> Confirm capture inputs
          </button>
        </div>
      )}
    </div>
  );
}
