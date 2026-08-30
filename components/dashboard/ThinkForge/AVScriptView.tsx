"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ChevronRight,
  FileVideo2,
  Lightbulb,
  Pencil,
  RefreshCw,
  Volume2,
} from "lucide-react";

import type { AVScriptPresentation } from "@/lib/thinkforge/presentation/av-script-projection";

export type AVScriptPresentationStatus =
  | "idle"
  | "loading"
  | "available"
  | "not_applicable"
  | "stale"
  | "invalid_contract"
  | "error";

type UnavailablePresentation = {
  status: "not_applicable" | "stale" | "invalid_contract";
  code: string;
  message: string;
};

export type AVScriptPresentationParseResult =
  | { status: "available"; presentation: AVScriptPresentation }
  | UnavailablePresentation
  | { status: "invalid_contract"; code: "malformed_response"; message: string };

type AVScriptViewState =
  | { status: "idle" | "loading" }
  | { status: "available"; presentation: AVScriptPresentation }
  | UnavailablePresentation
  | { status: "error"; message: string };

export interface AVScriptViewProps {
  sessionId?: string | null;
  scriptId?: string | null;
  documentVersion?: number;
  active: boolean;
  onStatusChange?: (status: AVScriptPresentationStatus) => void;
  onEditProse: () => void;
}

const MONO_LABEL = "font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-[#7A776E]";
type HeardDelivery = AVScriptPresentation["acts"][number]["scenes"][number]["beats"][number]["heard"][number]["delivery"];

function recordOf(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isCaptureRequirement(value: unknown): boolean {
  const record = recordOf(value);
  return Boolean(
    record
    && typeof record.objective === "string"
    && typeof record.whyRequired === "string"
    && typeof record.captureKind === "string"
    && stringArray(record.unresolvedCapabilityQuestions),
  );
}

function isVisualLayer(value: unknown): boolean {
  const record = recordOf(value);
  return Boolean(
    record
    && typeof record.audienceJob === "string"
    && typeof record.visualThesis === "string"
    && typeof record.audioRelationship === "string"
    && typeof record.timingNote === "string"
    && stringArray(record.continuityNotes)
    && stringArray(record.brandBoundaries)
    && stringArray(record.accessibilityRequirements)
    && typeof record.approvedSourceCount === "number"
    && typeof record.creativeReferenceCount === "number"
    && Array.isArray(record.captureRequirements)
    && record.captureRequirements.every(isCaptureRequirement),
  );
}

function isHeardLine(value: unknown): boolean {
  const record = recordOf(value);
  return Boolean(
    record
    && typeof record.speaker === "string"
    && (
      record.delivery === "sync-dialogue"
      || record.delivery === "voiceover"
      || record.delivery === "diegetic-speech"
    )
    && typeof record.text === "string"
    && typeof record.onCamera === "boolean",
  );
}

function isBeat(value: unknown): boolean {
  const record = recordOf(value);
  return Boolean(
    record
    && typeof record.kind === "string"
    && typeof record.narrativePurpose === "string"
    && (record.durationIntentSeconds === undefined || typeof record.durationIntentSeconds === "number")
    && Array.isArray(record.heard)
    && record.heard.every(isHeardLine)
    && stringArray(record.onScreenText)
    && Array.isArray(record.visualLayers)
    && record.visualLayers.every(isVisualLayer),
  );
}

function isScene(value: unknown): boolean {
  const record = recordOf(value);
  return Boolean(
    record
    && typeof record.title === "string"
    && typeof record.narrativePurpose === "string"
    && (record.durationIntentSeconds === undefined || typeof record.durationIntentSeconds === "number")
    && (record.mood === undefined || typeof record.mood === "string")
    && Array.isArray(record.beats)
    && record.beats.every(isBeat),
  );
}

function isAct(value: unknown): boolean {
  const record = recordOf(value);
  return Boolean(
    record
    && typeof record.title === "string"
    && typeof record.narrativePurpose === "string"
    && Array.isArray(record.scenes)
    && record.scenes.every(isScene),
  );
}

function isPresentation(value: unknown): value is AVScriptPresentation {
  const record = recordOf(value);
  const document = recordOf(record?.document);
  const treatment = recordOf(record?.treatment);
  const decisions = treatment?.decisions;
  return Boolean(
    record
    && record.version === 1
    && record.status === "available"
    && document
    && typeof document.title === "string"
    && typeof document.version === "number"
    && treatment
    && typeof treatment.audienceOutcome === "string"
    && typeof treatment.viewerPromise === "string"
    && typeof treatment.narrativeArc === "string"
    && typeof treatment.visualVerbalRelationship === "string"
    && typeof treatment.visualRhythm === "string"
    && stringArray(treatment.informationHierarchy)
    && stringArray(treatment.brandBoundaries)
    && stringArray(treatment.referenceSynthesis)
    && typeof treatment.continuityStrategy === "string"
    && typeof treatment.audioVoiceStrategy === "string"
    && stringArray(treatment.userConstraints)
    && stringArray(treatment.unresolvedAssumptions)
    && Array.isArray(decisions)
    && decisions.every((decision) => {
      const item = recordOf(decision);
      return Boolean(
        item
        && typeof item.decision === "string"
        && typeof item.rationale === "string"
        && typeof item.confidence === "number"
        && typeof item.evidenceCount === "number",
      );
    })
    && Array.isArray(record.acts)
    && record.acts.every(isAct),
  );
}

/**
 * The projection is a server-owned contract. Parse enough of every nested
 * array here to ensure a malformed successful response cannot crash the workspace.
 */
export function parseAVScriptPresentationResponse(value: unknown): AVScriptPresentationParseResult {
  if (isPresentation(value)) return { status: "available", presentation: value };

  const record = recordOf(value);
  if (
    record
    && (record.status === "not_applicable" || record.status === "stale" || record.status === "invalid_contract")
    && typeof record.code === "string"
    && typeof record.message === "string"
  ) {
    return {
      status: record.status,
      code: record.code,
      message: record.message,
    };
  }

  return {
    status: "invalid_contract",
    code: "malformed_response",
    message: "ThinkForge returned an incomplete AV Script response. Your saved prose is still available.",
  };
}

function humanize(value: string): string {
  return value.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDuration(seconds?: number): string | null {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) return null;
  const rounded = Math.round(seconds);
  const minutes = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return minutes > 0 ? `${minutes}:${String(remainder).padStart(2, "0")}` : `${remainder}s`;
}

function captureKindLabel(kind: string): string {
  const labels: Record<string, string> = {
    "physical-camera": "Physical capture needed",
    "screen-recording": "Screen capture needed",
    "source-asset": "Approved source material needed",
    unspecified: "Acquisition choice needed",
  };
  return labels[kind] ?? humanize(kind);
}

function heardDeliveryLabel(delivery: HeardDelivery): string {
  const labels: Record<HeardDelivery, string> = {
    "sync-dialogue": "spoken on camera",
    voiceover: "voice-over",
    "diegetic-speech": "heard within the scene",
  };
  return labels[delivery];
}

function ListSection({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <section className="border-t border-[#1C1B19] pt-3">
      <h3 className={MONO_LABEL}>{title}</h3>
      <ul className="mt-2 space-y-1.5">
        {items.map((item) => (
          <li key={item} className="flex gap-2 text-[12px] leading-relaxed text-[#B5B2A8]">
            <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#D4A652]" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TreatmentRationale({ presentation }: { presentation: AVScriptPresentation }) {
  const { treatment } = presentation;
  const hasDetails = treatment.decisions.length > 0
    || treatment.referenceSynthesis.length > 0
    || treatment.brandBoundaries.length > 0
    || treatment.unresolvedAssumptions.length > 0;
  if (!hasDetails) return null;

  return (
    <details className="border-y border-[#1C1B19] py-4">
      <summary className="cursor-pointer list-none text-[13px] font-medium text-[#ECE9E1] marker:hidden">
        <span className="flex items-center gap-2"><Lightbulb className="h-4 w-4 text-[#D4A652]" /> Why this treatment</span>
      </summary>
      <div className="mt-4 space-y-4">
        {treatment.decisions.length > 0 && (
          <section>
            <h3 className={MONO_LABEL}>Editorial decisions</h3>
            <div className="mt-2 space-y-3">
              {treatment.decisions.map((decision) => (
                <article key={`${decision.decision}:${decision.rationale}`} className="border-l-2 border-[#4C93A2] pl-3">
                  <p className="text-[12px] font-medium text-[#ECE9E1]">{decision.decision}</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-[#B5B2A8]">{decision.rationale}</p>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[#7A776E]">
                    Confidence {Math.round(decision.confidence * 100)}% · {decision.evidenceCount} evidence item{decision.evidenceCount === 1 ? "" : "s"}
                  </p>
                </article>
              ))}
            </div>
          </section>
        )}
        <ListSection title="Reference synthesis" items={treatment.referenceSynthesis} />
        <ListSection title="Brand boundaries" items={treatment.brandBoundaries} />
        <ListSection title="Open assumptions" items={treatment.unresolvedAssumptions} />
      </div>
    </details>
  );
}

function VisualLayer({ layer, index }: { layer: AVScriptPresentation["acts"][number]["scenes"][number]["beats"][number]["visualLayers"][number]; index: number }) {
  return (
    <article className="border-l-2 border-[#4C93A2] pl-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#7A776E]">Visual layer {index + 1}</p>
      <p className="mt-1 text-[13px] font-medium text-[#ECE9E1]">{layer.audienceJob}</p>
      <p className="mt-1 text-[12px] leading-relaxed text-[#B5B2A8]">{layer.visualThesis}</p>
      <p className="mt-2 text-[11px] leading-relaxed text-[#9C998F]">
        <span className="font-medium text-[#ECE9E1]">Relationship to audio: </span>{humanize(layer.audioRelationship)}
        {layer.timingNote ? ` · ${layer.timingNote}` : ""}
      </p>

      {layer.captureRequirements.length > 0 && (
        <div className="mt-3 space-y-2 border-t border-[#1C1B19] pt-2">
          <p className={MONO_LABEL}>What needs to be acquired</p>
          {layer.captureRequirements.map((requirement) => (
            <div key={`${requirement.captureKind}:${requirement.objective}`} className="text-[11px] leading-relaxed text-[#B5B2A8]">
              <p><span className="font-medium text-[#ECE9E1]">{captureKindLabel(requirement.captureKind)}: </span>{requirement.objective}</p>
              <p className="mt-0.5 text-[#7A776E]">{requirement.whyRequired}</p>
              {requirement.unresolvedCapabilityQuestions.length > 0 && (
                <ul className="mt-1 space-y-1 pl-3 text-[#9C998F]">
                  {requirement.unresolvedCapabilityQuestions.map((question) => <li key={question} className="list-disc">{question}</li>)}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {(layer.continuityNotes.length > 0 || layer.brandBoundaries.length > 0 || layer.accessibilityRequirements.length > 0) && (
        <div className="mt-3 grid gap-3 border-t border-[#1C1B19] pt-2 sm:grid-cols-3">
          <ListSection title="Continuity" items={layer.continuityNotes} />
          <ListSection title="Brand" items={layer.brandBoundaries} />
          <ListSection title="Accessibility" items={layer.accessibilityRequirements} />
        </div>
      )}

      <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.08em] text-[#7A776E]">
        {layer.approvedSourceCount} approved source{layer.approvedSourceCount === 1 ? "" : "s"} · {layer.creativeReferenceCount} creative reference{layer.creativeReferenceCount === 1 ? "" : "s"}
      </p>
    </article>
  );
}

function AVPresentationBody({ presentation, onEditProse }: { presentation: AVScriptPresentation; onEditProse: () => void }) {
  const { treatment } = presentation;
  return (
    <div className="h-full overflow-y-auto bg-[#0B0B0A]">
      <div className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 sm:py-7">
        <header className="border-b border-[#1C1B19] pb-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className={MONO_LABEL}>AV Script · saved document v{presentation.document.version}</p>
              <h1 className="mt-2 text-xl font-semibold text-[#ECE9E1] sm:text-2xl">{presentation.document.title}</h1>
              <p className="mt-3 max-w-3xl text-[13px] leading-relaxed text-[#B5B2A8]">{treatment.viewerPromise}</p>
            </div>
            <button
              type="button"
              onClick={onEditProse}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-[7px] border border-[#282724] px-3 py-2 text-[12px] text-[#B5B2A8] transition-colors hover:text-[#ECE9E1] focus:outline-none focus-visible:shadow-[0_0_0_2px_#D4A65240]"
            >
              <Pencil className="h-3.5 w-3.5" /> Edit prose
            </button>
          </div>
        </header>

        <section className="grid gap-x-8 gap-y-4 border-b border-[#1C1B19] py-5 sm:grid-cols-2">
          <div>
            <p className={MONO_LABEL}>Audience outcome</p>
            <p className="mt-1 text-[13px] leading-relaxed text-[#ECE9E1]">{treatment.audienceOutcome}</p>
          </div>
          <div>
            <p className={MONO_LABEL}>Narrative arc</p>
            <p className="mt-1 text-[13px] leading-relaxed text-[#ECE9E1]">{treatment.narrativeArc}</p>
          </div>
          <div>
            <p className={MONO_LABEL}>Visual and verbal relationship</p>
            <p className="mt-1 text-[13px] leading-relaxed text-[#B5B2A8]">{humanize(treatment.visualVerbalRelationship)}</p>
          </div>
          <div>
            <p className={MONO_LABEL}>Visual rhythm</p>
            <p className="mt-1 text-[13px] leading-relaxed text-[#B5B2A8]">{treatment.visualRhythm}</p>
          </div>
        </section>

        <TreatmentRationale presentation={presentation} />

        <div className="mt-6 space-y-8">
          {presentation.acts.map((act, actIndex) => (
            <section key={`${actIndex}:${act.title}`} className="border-b border-[#282724] pb-8 last:border-b-0">
              <div className="flex items-baseline gap-3">
                <p className={MONO_LABEL}>Act {actIndex + 1}</p>
                <h2 className="text-base font-semibold text-[#ECE9E1]">{act.title}</h2>
              </div>
              <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-[#B5B2A8]">{act.narrativePurpose}</p>

              <div className="mt-5 space-y-5">
                {act.scenes.map((scene, sceneIndex) => (
                  <article key={`${sceneIndex}:${scene.title}`} className="border border-[#1C1B19] bg-[#0F0F0E] p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className={MONO_LABEL}>Narrative scene {sceneIndex + 1}</p>
                        <h3 className="mt-1 text-[15px] font-medium text-[#ECE9E1]">{scene.title}</h3>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {formatDuration(scene.durationIntentSeconds) && (
                          <span className="rounded-[4px] border border-[#282724] px-1.5 py-0.5 font-mono text-[10px] text-[#B5B2A8]">Intent {formatDuration(scene.durationIntentSeconds)}</span>
                        )}
                        {scene.mood && <span className="rounded-[4px] border border-[#282724] px-1.5 py-0.5 font-mono text-[10px] text-[#B5B2A8]">{scene.mood}</span>}
                      </div>
                    </div>
                    <p className="mt-2 text-[12px] leading-relaxed text-[#B5B2A8]">{scene.narrativePurpose}</p>

                    <div className="mt-5 space-y-5">
                      {scene.beats.map((beat, beatIndex) => (
                        <section key={`${beatIndex}:${beat.narrativePurpose}`} className="border-t border-[#1C1B19] pt-4 first:border-t-0 first:pt-0">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <div className="flex items-baseline gap-2">
                              <p className={MONO_LABEL}>Beat {beatIndex + 1}</p>
                              <p className="text-[12px] font-medium text-[#ECE9E1]">{humanize(beat.kind)}</p>
                            </div>
                            {formatDuration(beat.durationIntentSeconds) && <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#7A776E]">Intent {formatDuration(beat.durationIntentSeconds)}</span>}
                          </div>
                          <p className="mt-1 text-[12px] leading-relaxed text-[#B5B2A8]">{beat.narrativePurpose}</p>

                          <div className="mt-4 grid gap-4 lg:grid-cols-2">
                            <section>
                              <div className="flex items-center gap-2"><Volume2 className="h-3.5 w-3.5 text-[#4C93A2]" /><h4 className={MONO_LABEL}>What is heard</h4></div>
                              {beat.heard.length > 0 ? (
                                <div className="mt-2 space-y-2">
                                  {beat.heard.map((line, lineIndex) => (
                                    <div key={`${lineIndex}:${line.text}`} className="border-l-2 border-[#D4A652] pl-3 text-[12px] leading-relaxed text-[#B5B2A8]">
                                      <p className="font-medium text-[#ECE9E1]">{line.speaker} <span className="font-normal text-[#7A776E]">· {heardDeliveryLabel(line.delivery)}</span></p>
                                      <p className="mt-0.5">{line.text}</p>
                                    </div>
                                  ))}
                                </div>
                              ) : <p className="mt-2 text-[12px] text-[#7A776E]">No spoken delivery is planned for this beat.</p>}
                            </section>
                            <section>
                              <div className="flex items-center gap-2"><FileVideo2 className="h-3.5 w-3.5 text-[#4C93A2]" /><h4 className={MONO_LABEL}>On-screen words</h4></div>
                              {beat.onScreenText.length > 0 ? (
                                <ul className="mt-2 space-y-1.5">
                                  {beat.onScreenText.map((text) => <li key={text} className="border-l-2 border-[#4C93A2] pl-3 text-[12px] leading-relaxed text-[#B5B2A8]">{text}</li>)}
                                </ul>
                              ) : <p className="mt-2 text-[12px] text-[#7A776E]">No on-screen wording is required.</p>}
                            </section>
                          </div>

                          <section className="mt-4">
                            <h4 className={MONO_LABEL}>What the audience sees</h4>
                            {beat.visualLayers.length > 0 ? (
                              <div className="mt-3 space-y-4">
                                {beat.visualLayers.map((layer, layerIndex) => <VisualLayer key={`${layerIndex}:${layer.visualThesis}`} layer={layer} index={layerIndex} />)}
                              </div>
                            ) : <p className="mt-2 text-[12px] text-[#7A776E]">No visual layer is declared for this beat.</p>}
                          </section>
                        </section>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function AVStatusView({ state, onRetry, onEditProse }: { state: Exclude<AVScriptViewState, { status: "available" | "idle" | "loading" }>; onRetry: () => void; onEditProse: () => void }) {
  const stale = state.status === "stale";
  const isError = state.status === "error";
  const title = stale ? "The AV treatment needs a refresh" : isError ? "AV Script is temporarily unavailable" : "AV Script is unavailable for this document";
  const message = state.message;
  return (
    <div className="flex h-full items-center justify-center bg-[#0B0B0A] p-6">
      <section className="w-full max-w-lg border border-[#D4A65233] bg-[#0F0F0E] p-5" role="alert">
        <div className="flex gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#E1BF72]" />
          <div>
            <h2 className="text-[15px] font-medium text-[#ECE9E1]">{title}</h2>
            <p className="mt-2 text-[12px] leading-relaxed text-[#B5B2A8]">{message}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={onEditProse} className="inline-flex items-center gap-1.5 rounded-[7px] border border-[#282724] px-3 py-2 text-[12px] text-[#B5B2A8] hover:text-[#ECE9E1]"><Pencil className="h-3.5 w-3.5" /> Edit prose</button>
              {isError && <button type="button" onClick={onRetry} className="inline-flex items-center gap-1.5 rounded-[7px] border border-[#282724] px-3 py-2 text-[12px] text-[#B5B2A8] hover:text-[#ECE9E1]"><RefreshCw className="h-3.5 w-3.5" /> Retry</button>}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export function AVScriptView({ sessionId, scriptId, documentVersion, active, onStatusChange, onEditProse }: AVScriptViewProps) {
  const [state, setState] = useState<AVScriptViewState>({ status: "idle" });
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    if (!sessionId || !scriptId || !Number.isInteger(documentVersion) || (documentVersion ?? 0) <= 0) {
      setState({ status: "idle" });
      onStatusChange?.("idle");
      return;
    }

    const controller = new AbortController();
    setState({ status: "loading" });
    onStatusChange?.("loading");

    void (async () => {
      try {
        const params = new URLSearchParams({ sessionId, scriptId });
        const response = await fetch(`/api/services/thinkforge/script/av-presentation?${params.toString()}`, {
          signal: controller.signal,
        });
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const record = recordOf(body);
          const message = typeof record?.error === "string"
            ? record.error
            : "ThinkForge could not load the AV Script right now.";
          if (!controller.signal.aborted) {
            setState({ status: "error", message });
            onStatusChange?.("error");
          }
          return;
        }

        const parsed = parseAVScriptPresentationResponse(body);
        if (controller.signal.aborted) return;
        if (parsed.status === "available") {
          setState(parsed);
          onStatusChange?.("available");
          return;
        }
        setState(parsed);
        onStatusChange?.(parsed.status);
      } catch (error) {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "ThinkForge could not load the AV Script right now.",
        });
        onStatusChange?.("error");
      }
    })();

    return () => controller.abort();
  }, [documentVersion, onStatusChange, retryNonce, scriptId, sessionId]);

  if (!active) return null;
  if (state.status === "idle" || state.status === "loading") {
    return (
      <div className="flex h-full items-center justify-center bg-[#0B0B0A]" aria-busy="true">
        <div className="flex items-center gap-2 text-[12px] text-[#B5B2A8]"><RefreshCw className="h-4 w-4 animate-spin text-[#D4A652]" /> Loading AV Script</div>
      </div>
    );
  }
  if (
    state.status === "not_applicable"
    || state.status === "stale"
    || state.status === "invalid_contract"
    || state.status === "error"
  ) {
    return <AVStatusView state={state} onRetry={() => setRetryNonce((value) => value + 1)} onEditProse={onEditProse} />;
  }
  if (state.status === "available") {
    return <AVPresentationBody presentation={state.presentation} onEditProse={onEditProse} />;
  }
  return null;
}
