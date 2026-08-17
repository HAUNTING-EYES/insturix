import { tool } from "@langchain/core/tools";
import { z } from "zod";

import { DEFAULT_CONFIG } from "../config/editron-config";
import type { ChatFrameEvidence } from "./chat-frame-evidence";
import {
  searchCanonicalChatEvidence,
  type CanonicalChatEvidenceCandidate,
} from "../services/chat-multimodal-evidence";
import {
  verifyChatFrameVisualMatch,
  type ChatFrameVisualVerification,
} from "../services/chat-frame-visual-verification";
import { protectChatTextLegibility } from "./chat-overlay-safe-placement";
import { PROJECT_ASSET_ANALYSES_COLLECTION } from "../services/project-analysis-storage";
import {
  buildSubjectAwareReframePlan,
  type SubjectReframePlan,
} from "../services/subject-reframe-plan";
import { resolveAtomicZoomForm } from "../services/zoom-form";

type OverlayId = string | number;

export interface VisualBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  units: "normalized" | "pixel";
}

export interface VisualHighlightOverlayHint {
  type: "shape";
  start: number;
  duration: number;
  x: string | number;
  y: string | number;
  width: string | number;
  height: string | number;
  styles: {
    fill: string;
    stroke: string;
    strokeWidth: number;
    borderRadius: string;
    opacity: number;
  };
}

export interface VisualMomentCandidate {
  text: string;
  frame: number;
  startFrame: number;
  endFrame: number;
  durationFrames: number;
  confidence: number;
  confidenceLabel: "high" | "medium" | "low";
  matchType: "exact-phrase" | "token-overlap" | "character-vector" | "multimodal-semantic";
  matchReasons: string[];
  evidenceText: string;
  boundingBox?: VisualBoundingBox;
  source: {
    type: "overlay" | "analysis" | "multimodal-evidence";
    overlayId?: OverlayId;
    assetId?: string;
    overlayType?: string;
    path: string;
    evidenceId?: string;
    auditId?: string;
    scores?: CanonicalChatEvidenceCandidate["scores"];
    missingModalities?: string[];
    rejectionReasons?: string[];
    accepted?: boolean;
    frameVerificationReceiptId?: string;
    verifiedFrame?: number;
  };
  safeForAutoEdit: boolean;
  useWith: {
    cut_section: { startFrame: number; endFrame: number; note: string };
    add_motion_graphic: { frame: number; text: string };
    set_keyframes: { frame: number; note: string };
    visual_inspect_frame: { frame: number; frames?: number[]; question: string };
  };
}

interface CreateChatVisualToolsOptions {
  userId: string;
  projectId: string;
  subjectReframeDependencies?: SubjectReframeDependencies;
  frameVerifier?: typeof verifyChatFrameVisualMatch;
}

export interface SubjectReframeDependencies {
  loadProject(userId: string, projectId: string): Promise<Record<string, any> | null>;
  loadAnalyses(projectId: string, assetIds: string[]): Promise<unknown[]>;
  saveProject(userId: string, projectId: string, project: Record<string, any>): Promise<void>;
  updateProject(userId: string, projectId: string, updates: Record<string, unknown>): Promise<void>;
}

interface VisualMomentOptions {
  videoOverlayId?: OverlayId;
  limit?: number;
  minConfidence?: number;
  includeOverlayText?: boolean;
}

export type VisualEditAction = "highlight" | "inspect" | "cut_range" | "keyframe_anchor" | "speed_ramp";
export type VisualEditResolutionStatus = "ready" | "no-match" | "ambiguous" | "no-placement";

export interface VisualEditResolveOptions extends VisualMomentOptions {
  action?: VisualEditAction;
  durationFrames?: number;
  precomputedCandidates?: VisualMomentCandidate[];
}

export interface VisualEditResolution {
  status: VisualEditResolutionStatus;
  action: VisualEditAction;
  query: string;
  candidates: VisualMomentCandidate[];
  candidate?: VisualMomentCandidate;
  warnings: string[];
  message: string;
  useWith?: {
    add_overlay?: VisualHighlightOverlayHint;
    apply_speed_ramp?: {
      targetFrame: number;
      durationFrames: number;
      videoOverlayId?: OverlayId;
    };
    cut_section?: VisualMomentCandidate["useWith"]["cut_section"];
    set_keyframes?: VisualMomentCandidate["useWith"]["set_keyframes"];
    visual_inspect_frame?: VisualMomentCandidate["useWith"]["visual_inspect_frame"];
  };
}

export interface CameraShakeOptions {
  targetFrame?: number;
  videoOverlayId?: OverlayId;
  targetQuery?: string;
  intensity?: number;
  durationFrames?: number;
  canvasWidth?: number;
  replacePositionKeyframes?: boolean;
}

export interface CameraShakeOverlayUpdate {
  overlayId: OverlayId;
  targetFrame: number;
  localFrame: number;
  previousKeyframeTrackCount: number;
  nextKeyframeTracks: any[];
  intensity: number;
  durationFrames: number;
  maxOffset: number;
  reason: string;
}

export interface CameraShakePlan {
  status: "changed" | "no-target" | "conflict";
  targetFrame?: number;
  targetOverlayId?: OverlayId;
  updates: CameraShakeOverlayUpdate[];
  warnings: string[];
  message: string;
}

export interface SpeedRampOptions {
  startFrame?: number;
  endFrame?: number;
  targetFrame?: number;
  durationFrames?: number;
  videoOverlayId?: OverlayId;
  targetQuery?: string;
  targetSpeed?: number;
  replaceExistingSpeedCurve?: boolean;
  allowDialogueSpeedRamp?: boolean;
}

export interface SpeedRampOverlayUpdate {
  overlayId: OverlayId;
  startFrame: number;
  endFrame: number;
  localStartFrame: number;
  localMidFrame: number;
  localEndFrame: number;
  previousSpeedCurve?: any[];
  nextSpeedCurve: any[];
  nextKeyframeTracks: any[];
  targetSpeed: number;
  reason: string;
}

export interface SpeedRampPlan {
  status: "changed" | "no-target" | "conflict";
  startFrame?: number;
  endFrame?: number;
  targetOverlayId?: OverlayId;
  updates: SpeedRampOverlayUpdate[];
  warnings: string[];
  message: string;
}

export interface FadeOptions {
  overlayId?: OverlayId;
  startFrame?: number;
  endFrame?: number;
  targetFrame?: number;
  targetQuery?: string;
  direction?: "in" | "out" | "both";
  durationFrames?: number;
  fromOpacity?: number;
  toOpacity?: number;
  replaceExistingOpacityKeyframes?: boolean;
  allowCaptionFade?: boolean;
  allowBrandFade?: boolean;
}

export interface FadeOverlayUpdate {
  overlayId: OverlayId;
  startFrame: number;
  endFrame: number;
  localStartFrame: number;
  localEndFrame: number;
  previousKeyframeTrackCount: number;
  nextKeyframeTracks: any[];
  nextStyles?: Record<string, unknown>;
  fromOpacity: number;
  toOpacity: number;
  reason: string;
}

export interface FadePlan {
  status: "changed" | "no-target" | "conflict";
  startFrame?: number;
  endFrame?: number;
  targetOverlayId?: OverlayId;
  updates: FadeOverlayUpdate[];
  warnings: string[];
  message: string;
}

export type KeyframeEditDirection = "in" | "out";

export interface KeyframeEditOptions {
  overlayId?: OverlayId;
  targetQuery?: string;
  targetFrame?: number;
  direction?: KeyframeEditDirection;
  startFrame?: number;
  endFrame?: number;
  durationFrames?: number;
  scaleDelta?: number;
  evidenceModality?: "transcript" | "visual" | "audio";
  evidenceStrength?: number;
  focalPoint?: { x: number; y: number };
  replaceExistingScaleKeyframes?: boolean;
  allowCaptionKeyframes?: boolean;
}

export interface KeyframeEditPlan {
  status: "ready" | "no-target" | "conflict";
  targetOverlayId?: OverlayId;
  startFrame?: number;
  endFrame?: number;
  localStartFrame?: number;
  localEndFrame?: number;
  direction: KeyframeEditDirection;
  scaleDelta?: number;
  useWith?: {
    set_keyframes: {
      overlayId: number;
      property: "scale";
      keyframes: Array<{ frame: number; value: number; easing: "linear" | "ease-in" | "ease-out" | "ease-in-out" }>;
      focalPoint?: { x: number; y: number };
    };
  };
  warnings: string[];
  message: string;
}

export type LayerReorderRelation = "behind" | "in-front-of" | "front" | "back";

export interface LayerReorderOptions {
  overlayId?: OverlayId;
  targetQuery?: string;
  referenceOverlayId?: OverlayId;
  referenceQuery?: string;
  relation?: LayerReorderRelation;
  targetRow?: number;
  allowVideoLayerMove?: boolean;
  allowRowCollision?: boolean;
  allowNonOverlappingReference?: boolean;
}

export interface LayerReorderOverlayUpdate {
  overlayId: OverlayId;
  previousRow: number;
  nextRow: number;
  nextStyles?: Record<string, unknown>;
  referenceOverlayId?: OverlayId;
  relation: LayerReorderRelation | "target-row";
  reason: string;
}

export interface LayerReorderPlan {
  status: "changed" | "no-target" | "conflict";
  targetOverlayId?: OverlayId;
  referenceOverlayId?: OverlayId;
  updates: LayerReorderOverlayUpdate[];
  warnings: string[];
  message: string;
}

export interface MoveRetimeOptions {
  overlayId?: OverlayId;
  targetQuery?: string;
  startFrame?: number;
  endFrame?: number;
  durationFrames?: number;
  shiftFrames?: number;
  allowSourceTrim?: boolean;
  allowCaptionRetime?: boolean;
  allowTimelineCollision?: boolean;
  allowProjectExtension?: boolean;
}

export interface MoveRetimeOverlayUpdate {
  overlayId: OverlayId;
  previousStartFrame: number;
  previousEndFrame: number;
  previousDurationFrames: number;
  nextStartFrame: number;
  nextEndFrame: number;
  nextDurationFrames: number;
  nextUpdates: Record<string, number>;
  sourceTrimFrames: number;
  reason: "semantic-overlay-move" | "semantic-overlay-retime" | "semantic-overlay-source-trim";
}

export interface MoveRetimePlan {
  status: "changed" | "no-target" | "conflict";
  targetOverlayId?: OverlayId;
  updates: MoveRetimeOverlayUpdate[];
  warnings: string[];
  message: string;
}

export type FilterIntent = "warmer" | "cooler" | "brighter" | "higher-contrast" | "black-and-white" | "muted" | "clear";

export interface FilterOptions {
  overlayId?: OverlayId;
  targetQuery?: string;
  targetFrame?: number;
  filterCss?: string;
  filterIntent?: FilterIntent;
  replaceExistingFilter?: boolean;
  allowCaptionFilter?: boolean;
  allowBrandFilter?: boolean;
}

export interface FilterOverlayUpdate {
  overlayId: OverlayId;
  previousFilter: string;
  nextFilter: string;
  nextStyles: Record<string, unknown>;
  reason: "manual-overlay-filter-override" | "manual-overlay-filter-clear";
}

export interface FilterPlan {
  status: "changed" | "no-target" | "conflict";
  targetOverlayId?: OverlayId;
  updates: FilterOverlayUpdate[];
  warnings: string[];
  message: string;
}

interface FrameRange {
  startFrame: number;
  endFrame: number;
}

interface VisualEvidence {
  evidenceText: string;
  frame: number;
  startFrame: number;
  endFrame: number;
  durationFrames: number;
  boundingBox?: VisualBoundingBox;
  source: VisualMomentCandidate["source"];
}

const DEFAULT_FPS = 30;
const DEFAULT_CLIP_DURATION_FRAMES = 30;
const DEFAULT_HIGHLIGHT_DURATION_FRAMES = 45;
const DEFAULT_SPEED_RAMP_DURATION_FRAMES = 30;

const visualMomentSchema = z.object({
  query: z.string().min(1).describe("Natural-language visual event, object, action, scene, or on-screen text to locate in the timeline."),
  videoOverlayId: z.union([z.string(), z.number()]).optional().describe("Optional timeline video overlay id to constrain the search."),
  limit: z.coerce.number().int().min(1).max(12).default(5).describe("Maximum visual moment candidates to return."),
  minConfidence: z.coerce.number().min(0).max(1).default(0.35).describe("Minimum candidate confidence."),
  includeOverlayText: z.boolean().default(true).describe("Also search text already attached to timeline overlays."),
});

const visualEditSchema = z.object({
  query: z.string().min(1).describe("Visual event, object, action, scene, or on-screen text that anchors the edit."),
  action: z.enum(["highlight", "inspect", "cut_range", "keyframe_anchor", "speed_ramp"]).default("highlight").describe("Requested downstream operation. Highlight needs a bounding box; inspect/cut/keyframe/speed-ramp need an unambiguous visual moment."),
  videoOverlayId: z.union([z.string(), z.number()]).optional().describe("Optional timeline video overlay id to constrain the search."),
  limit: z.coerce.number().int().min(1).max(12).default(5).describe("Maximum visual candidates to inspect before resolving ambiguity."),
  minConfidence: z.coerce.number().min(0).max(1).default(0.35).describe("Minimum candidate confidence."),
  includeOverlayText: z.boolean().default(true).describe("Also search text already attached to timeline overlays."),
  durationFrames: z.coerce.number().int().min(1).max(300).optional().describe("Optional operation window. Defaults are operation-specific."),
});

const cameraShakeSchema = z.object({
  targetFrame: z.coerce.number().int().min(0).optional().describe("Global timeline frame to shake on. Use frame from find_audio_moment or find_visual_moment when available."),
  videoOverlayId: z.union([z.string(), z.number()]).optional().describe("Optional video overlay id. If omitted, the active video overlay at targetFrame is used."),
  targetQuery: z.string().min(1).optional().describe("Optional visual query to resolve the target frame when targetFrame is not supplied."),
  intensity: z.coerce.number().min(0).max(1).default(0.3).describe("Shake intensity before config clamping. 0.3 matches the existing EDL default."),
  durationFrames: z.coerce.number().int().min(2).max(30).default(10).describe("Requested shake duration in frames before config clamping. 10 matches the existing EDL default."),
  canvasWidth: z.coerce.number().int().min(1).optional().describe("Canvas width for offset scaling. Defaults to project dimensions or 1920."),
  replacePositionKeyframes: z.boolean().default(false).describe("Allow replacing existing x/y position keyframes. Keep false unless the user explicitly wants to overwrite position motion."),
});

const speedRampSchema = z.object({
  startFrame: z.coerce.number().int().min(0).optional().describe("Global timeline start frame for the speed ramp."),
  endFrame: z.coerce.number().int().min(0).optional().describe("Global timeline end frame for the speed ramp. Must be after startFrame."),
  targetFrame: z.coerce.number().int().min(0).optional().describe("Global timeline frame to anchor the ramp when startFrame/endFrame are not supplied."),
  durationFrames: z.coerce.number().int().min(3).default(30).describe("Ramp window when only targetFrame is supplied. 30 frames matches the existing speed-change default."),
  videoOverlayId: z.union([z.string(), z.number()]).optional().describe("Optional video overlay id. If omitted, the active video overlay at the ramp start is used."),
  targetQuery: z.string().min(1).optional().describe("Optional visual query to resolve the ramp range when explicit frames are not supplied."),
  targetSpeed: z.coerce.number().min(0.01).max(4).default(0.5).describe("Middle speed multiplier before config clamping. 0.5 matches the existing EDL default."),
  replaceExistingSpeedCurve: z.boolean().default(false).describe("Allow replacing an existing speed curve or speed keyframe track."),
  allowDialogueSpeedRamp: z.boolean().default(false).describe("Allow retiming over caption/dialogue evidence. Keep false unless the user explicitly accepts speech sync risk."),
});

const fadeSchema = z.object({
  overlayId: z.union([z.string(), z.number()]).optional().describe("Target overlay id. Prefer selectedOverlayId from chat context when the user says this overlay."),
  startFrame: z.coerce.number().int().min(0).optional().describe("Global timeline frame where the fade starts."),
  endFrame: z.coerce.number().int().min(0).optional().describe("Global timeline frame where the fade ends."),
  targetFrame: z.coerce.number().int().min(0).optional().describe("Global timeline frame used to resolve the target overlay when overlayId is omitted."),
  targetQuery: z.string().min(1).optional().describe("Optional visual query to resolve the target overlay/frame when explicit ids are unavailable."),
  direction: z.enum(["in", "out", "both"]).default("out").describe("Fade direction. Use both for one atomic fade-in/hold/fade-out envelope; never split that request into two calls."),
  durationFrames: z.coerce.number().int().min(1).default(20).describe("Fade duration in frames per edge. For both, each edge is capped to half the available range."),
  fromOpacity: z.coerce.number().min(0).max(1).optional().describe("Optional edge opacity. Defaults to 1 for fade out, and 0 for fade in or both."),
  toOpacity: z.coerce.number().min(0).max(1).optional().describe("Optional destination/hold opacity. Defaults to 0 for fade out, and 1 for fade in or both."),
  replaceExistingOpacityKeyframes: z.boolean().default(false).describe("Allow replacing existing opacity keyframes. Keep false unless the user explicitly wants to overwrite opacity animation."),
  allowCaptionFade: z.boolean().default(false).describe("Allow fading caption/subtitle overlays. Keep false unless captions were explicitly targeted."),
  allowBrandFade: z.boolean().default(false).describe("Allow fading likely logo/brand/watermark overlays. Keep false unless the brand element was explicitly targeted."),
});

const keyframeEditSchema = z.object({
  overlayId: z.union([z.string(), z.number()]).optional().describe("Target overlay id. Prefer selectedOverlayId from chat context when the user says this clip, selected clip, or this overlay."),
  targetQuery: z.string().min(1).optional().describe("Natural-language overlay reference when overlayId is unavailable. Use explicit selectedOverlayId when available."),
  targetFrame: z.coerce.number().int().min(0).optional().describe("Grounded global timeline anchor. When overlayId is omitted, the one active visual source at this frame is resolved."),
  direction: z.enum(["in", "out"]).default("in").describe("Scale direction: in means 1.0 to larger, out means larger to 1.0."),
  startFrame: z.coerce.number().int().min(0).optional().describe("Optional global timeline frame where the scale keyframes should start. Defaults to the overlay start."),
  endFrame: z.coerce.number().int().min(0).optional().describe("Optional global timeline frame where the scale keyframes should end. Defaults to the overlay end."),
  durationFrames: z.coerce.number().int().min(2).max(7200).optional().describe("Optional duration in frames when only one edge is supplied. Defaults to the full target overlay duration."),
  scaleDelta: z.coerce.number().min(0.01).max(0.5).default(0.12).describe("Requested scale delta before safety clamping. 0.12 is a restrained manual zoom."),
  evidenceModality: z.enum(["transcript", "visual", "audio"]).optional().describe("Server-owned evidence modality for a motivated zoom anchor."),
  evidenceStrength: z.coerce.number().min(0).max(1).optional().describe("Revision-bound resolver confidence for a motivated zoom. This is evidence, not a hand-authored scale value."),
  focalPoint: z.object({
    x: z.coerce.number().min(0).max(1),
    y: z.coerce.number().min(0).max(1),
  }).strict().optional().describe("Revision-bound normalized focal point returned by visual evidence. It is resolved into a render-safe transform origin."),
  replaceExistingScaleKeyframes: z.boolean().default(false).describe("Allow replacing existing scale keyframes. Keep false unless the user explicitly wants to overwrite zoom/scale motion."),
  allowCaptionKeyframes: z.boolean().default(false).describe("Allow scale keyframes on captions/subtitles. Keep false unless captions were explicitly targeted."),
});

const layerReorderSchema = z.object({
  overlayId: z.union([z.string(), z.number()]).optional().describe("Target overlay id to move in layer order. Prefer selectedOverlayId when the user says this overlay."),
  targetQuery: z.string().min(1).optional().describe("Natural-language target overlay reference such as logo, title, lower third, or asset label when overlayId is unavailable."),
  referenceOverlayId: z.union([z.string(), z.number()]).optional().describe("Reference overlay id for behind/in-front-of moves."),
  referenceQuery: z.string().min(1).optional().describe("Natural-language reference overlay such as title or background when referenceOverlayId is unavailable."),
  relation: z.enum(["behind", "in-front-of", "front", "back"]).default("in-front-of").describe("Desired stacking relation. In Editron lower row renders in front for ordinary visual overlays."),
  targetRow: z.coerce.number().int().min(0).optional().describe("Explicit target row. Use only when the user asks for a specific layer/row."),
  allowVideoLayerMove: z.boolean().default(false).describe("Allow moving a video overlay row. Keep false unless the user explicitly asks to layer the source clip."),
  allowRowCollision: z.boolean().default(false).describe("Allow moving into a row that already has an overlapping ordinary visual overlay."),
  allowNonOverlappingReference: z.boolean().default(false).describe("Allow reference-based reorder when target and reference overlays do not overlap in time."),
});

const moveRetimeSchema = z.object({
  overlayId: z.union([z.string(), z.number()]).optional().describe("Target overlay id to move or retime. Prefer selectedOverlayId when the user says this overlay."),
  targetQuery: z.string().min(1).optional().describe("Natural-language overlay reference such as logo, title, music, sticker, or asset label when overlayId is unavailable."),
  startFrame: z.coerce.number().int().min(0).optional().describe("New global timeline start frame. If supplied alone, the overlay moves while preserving duration."),
  endFrame: z.coerce.number().int().min(0).optional().describe("New global timeline end frame. Combine with startFrame or durationFrames for an exact range."),
  durationFrames: z.coerce.number().int().min(1).optional().describe("New overlay duration in frames. Combine with startFrame, endFrame, or shiftFrames."),
  shiftFrames: z.coerce.number().int().optional().describe("Move the overlay by this many frames while preserving duration unless durationFrames is supplied."),
  allowSourceTrim: z.boolean().default(false).describe("Allow changing videoStartTime/startFromSound when trimming the start of video or sound media."),
  allowCaptionRetime: z.boolean().default(false).describe("Reserved for explicit caption retime requests. Captions still need a caption-specific retime path in this slice."),
  allowTimelineCollision: z.boolean().default(false).describe("Allow the target overlay to overlap another overlay on the same row after the move."),
  allowProjectExtension: z.boolean().default(false).describe("Allow the overlay to extend beyond the current project duration."),
});

const filterSchema = z.object({
  overlayId: z.union([z.string(), z.number()]).optional().describe("Target overlay id. Prefer selectedOverlayId when the user says this clip or this overlay."),
  targetQuery: z.string().min(1).optional().describe("Natural-language target overlay reference such as clip, image, logo, title, or asset label when overlayId is unavailable."),
  targetFrame: z.coerce.number().int().min(0).optional().describe("Global timeline frame used to resolve the active visual clip when overlayId is omitted."),
  filterCss: z.string().min(1).max(160).optional().describe("Explicit safe CSS filter string. Only simple brightness/contrast/saturate/grayscale/sepia/invert/blur/hue-rotate/opacity functions are accepted."),
  filterIntent: z.enum(["warmer", "cooler", "brighter", "higher-contrast", "black-and-white", "muted", "clear"]).optional().describe("Manual overlay filter intent when filterCss is not supplied."),
  replaceExistingFilter: z.boolean().default(false).describe("Allow replacing an existing overlay-level filter. Keep false unless the user explicitly wants to override a current manual filter."),
  allowCaptionFilter: z.boolean().default(false).describe("Allow filtering captions/subtitles. Keep false unless captions were explicitly targeted."),
  allowBrandFilter: z.boolean().default(false).describe("Allow filtering likely logo/brand/watermark overlays. Keep false unless the brand element was explicitly targeted."),
});

const subjectReframeSchema = z.object({
  targetAspectRatio: z.enum(["16:9", "9:16", "1:1", "4:5"]).describe("Required output aspect ratio. Use the ratio explicitly requested by the user."),
});

const PROJECT_VISUAL_ROOT_KEYS = [
  "analysis",
  "rawFootageAnalysis",
  "visualAnalysis",
  "videoAnalysis",
  "visionAnalysis",
  "fiveTrackAnalysis",
  "sceneAnalysis",
  "footageAnalysis",
  "analysisResult",
  "analysisResults",
  "keyframeAnalyses",
  "keyframes",
  "shots",
  "scenes",
  "segments",
  "frames",
  "visualMetadata",
];

const OVERLAY_VISUAL_ROOT_KEYS = [
  "analysis",
  "rawFootageAnalysis",
  "visualAnalysis",
  "videoAnalysis",
  "visionAnalysis",
  "fiveTrackAnalysis",
  "sceneAnalysis",
  "analysisResult",
  "analysisResults",
  "keyframeAnalyses",
  "keyframes",
  "shots",
  "scenes",
  "segments",
  "frames",
  "metadata",
];

const VISUAL_KEYS = new Set([
  "action",
  "actions",
  "actor",
  "actors",
  "appearance",
  "boundingbox",
  "boundingboxes",
  "camera",
  "caption",
  "captions",
  "category",
  "concept",
  "concepts",
  "description",
  "descriptions",
  "emotion",
  "emotions",
  "face",
  "faces",
  "frame",
  "frames",
  "gesture",
  "gestures",
  "keyframe",
  "keyframes",
  "keyframeanalyses",
  "label",
  "labels",
  "object",
  "objects",
  "ocr",
  "onscreentext",
  "person",
  "people",
  "scene",
  "scenedescription",
  "scenes",
  "shot",
  "shots",
  "shottype",
  "summary",
  "tag",
  "tags",
  "text",
  "title",
  "visual",
  "visualanalysis",
  "visualmetadata",
]);

const TEXT_FACT_KEYS = new Set([
  "action",
  "caption",
  "category",
  "concept",
  "description",
  "emotion",
  "gesture",
  "label",
  "name",
  "object",
  "ocr",
  "onscreentext",
  "scene",
  "scenedescription",
  "shottype",
  "summary",
  "tag",
  "text",
  "title",
]);

const NON_VISUAL_KEYS = new Set([
  "assetid",
  "audio",
  "audios",
  "createdat",
  "duration",
  "durationinframes",
  "end",
  "endframe",
  "endms",
  "endsec",
  "file",
  "filename",
  "from",
  "height",
  "html",
  "id",
  "metadata",
  "path",
  "projectid",
  "row",
  "src",
  "start",
  "startframe",
  "startms",
  "startsec",
  "transcript",
  "transcription",
  "updatedat",
  "url",
  "userid",
  "width",
  "words",
]);

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "he",
  "her",
  "his",
  "in",
  "into",
  "is",
  "it",
  "of",
  "on",
  "or",
  "she",
  "that",
  "the",
  "their",
  "there",
  "they",
  "this",
  "to",
  "with",
]);

export function createChatVisualTools({
  userId,
  projectId,
  subjectReframeDependencies,
  frameVerifier = verifyChatFrameVisualMatch,
}: CreateChatVisualToolsOptions) {
  const findVisualMoment = tool(
    async (input: z.infer<typeof visualMomentSchema>) => {
      const { projectService } = await import("../services/project-service");
      const project = await projectService.loadProject(userId, projectId);
      const evidence = buildVisualEvidence(project, {
        videoOverlayId: input.videoOverlayId,
        includeOverlayText: input.includeOverlayText,
      });
      const lexicalCandidates = findVisualMomentCandidates(project, input.query, {
        videoOverlayId: input.videoOverlayId,
        limit: input.limit,
        minConfidence: input.minConfidence,
        includeOverlayText: input.includeOverlayText,
      });
      const retrieval = await enrichVisualCandidatesWithCanonicalEvidence({
        project, projectId, userId, query: input.query,
        overlayId: input.videoOverlayId, limit: input.limit, lexicalCandidates,
      });
      const candidates = retrieval.candidates;

      return JSON.stringify({
        status: "success",
        data: {
          query: input.query,
          searchedEvidenceCount: evidence.length,
          returned: candidates.length,
          candidates,
          canonicalEvidence: retrieval.audit,
          message: candidates.length
            ? `Found ${candidates.length} visual moment candidate(s). This is discovery evidence only; call resolve_visual_edit before any mutation.`
            : `No stored visual evidence matched "${input.query}". Use analyze_clip_video/analyze_video_content first, or ask once for a clearer visual phrase.`,
        },
      });
    },
    {
      name: "find_visual_moment",
      description: `Find when a stored visual event, object, scene, action, gesture, OCR text, or overlay visual label appears in the edited timeline.
Use for read-only discovery and questions about where something appears. For any mutation, call resolve_visual_edit directly because it performs the same retrieval and returns the only mutation-authorizing contract.
Returns deterministic frame candidates, confidence, source evidence, and exact frame hints for cut_section, add_motion_graphic, set_keyframes, and visual_inspect_frame.
Do not make a destructive edit from a low-confidence or ambiguous candidate; present the candidates and ask once.`,
      schema: visualMomentSchema,
    },
  );

  const resolveVisualEdit = tool(
    async (input: z.infer<typeof visualEditSchema>, config) => {
      const { projectService } = await import("../services/project-service");
      const project = await projectService.loadProject(userId, projectId);
      const evidence = buildVisualEvidence(project, {
        videoOverlayId: input.videoOverlayId,
        includeOverlayText: input.includeOverlayText,
      });
      const lexicalCandidates = findVisualMomentCandidates(project, input.query, {
        videoOverlayId: input.videoOverlayId,
        limit: input.limit,
        minConfidence: input.minConfidence,
        includeOverlayText: input.includeOverlayText,
      });
      const retrieval = await enrichVisualCandidatesWithCanonicalEvidence({
        project, projectId, userId, query: input.query,
        overlayId: input.videoOverlayId, limit: input.limit, lexicalCandidates,
      });
      let candidates = retrieval.candidates;
      let frameVerification: ChatFrameVisualVerification | undefined;
      const resolutionEnvelope = (
        data: Record<string, unknown>,
        message: string,
        ready = false,
      ) => JSON.stringify({
        status: ready ? "success" : "error",
        data,
        error: ready
          ? null
          : {
              code: "VISUAL_RESOLUTION_REQUIRED",
              message,
              details: { resolverStatus: data.status ?? "unknown" },
            },
        nextAction: ready ? "continue" : "ask_clarification",
      });
      const frameEvidence = config?.configurable?.chatFrameEvidence as ChatFrameEvidence | undefined;
      if (frameEvidence) {
        const candidate = selectVisualCandidateForFrame(candidates, frameEvidence.frame);
        if (!candidate) {
          return resolutionEnvelope(
            {
              status: "no-match",
              action: input.action,
              query: input.query,
              candidates,
              warnings: [],
              canonicalEvidence: retrieval.audit,
            },
            `The attached rendered frame ${frameEvidence.frame} does not belong to a retrieved visual candidate for "${input.query}".`,
          );
        }
        try {
          frameVerification = await frameVerifier({
            query: input.query,
            evidence: frameEvidence,
            candidateContext: candidate.evidenceText,
          });
        } catch (error) {
          const message = `The rendered frame could not be independently verified: ${error instanceof Error ? error.message : String(error)}`;
          return JSON.stringify({
            status: "declined",
            data: {
              status: "ambiguous",
              action: input.action,
              query: input.query,
              candidates,
              warnings: ["frame-verification-provider-failed"],
              canonicalEvidence: retrieval.audit,
            },
            error: {
              code: "VISUAL_VERIFICATION_PROVIDER_FAILED",
              message,
              details: { retryable: false },
            },
            nextAction: "stop",
          });
        }
        if (frameVerification.status !== "confirmed") {
          const message = `The rendered frame did not visibly confirm "${input.query}". No edit was authorized.`;
          return JSON.stringify({
            status: "needs-choice",
            data: {
              status: "ambiguous",
              action: input.action,
              query: input.query,
              candidates,
              warnings: ["frame-verification-rejected"],
              canonicalEvidence: retrieval.audit,
              frameVerification,
            },
            error: {
              code: "VISUAL_TARGET_NOT_CONFIRMED",
              message,
              details: { retryable: false },
            },
            nextAction: "ask_clarification",
          });
        }
        candidates = promoteFrameVerifiedCandidate(candidates, candidate, frameVerification);
      }
      const plan = resolveVisualEditPlacement(project, input.query, {
        action: input.action,
        videoOverlayId: input.videoOverlayId,
        limit: input.limit,
        minConfidence: input.minConfidence,
        includeOverlayText: input.includeOverlayText,
        durationFrames: input.durationFrames,
        precomputedCandidates: candidates,
      });

      return resolutionEnvelope(
        {
          ...plan,
          searchedEvidenceCount: evidence.length,
          canonicalEvidence: retrieval.audit,
          ...(frameVerification ? { frameVerification } : {}),
        },
        plan.message,
        plan.status === "ready",
      );
    },
    {
      name: "resolve_visual_edit",
      description: `Resolve a stored visual event into safe edit parameters for downstream tools.
Call this directly for requests like "when the logo appears, add a highlight", "cut the shot with the laptop", or "zoom/keyframe on the object"; do not call find_visual_moment first.
Returns add_overlay placement only when the matched visual fact has a bounding box. Otherwise it returns an inspection frame and fails loud instead of guessing coordinates. It never mutates the project by itself.`,
      schema: visualEditSchema,
    },
  );

  const resolveKeyframeEdit = tool(
    async (input: z.infer<typeof keyframeEditSchema>) => {
      const { projectService } = await import("../services/project-service");
      const project = await projectService.loadProject(userId, projectId);
      const plan = resolveKeyframeEditParams(project, input);

      return JSON.stringify({
        status: plan.status === "ready" ? "success" : "error",
        data: plan,
        message: plan.message,
      });
    },
    {
      name: "resolve_keyframe_edit",
      description: `Resolve a selected/target overlay into safe set_keyframes params for manual scale zooms.
Use for chat requests like "slowly zoom in on the selected clip" after selectedOverlayId is present in chat context, or after a precise overlay query.
This is read-only: it returns local-frame scale keyframes for set_keyframes and refuses missing targets, captions, sound overlays, too-short clips, or existing scale motion unless replacement is explicit.`,
      schema: keyframeEditSchema,
    },
  );

  const applyCameraShake = tool(
    async (input: z.infer<typeof cameraShakeSchema>) => {
      try {
        const { projectService } = await import("../services/project-service");
        const project = await projectService.loadProject(userId, projectId);
        if (!project) {
          return JSON.stringify({ status: "error", message: `Project ${projectId} was not found or is not accessible.` });
        }

        const plan = applyCameraShakeToProject(project, input);
        if (plan.status !== "changed") {
          return JSON.stringify({ status: "error", message: plan.message, data: plan });
        }
        const resultData = withAffectedFrameRanges(
          plan,
          cameraShakeAffectedFrameRanges(project, plan),
          "apply_camera_shake",
        );

        for (const update of plan.updates) {
          await projectService.updateOverlay(userId, projectId, Number(update.overlayId), {
            keyframeTracks: update.nextKeyframeTracks,
          } as any);
        }

        return JSON.stringify({ status: "success", data: resultData });
      } catch (error: any) {
        return JSON.stringify({ status: "error", message: error?.message ?? "Failed to apply camera shake." });
      }
    },
    {
      name: "apply_camera_shake",
      description: `Apply a brief, bounded camera shake to the active video overlay at a resolved impact frame.
Use after find_audio_moment or find_visual_moment when the user asks for shake, impact, hit, punch, or beat/drop emphasis.
Requires a target frame or high-confidence visual target. Refuses to overwrite existing position keyframes unless replacePositionKeyframes is true.`,
      schema: cameraShakeSchema,
    },
  );

  const applySpeedRamp = tool(
    async (input: z.infer<typeof speedRampSchema>) => {
      try {
        const { projectService } = await import("../services/project-service");
        const project = await projectService.loadProject(userId, projectId);
        if (!project) {
          return JSON.stringify({ status: "error", message: `Project ${projectId} was not found or is not accessible.` });
        }

        const plan = applySpeedRampToProject(project, input);
        if (plan.status !== "changed") {
          return JSON.stringify({ status: "error", message: plan.message, data: plan });
        }
        const resultData = withAffectedFrameRanges(
          plan,
          plan.updates.map(({ startFrame, endFrame }) => ({ startFrame, endFrame })),
          "apply_speed_ramp",
        );

        for (const update of plan.updates) {
          await projectService.updateOverlay(userId, projectId, Number(update.overlayId), {
            speedCurve: update.nextSpeedCurve,
            keyframeTracks: update.nextKeyframeTracks,
          } as any);
        }

        return JSON.stringify({ status: "success", data: resultData });
      } catch (error: any) {
        return JSON.stringify({ status: "error", message: error?.message ?? "Failed to apply speed ramp." });
      }
    },
    {
      name: "apply_speed_ramp",
      description: `Apply a bounded speed ramp to the active video overlay over a resolved frame range.
Use for "slow this moment down", "speed ramp on this action", or "return to normal speed after emphasis" after a selected range, target frame, find_audio_moment, or find_visual_moment.
Writes speedCurve plus matching speed keyframes into the existing video speed path. Refuses dialogue/caption overlap and existing speed curves unless explicitly allowed.`,
      schema: speedRampSchema,
    },
  );

  const applyFade = tool(
    async (input: z.infer<typeof fadeSchema>) => {
      try {
        const { projectService } = await import("../services/project-service");
        const project = await projectService.loadProject(userId, projectId);
        if (!project) {
          return JSON.stringify({ status: "error", message: `Project ${projectId} was not found or is not accessible.` });
        }

        const plan = applyFadeToProject(project, input);
        if (plan.status !== "changed") {
          return JSON.stringify({ status: "error", message: plan.message, data: plan });
        }
        const resultData = withAffectedFrameRanges(
          plan,
          plan.updates.map(({ startFrame, endFrame }) => ({ startFrame, endFrame })),
          "apply_fade",
        );

        for (const update of plan.updates) {
          await projectService.updateOverlay(userId, projectId, Number(update.overlayId), {
            keyframeTracks: update.nextKeyframeTracks,
          } as any);
        }

        return JSON.stringify({ status: "success", data: resultData });
      } catch (error: any) {
        return JSON.stringify({ status: "error", message: error?.message ?? "Failed to apply fade." });
      }
    },
    {
      name: "apply_fade",
      description: `Apply bounded opacity fade keyframes to one visual overlay.
Use for "fade this out", "fade this overlay in", "fade in and out", or "fade it at the end" after a selected overlay, explicit overlay id, target frame, or high-confidence visual target.
For fade in and out, call this tool exactly once with direction="both"; never split one user request into separate in/out calls.
Writes opacity keyframes into the existing keyframeTracks path. Refuses sound overlays, protected captions/brand elements, and existing opacity motion unless explicitly allowed.`,
      schema: fadeSchema,
    },
  );

  const reorderLayer = tool(
    async (input: z.infer<typeof layerReorderSchema>) => {
      try {
        const { projectService } = await import("../services/project-service");
        const project = await projectService.loadProject(userId, projectId);
        if (!project) {
          return JSON.stringify({ status: "error", message: `Project ${projectId} was not found or is not accessible.` });
        }

        const plan = applyLayerReorderToProject(project, input);
        if (plan.status !== "changed") {
          return JSON.stringify({ status: "error", message: plan.message, data: plan });
        }
        const resultData = withAffectedFrameRanges(
          plan,
          layerReorderAffectedFrameRanges(project, plan),
          "reorder_layer",
        );

        for (const update of plan.updates) {
          const numericOverlayId = Number(update.overlayId);
          if (!Number.isFinite(numericOverlayId)) {
            return JSON.stringify({ status: "error", message: `Overlay ${String(update.overlayId)} cannot be updated because its id is not numeric.`, data: plan });
          }
          await projectService.updateOverlay(userId, projectId, numericOverlayId, {
            row: update.nextRow,
            ...(update.nextStyles ? { styles: update.nextStyles } : {}),
          } as any);
        }

        return JSON.stringify({ status: "success", data: resultData });
      } catch (error: any) {
        return JSON.stringify({ status: "error", message: error?.message ?? "Failed to reorder layer." });
      }
    },
    {
      name: "reorder_layer",
      description: `Move one ordinary visual overlay in front of or behind another overlay by changing the existing row field.
Use for "move the logo behind the title", "bring this sticker forward", "send this background back", or explicit layer/row requests.
Lower rows render in front for ordinary overlays. This refuses sound, captions, transitions, protected video moves, non-overlapping references, and row collisions unless explicitly allowed.`,
      schema: layerReorderSchema,
    },
  );

  const moveRetimeOverlay = tool(
    async (input: z.infer<typeof moveRetimeSchema>) => {
      try {
        const { projectService } = await import("../services/project-service");
        const project = await projectService.loadProject(userId, projectId);
        if (!project) {
          return JSON.stringify({ status: "error", message: `Project ${projectId} was not found or is not accessible.` });
        }

        const plan = applyMoveRetimeToProject(project, input);
        if (plan.status !== "changed") {
          return JSON.stringify({ status: "error", message: plan.message, data: plan });
        }
        const resultData = withAffectedFrameRanges(
          plan,
          plan.updates.flatMap((update) => [
            {
              startFrame: update.previousStartFrame,
              endFrame: update.previousEndFrame,
            },
            {
              startFrame: update.nextStartFrame,
              endFrame: update.nextEndFrame,
            },
          ]),
          "move_retime_overlay",
        );

        for (const update of plan.updates) {
          const numericOverlayId = Number(update.overlayId);
          if (!Number.isFinite(numericOverlayId)) {
            return JSON.stringify({ status: "error", message: `Overlay ${String(update.overlayId)} cannot be updated because its id is not numeric.`, data: plan });
          }
          await projectService.updateOverlay(userId, projectId, numericOverlayId, update.nextUpdates as any);
        }

        return JSON.stringify({ status: "success", data: resultData });
      } catch (error: any) {
        return JSON.stringify({ status: "error", message: error?.message ?? "Failed to move or retime overlay." });
      }
    },
    {
      name: "move_retime_overlay",
      description: `Move or retime one existing overlay by writing the existing from/durationInFrames timing fields.
Use for "move this later", "make this shorter", "extend this title", or "fit this sticker to these frames" after a selected overlay, explicit overlay id, or high-confidence overlay query.
Refuses caption/subtitle retiming, transitions, same-row timeline collisions, project overflow, and video/audio source-start trims unless explicitly allowed. This is not a renderer, template, or animation picker.`,
      schema: moveRetimeSchema,
    },
  );

  const applyFilter = tool(
    async (input: z.infer<typeof filterSchema>) => {
      try {
        const { projectService } = await import("../services/project-service");
        const project = await projectService.loadProject(userId, projectId);
        if (!project) {
          return JSON.stringify({ status: "error", message: `Project ${projectId} was not found or is not accessible.` });
        }

        const plan = applyFilterToProject(project, input);
        if (plan.status !== "changed") {
          return JSON.stringify({ status: "error", message: plan.message, data: plan });
        }
        const resultData = withAffectedFrameRanges(
          plan,
          overlayRangesForIds(project, plan.updates.map((update) => update.overlayId)),
          "apply_filter",
        );

        for (const update of plan.updates) {
          const numericOverlayId = Number(update.overlayId);
          if (!Number.isFinite(numericOverlayId)) {
            return JSON.stringify({ status: "error", message: `Overlay ${String(update.overlayId)} cannot be updated because its id is not numeric.`, data: plan });
          }
          await projectService.updateOverlay(userId, projectId, numericOverlayId, {
            styles: update.nextStyles,
          } as any);
        }

        return JSON.stringify({ status: "success", data: resultData });
      } catch (error: any) {
        return JSON.stringify({ status: "error", message: error?.message ?? "Failed to apply filter." });
      }
    },
    {
      name: "apply_filter",
      description: `Apply a safe manual CSS filter override to one explicitly resolved visual overlay.
Use for selected-overlay requests such as "make this clip warmer", "make this image black and white", or "clear the filter".
Writes only overlay.styles.filter, which is already consumed by the renderer. It does not revive EDL filter-change, does not pick project-wide color grade, and refuses captions, audio, unsafe CSS, ambiguous targets, and existing filters unless explicitly allowed.`,
      schema: filterSchema,
    },
  );

  const reframeProject = tool(
    async (input: z.infer<typeof subjectReframeSchema>) => {
      try {
        const dependencies = subjectReframeDependencies ?? await createSubjectReframeDependencies();
        const project = await dependencies.loadProject(userId, projectId);
        if (!project) {
          return JSON.stringify({ status: "error", message: `Project ${projectId} was not found or is not accessible.` });
        }

        const assetIds = Array.from(new Set(
          (Array.isArray(project.overlays) ? project.overlays : [])
            .filter((overlay: any) => overlay?.type === "video" || overlay?.type === "image")
            .map((overlay: any) => typeof overlay.assetId === "string" ? overlay.assetId.trim() : "")
            .filter(Boolean),
        ));
        const analyses = await dependencies.loadAnalyses(projectId, assetIds);
        const plan = await applySubjectReframeMutation({
          userId,
          projectId,
          project,
          analyses,
          targetAspectRatio: input.targetAspectRatio,
        }, dependencies);
        const resultData = plan.status === "changed"
          ? withAffectedFrameRanges(
              plan,
              overlayRangesForIds(project, plan.overlayUpdates.map((update) => update.overlayId)),
              "reframe_project",
            )
          : plan;

        return JSON.stringify({
          status: plan.status === "changed" ? "success" : "error",
          data: resultData,
          message: plan.message,
        });
      } catch (error: any) {
        return JSON.stringify({ status: "error", message: error?.message ?? "Failed to reframe the project." });
      }
    },
    {
      name: "reframe_project",
      description: `Reframe the full edited project to an explicitly requested aspect ratio while keeping grounded subjects visible.
Uses persisted per-asset spatial evidence to build subject-following focal tracks. Full-canvas media without usable subject evidence is safely contained; authored picture-in-picture and other non-full-canvas layouts are preserved.
Use for direct requests such as "make this 9:16 and keep the subject in frame". This tool owns its evidence lookup and mutation; do not route the request through apply_editorial_intent.`,
      schema: subjectReframeSchema,
    },
  );

  return [findVisualMoment, resolveVisualEdit, resolveKeyframeEdit, applyCameraShake, applySpeedRamp, applyFade, reorderLayer, moveRetimeOverlay, applyFilter, reframeProject];
}

export async function applySubjectReframeMutation(
  input: {
    userId: string;
    projectId: string;
    project: Record<string, any>;
    analyses: unknown[];
    targetAspectRatio: "16:9" | "9:16" | "1:1" | "4:5";
  },
  dependencies: SubjectReframeDependencies,
): Promise<SubjectReframePlan> {
  const plan = buildSubjectAwareReframePlan({
    project: input.project,
    analyses: input.analyses,
    targetAspectRatio: input.targetAspectRatio,
  });
  if (plan.status !== "changed") return plan;

  const updatesById = new Map(plan.overlayUpdates.map((update) => [update.overlayId, update.updates]));
  const overlays = (Array.isArray(input.project.overlays) ? input.project.overlays : []).map((overlay: any) => {
    const updates = updatesById.get(Number(overlay?.id));
    return updates ? { ...overlay, ...updates } : overlay;
  });
  const auditReceipt = plan.projectUpdates["intelligence.lastSubjectReframe"];
  await dependencies.saveProject(input.userId, input.projectId, {
    ...input.project,
    overlays,
    aspectRatio: plan.projectUpdates.aspectRatio,
    playerDimensions: plan.projectUpdates.playerDimensions,
  });
  if (auditReceipt) {
    await dependencies.updateProject(input.userId, input.projectId, {
      "intelligence.lastSubjectReframe": auditReceipt,
    });
  }
  return plan;
}

async function createSubjectReframeDependencies(): Promise<SubjectReframeDependencies> {
  const [{ projectService }, { getDatabase }] = await Promise.all([
    import("../services/project-service"),
    import("../db/mongodb"),
  ]);
  const db = await getDatabase();
  return {
    loadProject: (userId, projectId) => projectService.loadProject(userId, projectId) as Promise<Record<string, any> | null>,
    loadAnalyses: async (projectId, assetIds) => {
      if (assetIds.length === 0) return [];
      return db.collection(PROJECT_ASSET_ANALYSES_COLLECTION).find({
        projectId,
        assetId: { $in: assetIds },
      }).toArray();
    },
    saveProject: (userId, projectId, project) => projectService.saveProject(userId, projectId, project as any),
    updateProject: (userId, projectId, updates) => projectService.updateProject(userId, projectId, updates),
  };
}

async function enrichVisualCandidatesWithCanonicalEvidence(input: {
  project: unknown;
  projectId: string;
  userId: string;
  query: string;
  overlayId?: OverlayId;
  limit: number;
  lexicalCandidates: VisualMomentCandidate[];
}): Promise<{
  candidates: VisualMomentCandidate[];
  audit: {
    mode: "lexical-exact" | "canonical-multimodal";
    auditId: string | null;
    analyzedDocumentCount: number;
    embeddedDocumentCount: number;
  };
}> {
  if (input.lexicalCandidates.some((candidate) => candidate.safeForAutoEdit && candidate.matchType === "exact-phrase")) {
    return {
      candidates: input.lexicalCandidates,
      audit: {
        mode: "lexical-exact",
        auditId: null,
        analyzedDocumentCount: 0,
        embeddedDocumentCount: 0,
      },
    };
  }

  const evidence = await searchCanonicalChatEvidence({
    projectId: input.projectId,
    userId: input.userId,
    project: input.project,
    query: input.query,
    intent: "visual",
    overlayId: input.overlayId,
    limit: input.limit,
  });
  const semanticCandidates = evidence.candidates
    .filter((candidate) => candidate.startFrame != null && candidate.endFrame != null)
    .map((candidate) => canonicalVisualCandidate(candidate, evidence.auditId, input.query));
  return {
    candidates: mergeVisualCandidates(input.lexicalCandidates, semanticCandidates, input.limit),
    audit: {
      mode: "canonical-multimodal",
      auditId: evidence.auditId,
      analyzedDocumentCount: evidence.analyzedDocumentCount,
      embeddedDocumentCount: evidence.embeddedDocumentCount,
    },
  };
}

function selectVisualCandidateForFrame(
  candidates: VisualMomentCandidate[],
  frame: number,
): VisualMomentCandidate | undefined {
  return candidates
    .filter((candidate) => frame >= candidate.startFrame && frame <= candidate.endFrame)
    .sort((left, right) => (
      Number(right.safeForAutoEdit) - Number(left.safeForAutoEdit)
      || right.confidence - left.confidence
      || Math.abs(left.frame - frame) - Math.abs(right.frame - frame)
    ))[0];
}

function promoteFrameVerifiedCandidate(
  candidates: VisualMomentCandidate[],
  selected: VisualMomentCandidate,
  verification: ChatFrameVisualVerification,
): VisualMomentCandidate[] {
  const promoted: VisualMomentCandidate = {
    ...selected,
    ...(verification.boundingBox ? { boundingBox: verification.boundingBox } : {}),
    safeForAutoEdit: true,
    matchReasons: [
      ...selected.matchReasons,
      `frame-verified=${verification.receiptId}`,
      `frame-match=${verification.matchQuality}`,
    ],
    source: {
      ...selected.source,
      frameVerificationReceiptId: verification.receiptId,
      verifiedFrame: verification.frame,
    },
  };
  return [
    promoted,
    ...candidates.filter((candidate) => candidate !== selected),
  ];
}

function canonicalVisualCandidate(
  candidate: CanonicalChatEvidenceCandidate,
  auditId: string,
  query: string,
): VisualMomentCandidate {
  const startFrame = candidate.startFrame!;
  const endFrame = Math.max(startFrame + 1, candidate.endFrame!);
  const frame = Math.round((startFrame + endFrame) / 2);
  return {
    text: truncate(candidate.visualText || candidate.text, 140),
    frame,
    startFrame,
    endFrame,
    durationFrames: endFrame - startFrame,
    confidence: round3(candidate.score),
    confidenceLabel: confidenceLabel(candidate.score),
    matchType: "multimodal-semantic",
    matchReasons: [
      `canonical-match=${candidate.matchType}`,
      `text-semantic=${candidate.scores.textSemantic ?? "missing"}`,
      `image-semantic=${candidate.scores.imageSemantic ?? "missing"}`,
      `lexical=${candidate.scores.lexical}`,
      `audit=${auditId}`,
    ],
    evidenceText: candidate.visualText || candidate.text,
    ...(candidate.boundingBox ? { boundingBox: candidate.boundingBox } : {}),
    source: {
      type: "multimodal-evidence",
      ...(candidate.overlayId != null ? { overlayId: candidate.overlayId } : {}),
      assetId: candidate.assetId,
      ...(candidate.overlayType ? { overlayType: candidate.overlayType } : {}),
      path: candidate.sourcePaths.join(" | "),
      evidenceId: candidate.evidenceId,
      auditId,
      scores: candidate.scores,
      missingModalities: candidate.missingModalities,
      rejectionReasons: candidate.rejectionReasons,
      accepted: candidate.accepted,
    },
    safeForAutoEdit: candidate.safeForAutomaticMutation,
    useWith: {
      cut_section: {
        startFrame,
        endFrame,
        note: "Semantic visual segment only. Confirm the range before removing footage.",
      },
      add_motion_graphic: { frame, text: truncate(query, 80) },
      set_keyframes: { frame, note: "Use as a visually grounded emphasis anchor after inspection." },
      visual_inspect_frame: { frame, question: `Verify canonical visual match for: ${truncate(query, 80)}` },
    },
  };
}

function canRequestCanonicalFrameVerification(
  candidate: VisualMomentCandidate,
): boolean {
  return candidate.source.type === "multimodal-evidence"
    && candidate.source.accepted === true
    && !candidate.source.rejectionReasons?.includes("ambiguous-top-candidates");
}

function mergeVisualCandidates(
  lexical: VisualMomentCandidate[],
  semantic: VisualMomentCandidate[],
  limit: number,
): VisualMomentCandidate[] {
  const candidates = new Map<string, VisualMomentCandidate>();
  for (const candidate of [...lexical, ...semantic]) {
    const key = `${String(candidate.source.overlayId ?? "")}:${candidate.startFrame}:${candidate.endFrame}`;
    const existing = candidates.get(key);
    if (!existing || candidate.safeForAutoEdit || (!existing.safeForAutoEdit && candidate.confidence > existing.confidence)) {
      candidates.set(key, candidate);
    }
  }
  return [...candidates.values()]
    .sort((left, right) => Number(right.safeForAutoEdit) - Number(left.safeForAutoEdit)
      || right.confidence - left.confidence
      || left.startFrame - right.startFrame)
    .slice(0, clampInt(limit, 1, 12));
}

export function resolveKeyframeEditParams(
  project: any,
  options: KeyframeEditOptions,
): KeyframeEditPlan {
  const direction = options.direction ?? "in";
  const warnings: string[] = [];

  if (
    options.overlayId == null
    && !options.targetQuery?.trim()
    && positiveOrZeroNumber(options.targetFrame) == null
  ) {
    return {
      status: "no-target",
      direction,
      warnings,
      message: "Keyframe edit needs overlayId, an unambiguous targetQuery, or a grounded targetFrame.",
    };
  }

  const targetResult = resolveKeyframeTargetOverlay(project, options);
  if (!targetResult.ok) {
    return {
      status: "no-target",
      direction,
      warnings: targetResult.warnings,
      message: targetResult.message,
    };
  }

  const { overlay } = targetResult;
  warnings.push(...targetResult.warnings);
  const blockReason = keyframeEditBlockReason(overlay, options.allowCaptionKeyframes ?? false);
  if (blockReason) {
    return {
      status: "conflict",
      targetOverlayId: overlay.id,
      direction,
      warnings,
      message: blockReason,
    };
  }

  const numericOverlayId = Number(overlay.id);
  if (!Number.isFinite(numericOverlayId)) {
    return {
      status: "no-target",
      targetOverlayId: overlay.id,
      direction,
      warnings,
      message: `Overlay ${String(overlay.id)} cannot be used with set_keyframes because its id is not numeric.`,
    };
  }

  const motivatedForm = resolveMotivatedZoomForm(overlay, options, direction);
  const rangeResult = motivatedForm
    ? {
        ok: true as const,
        range: {
          startFrame: frame(overlay.from) + motivatedForm.startFrame,
          endFrame: frame(overlay.from) + motivatedForm.endFrame,
        },
        localStartFrame: motivatedForm.startFrame,
        localEndFrame: motivatedForm.endFrame,
        warnings: [] as string[],
      }
    : resolveKeyframeEditFrameRange(overlay, options);
  if (!rangeResult.ok) {
    return {
      status: "no-target",
      targetOverlayId: overlay.id,
      direction,
      warnings,
      message: rangeResult.message,
    };
  }
  warnings.push(...rangeResult.warnings);

  const existingTracks = Array.isArray(overlay.keyframeTracks) ? overlay.keyframeTracks : [];
  const existingScaleTracks = existingTracks.filter(isScaleKeyframeTrack);
  if (existingScaleTracks.length && !options.replaceExistingScaleKeyframes) {
    return {
      status: "conflict",
      targetOverlayId: overlay.id,
      startFrame: rangeResult.range.startFrame,
      endFrame: rangeResult.range.endFrame,
      localStartFrame: rangeResult.localStartFrame,
      localEndFrame: rangeResult.localEndFrame,
      direction,
      warnings: [
        ...warnings,
        "Existing scale keyframes were found; keyframe edit was not resolved because set_keyframes would overwrite scale motion.",
      ],
      message: `Overlay ${String(overlay.id)} already has scale keyframes. Ask to replace existing scale motion if that is intentional.`,
    };
  }

  const scaleDelta = motivatedForm
    ? round3(Math.abs(motivatedForm.scaleDelta))
    : round3(clamp(options.scaleDelta ?? 0.12, 0.02, 0.35));
  const keyframes = motivatedForm
    ? motivatedForm.keyframes.map((keyframe) => ({
        ...keyframe,
        easing: keyframe.easing === "snap-out" ? "ease-out" as const : keyframe.easing,
      }))
    : buildScaleKeyframes(rangeResult.localStartFrame, rangeResult.localEndFrame, direction, scaleDelta);

  return {
    status: "ready",
    targetOverlayId: overlay.id,
    startFrame: rangeResult.range.startFrame,
    endFrame: rangeResult.range.endFrame,
    localStartFrame: rangeResult.localStartFrame,
    localEndFrame: rangeResult.localEndFrame,
    direction,
    scaleDelta,
    useWith: {
      set_keyframes: {
        overlayId: numericOverlayId,
        property: "scale",
        keyframes,
        ...(motivatedForm ? {
          focalPoint: { x: motivatedForm.focal.x, y: motivatedForm.focal.y },
        } : {}),
      },
    },
    warnings,
    message: `Resolved ${direction === "in" ? "zoom in" : "zoom out"} scale keyframes for overlay ${String(overlay.id)} over frames ${rangeResult.range.startFrame}-${rangeResult.range.endFrame}${motivatedForm ? " from grounded moment evidence and the atomic zoom-form owner" : ""}.`,
  };
}

function resolveKeyframeTargetOverlay(
  project: any,
  options: KeyframeEditOptions,
): { ok: true; overlay: any; warnings: string[] }
  | { ok: false; message: string; warnings: string[] } {
  if (options.overlayId != null || options.targetQuery?.trim()) {
    const resolved = resolveMoveRetimeOverlay(project, options.overlayId, options.targetQuery);
    return resolved.ok
      ? resolved
      : {
          ...resolved,
          message: resolved.message.replace("Move/retime", "Keyframe edit"),
        };
  }

  const targetFrame = positiveOrZeroNumber(options.targetFrame);
  const overlays: any[] = Array.isArray(project?.overlays) ? project.overlays : [];
  const activeSources = targetFrame == null
    ? []
    : overlays.filter((overlay) => {
        const type = String(overlay?.type ?? "").toLowerCase();
        return (type === "video" || type === "image") && overlayContainsFrame(overlay, targetFrame);
      });
  if (activeSources.length === 1) {
    return { ok: true, overlay: activeSources[0], warnings: [] };
  }
  if (activeSources.length > 1) {
    const primarySources = activeSources.filter((overlay) => frame(overlay?.row) === 0);
    if (primarySources.length === 1) {
      return {
        ok: true,
        overlay: primarySources[0],
        warnings: [`Multiple visual sources were active at frame ${targetFrame}; the sole primary-row source was selected.`],
      };
    }
    return {
      ok: false,
      warnings: [],
      message: `Multiple visual sources are active at frame ${targetFrame}; select the intended clip before applying zoom keyframes.`,
    };
  }
  return {
    ok: false,
    warnings: [],
    message: `No visual source is active at frame ${targetFrame}; the zoom was not applied.`,
  };
}

function resolveMotivatedZoomForm(
  overlay: any,
  options: KeyframeEditOptions,
  direction: KeyframeEditDirection,
): ReturnType<typeof resolveAtomicZoomForm> | null {
  const targetFrame = positiveOrZeroNumber(options.targetFrame);
  const evidenceStrength = finiteNumber(options.evidenceStrength);
  if (targetFrame == null || evidenceStrength == null || !options.evidenceModality) return null;

  const overlayStart = frame(overlay?.from);
  const sceneEnd = duration(overlay?.durationInFrames);
  const localFrame = targetFrame - overlayStart;
  if (localFrame < 0 || localFrame >= sceneEnd) return null;

  const metadata = isRecord(overlay?.metadata) ? overlay.metadata : {};
  const signals = {
    ...record(metadata.rawSignals),
    ...record(metadata.signals),
    ...record(metadata.atomicOverlaySignals),
    ...record(overlay?.contentSignals),
    ...(options.evidenceModality === "transcript"
      ? { word_importance: evidenceStrength }
      : options.evidenceModality === "audio"
        ? { speech_energy: evidenceStrength }
        : { visual_significance: evidenceStrength }),
    ...(options.focalPoint ? {
      zoom_focal_x: options.focalPoint.x,
      zoom_focal_y: options.focalPoint.y,
    } : {}),
    topic_shift: direction === "out" ? 1 : 0,
  };

  const requestedScaleDelta = options.scaleDelta == null
    ? undefined
    : clamp(options.scaleDelta, 0.02, 0.35);
  const scaleParams = requestedScaleDelta == null
    ? {}
    : direction === "out"
      ? { scaleFrom: 1 + requestedScaleDelta, scaleTo: 1 }
      : { scaleFrom: 1, scaleTo: 1 + requestedScaleDelta };

  return resolveAtomicZoomForm({
    signals,
    params: {
      ...(direction === "out" ? { zoomType: "pull-back" } : {}),
      ...scaleParams,
    },
    localFrame,
    sceneEnd,
  });
}

function resolveKeyframeEditFrameRange(
  overlay: any,
  options: KeyframeEditOptions,
): { ok: true; range: FrameRange; localStartFrame: number; localEndFrame: number; warnings: string[] } | { ok: false; message: string } {
  const overlayStartFrame = frame(overlay?.from);
  const overlayDurationFrames = duration(overlay?.durationInFrames);
  const overlayEndFrame = overlayStartFrame + overlayDurationFrames;
  const warnings: string[] = [];
  if (overlayDurationFrames < 2) {
    return { ok: false, message: `Overlay ${String(overlay?.id)} is too short for visible scale keyframes.` };
  }

  const requestedStartFrame = positiveOrZeroNumber(options.startFrame);
  const requestedEndFrame = positiveOrZeroNumber(options.endFrame);
  const requestedDurationFrames = positiveNumber(options.durationFrames);
  let startFrame = requestedStartFrame ?? overlayStartFrame;
  let endFrame = requestedEndFrame;

  if (endFrame == null && requestedDurationFrames != null) {
    endFrame = startFrame + Math.round(requestedDurationFrames);
    if (endFrame > overlayEndFrame) {
      warnings.push(
        `Requested ${Math.round(requestedDurationFrames)}-frame zoom was clamped to overlay ${String(overlay?.id)} ending at frame ${overlayEndFrame}.`,
      );
      endFrame = overlayEndFrame;
    }
  } else if (endFrame == null) {
    endFrame = overlayEndFrame;
  }

  startFrame = Math.round(startFrame);
  endFrame = Math.round(endFrame);
  if (startFrame < overlayStartFrame || endFrame > overlayEndFrame) {
    return { ok: false, message: `Requested keyframe range ${startFrame}-${endFrame} is outside overlay ${String(overlay?.id)} frames ${overlayStartFrame}-${overlayEndFrame}.` };
  }
  if (endFrame - startFrame < 2) {
    return { ok: false, message: `Requested keyframe range ${startFrame}-${endFrame} is too short for a visible zoom.` };
  }

  return {
    ok: true,
    range: { startFrame, endFrame },
    localStartFrame: startFrame - overlayStartFrame,
    localEndFrame: endFrame - overlayStartFrame,
    warnings,
  };
}

function keyframeEditBlockReason(overlay: any, allowCaptionKeyframes: boolean): string | undefined {
  const type = String(overlay?.type ?? "").toLowerCase();
  if (type === "sound" || type === "audio") return `Overlay ${String(overlay?.id)} is ${type}; scale keyframes only apply to visual overlays.`;
  if (type === "transition") return `Overlay ${String(overlay?.id)} is a transition; use transition controls instead of overlay scale keyframes.`;
  if (isCaptionLikeOverlay(overlay) && !allowCaptionKeyframes) return `Overlay ${String(overlay?.id)} is captions/subtitles. Ask to allow caption keyframes if scaling captions is intentional.`;
  return undefined;
}

function buildScaleKeyframes(
  localStartFrame: number,
  localEndFrame: number,
  direction: KeyframeEditDirection,
  scaleDelta: number,
): Array<{ frame: number; value: number; easing: "linear" | "ease-in" | "ease-out" | "ease-in-out" }> {
  const highScale = round3(1 + scaleDelta);
  const startValue = direction === "in" ? 1 : highScale;
  const endValue = direction === "in" ? highScale : 1;
  return [
    { frame: localStartFrame, value: startValue, easing: "ease-in-out" },
    { frame: localEndFrame, value: endValue, easing: "ease-out" },
  ];
}

function isScaleKeyframeTrack(track: any): boolean {
  return track?.property === "scale";
}

export function applyCameraShakeToProject(
  project: any,
  options: CameraShakeOptions,
): CameraShakePlan {
  const overlays: any[] = Array.isArray(project?.overlays) ? project.overlays : [];
  const warnings: string[] = [];
  const targetFrameResult = resolveCameraShakeTargetFrame(project, options);
  if (!targetFrameResult.ok) {
    return {
      status: "no-target",
      updates: [],
      warnings: targetFrameResult.warnings,
      message: targetFrameResult.message,
    };
  }

  const targetFrame = targetFrameResult.frame;
  const video = resolveCameraShakeVideoOverlay(overlays, targetFrame, options.videoOverlayId);
  if (!video) {
    return {
      status: "no-target",
      targetFrame,
      updates: [],
      warnings,
      message: options.videoOverlayId != null
        ? `Video overlay ${String(options.videoOverlayId)} is not active at frame ${targetFrame}.`
        : `No video overlay is active at frame ${targetFrame}.`,
    };
  }

  const videoDurationFrames = duration(video.durationInFrames);
  const localFrame = targetFrame - frame(video.from);
  if (localFrame < 0 || localFrame > videoDurationFrames - 3) {
    return {
      status: "no-target",
      targetFrame,
      targetOverlayId: video.id,
      updates: [],
      warnings,
      message: `Video overlay ${String(video.id)} does not have enough remaining frames for a clean shake at frame ${targetFrame}.`,
    };
  }

  const existingTracks = Array.isArray(video.keyframeTracks) ? video.keyframeTracks : [];
  const existingPositionTracks = existingTracks.filter((track: any) => track?.property === "x" || track?.property === "y");
  const nonShakePositionTracks = existingPositionTracks.filter((track: any) => !isCameraShakeTrack(track));
  if (nonShakePositionTracks.length && !options.replacePositionKeyframes) {
    return {
      status: "conflict",
      targetFrame,
      targetOverlayId: video.id,
      updates: [],
      warnings: ["Existing x/y position keyframes were found; camera shake was not applied because it would override position motion."],
      message: `Overlay ${String(video.id)} already has x/y position keyframes. Ask to replace position motion if that is intentional.`,
    };
  }

  const config = DEFAULT_CONFIG.editing;
  const canvasWidth = positiveNumber(options.canvasWidth)
    ?? positiveNumber(project?.playerDimensions?.width)
    ?? positiveNumber(project?.dimensions?.width)
    ?? 1920;
  const intensity = round3(clamp(options.intensity ?? 0.3, config.shakeIntensityRange[0], config.shakeIntensityRange[1]));
  const durationFrames = clampInt(options.durationFrames ?? 10, 2, config.shakeMaxDurationFrames);
  const maxOffset = round3(intensity * canvasWidth * config.shakeCanvasOffsetFraction);
  const shakeTracks = buildCameraShakeTracks({
    localFrame,
    targetFrame,
    videoFrom: frame(video.from),
    videoDurationFrames,
    durationFrames,
    maxOffset,
  });
  const keptTracks = existingTracks.filter((track: any) => {
    if (options.replacePositionKeyframes && (track?.property === "x" || track?.property === "y")) return false;
    return !isCameraShakeTrack(track);
  });
  const nextKeyframeTracks = [...keptTracks, ...shakeTracks];

  return {
    status: "changed",
    targetFrame,
    targetOverlayId: video.id,
    updates: [{
      overlayId: video.id,
      targetFrame,
      localFrame,
      previousKeyframeTrackCount: existingTracks.length,
      nextKeyframeTracks,
      intensity,
      durationFrames,
      maxOffset,
      reason: "brief-impact-camera-shake",
    }],
    warnings,
    message: `Applied bounded camera shake to video overlay ${String(video.id)} at frame ${targetFrame}.`,
  };
}

export function applySpeedRampToProject(
  project: any,
  options: SpeedRampOptions,
): SpeedRampPlan {
  const overlays: any[] = Array.isArray(project?.overlays) ? project.overlays : [];
  const warnings: string[] = [];
  const rangeResult = resolveSpeedRampFrameRange(project, options);
  if (!rangeResult.ok) {
    return {
      status: "no-target",
      updates: [],
      warnings: rangeResult.warnings,
      message: rangeResult.message,
    };
  }

  const { startFrame, endFrame } = rangeResult.range;
  warnings.push(...rangeResult.warnings);
  const video = resolveSpeedRampVideoOverlay(overlays, rangeResult.range, options.videoOverlayId);
  if (!video) {
    return {
      status: "no-target",
      startFrame,
      endFrame,
      updates: [],
      warnings,
      message: options.videoOverlayId != null
        ? `Video overlay ${String(options.videoOverlayId)} does not fully cover frames ${startFrame}-${endFrame}.`
        : `No single video overlay fully covers frames ${startFrame}-${endFrame}.`,
    };
  }

  if (
    !options.allowDialogueSpeedRamp
    && hasCaptionDialogueInRange(overlays, rangeResult.range, positiveNumber(project?.fps) ?? 30)
  ) {
    return {
      status: "conflict",
      startFrame,
      endFrame,
      targetOverlayId: video.id,
      updates: [],
      warnings: ["Caption/dialogue evidence overlaps the requested range; speed ramp was not applied because it can desync or distort speech."],
      message: `Frames ${startFrame}-${endFrame} overlap captions/dialogue. Ask to allow dialogue speed ramp only if speech sync risk is intentional.`,
    };
  }

  const videoStartFrame = frame(video.from);
  const videoDurationFrames = duration(video.durationInFrames);
  const localStartFrame = startFrame - videoStartFrame;
  const localEndFrame = Math.min(endFrame - videoStartFrame, videoDurationFrames - 1);
  if (localStartFrame < 0 || localEndFrame >= videoDurationFrames || localEndFrame - localStartFrame < 3) {
    return {
      status: "no-target",
      startFrame,
      endFrame,
      targetOverlayId: video.id,
      updates: [],
      warnings,
      message: `Video overlay ${String(video.id)} does not have enough frames for a clean speed ramp over ${startFrame}-${endFrame}.`,
    };
  }

  const existingSpeedCurve = Array.isArray(video.speedCurve) ? video.speedCurve : undefined;
  const existingTracks = Array.isArray(video.keyframeTracks) ? video.keyframeTracks : [];
  const nonRampSpeedTracks = existingTracks.filter((track: any) => track?.property === "speed" && !isSpeedRampTrack(track));
  if (((existingSpeedCurve?.length ?? 0) > 0 || nonRampSpeedTracks.length > 0) && !options.replaceExistingSpeedCurve) {
    return {
      status: "conflict",
      startFrame,
      endFrame,
      targetOverlayId: video.id,
      updates: [],
      warnings: ["Existing speed curve/keyframes were found; speed ramp was not applied because it would overwrite retiming."],
      message: `Overlay ${String(video.id)} already has speed keyframes. Ask to replace existing speed motion if that is intentional.`,
    };
  }

  const config = DEFAULT_CONFIG.editing;
  const targetSpeed = round3(clamp(options.targetSpeed ?? 0.5, config.speedRange[0], config.speedRange[1]));
  const nextSpeedCurve = buildSpeedRampCurve(localStartFrame, localEndFrame, targetSpeed);
  const keptTracks = existingTracks.filter((track: any) => {
    if (options.replaceExistingSpeedCurve && track?.property === "speed") return false;
    return !isSpeedRampTrack(track);
  });
  const nextKeyframeTracks = [...keptTracks, speedRampTrack(nextSpeedCurve)];

  return {
    status: "changed",
    startFrame,
    endFrame,
    targetOverlayId: video.id,
    updates: [{
      overlayId: video.id,
      startFrame,
      endFrame,
      localStartFrame,
      localMidFrame: nextSpeedCurve[1].frame,
      localEndFrame,
      previousSpeedCurve: existingSpeedCurve,
      nextSpeedCurve,
      nextKeyframeTracks,
      targetSpeed,
      reason: "bounded-semantic-speed-ramp",
    }],
    warnings,
    message: `Applied bounded speed ramp to video overlay ${String(video.id)} over frames ${startFrame}-${endFrame}.`,
  };
}

export function applyFadeToProject(
  project: any,
  options: FadeOptions,
): FadePlan {
  const targetResult = resolveFadeTargetOverlay(project, options);
  if (!targetResult.ok) {
    return {
      status: "no-target",
      updates: [],
      warnings: targetResult.warnings,
      message: targetResult.message,
    };
  }

  const { overlay } = targetResult;
  const warnings = [...targetResult.warnings];
  const overlayType = String(overlay?.type ?? "").toLowerCase();
  if (overlayType === "sound" || overlayType === "audio") {
    return {
      status: "no-target",
      targetOverlayId: overlay.id,
      updates: [],
      warnings,
      message: `Overlay ${String(overlay.id)} is ${overlayType || "non-visual"}; opacity fade only applies to visual overlays.`,
    };
  }

  if (isCaptionLikeOverlay(overlay) && !options.allowCaptionFade) {
    return {
      status: "conflict",
      targetOverlayId: overlay.id,
      updates: [],
      warnings: ["Caption/subtitle overlay was protected from fade because fading captions can harm readability."],
      message: `Overlay ${String(overlay.id)} looks like captions/subtitles. Ask to allow caption fade if hiding captions is intentional.`,
    };
  }

  if (isLikelyBrandOverlay(overlay) && !options.allowBrandFade) {
    return {
      status: "conflict",
      targetOverlayId: overlay.id,
      updates: [],
      warnings: ["Likely brand/logo/watermark overlay was protected from fade."],
      message: `Overlay ${String(overlay.id)} looks like a brand/logo/watermark element. Ask to allow brand fade if hiding it is intentional.`,
    };
  }

  const rangeResult = resolveFadeFrameRange(project, overlay, options);
  if (!rangeResult.ok) {
    return {
      status: "no-target",
      targetOverlayId: overlay.id,
      updates: [],
      warnings,
      message: rangeResult.message,
    };
  }

  const { startFrame, endFrame } = rangeResult.range;
  const overlayStartFrame = frame(overlay.from);
  const overlayDurationFrames = duration(overlay.durationInFrames);
  const localStartFrame = startFrame - overlayStartFrame;
  const localEndFrame = endFrame - overlayStartFrame;
  const direction = options.direction ?? "out";
  const minimumRangeFrames = direction === "both" ? 2 : 1;
  if (
    localStartFrame < 0
    || localEndFrame > overlayDurationFrames
    || localEndFrame - localStartFrame < minimumRangeFrames
  ) {
    return {
      status: "no-target",
      startFrame,
      endFrame,
      targetOverlayId: overlay.id,
      updates: [],
      warnings,
      message: `Overlay ${String(overlay.id)} does not have enough frames for a clean fade over ${startFrame}-${endFrame}.`,
    };
  }

  const existingTracks = Array.isArray(overlay.keyframeTracks) ? overlay.keyframeTracks : [];
  const existingOpacityTracks = existingTracks.filter((track: any) => track?.property === "opacity");
  const nonFadeOpacityTracks = existingOpacityTracks.filter((track: any) => !isFadeTrack(track));
  if (nonFadeOpacityTracks.length && !options.replaceExistingOpacityKeyframes) {
    return {
      status: "conflict",
      startFrame,
      endFrame,
      targetOverlayId: overlay.id,
      updates: [],
      warnings: ["Existing opacity keyframes were found; fade was not applied because it would overwrite opacity motion."],
      message: `Overlay ${String(overlay.id)} already has opacity keyframes. Ask to replace existing opacity motion if that is intentional.`,
    };
  }

  const rendererFade = resolveRendererFadeAnimation(overlay, direction);
  const hasExplicitFadeShape = [
    options.startFrame,
    options.endFrame,
    options.targetFrame,
    options.durationFrames,
    options.fromOpacity,
    options.toOpacity,
  ].some((value) => value != null);
  if (rendererFade.satisfiesRequest && !hasExplicitFadeShape && !options.replaceExistingOpacityKeyframes) {
    return {
      status: "no-target",
      startFrame,
      endFrame,
      targetOverlayId: overlay.id,
      updates: [],
      warnings,
      message: `Overlay ${String(overlay.id)} already has the requested renderer fade.`,
    };
  }
  if (rendererFade.hasConflictingFade && !options.replaceExistingOpacityKeyframes) {
    return {
      status: "conflict",
      startFrame,
      endFrame,
      targetOverlayId: overlay.id,
      updates: [],
      warnings: ["Existing renderer fade animation was found; a second opacity owner was not added."],
      message: `Overlay ${String(overlay.id)} already has renderer-owned fade motion. Ask to replace existing opacity motion if different fade timing is intentional.`,
    };
  }

  const fadesFromTransparentEdge = direction === "in" || direction === "both";
  const fromOpacity = round3(clamp(options.fromOpacity ?? (fadesFromTransparentEdge ? 0 : 1), 0, 1));
  const toOpacity = round3(clamp(options.toOpacity ?? (fadesFromTransparentEdge ? 1 : 0), 0, 1));
  if (fromOpacity === toOpacity) {
    return {
      status: "no-target",
      startFrame,
      endFrame,
      targetOverlayId: overlay.id,
      updates: [],
      warnings,
      message: `Fade opacity values are identical (${fromOpacity}); no opacity change would be visible.`,
    };
  }

  const fadeTrack = buildFadeTrack(
    localStartFrame,
    localEndFrame,
    fromOpacity,
    toOpacity,
    direction,
    Math.max(1, Math.round(positiveNumber(options.durationFrames) ?? 20)),
  );
  const keptTracks = existingTracks.filter((track: any) => {
    if (options.replaceExistingOpacityKeyframes && track?.property === "opacity") return false;
    return !isFadeTrack(track);
  });
  const nextKeyframeTracks = [...keptTracks, fadeTrack];

  return {
    status: "changed",
    startFrame,
    endFrame,
    targetOverlayId: overlay.id,
    updates: [{
      overlayId: overlay.id,
      startFrame,
      endFrame,
      localStartFrame,
      localEndFrame,
      previousKeyframeTrackCount: existingTracks.length,
      nextKeyframeTracks,
      ...(rendererFade.nextStyles ? { nextStyles: rendererFade.nextStyles } : {}),
      fromOpacity,
      toOpacity,
      reason: `semantic-fade-${direction}`,
    }],
    warnings,
    message: `Applied ${
      direction === "both" ? "fade in and out" : direction === "in" ? "fade in" : "fade out"
    } to overlay ${String(overlay.id)} over frames ${startFrame}-${endFrame}.`,
  };
}

export function applyLayerReorderToProject(
  project: any,
  options: LayerReorderOptions,
): LayerReorderPlan {
  const overlays: any[] = Array.isArray(project?.overlays) ? project.overlays : [];
  const targetResult = resolveLayerReorderOverlay(project, options.overlayId, options.targetQuery, "target");
  if (!targetResult.ok) {
    return {
      status: "no-target",
      updates: [],
      warnings: targetResult.warnings,
      message: targetResult.message,
    };
  }

  const target = targetResult.overlay;
  const warnings = [...targetResult.warnings];
  const targetBlock = layerReorderBlockReason(target, "target", Boolean(options.allowVideoLayerMove));
  if (targetBlock) {
    return {
      status: "conflict",
      targetOverlayId: target.id,
      updates: [],
      warnings,
      message: targetBlock,
    };
  }

  const previousRow = currentOverlayRow(target);
  let reference: any | undefined;
  let relation: LayerReorderRelation | "target-row" = options.relation ?? "in-front-of";
  let nextRow = positiveOrZeroNumber(options.targetRow);

  if (nextRow != null) {
    nextRow = Math.round(nextRow);
    relation = "target-row";
    if (options.referenceOverlayId != null || options.referenceQuery) {
      warnings.push("Explicit targetRow was supplied, so reference overlay relation was not used.");
    }
  } else if (relation === "front") {
    nextRow = 0;
  } else if (relation === "back") {
    const furthestOtherRow = overlays
      .filter((overlay: any) => String(overlay?.id) !== String(target.id))
      .reduce((maxRow: number, overlay: any) => Math.max(maxRow, currentOverlayRow(overlay)), -1);
    if (previousRow > furthestOtherRow) {
      return {
        status: "no-target",
        targetOverlayId: target.id,
        updates: [],
        warnings,
        message: `Overlay ${String(target.id)} is already behind every other ordinary layer.`,
      };
    }
    nextRow = furthestOtherRow + 1;
  } else {
    const referenceResult = resolveLayerReorderOverlay(project, options.referenceOverlayId, options.referenceQuery, "reference");
    if (!referenceResult.ok) {
      return {
        status: "no-target",
        targetOverlayId: target.id,
        updates: [],
        warnings: [...warnings, ...referenceResult.warnings],
        message: referenceResult.message,
      };
    }

    reference = referenceResult.overlay;
    warnings.push(...referenceResult.warnings);
    if (String(reference.id) === String(target.id)) {
      return {
        status: "conflict",
        targetOverlayId: target.id,
        referenceOverlayId: reference.id,
        updates: [],
        warnings,
        message: "Layer reorder target and reference resolved to the same overlay.",
      };
    }

    const referenceBlock = layerReorderBlockReason(reference, "reference", true);
    if (referenceBlock) {
      return {
        status: "conflict",
        targetOverlayId: target.id,
        referenceOverlayId: reference.id,
        updates: [],
        warnings,
        message: referenceBlock,
      };
    }

    if (!options.allowNonOverlappingReference && !rangesOverlap(overlayFrameRange(target), overlayFrameRange(reference))) {
      return {
        status: "conflict",
        targetOverlayId: target.id,
        referenceOverlayId: reference.id,
        updates: [],
        warnings,
        message: `Overlay ${String(target.id)} and reference overlay ${String(reference.id)} do not overlap in time, so changing layer order would not have a visible effect.`,
      };
    }

    const referenceRow = currentOverlayRow(reference);
    if (relation === "behind") {
      if (previousRow > referenceRow) {
        return {
          status: "no-target",
          targetOverlayId: target.id,
          referenceOverlayId: reference.id,
          updates: [],
          warnings,
          message: `Overlay ${String(target.id)} is already behind reference overlay ${String(reference.id)}.`,
        };
      }
      nextRow = referenceRow + 1;
    } else {
      if (previousRow < referenceRow) {
        return {
          status: "no-target",
          targetOverlayId: target.id,
          referenceOverlayId: reference.id,
          updates: [],
          warnings,
          message: `Overlay ${String(target.id)} is already in front of reference overlay ${String(reference.id)}.`,
        };
      }
      if (referenceRow <= 0) {
        return {
          status: "conflict",
          targetOverlayId: target.id,
          referenceOverlayId: reference.id,
          updates: [],
          warnings,
          message: `Reference overlay ${String(reference.id)} is already on the frontmost ordinary row (0); moving another overlay in front requires an explicit targetRow or a manual row shift.`,
        };
      }
      nextRow = referenceRow - 1;
    }
  }

  if (nextRow == null || nextRow < 0) {
    return {
      status: "no-target",
      targetOverlayId: target.id,
      referenceOverlayId: reference?.id,
      updates: [],
      warnings,
      message: "Layer reorder needs a reference relation, targetRow, front, or back destination.",
    };
  }

  const roundedNextRow = Math.round(nextRow);
  if (roundedNextRow === previousRow) {
    return {
      status: "no-target",
      targetOverlayId: target.id,
      referenceOverlayId: reference?.id,
      updates: [],
      warnings,
      message: `Overlay ${String(target.id)} is already on row ${roundedNextRow}.`,
    };
  }

  const collisions = findLayerRowCollisions(overlays, target, roundedNextRow);
  if (collisions.length && !options.allowRowCollision) {
    return {
      status: "conflict",
      targetOverlayId: target.id,
      referenceOverlayId: reference?.id,
      updates: [],
      warnings,
      message: `Row ${roundedNextRow} already has overlapping ordinary visual overlay(s): ${collisions.map((overlay) => String(overlay.id)).join(", ")}. Ask to allow row collision only if this stacking ambiguity is intentional.`,
    };
  }

  const currentStyles = target?.styles && typeof target.styles === "object" && !Array.isArray(target.styles)
    ? target.styles as Record<string, unknown>
    : {};
  const protectedStyles = String(target?.type) === "text" && roundedNextRow < previousRow
    ? protectChatTextLegibility({
        overlayType: "text",
        currentStyles,
      })
    : undefined;
  const nextStyles = protectedStyles && Object.entries(protectedStyles)
    .some(([key, value]) => currentStyles[key] !== value)
    ? protectedStyles
    : undefined;
  if (nextStyles) {
    warnings.push("Applied the canonical text legibility floor because the text overlay moved toward the front.");
  }

  return {
    status: "changed",
    targetOverlayId: target.id,
    referenceOverlayId: reference?.id,
    updates: [{
      overlayId: target.id,
      previousRow,
      nextRow: roundedNextRow,
      ...(nextStyles ? { nextStyles } : {}),
      referenceOverlayId: reference?.id,
      relation,
      reason: "semantic-layer-reorder",
    }],
    warnings,
    message: `Moved overlay ${String(target.id)} from row ${previousRow} to row ${roundedNextRow}.`,
  };
}

export function applyMoveRetimeToProject(
  project: any,
  options: MoveRetimeOptions,
): MoveRetimePlan {
  const overlays: any[] = Array.isArray(project?.overlays) ? project.overlays : [];
  const targetResult = resolveMoveRetimeOverlay(project, options.overlayId, options.targetQuery);
  if (!targetResult.ok) {
    return {
      status: "no-target",
      updates: [],
      warnings: targetResult.warnings,
      message: targetResult.message,
    };
  }

  const target = targetResult.overlay;
  const warnings = [...targetResult.warnings];
  const targetBlock = moveRetimeBlockReason(target, Boolean(options.allowCaptionRetime));
  if (targetBlock) {
    return {
      status: "conflict",
      targetOverlayId: target.id,
      updates: [],
      warnings,
      message: targetBlock,
    };
  }

  const previousRange = overlayFrameRange(target);
  const previousDurationFrames = previousRange.endFrame - previousRange.startFrame;
  const rangeResult = resolveMoveRetimeFrameRange(previousRange, options);
  if (!rangeResult.ok) {
    return {
      status: "no-target",
      targetOverlayId: target.id,
      updates: [],
      warnings,
      message: rangeResult.message,
    };
  }

  warnings.push(...rangeResult.warnings);
  const nextRange = rangeResult.range;
  const nextDurationFrames = nextRange.endFrame - nextRange.startFrame;
  if (nextRange.startFrame === previousRange.startFrame && nextDurationFrames === previousDurationFrames) {
    return {
      status: "no-target",
      targetOverlayId: target.id,
      updates: [],
      warnings,
      message: `Overlay ${String(target.id)} already has timing ${previousRange.startFrame}-${previousRange.endFrame}.`,
    };
  }

  const totalFrames = resolveProjectDurationFrames(project);
  if (totalFrames > 0 && nextRange.endFrame > totalFrames && !options.allowProjectExtension) {
    return {
      status: "conflict",
      targetOverlayId: target.id,
      updates: [],
      warnings,
      message: `Move/retime would end at frame ${nextRange.endFrame}, beyond the project duration (${totalFrames} frames). Ask to allow project extension if that is intentional.`,
    };
  }

  const sourceUpdateResult = resolveMoveRetimeSourceUpdates(target, previousRange, nextRange, options);
  if (!sourceUpdateResult.ok) {
    return {
      status: "conflict",
      targetOverlayId: target.id,
      updates: [],
      warnings: [...warnings, ...sourceUpdateResult.warnings],
      message: sourceUpdateResult.message,
    };
  }

  warnings.push(...sourceUpdateResult.warnings);
  const nextRow = currentOverlayRow(target);
  const collisions = findTimelineRowCollisions(overlays, target, nextRange, nextRow);
  if (collisions.length && !options.allowTimelineCollision) {
    return {
      status: "conflict",
      targetOverlayId: target.id,
      updates: [],
      warnings,
      message: `Frames ${nextRange.startFrame}-${nextRange.endFrame} on row ${nextRow} already overlap overlay(s): ${collisions.map((overlay) => String(overlay.id)).join(", ")}. Ask to allow timeline collision only if this overlap is intentional.`,
    };
  }

  const nextUpdates: Record<string, number> = {
    from: nextRange.startFrame,
    durationInFrames: nextDurationFrames,
    ...sourceUpdateResult.updates,
  };
  const reason = sourceUpdateResult.sourceTrimFrames > 0
    ? "semantic-overlay-source-trim"
    : previousDurationFrames === nextDurationFrames
      ? "semantic-overlay-move"
      : "semantic-overlay-retime";

  return {
    status: "changed",
    targetOverlayId: target.id,
    updates: [{
      overlayId: target.id,
      previousStartFrame: previousRange.startFrame,
      previousEndFrame: previousRange.endFrame,
      previousDurationFrames,
      nextStartFrame: nextRange.startFrame,
      nextEndFrame: nextRange.endFrame,
      nextDurationFrames,
      nextUpdates,
      sourceTrimFrames: sourceUpdateResult.sourceTrimFrames,
      reason,
    }],
    warnings,
    message: `Moved/retimed overlay ${String(target.id)} from frames ${previousRange.startFrame}-${previousRange.endFrame} to ${nextRange.startFrame}-${nextRange.endFrame}.`,
  };
}

export function applyFilterToProject(
  project: any,
  options: FilterOptions,
): FilterPlan {
  const targetResult = resolveFilterTargetOverlay(project, options);
  if (!targetResult.ok) {
    return {
      status: "no-target",
      updates: [],
      warnings: targetResult.warnings,
      message: targetResult.message,
    };
  }

  const target = targetResult.overlay;
  const warnings = [...targetResult.warnings];
  const targetBlock = filterBlockReason(target, Boolean(options.allowCaptionFilter), Boolean(options.allowBrandFilter));
  if (targetBlock) {
    return {
      status: "conflict",
      targetOverlayId: target.id,
      updates: [],
      warnings,
      message: targetBlock,
    };
  }

  const filterResult = resolveManualFilterCss(options);
  if (!filterResult.ok) {
    return {
      status: "conflict",
      targetOverlayId: target.id,
      updates: [],
      warnings,
      message: filterResult.message,
    };
  }
  warnings.push(...filterResult.warnings);

  const previousStyles = isRecord(target?.styles) ? { ...target.styles } : {};
  const previousFilter = (stringValue(previousStyles.filter) ?? "none").trim() || "none";
  const nextFilter = filterResult.filter;

  if (previousFilter !== "none" && previousFilter !== nextFilter && nextFilter !== "none" && !options.replaceExistingFilter) {
    return {
      status: "conflict",
      targetOverlayId: target.id,
      updates: [],
      warnings,
      message: `Overlay ${String(target.id)} already has filter "${previousFilter}". Ask to replace the existing filter if overriding it is intentional.`,
    };
  }

  if (previousFilter === nextFilter) {
    return {
      status: "no-target",
      targetOverlayId: target.id,
      updates: [],
      warnings,
      message: `Overlay ${String(target.id)} already has filter "${nextFilter}".`,
    };
  }

  return {
    status: "changed",
    targetOverlayId: target.id,
    updates: [{
      overlayId: target.id,
      previousFilter,
      nextFilter,
      nextStyles: { ...previousStyles, filter: nextFilter },
      reason: nextFilter === "none" ? "manual-overlay-filter-clear" : "manual-overlay-filter-override",
    }],
    warnings,
    message: nextFilter === "none"
      ? `Cleared manual filter on overlay ${String(target.id)}.`
      : `Applied manual filter "${nextFilter}" to overlay ${String(target.id)}.`,
  };
}

function resolveFilterTargetOverlay(
  project: any,
  options: FilterOptions,
): { ok: true; overlay: any; warnings: string[] } | { ok: false; message: string; warnings: string[] } {
  const warnings: string[] = [];
  const overlays: any[] = Array.isArray(project?.overlays) ? project.overlays : [];

  if (options.overlayId != null) {
    const overlay = overlays.find((candidate) => String(candidate?.id) === String(options.overlayId));
    if (!overlay) {
      return {
        ok: false,
        warnings,
        message: `Overlay ${String(options.overlayId)} was not found in the project.`,
      };
    }
    return { ok: true, overlay, warnings };
  }

  if (options.targetQuery?.trim()) {
    const normalizedQuery = normalizeText(options.targetQuery);
    const queryTokens = tokenize(options.targetQuery);
    const scored = overlays
      .map((overlay) => ({ overlay, score: scoreLayerOverlayQuery(overlay, normalizedQuery, queryTokens) }))
      .filter((candidate) => candidate.score >= 0.35)
      .sort((a, b) => b.score - a.score || frame(a.overlay?.from) - frame(b.overlay?.from) || currentOverlayRow(a.overlay) - currentOverlayRow(b.overlay));

    const best = scored[0];
    if (!best) {
      return {
        ok: false,
        warnings,
        message: `No overlay matched "${options.targetQuery}". Use an explicit overlay id or inspect the timeline first.`,
      };
    }

    const second = scored[1];
    if (second && Math.abs(best.score - second.score) < 0.08) {
      return {
        ok: false,
        warnings,
        message: `Overlay query "${options.targetQuery}" is ambiguous between overlays ${String(best.overlay.id)} and ${String(second.overlay.id)}. Use overlay ids before applying a filter.`,
      };
    }

    warnings.push(`Resolved overlay ${String(best.overlay.id)} from query "${options.targetQuery}".`);
    return { ok: true, overlay: best.overlay, warnings };
  }

  const targetFrame = positiveOrZeroNumber(options.targetFrame);
  if (targetFrame != null) {
    const roundedFrame = Math.round(targetFrame);
    const activeMedia = overlays
      .filter((overlay) => isMediaFilterTargetOverlay(overlay) && overlayContainsFrame(overlay, roundedFrame))
      .sort((a, b) => currentOverlayRow(a) - currentOverlayRow(b) || String(a?.id).localeCompare(String(b?.id)));
    if (activeMedia.length === 1) {
      return { ok: true, overlay: activeMedia[0], warnings };
    }
    if (activeMedia.length > 1) {
      return {
        ok: false,
        warnings,
        message: `Frame ${roundedFrame} has multiple active media overlays (${activeMedia.map((overlay) => String(overlay.id)).join(", ")}). Use overlay id before applying a filter.`,
      };
    }

    const activeVisual = overlays
      .filter((overlay) => isPotentialFilterTargetOverlay(overlay) && !isCaptionLikeOverlay(overlay) && overlayContainsFrame(overlay, roundedFrame))
      .sort((a, b) => currentOverlayRow(a) - currentOverlayRow(b) || String(a?.id).localeCompare(String(b?.id)));
    if (activeVisual.length === 1) {
      return { ok: true, overlay: activeVisual[0], warnings };
    }
    if (activeVisual.length > 1) {
      return {
        ok: false,
        warnings,
        message: `Frame ${roundedFrame} has multiple active visual overlays (${activeVisual.map((overlay) => String(overlay.id)).join(", ")}). Use overlay id before applying a filter.`,
      };
    }

    return {
      ok: false,
      warnings,
      message: `No filterable visual overlay is active at frame ${roundedFrame}.`,
    };
  }

  return {
    ok: false,
    warnings,
    message: "Filter needs overlayId, targetQuery, or targetFrame. Use selectedOverlayId from chat context when the user says this clip or this overlay.",
  };
}

function resolveManualFilterCss(
  options: FilterOptions,
): { ok: true; filter: string; warnings: string[] } | { ok: false; message: string; warnings: string[] } {
  const warnings: string[] = [];
  const explicitFilter = stringValue(options.filterCss)?.trim();
  if (explicitFilter && options.filterIntent) {
    warnings.push("filterCss was supplied, so filterIntent was ignored.");
  }

  if (explicitFilter) {
    const safeFilter = normalizeSafeFilterCss(explicitFilter);
    if (!safeFilter) {
      return {
        ok: false,
        warnings,
        message: "Filter CSS was rejected. Use only safe brightness/contrast/saturate/grayscale/sepia/invert/blur/hue-rotate/opacity functions or none.",
      };
    }
    return { ok: true, filter: safeFilter, warnings };
  }

  if (!options.filterIntent) {
    return {
      ok: false,
      warnings,
      message: "Filter needs filterIntent or filterCss. Broad project color grading stays with the profile/color owner.",
    };
  }

  return { ok: true, filter: filterCssForIntent(options.filterIntent), warnings };
}

function normalizeSafeFilterCss(value: string): string | undefined {
  const trimmed = value.trim().replace(/\s+/g, " ");
  const lower = trimmed.toLowerCase();
  if (lower === "none") return "none";
  if (!trimmed || /[;{}]/.test(trimmed) || lower.includes("url(") || lower.includes("var(") || lower.includes("expression")) {
    return undefined;
  }

  const filterFunctionPattern = /(brightness|contrast|saturate|grayscale|sepia|invert|blur|hue-rotate|opacity)\((-?\d*\.?\d+)(%|px|deg)?\)/g;
  let consumed = "";
  let match: RegExpExecArray | null;
  while ((match = filterFunctionPattern.exec(trimmed)) !== null) {
    const fullMatch = match[0];
    const name = match[1] ?? "";
    const rawAmount = match[2] ?? "";
    const unit = match[3] ?? "";
    const amount = Number(rawAmount);
    if (!isSafeFilterFunction(name, amount, unit)) return undefined;
    consumed += fullMatch;
  }

  return consumed && consumed === trimmed.replace(/\s+/g, "") ? trimmed : undefined;
}

function isSafeFilterFunction(name: string, amount: number, unit: string): boolean {
  if (!Number.isFinite(amount)) return false;
  switch (name) {
    case "hue-rotate":
      return unit === "deg" && amount >= -180 && amount <= 180;
    case "blur":
      return unit === "px" && amount >= 0 && amount <= 32;
    case "grayscale":
    case "sepia":
    case "invert":
    case "opacity":
      return unit === "%" ? amount >= 0 && amount <= 100 : unit === "" && amount >= 0 && amount <= 1;
    case "brightness":
    case "contrast":
    case "saturate":
      return unit === "%" ? amount >= 0 && amount <= 300 : unit === "" && amount >= 0 && amount <= 3;
    default:
      return false;
  }
}

function filterCssForIntent(intent: FilterIntent): string {
  switch (intent) {
    case "warmer":
      return "sepia(0.18) saturate(1.12) hue-rotate(-6deg) brightness(1.03)";
    case "cooler":
      return "saturate(0.95) hue-rotate(6deg) brightness(1.01)";
    case "brighter":
      return "brightness(1.12) contrast(1.04)";
    case "higher-contrast":
      return "contrast(1.16) saturate(1.05)";
    case "black-and-white":
      return "grayscale(1) contrast(1.05)";
    case "muted":
      return "saturate(0.72) contrast(0.96)";
    case "clear":
      return "none";
  }
}

function filterBlockReason(overlay: any, allowCaptionFilter: boolean, allowBrandFilter: boolean): string | undefined {
  const type = String(overlay?.type ?? "").toLowerCase();
  if (type === "sound" || type === "audio") {
    return `Overlay ${String(overlay?.id)} is ${type}; filters only apply to visual overlays.`;
  }
  if (type === "transition") {
    return `Overlay ${String(overlay?.id)} is a transition; use transition controls instead of overlay filters.`;
  }
  if (isCaptionLikeOverlay(overlay) && !allowCaptionFilter) {
    return `Overlay ${String(overlay?.id)} is captions/subtitles; captions are protected from generic filter changes unless explicitly allowed.`;
  }
  if (isLikelyBrandOverlay(overlay) && !allowBrandFilter) {
    return `Overlay ${String(overlay?.id)} looks like a logo/brand/watermark; brand elements are protected from generic filter changes unless explicitly allowed.`;
  }
  if (!isPotentialFilterTargetOverlay(overlay)) {
    return `Overlay ${String(overlay?.id)} is not a filterable visual overlay.`;
  }
  return undefined;
}

function isMediaFilterTargetOverlay(overlay: any): boolean {
  const type = String(overlay?.type ?? "").toLowerCase();
  return type === "video" || type === "image";
}

function isPotentialFilterTargetOverlay(overlay: any): boolean {
  const type = String(overlay?.type ?? "").toLowerCase();
  return Boolean(overlay) && type !== "sound" && type !== "audio" && type !== "transition";
}

function resolveMoveRetimeOverlay(
  project: any,
  overlayId: OverlayId | undefined,
  query: string | undefined,
): { ok: true; overlay: any; warnings: string[] } | { ok: false; message: string; warnings: string[] } {
  const warnings: string[] = [];
  const overlays: any[] = Array.isArray(project?.overlays) ? project.overlays : [];

  if (overlayId != null) {
    const overlay = overlays.find((candidate) => String(candidate?.id) === String(overlayId));
    if (!overlay) {
      return {
        ok: false,
        warnings,
        message: `Overlay ${String(overlayId)} was not found in the project.`,
      };
    }
    return { ok: true, overlay, warnings };
  }

  if (!query?.trim()) {
    return {
      ok: false,
      warnings,
      message: "Move/retime needs overlayId or targetQuery for the overlay to edit. Use selectedOverlayId from chat context when the user says this overlay.",
    };
  }

  const normalizedQuery = normalizeText(query);
  const queryTokens = tokenize(query);
  const scored = overlays
    .map((overlay) => ({ overlay, score: scoreLayerOverlayQuery(overlay, normalizedQuery, queryTokens) }))
    .filter((candidate) => candidate.score >= 0.35)
    .sort((a, b) => b.score - a.score || frame(a.overlay?.from) - frame(b.overlay?.from) || currentOverlayRow(a.overlay) - currentOverlayRow(b.overlay));

  const best = scored[0];
  if (!best) {
    return {
      ok: false,
      warnings,
      message: `No overlay matched "${query}". Use an explicit overlay id or inspect the timeline first.`,
    };
  }

  const second = scored[1];
  if (second && Math.abs(best.score - second.score) < 0.08) {
    return {
      ok: false,
      warnings,
      message: `Overlay query "${query}" is ambiguous between overlays ${String(best.overlay.id)} and ${String(second.overlay.id)}. Use overlay ids before moving or retiming.`,
    };
  }

  warnings.push(`Resolved overlay ${String(best.overlay.id)} from query "${query}".`);
  return { ok: true, overlay: best.overlay, warnings };
}

function resolveMoveRetimeFrameRange(
  previousRange: FrameRange,
  options: MoveRetimeOptions,
): { ok: true; range: FrameRange; warnings: string[] } | { ok: false; message: string } {
  const previousDurationFrames = previousRange.endFrame - previousRange.startFrame;
  const warnings: string[] = [];
  const shiftFrames = finiteInteger(options.shiftFrames);
  const startFrame = positiveOrZeroNumber(options.startFrame);
  const endFrame = positiveOrZeroNumber(options.endFrame);
  const durationFrames = positiveNumber(options.durationFrames);

  if (shiftFrames != null && (startFrame != null || endFrame != null)) {
    return { ok: false, message: "Move/retime needs either shiftFrames or explicit start/end frames, not both in one request." };
  }

  let nextStartFrame: number | undefined;
  let nextEndFrame: number | undefined;

  if (shiftFrames != null) {
    nextStartFrame = previousRange.startFrame + shiftFrames;
    const nextDurationFrames = Math.round(durationFrames ?? previousDurationFrames);
    nextEndFrame = nextStartFrame + nextDurationFrames;
  } else if (startFrame != null && endFrame != null) {
    nextStartFrame = Math.round(startFrame);
    nextEndFrame = Math.round(endFrame);
    if (durationFrames != null && Math.round(durationFrames) !== nextEndFrame - nextStartFrame) {
      return { ok: false, message: `durationFrames (${Math.round(durationFrames)}) does not match startFrame/endFrame range (${nextEndFrame - nextStartFrame}).` };
    }
  } else if (startFrame != null && durationFrames != null) {
    nextStartFrame = Math.round(startFrame);
    nextEndFrame = nextStartFrame + Math.round(durationFrames);
  } else if (endFrame != null && durationFrames != null) {
    nextEndFrame = Math.round(endFrame);
    nextStartFrame = nextEndFrame - Math.round(durationFrames);
  } else if (startFrame != null) {
    nextStartFrame = Math.round(startFrame);
    nextEndFrame = nextStartFrame + previousDurationFrames;
  } else if (endFrame != null) {
    nextStartFrame = previousRange.startFrame;
    nextEndFrame = Math.round(endFrame);
  } else if (durationFrames != null) {
    nextStartFrame = previousRange.startFrame;
    nextEndFrame = nextStartFrame + Math.round(durationFrames);
  } else {
    return { ok: false, message: "Move/retime needs shiftFrames, startFrame, endFrame, or durationFrames." };
  }

  if (nextStartFrame == null || nextEndFrame == null) {
    return { ok: false, message: "Move/retime could not resolve a target frame range." };
  }
  if (nextStartFrame < 0) {
    return { ok: false, message: `Move/retime would start before frame 0 (${nextStartFrame}).` };
  }
  if (nextEndFrame <= nextStartFrame) {
    return { ok: false, message: `Move/retime end frame (${nextEndFrame}) must be after start frame (${nextStartFrame}).` };
  }

  const roundedRange = {
    startFrame: Math.round(nextStartFrame),
    endFrame: Math.round(nextEndFrame),
  };
  if (shiftFrames != null) {
    warnings.push(`Resolved move by ${shiftFrames} frame(s) from ${previousRange.startFrame}-${previousRange.endFrame} to ${roundedRange.startFrame}-${roundedRange.endFrame}.`);
  }

  return { ok: true, range: roundedRange, warnings };
}

function resolveMoveRetimeSourceUpdates(
  overlay: any,
  previousRange: FrameRange,
  nextRange: FrameRange,
  options: MoveRetimeOptions,
): { ok: true; updates: Record<string, number>; sourceTrimFrames: number; warnings: string[] } | { ok: false; message: string; warnings: string[] } {
  const warnings: string[] = [];
  const type = String(overlay?.type ?? "").toLowerCase();
  const isVideo = type === "video";
  const isSound = type === "sound" || type === "audio";
  if (!isVideo && !isSound) {
    return { ok: true, updates: {}, sourceTrimFrames: 0, warnings };
  }

  const previousDurationFrames = previousRange.endFrame - previousRange.startFrame;
  const nextDurationFrames = nextRange.endFrame - nextRange.startFrame;
  const durationChanged = nextDurationFrames !== previousDurationFrames;
  if (!durationChanged) {
    return { ok: true, updates: {}, sourceTrimFrames: 0, warnings };
  }

  if (nextDurationFrames > previousDurationFrames) {
    return {
      ok: false,
      warnings,
      message: `Overlay ${String(overlay?.id)} is ${type}; extending media duration from ${previousDurationFrames} to ${nextDurationFrames} frames needs source-duration verification before it can be automatic.`,
    };
  }

  const shiftFrames = finiteInteger(options.shiftFrames);
  const explicitStart = positiveOrZeroNumber(options.startFrame);
  const explicitEnd = positiveOrZeroNumber(options.endFrame);
  const looksLikeStartTrim = shiftFrames == null
    && explicitStart != null
    && explicitEnd != null
    && nextRange.startFrame > previousRange.startFrame
    && nextRange.endFrame === previousRange.endFrame;

  if (looksLikeStartTrim && !options.allowSourceTrim) {
    return {
      ok: false,
      warnings,
      message: `Moving the ${type} overlay start from ${previousRange.startFrame} to ${nextRange.startFrame} while keeping the same end looks like a source-start trim. Ask to allowSourceTrim so videoStartTime/startFromSound can be updated truthfully.`,
    };
  }

  const sourceTrimFrames = options.allowSourceTrim && nextRange.startFrame > previousRange.startFrame
    ? nextRange.startFrame - previousRange.startFrame
    : 0;
  if (sourceTrimFrames <= 0) {
    return { ok: true, updates: {}, sourceTrimFrames: 0, warnings };
  }

  const updates: Record<string, number> = {};
  if (isVideo) {
    updates.videoStartTime = frame(overlay?.videoStartTime) + sourceTrimFrames;
  } else {
    updates.startFromSound = frame(overlay?.startFromSound) + sourceTrimFrames;
  }
  warnings.push(`Adjusted ${isVideo ? "videoStartTime" : "startFromSound"} by ${sourceTrimFrames} frame(s) for source-start trim.`);
  return { ok: true, updates, sourceTrimFrames, warnings };
}

function moveRetimeBlockReason(overlay: any, allowCaptionRetime: boolean): string | undefined {
  const type = String(overlay?.type ?? "").toLowerCase();
  if (type === "caption" || type === "subtitle") {
    return allowCaptionRetime
      ? `Overlay ${String(overlay?.id)} is ${type}; caption retime needs the caption-specific word timing path, so this generic move/retime tool will not alter it.`
      : `Overlay ${String(overlay?.id)} is ${type}; captions are protected from generic retime because word-level timing can desync.`;
  }
  if (type === "transition") {
    return `Overlay ${String(overlay?.id)} is a transition; use transition-specific editing so transition anchors stay attached to adjacent clips.`;
  }
  return undefined;
}

function findTimelineRowCollisions(overlays: any[], target: any, nextRange: FrameRange, nextRow: number): any[] {
  return overlays.filter((overlay) => {
    if (String(overlay?.id) === String(target?.id)) return false;
    if (currentOverlayRow(overlay) !== nextRow) return false;
    return rangesOverlap(nextRange, overlayFrameRange(overlay));
  });
}

function finiteInteger(value: unknown): number | undefined {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric) : undefined;
}

function resolveSpeedRampFrameRange(
  project: any,
  options: SpeedRampOptions,
): { ok: true; range: FrameRange; warnings: string[] } | { ok: false; message: string; warnings: string[] } {
  const warnings: string[] = [];
  const durationFrames = Math.max(3, Math.round(positiveNumber(options.durationFrames) ?? 30));
  let startFrame = positiveOrZeroNumber(options.startFrame);
  let endFrame = positiveOrZeroNumber(options.endFrame);

  if (startFrame == null && endFrame == null && options.targetQuery) {
    const candidates = findVisualMomentCandidates(project, options.targetQuery, {
      videoOverlayId: options.videoOverlayId,
      limit: 3,
      minConfidence: 0.35,
    });
    const best = candidates[0];
    if (!best) {
      return {
        ok: false,
        warnings,
        message: `No stored visual evidence matched "${options.targetQuery}". Use find_visual_moment or provide startFrame/endFrame first.`,
      };
    }
    if (!best.safeForAutoEdit) {
      return {
        ok: false,
        warnings,
        message: `Visual target "${options.targetQuery}" was not high-confidence enough for automatic speed ramp. Provide explicit frames or inspect candidates first.`,
      };
    }
    startFrame = best.startFrame;
    endFrame = best.endFrame - best.startFrame >= 3 ? best.endFrame : best.startFrame + durationFrames;
    warnings.push(`Resolved speed ramp frames ${startFrame}-${endFrame} from visual evidence: ${best.source.path}.`);
  }

  if (startFrame == null) {
    const targetFrame = positiveOrZeroNumber(options.targetFrame);
    if (targetFrame != null) {
      startFrame = targetFrame;
      endFrame = targetFrame + durationFrames;
    }
  } else if (endFrame == null) {
    endFrame = startFrame + durationFrames;
  }

  if (startFrame == null || endFrame == null) {
    return {
      ok: false,
      warnings,
      message: "Speed ramp needs startFrame/endFrame, targetFrame, or a high-confidence targetQuery.",
    };
  }

  const roundedStart = Math.round(startFrame);
  const roundedEnd = Math.round(endFrame);
  if (roundedEnd <= roundedStart) {
    return {
      ok: false,
      warnings,
      message: `Speed ramp endFrame (${roundedEnd}) must be after startFrame (${roundedStart}).`,
    };
  }
  if (roundedEnd - roundedStart < 3) {
    return {
      ok: false,
      warnings,
      message: `Speed ramp range ${roundedStart}-${roundedEnd} is too short for a stable curve.`,
    };
  }

  const totalFrames = resolveProjectDurationFrames(project);
  if (totalFrames > 0 && (roundedStart >= totalFrames || roundedEnd > totalFrames)) {
    return {
      ok: false,
      warnings,
      message: `Speed ramp range ${roundedStart}-${roundedEnd} is outside the project duration (${totalFrames} frames).`,
    };
  }

  return { ok: true, range: { startFrame: roundedStart, endFrame: roundedEnd }, warnings };
}

function resolveSpeedRampVideoOverlay(overlays: any[], range: FrameRange, videoOverlayId?: OverlayId): any | undefined {
  const videoOverlays = overlays.filter((overlay) => overlay?.type === "video");
  if (videoOverlayId != null) {
    const explicit = videoOverlays.find((overlay) => String(overlay?.id) === String(videoOverlayId));
    return explicit && overlayCoversRange(explicit, range) ? explicit : undefined;
  }
  return videoOverlays.find((overlay) => overlayCoversRange(overlay, range));
}

function overlayCoversRange(overlay: any, range: FrameRange): boolean {
  const startFrame = frame(overlay?.from);
  const endFrame = startFrame + duration(overlay?.durationInFrames);
  return startFrame <= range.startFrame && endFrame >= range.endFrame;
}

function hasCaptionDialogueInRange(overlays: any[], range: FrameRange, fps: number): boolean {
  return overlays.some((overlay) => {
    const type = String(overlay?.type ?? "").toLowerCase();
    if (type !== "caption" && type !== "subtitle") return false;
    const overlayStartFrame = frame(overlay?.from);
    const timedWords = timedCaptionRanges(overlay?.words, overlayStartFrame, fps);
    const timedCaptions = timedWords.length === 0
      ? timedCaptionRanges(overlay?.captions, overlayStartFrame, fps)
      : [];
    const timedRanges = timedWords.length > 0 ? timedWords : timedCaptions;
    if (timedRanges.length > 0) {
      return timedRanges.some((timedRange) => rangesOverlap(range, timedRange));
    }

    // Legacy caption payloads without usable word/group timings remain
    // conservative: their outer range is the only dialogue evidence available.
    const overlayRange = {
      startFrame: overlayStartFrame,
      endFrame: overlayStartFrame + duration(overlay?.durationInFrames),
    };
    return rangesOverlap(range, overlayRange);
  });
}

function timedCaptionRanges(value: unknown, overlayStartFrame: number, fps: number): FrameRange[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item: any) => {
    const startMs = finiteNumber(item?.startMs);
    const endMs = finiteNumber(item?.endMs);
    if (startMs === undefined || endMs === undefined || startMs < 0 || endMs <= startMs) return [];
    const startFrame = overlayStartFrame + Math.floor((startMs / 1_000) * fps);
    const endFrame = overlayStartFrame + Math.ceil((endMs / 1_000) * fps);
    return endFrame > startFrame ? [{ startFrame, endFrame }] : [];
  });
}

function rangesOverlap(a: FrameRange, b: FrameRange): boolean {
  return a.startFrame < b.endFrame && b.startFrame < a.endFrame;
}

function buildSpeedRampCurve(localStartFrame: number, localEndFrame: number, targetSpeed: number): any[] {
  const localMidFrame = Math.round(localStartFrame + ((localEndFrame - localStartFrame) / 2));
  return [
    { frame: localStartFrame, value: 1, easing: "ease-in-out" },
    { frame: localMidFrame, value: targetSpeed, easing: "ease-in-out" },
    { frame: localEndFrame, value: 1, easing: "ease-out" },
  ];
}

function speedRampTrack(keyframes: any[]): any {
  return {
    property: "speed",
    keyframes,
    metadata: {
      family: "speed-ramp",
      source: "apply_speed_ramp",
    },
  };
}

function isSpeedRampTrack(track: any): boolean {
  const metadata = isRecord(track?.metadata) ? track.metadata : undefined;
  return track?.family === "speed-ramp"
    || track?.source === "apply_speed_ramp"
    || metadata?.family === "speed-ramp"
    || metadata?.source === "apply_speed_ramp";
}

function resolveFadeTargetOverlay(
  project: any,
  options: FadeOptions,
): { ok: true; overlay: any; warnings: string[] } | { ok: false; message: string; warnings: string[] } {
  const warnings: string[] = [];
  const overlays: any[] = Array.isArray(project?.overlays) ? project.overlays : [];

  if (options.overlayId != null) {
    const overlay = overlays.find((candidate) => String(candidate?.id) === String(options.overlayId));
    if (!overlay) {
      return {
        ok: false,
        warnings,
        message: `Overlay ${String(options.overlayId)} was not found in the project.`,
      };
    }
    return { ok: true, overlay, warnings };
  }

  let targetFrame = positiveOrZeroNumber(options.targetFrame);
  if (targetFrame == null && options.targetQuery) {
    const candidates = findVisualMomentCandidates(project, options.targetQuery, {
      limit: 3,
      minConfidence: 0.35,
    });
    const best = candidates[0];
    if (!best) {
      return {
        ok: false,
        warnings,
        message: `No stored visual evidence matched "${options.targetQuery}". Use find_visual_moment or provide overlayId first.`,
      };
    }
    if (!best.safeForAutoEdit) {
      return {
        ok: false,
        warnings,
        message: `Visual target "${options.targetQuery}" was not high-confidence enough for automatic fade. Provide overlayId or inspect candidates first.`,
      };
    }
    targetFrame = best.frame;
    warnings.push(`Resolved fade target frame ${targetFrame} from visual evidence: ${best.source.path}.`);
    if (best.source.overlayId != null) {
      const overlay = overlays.find((candidate) => String(candidate?.id) === String(best.source.overlayId));
      if (overlay) return { ok: true, overlay, warnings };
    }
  }

  if (targetFrame != null) {
    const roundedFrame = Math.round(targetFrame);
    const overlay = overlays.find((candidate) => isFadeTargetOverlay(candidate) && overlayContainsFrame(candidate, roundedFrame));
    if (!overlay) {
      return {
        ok: false,
        warnings,
        message: `No visual overlay is active at frame ${roundedFrame}.`,
      };
    }
    return { ok: true, overlay, warnings };
  }

  return {
    ok: false,
    warnings,
    message: "Fade needs overlayId, targetFrame, or a high-confidence targetQuery. Use selectedOverlayId from chat context when the user says this overlay.",
  };
}

function resolveFadeFrameRange(
  project: any,
  overlay: any,
  options: FadeOptions,
): { ok: true; range: FrameRange } | { ok: false; message: string } {
  const direction = options.direction ?? "out";
  const durationFrames = Math.max(1, Math.round(positiveNumber(options.durationFrames) ?? 20));
  const overlayStartFrame = frame(overlay.from);
  const overlayEndFrame = overlayStartFrame + duration(overlay.durationInFrames);
  let startFrame = positiveOrZeroNumber(options.startFrame);
  let endFrame = positiveOrZeroNumber(options.endFrame);
  const targetFrame = positiveOrZeroNumber(options.targetFrame);

  if (direction === "both" && startFrame == null && endFrame == null) {
    startFrame = overlayStartFrame;
    endFrame = overlayEndFrame;
  } else if (direction === "both" && startFrame == null && endFrame != null) {
    startFrame = overlayStartFrame;
  } else if (direction === "both" && endFrame == null && startFrame != null) {
    endFrame = overlayEndFrame;
  } else if (startFrame == null && endFrame == null && targetFrame != null) {
    startFrame = targetFrame;
    endFrame = targetFrame + durationFrames;
  } else if (startFrame == null && endFrame == null) {
    if (direction === "in") {
      startFrame = overlayStartFrame;
      endFrame = overlayStartFrame + durationFrames;
    } else {
      endFrame = overlayEndFrame;
      startFrame = overlayEndFrame - durationFrames;
    }
  } else if (startFrame == null && endFrame != null) {
    startFrame = Math.max(0, endFrame - durationFrames);
  } else if (endFrame == null && startFrame != null) {
    endFrame = startFrame + durationFrames;
  }

  if (startFrame == null || endFrame == null) {
    return { ok: false, message: "Fade needs a resolvable frame range." };
  }

  const roundedStart = Math.round(startFrame);
  const roundedEnd = Math.round(endFrame);
  if (roundedEnd <= roundedStart) {
    return { ok: false, message: `Fade endFrame (${roundedEnd}) must be after startFrame (${roundedStart}).` };
  }
  if (roundedStart < overlayStartFrame || roundedEnd > overlayEndFrame) {
    return { ok: false, message: `Fade range ${roundedStart}-${roundedEnd} must stay inside overlay ${String(overlay.id)} frames ${overlayStartFrame}-${overlayEndFrame}.` };
  }

  const totalFrames = resolveProjectDurationFrames(project);
  if (totalFrames > 0 && (roundedStart >= totalFrames || roundedEnd > totalFrames)) {
    return { ok: false, message: `Fade range ${roundedStart}-${roundedEnd} is outside the project duration (${totalFrames} frames).` };
  }

  return { ok: true, range: { startFrame: roundedStart, endFrame: roundedEnd } };
}

function isFadeTargetOverlay(overlay: any): boolean {
  const type = String(overlay?.type ?? "").toLowerCase();
  return Boolean(overlay) && type !== "sound" && type !== "audio";
}

function isCaptionLikeOverlay(overlay: any): boolean {
  const type = String(overlay?.type ?? "").toLowerCase();
  return type === "caption" || type === "subtitle";
}

function isLikelyBrandOverlay(overlay: any): boolean {
  const metadata = isRecord(overlay?.metadata) ? overlay.metadata : undefined;
  const text = [
    overlay?.type,
    overlay?.content,
    overlay?.text,
    overlay?.title,
    overlay?.name,
    overlay?.label,
    overlay?.assetId,
    overlay?.sourceAssetId,
    overlay?.mediaId,
    overlay?.src,
    metadata?.title,
    metadata?.label,
    metadata?.description,
    metadata?.assetId,
  ]
    .map((value) => stringValue(value))
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();
  return /\b(brand|logo|watermark|bug|sponsor)\b/.test(text);
}

function buildFadeTrack(
  localStartFrame: number,
  localEndFrame: number,
  fromOpacity: number,
  toOpacity: number,
  direction: "in" | "out" | "both",
  durationFrames: number,
): any {
  if (direction === "both") {
    const availableFrames = localEndFrame - localStartFrame;
    const edgeDurationFrames = Math.min(
      Math.max(1, Math.round(durationFrames)),
      Math.floor(availableFrames / 2),
    );
    const fadeInEndFrame = localStartFrame + edgeDurationFrames;
    const fadeOutStartFrame = localEndFrame - edgeDurationFrames;
    const keyframes = [
      { frame: localStartFrame, value: fromOpacity, easing: "ease-out" },
      {
        frame: fadeInEndFrame,
        value: toOpacity,
        easing: fadeOutStartFrame === fadeInEndFrame ? "ease-in" : "linear",
      },
    ];
    if (fadeOutStartFrame > fadeInEndFrame) {
      keyframes.push({ frame: fadeOutStartFrame, value: toOpacity, easing: "ease-in" });
    }
    keyframes.push({ frame: localEndFrame, value: fromOpacity, easing: "linear" });
    return {
      property: "opacity",
      keyframes,
      metadata: {
        family: "fade",
        source: "apply_fade",
        direction,
      },
    };
  }

  return {
    property: "opacity",
    keyframes: [
      { frame: localStartFrame, value: fromOpacity, easing: direction === "in" ? "ease-out" : "ease-in" },
      { frame: localEndFrame, value: toOpacity, easing: "linear" },
    ],
    metadata: {
      family: "fade",
      source: "apply_fade",
      direction,
    },
  };
}

function isFadeTrack(track: any): boolean {
  const metadata = isRecord(track?.metadata) ? track.metadata : undefined;
  return track?.family === "fade"
    || track?.source === "apply_fade"
    || metadata?.family === "fade"
    || metadata?.source === "apply_fade";
}

function resolveRendererFadeAnimation(
  overlay: any,
  direction: "in" | "out" | "both",
): {
  satisfiesRequest: boolean;
  hasConflictingFade: boolean;
  nextStyles?: Record<string, unknown>;
} {
  const styles = isRecord(overlay?.styles) ? overlay.styles : undefined;
  const animation = isRecord(styles?.animation) ? styles.animation : undefined;
  if (!styles || !animation) {
    return { satisfiesRequest: false, hasConflictingFade: false };
  }

  const hasFadeIn = animation.enter === "fade";
  const hasFadeOut = animation.exit === "fade";
  const satisfiesRequest = direction === "both"
    ? hasFadeIn && hasFadeOut
    : direction === "in"
      ? hasFadeIn
      : hasFadeOut;
  const hasConflictingFade = direction === "both"
    ? hasFadeIn || hasFadeOut
    : direction === "in"
      ? hasFadeIn
      : hasFadeOut;
  if (!hasConflictingFade) {
    return { satisfiesRequest, hasConflictingFade };
  }

  const nextAnimation = { ...animation };
  if (direction === "in" || direction === "both") delete nextAnimation.enter;
  if (direction === "out" || direction === "both") delete nextAnimation.exit;
  return {
    satisfiesRequest,
    hasConflictingFade,
    nextStyles: {
      ...styles,
      animation: nextAnimation,
    },
  };
}

function resolveLayerReorderOverlay(
  project: any,
  overlayId: OverlayId | undefined,
  query: string | undefined,
  role: "target" | "reference",
): { ok: true; overlay: any; warnings: string[] } | { ok: false; message: string; warnings: string[] } {
  const warnings: string[] = [];
  const overlays: any[] = Array.isArray(project?.overlays) ? project.overlays : [];

  if (overlayId != null) {
    const overlay = overlays.find((candidate) => String(candidate?.id) === String(overlayId));
    if (!overlay) {
      return {
        ok: false,
        warnings,
        message: `${role === "target" ? "Target" : "Reference"} overlay ${String(overlayId)} was not found in the project.`,
      };
    }
    return { ok: true, overlay, warnings };
  }

  if (!query?.trim()) {
    return {
      ok: false,
      warnings,
      message: role === "target"
        ? "Layer reorder needs overlayId or targetQuery for the overlay to move."
        : "Reference-based layer reorder needs referenceOverlayId or referenceQuery.",
    };
  }

  const normalizedQuery = normalizeText(query);
  const queryTokens = tokenize(query);
  const scored = overlays
    .map((overlay) => ({ overlay, score: scoreLayerOverlayQuery(overlay, normalizedQuery, queryTokens) }))
    .filter((candidate) => candidate.score >= 0.35)
    .sort((a, b) => b.score - a.score || currentOverlayRow(a.overlay) - currentOverlayRow(b.overlay));

  const best = scored[0];
  if (!best) {
    return {
      ok: false,
      warnings,
      message: `No ${role} overlay matched "${query}". Use an explicit overlay id or inspect the timeline first.`,
    };
  }

  const second = scored[1];
  if (second && Math.abs(best.score - second.score) < 0.08) {
    return {
      ok: false,
      warnings,
      message: `${role === "target" ? "Target" : "Reference"} overlay query "${query}" is ambiguous between overlays ${String(best.overlay.id)} and ${String(second.overlay.id)}. Use overlay ids before reordering layers.`,
    };
  }

  warnings.push(`Resolved ${role} overlay ${String(best.overlay.id)} from query "${query}".`);
  return { ok: true, overlay: best.overlay, warnings };
}

function scoreLayerOverlayQuery(overlay: any, normalizedQuery: string, queryTokens: string[]): number {
  if (!normalizedQuery || !queryTokens.length) return 0;
  if (normalizeText(String(overlay?.id ?? "")) === normalizedQuery) return 1;

  const evidenceText = layerOverlaySearchText(overlay);
  const normalizedEvidence = normalizeText(evidenceText);
  if (!normalizedEvidence) return 0;
  if (normalizedEvidence.includes(normalizedQuery)) return 0.94;

  const evidenceTokens = tokenize(evidenceText);
  if (!evidenceTokens.length) return 0;

  const overlap = tokenOverlap(queryTokens, evidenceTokens);
  const coverage = overlap / queryTokens.length;
  const focus = overlap / evidenceTokens.length;
  const vector = scoreCharacterVector(normalizedQuery, normalizedEvidence);
  return clamp((coverage * 0.6) + (focus * 0.2) + (vector * 0.2), 0, 0.9);
}

function layerOverlaySearchText(overlay: any): string {
  const metadata = isRecord(overlay?.metadata) ? overlay.metadata : undefined;
  return [
    overlay?.id,
    overlay?.type,
    overlay?.content,
    overlay?.text,
    overlay?.title,
    overlay?.name,
    overlay?.label,
    overlay?.assetId,
    overlay?.sourceAssetId,
    overlay?.mediaId,
    overlay?.src,
    metadata?.title,
    metadata?.label,
    metadata?.description,
    metadata?.assetId,
    ...overlayTextFacts(overlay),
  ]
    .map((value) => (typeof value === "number" ? String(value) : stringValue(value)))
    .filter((value): value is string => Boolean(value))
    .join(" ");
}

function layerReorderBlockReason(overlay: any, role: "target" | "reference", allowVideoLayerMove: boolean): string | undefined {
  const type = String(overlay?.type ?? "").toLowerCase();
  const label = role === "target" ? "Target" : "Reference";
  if (type === "sound" || type === "audio") {
    return `${label} overlay ${String(overlay?.id)} is ${type}; audio overlays do not have visual layer order.`;
  }
  if (type === "caption" || type === "subtitle") {
    return `${label} overlay ${String(overlay?.id)} is ${type}; captions use fixed render priority for readability, so row changes would not truthfully control stacking.`;
  }
  if (type === "transition") {
    return `${label} overlay ${String(overlay?.id)} is a transition; transitions use fixed render priority and should not be reordered by row.`;
  }
  if (role === "target" && type === "video" && !allowVideoLayerMove) {
    return `Target overlay ${String(overlay?.id)} is a video clip. Ask to allow video layer move if changing source-clip stacking is intentional.`;
  }
  return undefined;
}

function currentOverlayRow(overlay: any): number {
  return Math.round(positiveOrZeroNumber(overlay?.row) ?? 0);
}

function overlayFrameRange(overlay: any): FrameRange {
  const startFrame = frame(overlay?.from);
  return {
    startFrame,
    endFrame: startFrame + duration(overlay?.durationInFrames),
  };
}

function withAffectedFrameRanges<T extends object>(
  data: T,
  ranges: FrameRange[],
  owner: string,
): T & { affectedFrameRanges: FrameRange[] } {
  const affectedFrameRanges = normalizeAffectedFrameRanges(ranges);
  if (affectedFrameRanges.length === 0) {
    throw new Error(`${owner} produced a changed plan without a valid affected frame range.`);
  }
  return { ...data, affectedFrameRanges };
}

function normalizeAffectedFrameRanges(ranges: FrameRange[]): FrameRange[] {
  const unique = new Map<string, FrameRange>();
  for (const range of ranges) {
    const rawStart = Number(range?.startFrame);
    const rawEnd = Number(range?.endFrame);
    if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd)) continue;
    const startFrame = Math.max(0, Math.round(rawStart));
    const endFrame = Math.max(0, Math.round(rawEnd));
    if (endFrame <= startFrame) continue;
    unique.set(`${startFrame}:${endFrame}`, { startFrame, endFrame });
  }
  return Array.from(unique.values()).sort(
    (left, right) => left.startFrame - right.startFrame || left.endFrame - right.endFrame,
  );
}

function overlayRangesForIds(project: any, overlayIds: OverlayId[]): FrameRange[] {
  const ids = new Set(overlayIds.map((overlayId) => String(overlayId)));
  const overlays = Array.isArray(project?.overlays) ? project.overlays : [];
  return overlays
    .filter((overlay: any) => ids.has(String(overlay?.id)))
    .map(overlayFrameRange);
}

function cameraShakeAffectedFrameRanges(project: any, plan: CameraShakePlan): FrameRange[] {
  const overlays = Array.isArray(project?.overlays) ? project.overlays : [];
  return plan.updates.flatMap((update) => {
    const overlay = overlays.find((candidate: any) => String(candidate?.id) === String(update.overlayId));
    if (!overlay) return [];
    const shakeFrames = update.nextKeyframeTracks
      .filter(isCameraShakeTrack)
      .flatMap((track: any) => (
        Array.isArray(track?.keyframes)
          ? track.keyframes.map((keyframe: any) => Number(keyframe?.frame))
          : []
      ))
      .filter(Number.isFinite);
    if (shakeFrames.length === 0) return [];
    const overlayStartFrame = frame(overlay.from);
    return [{
      startFrame: overlayStartFrame + Math.min(...shakeFrames),
      endFrame: overlayStartFrame + Math.max(...shakeFrames) + 1,
    }];
  });
}

function layerReorderAffectedFrameRanges(project: any, plan: LayerReorderPlan): FrameRange[] {
  const overlays = Array.isArray(project?.overlays) ? project.overlays : [];
  return plan.updates.flatMap((update) => {
    const target = overlays.find((overlay: any) => String(overlay?.id) === String(update.overlayId));
    if (!target) return [];
    const targetRange = overlayFrameRange(target);
    if (update.referenceOverlayId == null) return [targetRange];
    const reference = overlays.find(
      (overlay: any) => String(overlay?.id) === String(update.referenceOverlayId),
    );
    if (!reference) return [targetRange];
    const referenceRange = overlayFrameRange(reference);
    if (!rangesOverlap(targetRange, referenceRange)) return [targetRange];
    return [{
      startFrame: Math.max(targetRange.startFrame, referenceRange.startFrame),
      endFrame: Math.min(targetRange.endFrame, referenceRange.endFrame),
    }];
  });
}

function findLayerRowCollisions(overlays: any[], target: any, nextRow: number): any[] {
  const targetRange = overlayFrameRange(target);
  return overlays.filter((overlay) => {
    if (String(overlay?.id) === String(target?.id)) return false;
    if (currentOverlayRow(overlay) !== nextRow) return false;
    if (!isOrdinaryLayerOverlay(overlay)) return false;
    return rangesOverlap(targetRange, overlayFrameRange(overlay));
  });
}

function isOrdinaryLayerOverlay(overlay: any): boolean {
  const type = String(overlay?.type ?? "").toLowerCase();
  return Boolean(overlay)
    && type !== "sound"
    && type !== "audio"
    && type !== "caption"
    && type !== "subtitle"
    && type !== "transition";
}

function resolveCameraShakeTargetFrame(
  project: any,
  options: CameraShakeOptions,
): { ok: true; frame: number; warnings: string[] } | { ok: false; message: string; warnings: string[] } {
  const warnings: string[] = [];
  let targetFrame = positiveOrZeroNumber(options.targetFrame);

  if (targetFrame == null && options.targetQuery) {
    const candidates = findVisualMomentCandidates(project, options.targetQuery, {
      videoOverlayId: options.videoOverlayId,
      limit: 3,
      minConfidence: 0.35,
    });
    const best = candidates[0];
    if (!best) {
      return {
        ok: false,
        warnings,
        message: `No stored visual evidence matched "${options.targetQuery}". Use find_visual_moment or provide targetFrame first.`,
      };
    }
    if (!best.safeForAutoEdit) {
      return {
        ok: false,
        warnings,
        message: `Visual target "${options.targetQuery}" was not high-confidence enough for automatic shake. Provide targetFrame or inspect candidates first.`,
      };
    }
    targetFrame = best.frame;
    warnings.push(`Resolved targetFrame ${targetFrame} from visual evidence: ${best.source.path}.`);
  }

  if (targetFrame == null) {
    return {
      ok: false,
      warnings,
      message: "Camera shake needs a targetFrame, or a high-confidence targetQuery that resolves to one visual moment.",
    };
  }

  const roundedFrame = Math.round(targetFrame);
  const totalFrames = resolveProjectDurationFrames(project);
  if (totalFrames > 0 && roundedFrame >= totalFrames) {
    return {
      ok: false,
      warnings,
      message: `Target frame ${roundedFrame} is outside the project duration (${totalFrames} frames).`,
    };
  }

  return { ok: true, frame: roundedFrame, warnings };
}

function resolveProjectDurationFrames(project: any): number {
  const explicit = positiveNumber(project?.durationInFrames);
  if (explicit) return Math.round(explicit);
  const overlays = Array.isArray(project?.overlays) ? project.overlays : [];
  return overlays.reduce((maxFrame: number, overlay: any) => Math.max(maxFrame, frame(overlay?.from) + duration(overlay?.durationInFrames)), 0);
}

function resolveCameraShakeVideoOverlay(overlays: any[], targetFrame: number, videoOverlayId?: OverlayId): any | undefined {
  const videoOverlays = overlays.filter((overlay) => overlay?.type === "video");
  if (videoOverlayId != null) {
    const explicit = videoOverlays.find((overlay) => String(overlay?.id) === String(videoOverlayId));
    return explicit && overlayContainsFrame(explicit, targetFrame) ? explicit : undefined;
  }
  return videoOverlays.find((overlay) => overlayContainsFrame(overlay, targetFrame));
}

function overlayContainsFrame(overlay: any, targetFrame: number): boolean {
  const startFrame = frame(overlay?.from);
  return startFrame <= targetFrame && startFrame + duration(overlay?.durationInFrames) > targetFrame;
}

function buildCameraShakeTracks(input: {
  localFrame: number;
  targetFrame: number;
  videoFrom: number;
  videoDurationFrames: number;
  durationFrames: number;
  maxOffset: number;
}): any[] {
  const shakeFrames = Math.min(input.durationFrames, Math.max(1, input.videoDurationFrames - input.localFrame - 2));
  const xKeyframes: any[] = [{ frame: input.localFrame, value: 0, easing: "linear" }];
  const yKeyframes: any[] = [{ frame: input.localFrame, value: 0, easing: "linear" }];
  const rand = mulberry32((input.targetFrame * 31) + (input.videoFrom * 17) + (input.videoDurationFrames * 7));

  for (let index = 1; index <= shakeFrames; index += 1) {
    const decay = 1 - (index / shakeFrames);
    xKeyframes.push({ frame: input.localFrame + index, value: round3((rand() - 0.5) * 2 * input.maxOffset * decay), easing: "linear" });
    yKeyframes.push({ frame: input.localFrame + index, value: round3((rand() - 0.5) * 2 * input.maxOffset * decay), easing: "linear" });
  }

  xKeyframes.push({ frame: input.localFrame + shakeFrames + 1, value: 0, easing: "ease-out" });
  yKeyframes.push({ frame: input.localFrame + shakeFrames + 1, value: 0, easing: "ease-out" });

  return [
    cameraShakeTrack("x", xKeyframes),
    cameraShakeTrack("y", yKeyframes),
  ];
}

function cameraShakeTrack(property: "x" | "y", keyframes: any[]): any {
  return {
    property,
    keyframes,
    metadata: {
      family: "camera-shake",
      source: "apply_camera_shake",
    },
  };
}

function isCameraShakeTrack(track: any): boolean {
  const metadata = isRecord(track?.metadata) ? track.metadata : undefined;
  return track?.family === "camera-shake"
    || track?.source === "apply_camera_shake"
    || metadata?.family === "camera-shake"
    || metadata?.source === "apply_camera_shake";
}

function mulberry32(seed: number): () => number {
  return () => {
    let value = seed += 0x6d2b79f5;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function findVisualMomentCandidates(
  project: any,
  query: string,
  options: VisualMomentOptions = {},
): VisualMomentCandidate[] {
  const limit = clampInt(options.limit ?? 5, 1, 12);
  const minConfidence = clamp(options.minConfidence ?? 0.35, 0, 1);
  const queryTokens = tokenize(query);
  const normalizedQuery = normalizeText(query);
  if (!queryTokens.length || !normalizedQuery) return [];

  const candidateMap = new Map<string, VisualMomentCandidate>();
  for (const evidence of buildVisualEvidence(project, options)) {
    const candidate = scoreEvidence(evidence, query, queryTokens, normalizedQuery);
    if (!candidate || candidate.confidence < minConfidence) continue;
    const key = candidateKey(candidate);
    const existing = candidateMap.get(key);
    if (!existing || candidate.confidence > existing.confidence) {
      candidateMap.set(key, candidate);
    }
  }

  const candidates = Array.from(candidateMap.values())
    .sort((a, b) => b.confidence - a.confidence || a.startFrame - b.startFrame || a.text.localeCompare(b.text))
    .slice(0, limit);

  if (!candidates.length) return candidates;

  const ambiguous = candidates.slice(1).some((candidate) => (
    Math.abs(candidates[0].confidence - candidate.confidence) < 0.08
    && !overlapsCandidate(candidates[0], candidate)
  ));

  return candidates.map((candidate, index) => ({
    ...candidate,
    safeForAutoEdit: index === 0
      && !ambiguous
      && candidate.matchType === "exact-phrase"
      && candidate.confidence >= 0.78,
  }));
}

export function resolveVisualEditPlacement(
  project: any,
  query: string,
  options: VisualEditResolveOptions = {},
): VisualEditResolution {
  const action = options.action ?? "highlight";
  const candidates = options.precomputedCandidates ?? findVisualMomentCandidates(project, query, {
      videoOverlayId: options.videoOverlayId,
      limit: options.limit ?? 5,
      minConfidence: options.minConfidence ?? 0.35,
      includeOverlayText: options.includeOverlayText,
    });
  const warnings: string[] = [];

  if (!candidates.length) {
    return {
      status: "no-match",
      action,
      query,
      candidates,
      warnings,
      message: `No stored visual evidence matched "${query}".`,
    };
  }

  const candidate = candidates[0];
  if (!candidate) {
    return {
      status: "no-match",
      action,
      query,
      candidates,
      warnings,
      message: `No stored visual evidence matched "${query}".`,
    };
  }

  const semanticCutRequiresConfirmation = action === "cut_range"
    && candidate.matchType === "multimodal-semantic";
  const readOnlyInspection = action === "inspect";
  if ((!candidate.safeForAutoEdit && !readOnlyInspection) || semanticCutRequiresConfirmation) {
    const second = candidates[1];
    const inspection = canRequestCanonicalFrameVerification(candidate)
      ? visualInspectionRequest(candidate, action)
      : undefined;
    return {
      status: "ambiguous",
      action,
      query,
      candidates,
      candidate,
      warnings,
      ...(inspection ? { useWith: { visual_inspect_frame: inspection } } : {}),
      message: inspection
        ? `Visual reference "${query}" requires rendered-frame confirmation before automatic ${action}.`
        : second
          ? `Visual reference "${query}" is ambiguous between frames ${candidate.startFrame}-${candidate.endFrame} and ${second.startFrame}-${second.endFrame}. Ask the user to choose before editing.`
          : `Visual reference "${query}" was not confident enough for automatic ${action}.`,
    };
  }

  if (action === "inspect") {
    return {
      status: "ready",
      action,
      query,
      candidates,
      candidate,
      warnings,
      useWith: { visual_inspect_frame: candidate.useWith.visual_inspect_frame },
      message: `Resolved visual inspection for "${candidate.text}" at frame ${candidate.frame}.`,
    };
  }

  if (action === "cut_range") {
    return {
      status: "ready",
      action,
      query,
      candidates,
      candidate,
      warnings,
      useWith: { cut_section: candidate.useWith.cut_section },
      message: `Resolved visual range for "${candidate.text}" to frames ${candidate.startFrame}-${candidate.endFrame}.`,
    };
  }

  if (action === "keyframe_anchor") {
    return {
      status: "ready",
      action,
      query,
      candidates,
      candidate,
      warnings,
      useWith: { set_keyframes: candidate.useWith.set_keyframes },
      message: `Resolved keyframe anchor for "${candidate.text}" at frame ${candidate.frame}.`,
    };
  }

  if (action === "speed_ramp") {
    return {
      status: "ready",
      action,
      query,
      candidates,
      candidate,
      warnings,
      useWith: {
        apply_speed_ramp: {
          targetFrame: candidate.frame,
          durationFrames: clampInt(
            options.durationFrames ?? DEFAULT_SPEED_RAMP_DURATION_FRAMES,
            3,
            300,
          ),
          ...(candidate.source.overlayId != null
            ? { videoOverlayId: candidate.source.overlayId }
            : {}),
        },
      },
      message: `Resolved speed-ramp anchor for "${candidate.text}" at frame ${candidate.frame}.`,
    };
  }

  const highlight = buildVisualHighlightOverlay(
    candidate,
    clampInt(options.durationFrames ?? DEFAULT_HIGHLIGHT_DURATION_FRAMES, 1, 300),
  );
  if (!highlight) {
    return {
      status: "no-placement",
      action,
      query,
      candidates,
      candidate,
      warnings,
      useWith: { visual_inspect_frame: candidate.useWith.visual_inspect_frame },
      message: `Visual reference "${query}" resolved to frame ${candidate.frame}, but no bounding box was available for highlight placement. Inspect the frame before adding a shape overlay.`,
    };
  }

  return {
    status: "ready",
    action,
    query,
    candidates,
    candidate,
    warnings,
    useWith: {
      add_overlay: highlight,
      visual_inspect_frame: candidate.useWith.visual_inspect_frame,
    },
    message: `Resolved highlight for "${candidate.text}" to frame ${candidate.frame} with a bounding box.`,
  };
}

function visualInspectionRequest(
  candidate: VisualMomentCandidate,
  action: VisualEditAction,
): VisualMomentCandidate["useWith"]["visual_inspect_frame"] {
  const request = candidate.useWith.visual_inspect_frame;
  if (action !== "speed_ramp") return request;
  const lastFrame = Math.max(candidate.startFrame, candidate.endFrame - 1);
  const frames = Array.from(new Set([
    Math.min(lastFrame, candidate.startFrame + 1),
    clampInt(candidate.frame, candidate.startFrame, lastFrame),
    Math.max(candidate.startFrame, lastFrame - 1),
  ])).sort((left, right) => left - right);
  return frames.length >= 3 ? { ...request, frames } : request;
}

function buildVisualHighlightOverlay(
  candidate: VisualMomentCandidate,
  durationFrames: number,
): VisualHighlightOverlayHint | undefined {
  if (!candidate.boundingBox) return undefined;
  const position = visualBoxToOverlayPosition(candidate.boundingBox);
  return {
    type: "shape",
    start: candidate.frame,
    duration: durationFrames,
    ...position,
    styles: {
      fill: "transparent",
      stroke: "#ffcc00",
      strokeWidth: 4,
      borderRadius: "10px",
      opacity: 0.95,
    },
  };
}

function visualBoxToOverlayPosition(box: VisualBoundingBox): Pick<VisualHighlightOverlayHint, "x" | "y" | "width" | "height"> {
  if (box.units === "normalized") {
    return {
      x: `${round3((box.x + box.width / 2) * 100)}%`,
      y: `${round3((box.y + box.height / 2) * 100)}%`,
      width: `${round3(box.width * 100)}%`,
      height: `${round3(box.height * 100)}%`,
    };
  }

  return {
    x: Math.round(box.x + box.width / 2),
    y: Math.round(box.y + box.height / 2),
    width: Math.round(box.width),
    height: Math.round(box.height),
  };
}

function buildVisualEvidence(project: any, options: VisualMomentOptions = {}): VisualEvidence[] {
  const fps = positiveNumber(project?.fps) ?? DEFAULT_FPS;
  const overlays = Array.isArray(project?.overlays) ? project.overlays : [];
  const projectRange = {
    startFrame: 0,
    endFrame: Math.max(1, Math.round(positiveNumber(project?.durationInFrames) ?? DEFAULT_CLIP_DURATION_FRAMES)),
  };
  const evidence: VisualEvidence[] = [];

  for (const overlay of overlays) {
    if (options.videoOverlayId != null && String(overlay?.id) !== String(options.videoOverlayId)) continue;
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

    if (options.includeOverlayText ?? true) {
      for (const text of overlayTextFacts(overlay)) {
        addEvidence(evidence, text, overlayRange, {
          ...sourceBase,
          path: `overlays.${String(overlay?.id ?? "unknown")}.text`,
        });
      }
    }

    for (const key of OVERLAY_VISUAL_ROOT_KEYS) {
      const value = overlay?.[key];
      if (value == null) continue;
      collectVisualEvidence(value, {
        path: `overlays.${String(overlay?.id ?? "unknown")}.${key}`,
        fps,
        range: overlayRange,
        visualContext: isVisualKey(key),
        sourceBase,
        output: evidence,
      });
    }
  }

  for (const key of PROJECT_VISUAL_ROOT_KEYS) {
    const value = project?.[key];
    if (value == null) continue;
    collectVisualEvidence(value, {
      path: key,
      fps,
      range: projectRange,
      visualContext: isVisualKey(key),
      sourceBase: {
        type: "analysis",
        assetId: stringValue(project?.assetId ?? project?.sourceAssetId ?? project?.mediaId),
      },
      output: evidence,
    });
  }

  return dedupeEvidence(evidence);
}

function collectVisualEvidence(
  value: unknown,
  context: {
    path: string;
    fps: number;
    range: FrameRange;
    visualContext: boolean;
    boundingBox?: VisualBoundingBox;
    sourceBase: Omit<VisualMomentCandidate["source"], "path">;
    output: VisualEvidence[];
  },
): void {
  if (value == null) return;

  if (typeof value === "string") {
    if (context.visualContext) {
      addEvidence(context.output, value, context.range, {
        ...context.sourceBase,
        path: context.path,
      }, context.boundingBox);
    }
    return;
  }

  if (Array.isArray(value)) {
    const stringItems = value.filter((item): item is string => typeof item === "string");
    if (stringItems.length === value.length && stringItems.length > 0 && context.visualContext) {
      addEvidence(context.output, stringItems.join(" "), context.range, {
        ...context.sourceBase,
        path: context.path,
      }, context.boundingBox);
      return;
    }

    value.forEach((item, index) => {
      collectVisualEvidence(item, {
        ...context,
        path: `${context.path}.${index}`,
      });
    });
    return;
  }

  if (!isRecord(value)) return;

  const range = resolveFrameRange(value, context.fps, context.range);
  const boundingBox = readVisualBoundingBox(value) ?? context.boundingBox;
  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = normalizeKey(key);
    if (NON_VISUAL_KEYS.has(normalizedKey) && !TEXT_FACT_KEYS.has(normalizedKey)) continue;
    const childVisualContext = context.visualContext || isVisualKey(key);
    const childPath = `${context.path}.${key}`;

    if (typeof child === "string") {
      if (childVisualContext || TEXT_FACT_KEYS.has(normalizedKey)) {
        addEvidence(context.output, child, range, {
          ...context.sourceBase,
          path: childPath,
        }, boundingBox);
      }
      continue;
    }

    if (Array.isArray(child) && child.every((item) => typeof item === "string")) {
      if (childVisualContext || TEXT_FACT_KEYS.has(normalizedKey)) {
        addEvidence(context.output, child.join(" "), range, {
          ...context.sourceBase,
          path: childPath,
        }, boundingBox);
      }
      continue;
    }

    collectVisualEvidence(child, {
      ...context,
      path: childPath,
      range,
      visualContext: childVisualContext,
      boundingBox,
    });
  }
}

function overlayTextFacts(overlay: any): string[] {
  return [
    overlay?.content,
    overlay?.text,
    overlay?.title,
    overlay?.name,
    overlay?.label,
    overlay?.metadata?.title,
    overlay?.metadata?.label,
    overlay?.metadata?.description,
  ]
    .map((value) => stringValue(value))
    .filter((value): value is string => Boolean(value));
}

function scoreEvidence(
  evidence: VisualEvidence,
  query: string,
  queryTokens: string[],
  normalizedQuery: string,
): VisualMomentCandidate | null {
  const normalizedEvidence = normalizeText(evidence.evidenceText);
  const evidenceTokens = tokenize(evidence.evidenceText);
  if (!normalizedEvidence || !evidenceTokens.length) return null;

  const exactPhrase = normalizedEvidence.includes(normalizedQuery);
  const overlap = tokenOverlap(queryTokens, evidenceTokens);
  const coverage = overlap / queryTokens.length;
  const evidenceFocus = overlap / evidenceTokens.length;
  const orderScore = scoreOrderedCoverage(queryTokens, evidenceTokens);
  const vectorScore = scoreCharacterVector(normalizedQuery, normalizedEvidence);
  const tokenScore = clamp((coverage * 0.55) + (evidenceFocus * 0.15) + (orderScore * 0.2) + (vectorScore * 0.1), 0, 0.92);
  const vectorOnlyScore = clamp(vectorScore * 0.72, 0, 0.86);
  const confidence = exactPhrase ? 0.94 : Math.max(tokenScore, vectorOnlyScore);

  if (confidence <= 0) return null;

  const matchType: VisualMomentCandidate["matchType"] = exactPhrase
    ? "exact-phrase"
    : coverage >= 0.45
      ? "token-overlap"
      : "character-vector";

  return {
    text: truncate(evidence.evidenceText, 140),
    frame: evidence.frame,
    startFrame: evidence.startFrame,
    endFrame: evidence.endFrame,
    durationFrames: evidence.durationFrames,
    confidence: round3(confidence),
    confidenceLabel: confidenceLabel(confidence),
    matchType,
    matchReasons: exactPhrase
      ? ["exact-phrase"]
      : [
          `coverage=${round3(coverage)}`,
          `focus=${round3(evidenceFocus)}`,
          `order=${round3(orderScore)}`,
          `vector=${round3(vectorScore)}`,
        ],
    evidenceText: evidence.evidenceText,
    boundingBox: evidence.boundingBox,
    source: evidence.source,
    safeForAutoEdit: false,
    useWith: {
      cut_section: {
        startFrame: evidence.startFrame,
        endFrame: evidence.endFrame,
        note: "Use only when the user asked to remove or isolate this visual moment and confidence is high.",
      },
      add_motion_graphic: {
        frame: evidence.frame,
        text: truncate(query, 80),
      },
      set_keyframes: {
        frame: evidence.frame,
        note: "Use as the anchor frame for zoom/pan/emphasis keyframes.",
      },
      visual_inspect_frame: {
        frame: evidence.frame,
        question: `Verify visual match for: ${truncate(query, 80)}`,
      },
    },
  };
}

function addEvidence(
  output: VisualEvidence[],
  rawText: string | undefined,
  range: FrameRange,
  source: VisualMomentCandidate["source"],
  boundingBox?: VisualBoundingBox,
): void {
  const evidenceText = cleanText(rawText);
  if (!evidenceText) return;
  const startFrame = Math.max(0, Math.round(range.startFrame));
  const endFrame = Math.max(startFrame + 1, Math.round(range.endFrame));
  output.push({
    evidenceText,
    frame: startFrame,
    startFrame,
    endFrame,
    durationFrames: endFrame - startFrame,
    boundingBox,
    source,
  });
}

function readVisualBoundingBox(value: unknown): VisualBoundingBox | undefined {
  if (!isRecord(value)) return undefined;
  const candidate = value.boundingBox ?? value.bounding_box ?? value.bbox ?? value.box ?? value.bounds ?? value;
  if (!isRecord(candidate)) return undefined;

  const x = positiveOrZeroNumber(candidate.x ?? candidate.left);
  const y = positiveOrZeroNumber(candidate.y ?? candidate.top);
  const right = positiveOrZeroNumber(candidate.right ?? candidate.x2);
  const bottom = positiveOrZeroNumber(candidate.bottom ?? candidate.y2);
  const width = positiveNumber(candidate.width ?? candidate.w) ?? ((typeof right === "number" && typeof x === "number") ? right - x : undefined);
  const height = positiveNumber(candidate.height ?? candidate.h) ?? ((typeof bottom === "number" && typeof y === "number") ? bottom - y : undefined);

  if (typeof x !== "number" || typeof y !== "number" || typeof width !== "number" || typeof height !== "number") return undefined;
  if (width <= 0 || height <= 0) return undefined;

  const units: VisualBoundingBox["units"] = Math.max(x, y, width, height) <= 1 ? "normalized" : "pixel";
  return {
    x: round3(x),
    y: round3(y),
    width: round3(width),
    height: round3(height),
    units,
  };
}

function resolveFrameRange(value: any, fps: number, fallback: FrameRange): FrameRange {
  const frameValue = firstNumber(value, ["frame", "frameNumber", "timestampFrame", "timeFrame"]);
  const explicitStart = firstNumber(value, ["startFrame", "frameStart", "from"]);
  const explicitEnd = firstNumber(value, ["endFrame", "frameEnd", "to"]);
  const durationFrames = firstNumber(value, ["durationFrames", "durationInFrames"]);
  const startMs = firstNumber(value, ["startMs", "timestampMs", "timeMs"]);
  const endMs = firstNumber(value, ["endMs"]);
  const startSec = firstNumber(value, ["startSec", "startSeconds", "timestampSec", "timestampSeconds", "timeSec", "timeSeconds"]);
  const endSec = firstNumber(value, ["endSec", "endSeconds"]);
  const genericStart = firstNumber(value, ["start", "timestamp", "time"]);
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
    ?? (typeof frameValue === "number" ? startFrame + 1 : undefined)
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

function firstNumber(value: any, keys: string[]): number | undefined {
  if (!isRecord(value)) return undefined;
  for (const key of keys) {
    const numeric = positiveOrZeroNumber(value[key]);
    if (typeof numeric === "number") return numeric;
  }
  return undefined;
}

function dedupeEvidence(evidence: VisualEvidence[]): VisualEvidence[] {
  const seen = new Set<string>();
  const result: VisualEvidence[] = [];
  for (const item of evidence) {
    const key = `${item.source.type}:${item.source.overlayId ?? ""}:${item.source.path}:${item.startFrame}:${item.endFrame}:${normalizeText(item.evidenceText)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function candidateKey(candidate: VisualMomentCandidate): string {
  return `${candidate.source.type}:${candidate.source.overlayId ?? ""}:${candidate.source.path}:${candidate.startFrame}:${candidate.endFrame}:${normalizeText(candidate.text)}`;
}

function overlapsCandidate(a: VisualMomentCandidate, b: VisualMomentCandidate): boolean {
  return a.startFrame < b.endFrame && b.startFrame < a.endFrame;
}

function tokenOverlap(a: string[], b: string[]): number {
  const bSet = new Set(b);
  return Array.from(new Set(a)).filter((token) => bSet.has(token)).length;
}

function scoreOrderedCoverage(queryTokens: string[], evidenceTokens: string[]): number {
  let cursor = 0;
  let matched = 0;
  for (const token of queryTokens) {
    const index = evidenceTokens.indexOf(token, cursor);
    if (index === -1) continue;
    matched += 1;
    cursor = index + 1;
  }
  return queryTokens.length ? matched / queryTokens.length : 0;
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

function confidenceLabel(confidence: number): VisualMomentCandidate["confidenceLabel"] {
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

function isVisualKey(value: string): boolean {
  return VISUAL_KEYS.has(normalizeKey(value));
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

function finiteNumber(value: unknown): number | undefined {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
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
