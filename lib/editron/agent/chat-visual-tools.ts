import { tool } from "@langchain/core/tools";
import { z } from "zod";

import { DEFAULT_CONFIG } from "../config/editron-config";

type OverlayId = string | number;

export interface VisualMomentCandidate {
  text: string;
  frame: number;
  startFrame: number;
  endFrame: number;
  durationFrames: number;
  confidence: number;
  confidenceLabel: "high" | "medium" | "low";
  matchType: "exact-phrase" | "token-overlap" | "character-vector";
  matchReasons: string[];
  evidenceText: string;
  source: {
    type: "overlay" | "analysis";
    overlayId?: OverlayId;
    assetId?: string;
    overlayType?: string;
    path: string;
  };
  safeForAutoEdit: boolean;
  useWith: {
    cut_section: { startFrame: number; endFrame: number; note: string };
    add_motion_graphic: { frame: number; text: string };
    set_keyframes: { frame: number; note: string };
    visual_inspect_frame: { frame: number; question: string };
  };
}

interface CreateChatVisualToolsOptions {
  userId: string;
  projectId: string;
}

interface VisualMomentOptions {
  videoOverlayId?: OverlayId;
  limit?: number;
  minConfidence?: number;
  includeOverlayText?: boolean;
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
  source: VisualMomentCandidate["source"];
}

const DEFAULT_FPS = 30;
const DEFAULT_CLIP_DURATION_FRAMES = 30;

const visualMomentSchema = z.object({
  query: z.string().min(1).describe("Natural-language visual event, object, action, scene, or on-screen text to locate in the timeline."),
  videoOverlayId: z.union([z.string(), z.number()]).optional().describe("Optional timeline video overlay id to constrain the search."),
  limit: z.coerce.number().int().min(1).max(12).default(5).describe("Maximum visual moment candidates to return."),
  minConfidence: z.coerce.number().min(0).max(1).default(0.35).describe("Minimum candidate confidence."),
  includeOverlayText: z.boolean().default(true).describe("Also search text already attached to timeline overlays."),
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

export function createChatVisualTools({ userId, projectId }: CreateChatVisualToolsOptions) {
  const findVisualMoment = tool(
    async (input: z.infer<typeof visualMomentSchema>) => {
      const { projectService } = await import("../services/project-service");
      const project = await projectService.loadProject(userId, projectId);
      const evidence = buildVisualEvidence(project, {
        videoOverlayId: input.videoOverlayId,
        includeOverlayText: input.includeOverlayText,
      });
      const candidates = findVisualMomentCandidates(project, input.query, {
        videoOverlayId: input.videoOverlayId,
        limit: input.limit,
        minConfidence: input.minConfidence,
        includeOverlayText: input.includeOverlayText,
      });

      return JSON.stringify({
        status: "success",
        data: {
          query: input.query,
          searchedEvidenceCount: evidence.length,
          returned: candidates.length,
          candidates,
          message: candidates.length
            ? `Found ${candidates.length} visual moment candidate(s). Use frame/startFrame/endFrame directly when confidence is high.`
            : `No stored visual evidence matched "${input.query}". Use analyze_clip_video/analyze_video_content first, or ask once for a clearer visual phrase.`,
        },
      });
    },
    {
      name: "find_visual_moment",
      description: `Find when a stored visual event, object, scene, action, gesture, OCR text, or overlay visual label appears in the edited timeline.
Use before edit requests such as "cut when the logo appears", "zoom when he points", "add a motion graphic on the shot with the laptop", or "inspect the frame where the product is visible".
Returns deterministic frame candidates, confidence, source evidence, and exact frame hints for cut_section, add_motion_graphic, set_keyframes, and visual_inspect_frame.
Do not make a destructive edit from a low-confidence or ambiguous candidate; present the candidates and ask once.`,
      schema: visualMomentSchema,
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

        for (const update of plan.updates) {
          await projectService.updateOverlay(userId, projectId, Number(update.overlayId), {
            keyframeTracks: update.nextKeyframeTracks,
          } as any);
        }

        return JSON.stringify({ status: "success", data: plan });
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

  return [findVisualMoment, applyCameraShake];
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
    safeForAutoEdit: index === 0 && !ambiguous && candidate.confidence >= 0.78,
  }));
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
      });
    }
    return;
  }

  if (Array.isArray(value)) {
    const stringItems = value.filter((item): item is string => typeof item === "string");
    if (stringItems.length === value.length && stringItems.length > 0 && context.visualContext) {
      addEvidence(context.output, stringItems.join(" "), context.range, {
        ...context.sourceBase,
        path: context.path,
      });
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
        });
      }
      continue;
    }

    if (Array.isArray(child) && child.every((item) => typeof item === "string")) {
      if (childVisualContext || TEXT_FACT_KEYS.has(normalizedKey)) {
        addEvidence(context.output, child.join(" "), range, {
          ...context.sourceBase,
          path: childPath,
        });
      }
      continue;
    }

    collectVisualEvidence(child, {
      ...context,
      path: childPath,
      range,
      visualContext: childVisualContext,
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
    source,
  });
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
