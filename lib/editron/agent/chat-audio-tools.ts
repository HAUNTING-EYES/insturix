import { tool } from "@langchain/core/tools";
import { z } from "zod";

import { AUDIO_LEVELS, DEFAULT_DUCKING_CONFIG } from "../constants/audio-standards";
import { ROW } from "@/lib/pipeline/scene-to-editron";
import {
  selectStrongestSpeechEmphasis,
  type ChatSpeechEmphasisCandidate,
} from "@/lib/editron/services/chat-signal-moment-evidence";
import {
  CHAT_LOCALIZED_ANCHOR_SIGNALS,
  type ChatLocalizedAnchorSignal,
} from "./chat-command-authority";
import { readProjectRevisionV1 } from "../services/project-revision-v1";

type OverlayId = string | number;

export type AudioMomentKind =
  | "silence"
  | "filler"
  | "beat"
  | "downbeat"
  | "beat-drop"
  | "transient"
  | "energy-peak"
  | "music-section"
  | "speech"
  | "sound-overlay"
  | "problem";

export interface AudioMomentCandidate {
  text: string;
  audioKind: AudioMomentKind;
  frame: number;
  startFrame: number;
  endFrame: number;
  startMs: number;
  endMs: number;
  durationFrames: number;
  confidence: number;
  confidenceLabel: "high" | "medium" | "low";
  signalStrength?: number;
  matchType: "exact-phrase" | "audio-kind" | "token-overlap" | "character-vector" | "signal-ranked";
  matchReasons: string[];
  evidenceText: string;
  source: {
    type: "overlay" | "analysis";
    overlayId?: OverlayId;
    assetId?: string;
    overlayType?: string;
    auditId?: string;
    evidenceId?: string;
    path: string;
  };
  safeForAutoEdit: boolean;
  useWith: {
    cut_section: { startFrame: number; endFrame: number; note: string };
    add_sfx: { frame: number; sync: "audio-anchor"; note: string };
    apply_camera_shake: { targetFrame: number; note: string };
    set_keyframes: { frame: number; note: string };
    sync_cuts_to_beats: { frame: number; note: string };
    add_motion_graphic: { frame: number; text: string };
  };
}

export type AudioEditAction = "add_sfx" | "camera_shake" | "cut_section" | "keyframe_anchor" | "sync_cuts_to_beats";
export type AudioEditResolutionStatus = "ready" | "no-match" | "ambiguous" | "unsupported";

export interface AudioTemporalConstraint {
  referenceFrame: number;
  relation: "after" | "before" | "nearest";
  occurrence: "first" | "last" | "nearest";
}

export interface AudioEditResolveOptions extends AudioMomentOptions {
  action?: AudioEditAction;
  sfxQuery?: string;
  temporalConstraint?: AudioTemporalConstraint;
  precomputedCandidates?: AudioMomentCandidate[];
}

export interface AudioEditResolution {
  status: AudioEditResolutionStatus;
  action: AudioEditAction;
  query: string;
  searchedCandidateCount: number;
  candidates: AudioMomentCandidate[];
  candidate?: AudioMomentCandidate;
  useWith?: {
    add_sfx?: { query: string; frame: number; sync: "audio-anchor"; note: string };
    apply_camera_shake?: AudioMomentCandidate["useWith"]["apply_camera_shake"];
    cut_section?: AudioMomentCandidate["useWith"]["cut_section"];
    sync_cuts_to_beats?: AudioMomentCandidate["useWith"]["sync_cuts_to_beats"];
  };
  warnings: string[];
  message: string;
}

interface CreateChatAudioToolsOptions {
  userId: string;
  projectId: string;
}

interface AudioMomentOptions {
  audioOverlayId?: OverlayId;
  limit?: number;
  minConfidence?: number;
  includeOverlayMetadata?: boolean;
  temporalConstraint?: AudioTemporalConstraint;
}

export interface AudioDuckingConfig {
  enabled: boolean;
  duckLevel: number;
  rampDownMs: number;
  rampUpMs: number;
  lookAheadMs: number;
}

export interface AudioDuckingOverlayUpdate {
  overlayId: OverlayId;
  row: number | undefined;
  previousConfig: AudioDuckingConfig | undefined;
  nextConfig: AudioDuckingConfig;
  nextStyles: Record<string, unknown>;
  reason: string;
}

export interface AudioDuckingPlan {
  status: "changed" | "unchanged" | "no-bgm";
  bgmOverlayIds: OverlayId[];
  voiceSourceOverlayIds: OverlayId[];
  speechEvidenceCount: number;
  updates: AudioDuckingOverlayUpdate[];
  unchangedOverlayIds: OverlayId[];
  skippedOverlayIds: OverlayId[];
  warnings: string[];
  config: AudioDuckingConfig;
  message: string;
}

interface FrameRange {
  startFrame: number;
  endFrame: number;
}

interface AudioEvidence {
  audioKind: AudioMomentKind;
  evidenceText: string;
  frame: number;
  startFrame: number;
  endFrame: number;
  durationFrames: number;
  fps: number;
  strength?: number;
  source: AudioMomentCandidate["source"];
}

interface CollectContext {
  path: string;
  fps: number;
  range: FrameRange;
  sourceBase: Omit<AudioMomentCandidate["source"], "path">;
  output: AudioEvidence[];
  totalDurationFrames: number;
}

const DEFAULT_FPS = 30;
const DEFAULT_CLIP_DURATION_FRAMES = 30;

const audioMomentSchema = z.object({
  query: z.string().min(1).describe("Natural-language audio event, beat, drop, silence, filler, music section, or sound cue to locate."),
  audioOverlayId: z.union([z.string(), z.number()]).optional().describe("Optional timeline audio/video overlay id to constrain the search."),
  selectionGoal: z.literal("strongest-signal").optional().describe("Rank measured evidence instead of matching query words."),
  selectionSignal: z.enum(CHAT_LOCALIZED_ANCHOR_SIGNALS).optional().describe("Measured signal to rank. Required with strongest-signal."),
  limit: z.coerce.number().int().min(1).max(12).default(5).describe("Maximum audio moment candidates to return."),
  minConfidence: z.coerce.number().min(0).max(1).default(0.35).describe("Minimum candidate confidence."),
  includeOverlayMetadata: z.boolean().default(true).describe("Also search audio/sound overlay metadata and labels."),
});

const audioEditSchema = audioMomentSchema.extend({
  action: z.enum(["add_sfx", "camera_shake", "cut_section", "keyframe_anchor", "sync_cuts_to_beats"]).default("add_sfx").describe("Edit operation that needs the resolved audio timing. keyframe_anchor only grounds timing; resolve_keyframe_edit remains the zoom-form owner."),
  sfxQuery: z.string().trim().min(1).optional().describe("Optional SFX search query to pass to add_sfx. If omitted, the resolver derives a conservative query from the request words."),
  temporalConstraint: z.object({
    referenceFrame: z.coerce.number().int().min(0),
    relation: z.enum(["after", "before", "nearest"]),
    occurrence: z.enum(["first", "last", "nearest"]),
  }).strict().optional().describe("Server-resolved temporal relation. The model must never invent referenceFrame."),
});

const audioDuckingSchema = z.object({
  enabled: z.boolean().default(true).describe("Whether BGM ducking should be enabled. Use false only when the user asks to remove/disable ducking."),
  duckLevel: z.coerce.number().min(0.02).max(0.8).default(DEFAULT_DUCKING_CONFIG.duckLevel).describe("BGM volume while speech/voiceover is active, 0-1."),
  rampDownMs: z.coerce.number().int().min(50).max(2000).default(DEFAULT_DUCKING_CONFIG.rampDownMs).describe("How quickly BGM lowers when speech starts."),
  rampUpMs: z.coerce.number().int().min(50).max(3000).default(DEFAULT_DUCKING_CONFIG.rampUpMs).describe("How quickly BGM returns after speech ends."),
  lookAheadMs: z.coerce.number().int().min(0).max(1000).default(DEFAULT_DUCKING_CONFIG.lookAheadMs).describe("Start lowering BGM this many milliseconds before speech starts."),
});

const PROJECT_AUDIO_ROOT_KEYS = [
  "analysis",
  "rawFootageAnalysis",
  "audio",
  "audioAnalysis",
  "audioFeatures",
  "musicAnalysis",
  "musicStructure",
  "fiveTrackAnalysis",
  "essentiaAnalysis",
  "analysisResult",
  "analysisResults",
  "mediaAnalysis",
];

const OVERLAY_AUDIO_ROOT_KEYS = [
  "analysis",
  "audio",
  "audioAnalysis",
  "audioFeatures",
  "musicAnalysis",
  "musicStructure",
  "beatGrid",
  "metadata",
];

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "at",
  "before",
  "for",
  "from",
  "in",
  "into",
  "of",
  "on",
  "the",
  "this",
  "to",
  "when",
  "where",
  "with",
]);

const KIND_TERMS: Record<AudioMomentKind, string[]> = {
  silence: ["silence", "silent", "pause", "quiet", "gap", "dead", "air", "room", "tone"],
  filler: ["filler", "um", "uh", "erm", "like", "stutter", "hesitation"],
  beat: ["beat", "pulse", "rhythm", "sync"],
  downbeat: ["downbeat", "beat", "one", "measure"],
  "beat-drop": ["drop", "beat", "hit", "impact", "climax", "chorus", "peak"],
  transient: ["transient", "hit", "impact", "accent", "stinger", "snap"],
  "energy-peak": ["energy", "loud", "peak", "swell", "climax", "rise"],
  "music-section": ["music", "section", "chorus", "verse", "intro", "outro", "build", "breakdown", "bridge", "drop"],
  speech: ["speech", "voice", "talking", "narration", "spoken"],
  "sound-overlay": ["sound", "audio", "music", "sfx", "song", "track", "voiceover"],
  problem: ["problem", "remove", "cleanup", "awkward", "bad"],
};

async function loadMeasuredSpeechEmphasisCandidates(input: {
  projectId: string;
  userId: string;
  project: any;
  audioOverlayId?: OverlayId;
  limit: number;
}): Promise<{
  auditId: string;
  searchedEvidenceCount: number;
  candidates: AudioMomentCandidate[];
}> {
  const ranked = await selectStrongestSpeechEmphasis({
    projectId: input.projectId,
    userId: input.userId,
    project: input.project,
    overlayId: input.audioOverlayId,
    limit: input.limit,
  });
  return {
    auditId: ranked.auditId,
    searchedEvidenceCount: ranked.candidates.length,
    candidates: ranked.candidates
      .map((candidate) => speechEmphasisToAudioCandidate(candidate, ranked.auditId))
      .filter((candidate): candidate is AudioMomentCandidate => candidate != null),
  };
}

function loadMeasuredImpactEmphasisCandidates(input: {
  project: any;
  audioOverlayId?: OverlayId;
  limit: number;
}): {
  searchedEvidenceCount: number;
  candidates: AudioMomentCandidate[];
} {
  const measuredEvidence = buildAudioEvidence(input.project, {
    audioOverlayId: input.audioOverlayId,
    includeOverlayMetadata: true,
  }).filter((evidence) => (
    isImpactEmphasisKind(evidence.audioKind)
    && evidence.strength != null
  ));

  const strongestPerFrame = new Map<number, AudioEvidence>();
  for (const evidence of measuredEvidence) {
    const existing = strongestPerFrame.get(evidence.frame);
    if (
      existing == null
      || (evidence.strength ?? -1) > (existing.strength ?? -1)
      || (
        evidence.strength === existing.strength
        && impactKindPriority(evidence.audioKind) > impactKindPriority(existing.audioKind)
      )
    ) {
      strongestPerFrame.set(evidence.frame, evidence);
    }
  }

  const ranked = Array.from(strongestPerFrame.values())
    .sort((a, b) => (
      (b.strength ?? -1) - (a.strength ?? -1)
      || impactKindPriority(b.audioKind) - impactKindPriority(a.audioKind)
      || a.frame - b.frame
      || a.source.path.localeCompare(b.source.path)
    ));
  const topStrength = ranked[0]?.strength;
  const hasDistinctTopTie = topStrength != null && ranked
    .slice(1)
    .some((evidence) => evidence.strength === topStrength);

  return {
    searchedEvidenceCount: measuredEvidence.length,
    candidates: ranked
      .slice(0, input.limit)
      .map((evidence, index) => measuredImpactToAudioCandidate(
        evidence,
        index === 0 && !hasDistinctTopTie,
      )),
  };
}

async function loadMeasuredRankedAudioCandidates(input: {
  projectId: string;
  userId: string;
  project: any;
  audioOverlayId?: OverlayId;
  limit: number;
  signal: ChatLocalizedAnchorSignal;
}): Promise<{
  auditId?: string;
  searchedEvidenceCount: number;
  candidates: AudioMomentCandidate[];
}> {
  if (input.signal === "speech-emphasis") {
    return loadMeasuredSpeechEmphasisCandidates(input);
  }
  return loadMeasuredImpactEmphasisCandidates(input);
}

export function findStrongestImpactEmphasisCandidates(
  project: any,
  options: Pick<AudioMomentOptions, "audioOverlayId" | "limit"> = {},
): AudioMomentCandidate[] {
  return loadMeasuredImpactEmphasisCandidates({
    project,
    audioOverlayId: options.audioOverlayId,
    limit: options.limit ?? 5,
  }).candidates;
}

export function createChatAudioTools({ userId, projectId }: CreateChatAudioToolsOptions) {
  const findAudioMoment = tool(
    async (input: z.infer<typeof audioMomentSchema>) => {
      const { projectService } = await import("../services/project-service");
      const project = await projectService.loadProject(userId, projectId);
      if (input.selectionGoal || input.selectionSignal) {
        if (input.selectionGoal !== "strongest-signal" || input.selectionSignal == null) {
          return JSON.stringify({
            status: "error",
            message: "Ranked audio selection requires selectionGoal=strongest-signal and a measured selectionSignal.",
          });
        }
        const ranked = await loadMeasuredRankedAudioCandidates({
          projectId,
          userId,
          project,
          audioOverlayId: input.audioOverlayId,
          limit: input.limit,
          signal: input.selectionSignal,
        });
        const candidates = ranked.candidates;
        return JSON.stringify({
          status: "success",
          data: {
            query: input.query,
            selection: {
              goal: input.selectionGoal,
              signal: input.selectionSignal,
              auditId: ranked.auditId,
            },
            searchedEvidenceCount: ranked.searchedEvidenceCount,
            returned: candidates.length,
            candidates,
            message: candidates.some((candidate) => candidate.safeForAutoEdit)
              ? `Found one uniquely strongest mapped ${input.selectionSignal} moment from measured evidence.`
              : `No uniquely strongest mapped ${input.selectionSignal} moment was safe for automatic editing.`,
          },
        });
      }
      const evidence = buildAudioEvidence(project, {
        audioOverlayId: input.audioOverlayId,
        includeOverlayMetadata: input.includeOverlayMetadata,
      });
      const candidates = findAudioMomentCandidates(project, input.query, {
        audioOverlayId: input.audioOverlayId,
        limit: input.limit,
        minConfidence: input.minConfidence,
        includeOverlayMetadata: input.includeOverlayMetadata,
      });

      return JSON.stringify({
        status: "success",
        data: {
          query: input.query,
          searchedEvidenceCount: evidence.length,
          returned: candidates.length,
          candidates,
          message: candidates.length
            ? `Found ${candidates.length} audio moment candidate(s). Use frame/startFrame/endFrame directly when confidence is high.`
            : `No stored audio evidence matched "${input.query}". Use analyze_clip_audio first, or ask once for a clearer audio phrase.`,
        },
      });
    },
    {
      name: "find_audio_moment",
      description: `Find when a stored audio event, silence, filler, beat, downbeat, music drop, energy peak, music section, or sound overlay appears in the edited timeline.
Use before edit requests such as "cut the long pause", "add impact on the beat drop", "sync this cut to the downbeat", or "put SFX on the loud hit".
For requests such as "the strongest spoken emphasis", pass selectionGoal=strongest-signal and selectionSignal=speech-emphasis. For the strongest impact, hit, transient, or beat emphasis, use selectionSignal=impact-emphasis. Ranked paths use persisted measurements and never fall back to matching those words.
Returns deterministic frame candidates, confidence, source evidence, and exact frame hints for cut_section, add_sfx, apply_camera_shake, set_keyframes, sync_cuts_to_beats, and add_motion_graphic.
Do not make a destructive edit from a low-confidence or ambiguous candidate; present the candidates and ask once.`,
      schema: audioMomentSchema,
    },
  );

  const resolveAudioEdit = tool(
    async (input: z.infer<typeof audioEditSchema>) => {
      const { projectService } = await import("../services/project-service");
      const project = await projectService.loadProject(userId, projectId);
      let precomputedCandidates: AudioMomentCandidate[] | undefined;
      if (input.selectionGoal || input.selectionSignal) {
        if (input.selectionGoal !== "strongest-signal" || input.selectionSignal == null) {
          return JSON.stringify({
            status: "error",
            message: "Ranked audio selection requires selectionGoal=strongest-signal and a measured selectionSignal.",
          });
        }
        precomputedCandidates = (await loadMeasuredRankedAudioCandidates({
          projectId,
          userId,
          project,
          audioOverlayId: input.audioOverlayId,
          limit: input.limit,
          signal: input.selectionSignal,
        })).candidates;
      }
      const resolution = resolveAudioEditTiming(project, input.query, {
        action: input.action,
        audioOverlayId: input.audioOverlayId,
        limit: input.limit,
        minConfidence: input.minConfidence,
        includeOverlayMetadata: input.includeOverlayMetadata,
        sfxQuery: input.sfxQuery,
        temporalConstraint: input.temporalConstraint,
        precomputedCandidates,
      });

      return JSON.stringify(buildAudioEditResolutionEnvelope(resolution));
    },
    {
      name: "resolve_audio_edit",
      description: `Resolve an audio-referenced edit into operation-ready timing.
Use after or instead of find_audio_moment for requests like "add impact on the first beat drop", "shake on the strongest hit", "cut the long silence", or "sync the cut to the downbeat".
This is read-only: it returns safe frame params for add_sfx, apply_camera_shake, cut_section, or sync_cuts_to_beats, and refuses no-match, ambiguous, low-confidence, or unsupported audio references.`,
      schema: audioEditSchema,
    },
  );

  const applyAudioDucking = tool(
    async (input: z.infer<typeof audioDuckingSchema>) => {
      try {
        const { projectService } = await import("../services/project-service");
        const project = await projectService.loadProject(userId, projectId);
        if (!project) {
          return JSON.stringify({ status: "error", message: `Project ${projectId} was not found or is not accessible.` });
        }

        const plan = applyAudioDuckingToProject(project, input);
        if (plan.status === "no-bgm") {
          return JSON.stringify({
            status: "error",
            message: plan.message,
            data: plan,
          });
        }
        if (plan.status === "unchanged") {
          return JSON.stringify({
            status: "no-op",
            data: plan,
            error: null,
            nextAction: "stop",
            message: plan.message,
          });
        }

        let expectedRevision = readProjectRevisionV1(project);
        if (!expectedRevision) {
          throw new Error("The project revision is unavailable; reload before applying audio ducking.");
        }
        for (const update of plan.updates) {
          const result = await projectService.updateOverlayAtRevisionV1(
            userId,
            projectId,
            {
              expectedRevision,
              actorKind: "AGENT",
              overlayId: update.overlayId,
              updates: { styles: update.nextStyles } as any,
            },
          );
          expectedRevision = result.mutationReceipt.revision;
        }

        return JSON.stringify({
          status: "success",
          data: {
            ...plan,
            message: plan.message,
          },
        });
      } catch (error: any) {
        return JSON.stringify({ status: "error", message: error?.message ?? "Failed to apply audio ducking." });
      }
    },
    {
      name: "apply_audio_ducking",
      description: `Enable professional BGM ducking under speech/voiceover.
Use when the user asks to lower music under speech, make dialogue clearer, stop music competing with voice, or remove/disable ducking.
This only updates BGM sound overlays. It must not modify SFX, captions, video timing, or generate new audio.`,
      schema: audioDuckingSchema,
    },
  );

  return [findAudioMoment, resolveAudioEdit, applyAudioDucking];
}

export function speechEmphasisToAudioCandidate(
  candidate: ChatSpeechEmphasisCandidate,
  auditId: string,
): AudioMomentCandidate | null {
  if (
    candidate.frame == null
    || candidate.startFrame == null
    || candidate.endFrame == null
    || candidate.endFrame <= candidate.startFrame
  ) {
    return null;
  }
  const note = `Prosody-ranked speech emphasis from evidence ${candidate.evidenceId}.`;
  const text = candidate.transcriptText.trim() || "speech emphasis";
  const confidence = clamp(candidate.score, 0, 1);
  return {
    text,
    audioKind: "speech",
    frame: candidate.frame,
    startFrame: candidate.startFrame,
    endFrame: candidate.endFrame,
    startMs: candidate.sourceStartMs,
    endMs: candidate.sourceEndMs,
    durationFrames: candidate.endFrame - candidate.startFrame,
    confidence,
    confidenceLabel: confidenceLabel(confidence),
    matchType: "signal-ranked",
    matchReasons: [
      "ranked-speech-prosody",
      `vocal-energy:${candidate.channels.vocalEnergy ?? "missing"}`,
      `emotion-intensity:${candidate.channels.emotionIntensity ?? "missing"}`,
      `pitch-variability:${candidate.channels.pitchVariability ?? "missing"}`,
      ...candidate.rejectionReasons,
    ],
    evidenceText: text,
    source: {
      type: "analysis",
      ...(candidate.overlayId != null ? { overlayId: candidate.overlayId } : {}),
      assetId: candidate.assetId,
      auditId,
      evidenceId: candidate.evidenceId,
      path: candidate.sourcePaths[0] ?? "editron_asset_analyses.segmentAnalysis",
    },
    safeForAutoEdit: candidate.safeForAutomaticMutation,
    useWith: {
      cut_section: {
        startFrame: candidate.startFrame,
        endFrame: candidate.endFrame,
        note,
      },
      add_sfx: {
        frame: candidate.frame,
        sync: "audio-anchor",
        note,
      },
      apply_camera_shake: {
        targetFrame: candidate.frame,
        note,
      },
      set_keyframes: {
        frame: candidate.frame,
        note,
      },
      sync_cuts_to_beats: {
        frame: candidate.frame,
        note,
      },
      add_motion_graphic: {
        frame: candidate.frame,
        text,
      },
    },
  };
}

export function buildAudioEditResolutionEnvelope(resolution: AudioEditResolution) {
  switch (resolution.status) {
    case "ready":
      return {
        status: "success" as const,
        data: resolution,
        error: null,
        nextAction: "continue" as const,
        message: resolution.message,
      };
    case "ambiguous":
      return {
        status: "needs-choice" as const,
        data: resolution,
        error: null,
        nextAction: "ask_clarification" as const,
        message: resolution.message,
      };
    case "no-match":
    case "unsupported":
      return {
        status: "declined" as const,
        data: resolution,
        error: null,
        nextAction: "stop" as const,
        message: resolution.message,
      };
  }
}

export function resolveAudioEditTiming(
  project: any,
  query: string,
  options: AudioEditResolveOptions = {},
): AudioEditResolution {
  const action = options.action ?? "add_sfx";
  const candidates = options.precomputedCandidates
    ? constrainAudioCandidates(
        options.precomputedCandidates,
        options.temporalConstraint,
        options.limit ?? 8,
      )
    : findAudioMomentCandidates(project, query, {
        audioOverlayId: options.audioOverlayId,
        limit: options.limit ?? 8,
        minConfidence: options.minConfidence ?? 0.35,
        includeOverlayMetadata: options.includeOverlayMetadata,
        temporalConstraint: options.temporalConstraint,
      });
  const warnings: string[] = [];

  if (!candidates.length) {
    return {
      status: "no-match",
      action,
      query,
      searchedCandidateCount: 0,
      candidates,
      warnings: ["No stored beat, silence, energy, section, or audio-overlay evidence matched the request."],
      message: `No stored audio evidence matched "${query}". Analyze the clip audio first or ask for a clearer audio moment.`,
    };
  }

  const selection = selectAudioEditCandidate(candidates, query, options.temporalConstraint);
  warnings.push(...selection.warnings);
  const candidate = selection.candidate ?? candidates[0];

  if (!selection.safe) {
    return {
      status: "ambiguous",
      action,
      query,
      searchedCandidateCount: candidates.length,
      candidates,
      candidate,
      warnings: [
        ...warnings,
        "The top audio candidate is not safe for automatic editing. Ask once or show candidates before mutating the project.",
      ],
      message: `Audio reference "${query}" was ambiguous or too low-confidence for an automatic ${action} edit.`,
    };
  }

  if (action === "keyframe_anchor") {
    return {
      status: "ready",
      action,
      query,
      searchedCandidateCount: candidates.length,
      candidates,
      candidate,
      warnings,
      message: `Resolved audio keyframe anchor "${candidate.text}" at frame ${candidate.frame}; resolve_keyframe_edit still owns the zoom form.`,
    };
  }

  if (action === "sync_cuts_to_beats" && !isBeatSyncKind(candidate.audioKind)) {
    return {
      status: "unsupported",
      action,
      query,
      searchedCandidateCount: candidates.length,
      candidates,
      candidate,
      warnings: [
        ...warnings,
        `Audio kind "${candidate.audioKind}" is not a beat-like anchor for sync_cuts_to_beats.`,
      ],
      message: `Resolved "${query}" to ${candidate.audioKind}, which is not valid for beat-sync edits.`,
    };
  }
  if (action === "camera_shake" && !isImpactEmphasisKind(candidate.audioKind)) {
    return {
      status: "unsupported",
      action,
      query,
      searchedCandidateCount: candidates.length,
      candidates,
      candidate,
      warnings: [
        ...warnings,
        `Audio kind "${candidate.audioKind}" is not a point-like impact anchor for camera shake.`,
      ],
      message: `Resolved "${query}" to ${candidate.audioKind}, which is not valid for camera-shake emphasis.`,
    };
  }

  const useWith: AudioEditResolution["useWith"] = {};
  if (action === "add_sfx") {
    useWith.add_sfx = {
      ...candidate.useWith.add_sfx,
      query: options.sfxQuery ?? inferAudioSfxQuery(query, candidate.audioKind),
    };
  } else if (action === "camera_shake") {
    useWith.apply_camera_shake = candidate.useWith.apply_camera_shake;
  } else if (action === "cut_section") {
    useWith.cut_section = candidate.useWith.cut_section;
  } else {
    useWith.sync_cuts_to_beats = candidate.useWith.sync_cuts_to_beats;
  }

  return {
    status: "ready",
    action,
    query,
    searchedCandidateCount: candidates.length,
    candidates,
    candidate,
    useWith,
    warnings,
    message: `Resolved "${query}" to ${candidate.audioKind} at frame ${candidate.frame} for ${action}.`,
  };
}

export function applyAudioDuckingToProject(
  project: any,
  options: Partial<AudioDuckingConfig> = {},
): AudioDuckingPlan {
  const overlays: any[] = Array.isArray(project?.overlays) ? project.overlays : [];
  const bgmOverlays: any[] = overlays.filter(isBgmSoundOverlay);
  const voiceSources: any[] = overlays.filter(isRenderVoiceSourceOverlay);
  const speechEvidenceCount = overlays.filter(isSpeechEvidenceOverlay).length;
  const enabled = options.enabled ?? true;
  const config: AudioDuckingConfig = {
    enabled,
    duckLevel: clamp(options.duckLevel ?? DEFAULT_DUCKING_CONFIG.duckLevel, 0.02, 0.8),
    rampDownMs: clampInt(options.rampDownMs ?? DEFAULT_DUCKING_CONFIG.rampDownMs, 50, 2000),
    rampUpMs: clampInt(options.rampUpMs ?? DEFAULT_DUCKING_CONFIG.rampUpMs, 50, 3000),
    lookAheadMs: clampInt(options.lookAheadMs ?? DEFAULT_DUCKING_CONFIG.lookAheadMs, 0, 1000),
  };
  const warnings: string[] = [];

  if (!bgmOverlays.length) {
    return {
      status: "no-bgm",
      bgmOverlayIds: [],
      voiceSourceOverlayIds: voiceSources.map((overlay: any) => overlay.id),
      speechEvidenceCount,
      updates: [],
      unchangedOverlayIds: [],
      skippedOverlayIds: overlays.filter((overlay: any) => overlay?.type === "sound").map((overlay: any) => overlay.id),
      warnings: ["No BGM sound overlay was found; SFX and voiceover tracks were not modified."],
      config,
      message: "No background music overlay was found, so audio ducking was not applied.",
    };
  }

  if (!voiceSources.length) {
    warnings.push("No renderable voiceover/native-audio source was found. Ducking config was applied, but playback will only lower music when a voice source exists.");
  }
  if (!speechEvidenceCount) {
    warnings.push("No transcript/caption/speech evidence was found. This was treated as an explicit user-requested audio mix change.");
  }

  const updates: AudioDuckingOverlayUpdate[] = [];
  const unchangedOverlayIds: OverlayId[] = [];
  const bgmIds = new Set(bgmOverlays.map((overlay: any) => overlay.id));
  const skippedOverlayIds = overlays
    .filter((overlay: any) => overlay?.type === "sound" && !bgmIds.has(overlay.id))
    .map((overlay: any) => overlay.id);

  for (const overlay of bgmOverlays) {
    const styles = isRecord(overlay.styles) ? { ...overlay.styles } : {};
    const previousConfig = normalizeDuckingConfig(styles.duckingConfig);
    const nextStyles: Record<string, unknown> = {
      ...styles,
      duckingConfig: config,
    };
    if (enabled && typeof nextStyles.volume !== "number") {
      nextStyles.volume = AUDIO_LEVELS.BGM_WITHOUT_VO;
    }

    if (previousConfig && sameDuckingConfig(previousConfig, config) && styles.volume === nextStyles.volume) {
      unchangedOverlayIds.push(overlay.id);
      continue;
    }

    updates.push({
      overlayId: overlay.id,
      row: typeof overlay.row === "number" ? overlay.row : undefined,
      previousConfig,
      nextConfig: config,
      nextStyles,
      reason: enabled ? "bgm-duck-under-speech" : "bgm-ducking-disabled",
    });
  }

  const status = updates.length ? "changed" : "unchanged";
  return {
    status,
    bgmOverlayIds: bgmOverlays.map((overlay: any) => overlay.id),
    voiceSourceOverlayIds: voiceSources.map((overlay: any) => overlay.id),
    speechEvidenceCount,
    updates,
    unchangedOverlayIds,
    skippedOverlayIds,
    warnings,
    config,
    message: status === "changed"
      ? `${enabled ? "Enabled" : "Disabled"} audio ducking on ${updates.length} BGM overlay(s); skipped ${skippedOverlayIds.length} non-BGM sound overlay(s).`
      : `Audio ducking was already ${enabled ? "enabled" : "disabled"} on all BGM overlay(s); skipped ${skippedOverlayIds.length} non-BGM sound overlay(s).`,
  };
}

export function findAudioMomentCandidates(
  project: any,
  query: string,
  options: AudioMomentOptions = {},
): AudioMomentCandidate[] {
  const limit = clampInt(options.limit ?? 5, 1, 12);
  const minConfidence = clamp(options.minConfidence ?? 0.35, 0, 1);
  const queryTokens = tokenize(query);
  const normalizedQuery = normalizeText(query);
  if (!queryTokens.length || !normalizedQuery) return [];

  const requestedKinds = inferRequestedKinds(queryTokens, normalizedQuery);
  const candidateMap = new Map<string, AudioMomentCandidate>();
  for (const evidence of buildAudioEvidence(project, options)) {
    const candidate = scoreEvidence(evidence, query, queryTokens, normalizedQuery, requestedKinds);
    if (!candidate || candidate.confidence < minConfidence) continue;
    const key = candidateKey(candidate);
    const existing = candidateMap.get(key);
    if (!existing || candidate.confidence > existing.confidence) {
      candidateMap.set(key, candidate);
    }
  }

  const candidates = constrainAudioCandidates(
    Array.from(candidateMap.values()),
    options.temporalConstraint,
    limit,
  );

  if (!candidates.length) return candidates;

  const ambiguous = options.temporalConstraint == null && candidates.slice(1).some((candidate) => (
    Math.abs(candidates[0].confidence - candidate.confidence) < 0.08
    && !overlapsCandidate(candidates[0], candidate)
  ));

  return candidates.map((candidate, index) => ({
    ...candidate,
    safeForAutoEdit: index === 0
      && !ambiguous
      && candidate.confidence >= 0.78
      && (requestedKinds.size === 0 || requestedKinds.has(candidate.audioKind) || candidate.matchType === "exact-phrase"),
  }));
}

function selectAudioEditCandidate(
  candidates: AudioMomentCandidate[],
  query: string,
  temporalConstraint?: AudioTemporalConstraint,
): { candidate?: AudioMomentCandidate; safe: boolean; warnings: string[] } {
  const candidate = candidates[0];
  if (!candidate) return { safe: false, warnings: [] };

  if (temporalConstraint) {
    return {
      candidate,
      safe: candidate.safeForAutoEdit,
      warnings: [
        `Selected the ${temporalConstraint.occurrence} qualifying audio candidate ${temporalConstraint.relation} reference frame ${temporalConstraint.referenceFrame}.`,
      ],
    };
  }

  const normalizedQuery = normalizeText(query);
  const queryTokens = new Set(tokenize(query));
  const wantsFirst = normalizedQuery.includes("first") || normalizedQuery.includes("earliest");
  const wantsLast = normalizedQuery.includes("last") || normalizedQuery.includes("final") || normalizedQuery.includes("latest");
  if (wantsFirst || wantsLast) {
    const topConfidence = candidate.confidence;
    let eligible = candidates
      .filter((item) => item.audioKind === candidate.audioKind && item.confidence >= 0.78 && topConfidence - item.confidence <= 0.08);
    const wantsPointAnchor = queryTokens.has("impact")
      || queryTokens.has("hit")
      || queryTokens.has("sync")
      || queryTokens.has("exactly")
      || queryTokens.has("beat")
      || queryTokens.has("drop");
    const pointEligible = wantsPointAnchor ? eligible.filter((item) => item.durationFrames <= 2) : [];
    if (pointEligible.length) eligible = pointEligible;
    eligible = eligible.sort((a, b) => wantsLast ? b.startFrame - a.startFrame : a.startFrame - b.startFrame);
    if (eligible[0]) {
      return {
        candidate: eligible[0],
        safe: true,
        warnings: [`Resolved ${wantsLast ? "last" : "first"} audio reference by selecting the ${wantsLast ? "latest" : "earliest"} high-confidence ${eligible[0].audioKind} ${pointEligible.length ? "point anchor" : "candidate"}.`],
      };
    }
  }

  return { candidate, safe: candidate.safeForAutoEdit, warnings: [] };
}

function constrainAudioCandidates(
  candidates: AudioMomentCandidate[],
  constraint: AudioTemporalConstraint | undefined,
  limit: number,
): AudioMomentCandidate[] {
  const boundedLimit = clampInt(limit, 1, 12);
  if (!constraint) {
    return [...candidates]
      .sort((a, b) => b.confidence - a.confidence || a.startFrame - b.startFrame || a.text.localeCompare(b.text))
      .slice(0, boundedLimit);
  }

  const eligible = candidates.filter((candidate) => {
    if (constraint.relation === "after") return candidate.frame > constraint.referenceFrame;
    if (constraint.relation === "before") return candidate.frame < constraint.referenceFrame;
    return true;
  });
  eligible.sort((a, b) => {
    if (constraint.occurrence === "first") {
      return a.frame - b.frame || b.confidence - a.confidence || a.text.localeCompare(b.text);
    }
    if (constraint.occurrence === "last") {
      return b.frame - a.frame || b.confidence - a.confidence || a.text.localeCompare(b.text);
    }
    return Math.abs(a.frame - constraint.referenceFrame) - Math.abs(b.frame - constraint.referenceFrame)
      || b.confidence - a.confidence
      || a.frame - b.frame
      || a.text.localeCompare(b.text);
  });

  return eligible.slice(0, boundedLimit);
}

function isBeatSyncKind(kind: AudioMomentKind): boolean {
  return kind === "beat"
    || kind === "downbeat"
    || kind === "beat-drop"
    || kind === "transient"
    || kind === "energy-peak"
    || kind === "music-section";
}

function isImpactEmphasisKind(kind: AudioMomentKind): boolean {
  return kind === "beat"
    || kind === "downbeat"
    || kind === "beat-drop"
    || kind === "transient"
    || kind === "energy-peak";
}

function impactKindPriority(kind: AudioMomentKind): number {
  switch (kind) {
    case "transient":
      return 5;
    case "beat-drop":
      return 4;
    case "energy-peak":
      return 3;
    case "downbeat":
      return 2;
    case "beat":
      return 1;
    default:
      return 0;
  }
}

function measuredImpactToAudioCandidate(
  evidence: AudioEvidence,
  safeForAutoEdit: boolean,
): AudioMomentCandidate {
  const strength = evidence.strength ?? 0;
  const startMs = Math.round((evidence.startFrame / evidence.fps) * 1000);
  const endMs = Math.round((evidence.endFrame / evidence.fps) * 1000);
  const note = `Measured ${evidence.audioKind} impact at strength ${round3(strength)} from ${evidence.source.path}.`;
  return {
    text: truncate(evidence.evidenceText, 140),
    audioKind: evidence.audioKind,
    frame: evidence.frame,
    startFrame: evidence.startFrame,
    endFrame: evidence.endFrame,
    startMs,
    endMs,
    durationFrames: evidence.durationFrames,
    confidence: 1,
    confidenceLabel: "high",
    signalStrength: round3(strength),
    matchType: "signal-ranked",
    matchReasons: [
      "ranked-impact-signal",
      `signal-strength:${round3(strength)}`,
      safeForAutoEdit ? "unique-maximum" : "not-unique-maximum",
    ],
    evidenceText: evidence.evidenceText,
    source: evidence.source,
    safeForAutoEdit,
    useWith: {
      cut_section: {
        startFrame: evidence.startFrame,
        endFrame: evidence.endFrame,
        note,
      },
      add_sfx: {
        frame: evidence.frame,
        sync: "audio-anchor",
        note,
      },
      apply_camera_shake: {
        targetFrame: evidence.frame,
        note,
      },
      set_keyframes: {
        frame: evidence.frame,
        note,
      },
      sync_cuts_to_beats: {
        frame: evidence.frame,
        note,
      },
      add_motion_graphic: {
        frame: evidence.frame,
        text: truncate(evidence.evidenceText, 80),
      },
    },
  };
}

function inferAudioSfxQuery(query: string, kind: AudioMomentKind): string {
  const tokens = new Set(tokenize(query));
  if (tokens.has("impact")) return "impact hit";
  if (tokens.has("whoosh") || tokens.has("swoosh")) return "whoosh";
  if (tokens.has("pop")) return "pop";
  if (tokens.has("ding")) return "ding";
  if (tokens.has("snap")) return "snap";
  if (tokens.has("stinger")) return "stinger";
  if (tokens.has("glitch")) return "glitch";
  if (tokens.has("boom")) return "boom";

  if (kind === "beat-drop" || kind === "transient" || kind === "energy-peak") return "impact hit";
  if (kind === "silence" || kind === "music-section") return "soft whoosh";
  return "subtle audio accent";
}

function buildAudioEvidence(project: any, options: AudioMomentOptions = {}): AudioEvidence[] {
  const fps = positiveNumber(project?.fps) ?? DEFAULT_FPS;
  const overlays: any[] = Array.isArray(project?.overlays) ? project.overlays : [];
  const totalDurationFrames = Math.max(1, Math.round(positiveNumber(project?.durationInFrames) ?? DEFAULT_CLIP_DURATION_FRAMES));
  const projectRange = { startFrame: 0, endFrame: totalDurationFrames };
  const evidence: AudioEvidence[] = [];

  for (const overlay of overlays) {
    if (options.audioOverlayId != null && String(overlay?.id) !== String(options.audioOverlayId)) continue;
    const overlayRange = resolveFrameRange(overlay, fps, {
      startFrame: frame(overlay?.from),
      endFrame: frame(overlay?.from) + duration(overlay?.durationInFrames),
    });
    const sourceBase = {
      type: "overlay" as const,
      overlayId: overlay?.id,
      assetId: stringValue(overlay?.assetId ?? overlay?.sourceAssetId ?? overlay?.mediaId ?? overlay?.metadata?.assetId),
      overlayType: stringValue(overlay?.type),
    };

    if (options.includeOverlayMetadata ?? true) {
      for (const text of overlayAudioTextFacts(overlay)) {
        addEvidence(evidence, {
          audioKind: "sound-overlay",
          evidenceText: text,
          range: overlayRange,
          fps,
          source: { ...sourceBase, path: `overlays.${String(overlay?.id ?? "unknown")}.audioText` },
        });
      }
    }

    for (const key of OVERLAY_AUDIO_ROOT_KEYS) {
      const value = overlay?.[key];
      if (value == null) continue;
      collectAudioEvidence(value, {
        path: `overlays.${String(overlay?.id ?? "unknown")}.${key}`,
        fps,
        range: overlayRange,
        sourceBase,
        output: evidence,
        totalDurationFrames,
      });
    }
  }

  for (const key of PROJECT_AUDIO_ROOT_KEYS) {
    const value = project?.[key];
    if (value == null) continue;
    collectAudioEvidence(value, {
      path: key,
      fps,
      range: projectRange,
      sourceBase: {
        type: "analysis",
        assetId: stringValue(project?.assetId ?? project?.sourceAssetId ?? project?.mediaId),
      },
      output: evidence,
      totalDurationFrames,
    });
  }

  return dedupeEvidence(evidence).sort((a, b) => a.startFrame - b.startFrame || a.audioKind.localeCompare(b.audioKind));
}

function collectAudioEvidence(value: unknown, context: CollectContext): void {
  if (value == null) return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectAudioEvidence(item, {
      ...context,
      path: `${context.path}.${index}`,
    }));
    return;
  }
  if (!isRecord(value)) return;

  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = normalizeKey(key);
    const childPath = `${context.path}.${key}`;

    if (Array.isArray(child)) {
      collectKnownAudioArray(normalizedKey, child, { ...context, path: childPath });
    }

    if (isRecord(child) && normalizedKey === "beatgrid") {
      collectAudioEvidence(child, { ...context, path: childPath });
      continue;
    }

    if (isRecord(child) || Array.isArray(child)) {
      collectAudioEvidence(child, { ...context, path: childPath });
    }
  }
}

function collectKnownAudioArray(key: string, items: unknown[], context: CollectContext): void {
  if (!items.length) return;

  if (key === "beats") {
    items.forEach((item, index) => addPointEvidence(context, item, index, items.length, "beat", "music beat"));
    return;
  }
  if (key === "downbeats") {
    items.forEach((item, index) => addPointEvidence(context, item, index, items.length, "downbeat", "music downbeat"));
    return;
  }
  if (key === "transients" || key === "stingers") {
    items.forEach((item, index) => addPointEvidence(context, item, index, items.length, "transient", key === "stingers" ? "music stinger" : "audio transient"));
    return;
  }
  if (key === "drops") {
    items.forEach((item, index) => addPointEvidence(context, item, index, items.length, "beat-drop", "music drop impact"));
    return;
  }
  if (key === "builds") {
    items.forEach((item, index) => addPointEvidence(context, item, index, items.length, "music-section", "music build"));
    return;
  }
  if (key === "breakdowns") {
    items.forEach((item, index) => addPointEvidence(context, item, index, items.length, "music-section", "music breakdown"));
    return;
  }
  if (key === "silences" || key === "silencegaps" || key === "silencegapsframes") {
    items.forEach((item) => addRangeEvidence(context, item, "silence", silenceText(item)));
    return;
  }
  if (key === "fillers") {
    items.forEach((item) => addPointEvidence(context, item, 0, items.length, "filler", fillerText(item)));
    return;
  }
  if (key === "problematicframes" || key === "problematicsegments") {
    items.forEach((item) => addRangeEvidence(context, item, inferProblemKind(item), problemText(item)));
    return;
  }
  if (key === "energycurve" || key === "rmsenergycurve" || key === "loudnesscurve") {
    collectEnergyPeaks(items, context);
    return;
  }
  if (key === "sections") {
    items.forEach((item) => addRangeEvidence(context, item, inferSectionKind(item), sectionText(item)));
    return;
  }
  if (key === "speechsegments" || (key === "segments" && context.path.toLowerCase().includes("audio"))) {
    items.forEach((item) => addRangeEvidence(context, item, "speech", speechText(item)));
  }
}

function addPointEvidence(
  context: CollectContext,
  item: unknown,
  index: number,
  total: number,
  audioKind: AudioMomentKind,
  fallbackText: string,
): void {
  const range = resolvePointRange(item, context.fps, context.range, index, total, context.totalDurationFrames);
  const strength = strengthValue(item);
  const extra = describePoint(item);
  addEvidence(context.output, {
    audioKind: refinePointKind(audioKind, item, fallbackText),
    evidenceText: [fallbackText, extra, strength != null ? `strength ${round3(strength)}` : undefined].filter(Boolean).join(" "),
    range,
    fps: context.fps,
    source: { ...context.sourceBase, path: context.path },
    strength,
  });
}

function addRangeEvidence(
  context: CollectContext,
  item: unknown,
  audioKind: AudioMomentKind,
  fallbackText: string,
): void {
  const range = resolveFrameRange(item, context.fps, context.range);
  addEvidence(context.output, {
    audioKind,
    evidenceText: fallbackText,
    range,
    fps: context.fps,
    source: { ...context.sourceBase, path: context.path },
    strength: strengthValue(item),
  });
}

function collectEnergyPeaks(items: unknown[], context: CollectContext): void {
  const samples = items
    .map((item, index) => {
      const energy = energyValue(item);
      if (energy == null) return null;
      const range = resolvePointRange(item, context.fps, context.range, index, items.length, context.totalDurationFrames);
      return { energy, range, item };
    })
    .filter((sample): sample is { energy: number; range: FrameRange; item: unknown } => Boolean(sample));

  if (!samples.length) return;
  const maxEnergy = Math.max(...samples.map((sample) => sample.energy));
  samples.forEach((sample, index) => {
    const prev = samples[index - 1]?.energy ?? 0;
    const next = samples[index + 1]?.energy ?? 0;
    const isPeak = sample.energy >= Math.max(prev, next) && sample.energy >= Math.max(0.55, maxEnergy * 0.75);
    if (!isPeak) return;
    addEvidence(context.output, {
      audioKind: "energy-peak",
      evidenceText: `audio energy peak ${round3(sample.energy)}`,
      range: sample.range,
      fps: context.fps,
      source: { ...context.sourceBase, path: context.path },
      strength: sample.energy,
    });
  });
}

function addEvidence(
  output: AudioEvidence[],
  input: {
    audioKind: AudioMomentKind;
    evidenceText: string;
    range: FrameRange;
    fps: number;
    source: AudioMomentCandidate["source"];
    strength?: number;
  },
): void {
  const evidenceText = cleanText(input.evidenceText);
  if (!evidenceText) return;
  const startFrame = Math.max(0, Math.round(input.range.startFrame));
  const endFrame = Math.max(startFrame + 1, Math.round(input.range.endFrame));
  output.push({
    audioKind: input.audioKind,
    evidenceText,
    frame: startFrame,
    startFrame,
    endFrame,
    durationFrames: endFrame - startFrame,
    fps: input.fps,
    strength: input.strength,
    source: input.source,
  });
}

function scoreEvidence(
  evidence: AudioEvidence,
  query: string,
  queryTokens: string[],
  normalizedQuery: string,
  requestedKinds: Set<AudioMomentKind>,
): AudioMomentCandidate | null {
  const normalizedEvidence = normalizeText(evidence.evidenceText);
  const evidenceTokens = tokenize(evidence.evidenceText);
  if (!normalizedEvidence || !evidenceTokens.length) return null;

  const exactPhrase = normalizedEvidence.includes(normalizedQuery);
  const kindScore = scoreKindMatch(evidence, queryTokens, requestedKinds);
  const overlap = tokenOverlap(queryTokens, evidenceTokens);
  const coverage = overlap / queryTokens.length;
  const evidenceFocus = overlap / evidenceTokens.length;
  const vectorScore = scoreCharacterVector(normalizedQuery, normalizedEvidence);
  const tokenScore = clamp((coverage * 0.58) + (evidenceFocus * 0.16) + (vectorScore * 0.18) + ((evidence.strength ?? 0) * 0.08), 0, 0.92);
  const vectorOnlyScore = clamp(vectorScore * 0.7, 0, 0.86);
  const confidence = exactPhrase ? 0.95 : Math.max(kindScore, tokenScore, vectorOnlyScore);
  if (confidence <= 0) return null;

  const matchType: AudioMomentCandidate["matchType"] = exactPhrase
    ? "exact-phrase"
    : kindScore >= Math.max(tokenScore, vectorOnlyScore)
      ? "audio-kind"
      : coverage >= 0.42
        ? "token-overlap"
        : "character-vector";

  const startMs = Math.round((evidence.startFrame / evidence.fps) * 1000);
  const endMs = Math.round((evidence.endFrame / evidence.fps) * 1000);

  return {
    text: truncate(evidence.evidenceText, 140),
    audioKind: evidence.audioKind,
    frame: evidence.frame,
    startFrame: evidence.startFrame,
    endFrame: evidence.endFrame,
    startMs,
    endMs,
    durationFrames: evidence.durationFrames,
    confidence: round3(confidence),
    confidenceLabel: confidenceLabel(confidence),
    matchType,
    matchReasons: exactPhrase
      ? ["exact-phrase"]
      : [
          `kind=${round3(kindScore)}`,
          `coverage=${round3(coverage)}`,
          `focus=${round3(evidenceFocus)}`,
          `vector=${round3(vectorScore)}`,
        ],
    evidenceText: evidence.evidenceText,
    source: evidence.source,
    safeForAutoEdit: false,
    useWith: {
      cut_section: {
        startFrame: evidence.startFrame,
        endFrame: evidence.endFrame,
        note: evidence.audioKind === "silence" || evidence.audioKind === "filler"
          ? "Use only when the user asked to remove this audio moment and confidence is high."
          : "Use only when the user explicitly asked to cut around this audio anchor.",
      },
      add_sfx: {
        frame: evidence.frame,
        sync: "audio-anchor",
        note: "Use as the anchor frame for impact/spot SFX.",
      },
      apply_camera_shake: {
        targetFrame: evidence.frame,
        note: "Use as the exact impact frame for a bounded camera shake.",
      },
      set_keyframes: {
        frame: evidence.frame,
        note: "Use as the anchor frame for audio-synced visual emphasis.",
      },
      sync_cuts_to_beats: {
        frame: evidence.frame,
        note: "Use as the beat/audio sync anchor when adjusting cuts.",
      },
      add_motion_graphic: {
        frame: evidence.frame,
        text: truncate(query, 80),
      },
    },
  };
}

function scoreKindMatch(
  evidence: AudioEvidence,
  queryTokens: string[],
  requestedKinds: Set<AudioMomentKind>,
): number {
  const direct = requestedKinds.has(evidence.audioKind);
  const related = Array.from(requestedKinds).some((kind) => areRelatedKinds(kind, evidence.audioKind));
  if (!direct && !related) return 0;

  let score = direct ? 0.82 : 0.7;
  if (evidence.audioKind === "silence" && queryTokens.some((token) => token === "long" || token === "awkward")) {
    score += evidence.durationFrames >= 18 ? 0.1 : 0;
  }
  const wantsPointAnchor = queryTokens.some((token) => token === "impact" || token === "hit" || token === "sync" || token === "beat" || token === "drop");
  if ((evidence.audioKind === "beat-drop" || evidence.audioKind === "energy-peak") && queryTokens.some((token) => token === "impact" || token === "hit")) {
    score += 0.08;
  }
  if (direct && evidence.audioKind === "beat-drop" && evidence.durationFrames <= 2 && wantsPointAnchor) {
    score += 0.04;
  }
  if (evidence.strength != null) score += clamp(evidence.strength, 0, 1) * 0.06;
  return clamp(score, 0, 0.94);
}

function inferRequestedKinds(queryTokens: string[], normalizedQuery: string): Set<AudioMomentKind> {
  const explicitBeatDrop = normalizedQuery.includes("beat drop") || normalizedQuery.includes("music drop");
  if (explicitBeatDrop) return new Set<AudioMomentKind>(["beat-drop"]);

  const kinds = new Set<AudioMomentKind>();
  for (const [kind, terms] of Object.entries(KIND_TERMS) as Array<[AudioMomentKind, string[]]>) {
    if (terms.some((term) => queryTokens.includes(term) || normalizedQuery.includes(term))) {
      kinds.add(kind);
    }
  }
  if (normalizedQuery.includes("dead air")) kinds.add("silence");
  if (normalizedQuery.includes("loud hit") || normalizedQuery.includes("impact hit")) kinds.add("transient");
  if (kinds.has("downbeat")) kinds.add("beat");
  return kinds;
}

function areRelatedKinds(a: AudioMomentKind, b: AudioMomentKind): boolean {
  if (a === b) return true;
  const beatKinds = new Set<AudioMomentKind>(["beat", "downbeat", "beat-drop", "transient", "energy-peak"]);
  if (beatKinds.has(a) && beatKinds.has(b)) return true;
  if ((a === "problem" && (b === "silence" || b === "filler")) || (b === "problem" && (a === "silence" || a === "filler"))) return true;
  if ((a === "music-section" && b === "beat-drop") || (a === "beat-drop" && b === "music-section")) return true;
  return false;
}

function resolvePointRange(
  value: unknown,
  fps: number,
  fallback: FrameRange,
  index: number,
  total: number,
  totalDurationFrames: number,
): FrameRange {
  if (typeof value === "number" && Number.isFinite(value)) {
    const frameValue = Math.max(0, Math.round(value));
    return { startFrame: frameValue, endFrame: frameValue + 1 };
  }

  const range = resolveFrameRange(value, fps, fallback);
  if (range.startFrame !== fallback.startFrame || range.endFrame !== fallback.endFrame) return range;

  const ratio = total > 1 ? index / (total - 1) : 0;
  const frameValue = Math.round(ratio * totalDurationFrames);
  return { startFrame: frameValue, endFrame: frameValue + 1 };
}

function resolveFrameRange(value: unknown, fps: number, fallback: FrameRange): FrameRange {
  if (!isRecord(value)) return fallback;
  const frameValue = firstNumber(value, ["frame", "frameNumber", "timestampFrame", "timeFrame", "beatFrame"]);
  const explicitStart = firstNumber(value, ["startFrame", "frameStart", "from"]);
  const explicitEnd = firstNumber(value, ["endFrame", "frameEnd", "to"]);
  const durationFrames = firstNumber(value, ["durationFrames", "durationInFrames"]);
  const startMs = firstNumber(value, ["startMs", "timestampMs", "timeMs", "startMillis", "timestampMillis"]);
  const endMs = firstNumber(value, ["endMs", "endMillis"]);
  const startSec = firstNumber(value, ["startSec", "startSeconds", "timestampSec", "timestampSeconds", "timeSec", "timeSeconds", "time"]);
  const endSec = firstNumber(value, ["endSec", "endSeconds"]);
  const genericStart = firstNumber(value, ["start", "timestamp"]);
  const genericEnd = firstNumber(value, ["end"]);

  let startFrame = explicitStart
    ?? (typeof frameValue === "number" ? frameValue : undefined)
    ?? (typeof startMs === "number" ? Math.round((startMs / 1000) * fps) : undefined)
    ?? (typeof startSec === "number" ? Math.round(startSec * fps) : undefined)
    ?? genericTimeToFrame(genericStart, fps)
    ?? fallback.startFrame;

  let endFrame = explicitEnd
    ?? (typeof durationFrames === "number" ? startFrame + durationFrames : undefined)
    ?? (typeof endMs === "number" ? Math.round((endMs / 1000) * fps) : undefined)
    ?? (typeof endSec === "number" ? Math.round(endSec * fps) : undefined)
    ?? genericTimeToFrame(genericEnd, fps)
    ?? (typeof frameValue === "number" || startMs != null || startSec != null || genericStart != null ? startFrame + 1 : undefined)
    ?? fallback.endFrame;

  startFrame = Math.max(0, Math.round(startFrame));
  endFrame = Math.max(startFrame + 1, Math.round(endFrame));
  return { startFrame, endFrame };
}

function genericTimeToFrame(value: number | undefined, fps: number): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  if (Math.abs(value) <= 180) return Math.round(value * fps);
  return Math.round(value);
}

function firstNumber(value: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const numeric = positiveOrZeroNumber(value[key]);
    if (typeof numeric === "number") return numeric;
  }
  return undefined;
}

function overlayAudioTextFacts(overlay: any): string[] {
  const type = stringValue(overlay?.type);
  const isAudioLike = type === "sound" || type === "audio" || type === "video";
  if (!isAudioLike) return [];
  return [
    overlay?.content,
    overlay?.text,
    overlay?.title,
    overlay?.name,
    overlay?.label,
    overlay?.metadata?.title,
    overlay?.metadata?.label,
    overlay?.metadata?.description,
    overlay?.metadata?.audioDescription,
  ]
    .map((value) => stringValue(value))
    .filter((value): value is string => Boolean(value));
}

function refinePointKind(kind: AudioMomentKind, item: unknown, fallbackText: string): AudioMomentKind {
  const text = normalizeText([fallbackText, describePoint(item)].join(" "));
  if (kind === "beat" && text.includes("downbeat")) return "downbeat";
  if ((kind === "beat" || kind === "music-section") && text.includes("drop")) return "beat-drop";
  return kind;
}

function inferSectionKind(item: unknown): AudioMomentKind {
  const text = normalizeText(sectionText(item));
  return text.includes("drop") || text.includes("chorus") || text.includes("peak") ? "beat-drop" : "music-section";
}

function inferProblemKind(item: unknown): AudioMomentKind {
  const text = normalizeText(problemText(item));
  if (text.includes("silence") || text.includes("pause")) return "silence";
  if (text.includes("filler") || text.includes("um") || text.includes("uh")) return "filler";
  return "problem";
}

function describePoint(item: unknown): string {
  if (!isRecord(item)) return "";
  return [
    stringValue(item.type),
    stringValue(item.beatType),
    stringValue(item.label),
    stringValue(item.description),
    stringValue(item.section),
  ].filter(Boolean).join(" ");
}

function silenceText(item: unknown): string {
  const durationMs = isRecord(item) ? firstNumber(item, ["durationMs", "durationMillis"]) : undefined;
  return durationMs ? `audio silence ${Math.round(durationMs)}ms` : "audio silence";
}

function fillerText(item: unknown): string {
  if (!isRecord(item)) return "filler word";
  const word = stringValue(item.word ?? item.text);
  return word ? `filler word ${word}` : "filler word";
}

function problemText(item: unknown): string {
  if (!isRecord(item)) return "audio problem";
  return stringValue(item.description ?? item.reason ?? item.type ?? item.label) ?? "audio problem";
}

function sectionText(item: unknown): string {
  if (!isRecord(item)) return "music section";
  const label = stringValue(item.type ?? item.label ?? item.section ?? item.name) ?? "section";
  const energy = stringValue(item.energyLevel ?? item.energy ?? item.intensity);
  return `music ${label}${energy ? ` ${energy}` : ""}`;
}

function speechText(item: unknown): string {
  if (!isRecord(item)) return "speech segment";
  return stringValue(item.text ?? item.transcript ?? item.content) ?? "speech segment";
}

function isBgmSoundOverlay(overlay: any): boolean {
  if (overlay?.type !== "sound") return false;
  if (overlay.row === ROW.SFX || overlay.row === ROW.VOICEOVER) return false;
  if (overlay.row === ROW.BGM) return true;
  const identity = audioOverlayIdentity(overlay);
  return /\bbgm\b/.test(identity)
    || identity.includes("background music")
    || identity.includes("background_music")
    || identity.includes("music bed")
    || identity.includes("music-bed");
}

function isRenderVoiceSourceOverlay(overlay: any): boolean {
  if (overlay?.type === "video" && overlay.hasNativeAudio === true) return true;
  if (overlay?.type !== "sound") return false;
  if (overlay.row === ROW.VOICEOVER || overlay.row === 4) return true;
  const identity = audioOverlayIdentity(overlay);
  return identity.includes("voiceover")
    || /\bvo\b/.test(identity)
    || identity.includes("narration")
    || identity.includes("dialogue")
    || identity.includes("speech");
}

function isSpeechEvidenceOverlay(overlay: any): boolean {
  if (isRenderVoiceSourceOverlay(overlay)) return true;
  if (overlay?.type === "caption") return true;
  return Boolean(overlay?.words?.length || overlay?.captions?.length || overlay?.transcription);
}

function audioOverlayIdentity(overlay: any): string {
  return normalizeText([
    stringValue(overlay?.assetId),
    stringValue(overlay?.sourceAssetId),
    stringValue(overlay?.mediaId),
    stringValue(overlay?.content),
    stringValue(overlay?.name),
    stringValue(overlay?.label),
    stringValue(overlay?.metadata?.role),
    stringValue(overlay?.metadata?.audioRole),
    stringValue(overlay?.metadata?.source),
    stringValue(overlay?.metadata?.family),
  ].filter(Boolean).join(" "));
}

function normalizeDuckingConfig(value: unknown): AudioDuckingConfig | undefined {
  if (!isRecord(value)) return undefined;
  return {
    enabled: Boolean(value.enabled),
    duckLevel: clampNumber(firstNumber(value, ["duckLevel"])) ?? DEFAULT_DUCKING_CONFIG.duckLevel,
    rampDownMs: clampInt(firstNumber(value, ["rampDownMs"]) ?? DEFAULT_DUCKING_CONFIG.rampDownMs, 50, 2000),
    rampUpMs: clampInt(firstNumber(value, ["rampUpMs"]) ?? DEFAULT_DUCKING_CONFIG.rampUpMs, 50, 3000),
    lookAheadMs: clampInt(firstNumber(value, ["lookAheadMs"]) ?? DEFAULT_DUCKING_CONFIG.lookAheadMs, 0, 1000),
  };
}

function sameDuckingConfig(a: AudioDuckingConfig, b: AudioDuckingConfig): boolean {
  return a.enabled === b.enabled
    && a.duckLevel === b.duckLevel
    && a.rampDownMs === b.rampDownMs
    && a.rampUpMs === b.rampUpMs
    && a.lookAheadMs === b.lookAheadMs;
}

function strengthValue(item: unknown): number | undefined {
  if (!isRecord(item)) return undefined;
  return clampNumber(firstNumber(item, ["strength", "magnitude", "energy", "score"]));
}

function energyValue(item: unknown): number | undefined {
  if (typeof item === "number" && Number.isFinite(item)) return clamp(item, 0, 1);
  if (!isRecord(item)) return undefined;
  return clampNumber(firstNumber(item, ["energy", "value", "rms", "loudness", "strength", "magnitude"]));
}

function dedupeEvidence(evidence: AudioEvidence[]): AudioEvidence[] {
  const seen = new Set<string>();
  const result: AudioEvidence[] = [];
  for (const item of evidence) {
    const key = `${item.source.type}:${item.source.overlayId ?? ""}:${item.source.path}:${item.audioKind}:${item.startFrame}:${item.endFrame}:${normalizeText(item.evidenceText)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function candidateKey(candidate: AudioMomentCandidate): string {
  return `${candidate.source.type}:${candidate.source.overlayId ?? ""}:${candidate.source.path}:${candidate.audioKind}:${candidate.startFrame}:${candidate.endFrame}:${normalizeText(candidate.text)}`;
}

function overlapsCandidate(a: AudioMomentCandidate, b: AudioMomentCandidate): boolean {
  return a.startFrame < b.endFrame && b.startFrame < a.endFrame;
}

function tokenOverlap(a: string[], b: string[]): number {
  const bSet = new Set(b);
  return Array.from(new Set(a)).filter((token) => bSet.has(token)).length;
}

function scoreCharacterVector(a: string, b: string): number {
  const aBigrams = bigrams(a);
  const bBigrams = bigrams(b);
  if (!aBigrams.size || !bBigrams.size) return 0;
  let intersection = 0;
  for (const item of aBigrams) {
    if (bBigrams.has(item)) intersection += 1;
  }
  return clamp((2 * intersection) / (aBigrams.size + bBigrams.size), 0, 1);
}

function bigrams(value: string): Set<string> {
  const normalized = normalizeText(value).replace(/\s+/g, "");
  const result = new Set<string>();
  for (let index = 0; index < normalized.length - 1; index += 1) {
    result.add(normalized.slice(index, index + 2));
  }
  return result;
}

function confidenceLabel(confidence: number): AudioMomentCandidate["confidenceLabel"] {
  if (confidence >= 0.78) return "high";
  if (confidence >= 0.55) return "medium";
  return "low";
}

function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function normalizeText(value: string): string {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function cleanText(value: string | undefined): string {
  if (!value) return "";
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function frame(value: unknown): number {
  return Math.max(0, Math.round(positiveOrZeroNumber(value) ?? 0));
}

function duration(value: unknown): number {
  return Math.max(1, Math.round(positiveNumber(value) ?? DEFAULT_CLIP_DURATION_FRAMES));
}

function positiveNumber(value: unknown): number | undefined {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : undefined;
}

function positiveOrZeroNumber(value: unknown): number | undefined {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : undefined;
}

function clampNumber(value: number | undefined): number | undefined {
  return typeof value === "number" ? clamp(value, 0, 1) : undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampInt(value: number, min: number, max: number): number {
  return Math.round(clamp(value, min, max));
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 1)).trim()}...`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
