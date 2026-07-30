import { tool } from "@langchain/core/tools";
import { z } from "zod";

import type { TranscriptionWord } from "../services/media/types";
import {
  searchCanonicalChatEvidence,
  type CanonicalChatEvidenceCandidate,
} from "../services/chat-multimodal-evidence";

type OverlayId = string | number;

export interface TranscriptSearchWord {
  word: string;
  startMs: number;
  endMs: number;
  startFrame: number;
  endFrame: number;
  confidence?: number;
  speaker?: number;
  source: {
    type: "video-transcription" | "audio-transcription" | "caption-overlay";
    overlayId?: OverlayId;
    assetId?: string;
    overlayType?: string;
  };
}

export type TranscriptMomentSource = TranscriptSearchWord["source"] | {
  type: "multimodal-evidence";
  overlayId?: OverlayId;
  assetId: string;
  overlayType?: string;
  evidenceId: string;
  auditId: string;
  path: string;
  scores: CanonicalChatEvidenceCandidate["scores"];
  missingModalities: string[];
  rejectionReasons: string[];
};

export interface TranscriptMomentCandidate {
  text: string;
  startFrame: number;
  endFrame: number;
  startMs: number;
  endMs: number;
  durationFrames: number;
  confidence: number;
  confidenceLabel: "high" | "medium" | "low";
  matchType: "phrase" | "fuzzy" | "lexical-vector" | "multimodal-semantic";
  matchReasons: string[];
  surroundingWords: string;
  source: TranscriptMomentSource;
  wordIndexes: number[];
  safeForAutoEdit: boolean;
  useWith: {
    cut_section: { startFrame: number; endFrame: number; note: string };
    add_captions: { startFrame: number; endFrame: number; text: string };
    add_motion_graphic: { frame: number; text: string };
    add_sfx: { frame: number; sync: "word-start" };
    set_keyframes: { frame: number; note: string };
  };
}

export type TranscriptEditAction = "cut_phrase" | "cut_after_phrase" | "keyframe_anchor";
export type TranscriptEditResolutionStatus = "ready" | "no-match" | "ambiguous" | "no-range";
export type StickerOverlayResolutionStatus = "ready" | "no-match" | "ambiguous";
export type StickerOverlayPlacement = "upper-right" | "upper-left" | "lower-right" | "lower-left";

export interface TranscriptEditResolveOptions extends TranscriptMomentOptions {
  action?: TranscriptEditAction;
  minGapFrames?: number;
  maxCutFrames?: number;
  precomputedCandidates?: TranscriptMomentCandidate[];
}

export interface TranscriptEditResolution {
  status: TranscriptEditResolutionStatus;
  action: TranscriptEditAction;
  query: string;
  candidates: TranscriptMomentCandidate[];
  candidate?: TranscriptMomentCandidate;
  cutSection?: { startFrame: number; endFrame: number; note: string };
  warnings: string[];
  message: string;
  useWith?: {
    cut_section: { startFrame: number; endFrame: number; note: string };
  };
}

export interface StickerOverlayResolveOptions extends TranscriptMomentOptions {
  description?: string;
  durationFrames?: number;
  offsetFrames?: number;
  placement?: StickerOverlayPlacement;
  width?: number;
  height?: number;
}

export interface StickerOverlayResolution {
  status: StickerOverlayResolutionStatus;
  query: string;
  candidates: TranscriptMomentCandidate[];
  candidate?: TranscriptMomentCandidate;
  warnings: string[];
  message: string;
  useWith?: {
    generate_html_sticker: {
      start: number;
      duration: number;
      description: string;
      x: string;
      y: string;
      width: number;
      height: number;
      enterAnimation: "fade" | "pop" | "bounce" | "slideUp" | "slideDown" | "slideLeft" | "slideRight" | "scale" | "spin" | "elastic";
      exitAnimation: "fade" | "pop" | "shrink" | "slideUp" | "slideDown" | "slideLeft" | "slideRight" | "scale" | "spin";
    };
  };
}

interface CreateChatTranscriptToolsOptions {
  userId: string;
  projectId: string;
}

interface TranscriptMomentOptions {
  limit?: number;
  minConfidence?: number;
}

type GetTranscription = (
  assetId: string,
  userId: string,
  options?: { forceRefresh?: boolean; preferWordLevel?: boolean },
) => Promise<{ words: TranscriptionWord[]; transcript?: string; confidence?: number }>;

const DEFAULT_FPS = 30;
const transcriptMomentSchema = z.object({
  query: z.string().min(1).describe("Spoken phrase or natural-language words to locate in the timeline."),
  videoOverlayId: z.union([z.string(), z.number()]).optional().describe("Optional timeline overlay id to constrain the search."),
  limit: z.coerce.number().int().min(1).max(12).default(5).describe("Maximum transcript moment candidates to return."),
  minConfidence: z.coerce.number().min(0).max(1).default(0.42).describe("Minimum candidate confidence."),
  includeCaptions: z.boolean().default(true).describe("Also search caption overlays already present on the timeline."),
  forceRefresh: z.boolean().default(false).describe("Refresh cached transcription before searching media assets."),
});

const transcriptEditSchema = z.object({
  query: z.string().min(1).describe("Spoken phrase that anchors the edit."),
  action: z.enum(["cut_phrase", "cut_after_phrase", "keyframe_anchor"]).default("cut_after_phrase").describe("Use cut_after_phrase for pauses/dead air after the phrase; cut_phrase when the spoken words should be removed; keyframe_anchor only grounds timing for resolve_keyframe_edit."),
  videoOverlayId: z.union([z.string(), z.number()]).optional().describe("Optional timeline overlay id to constrain transcript search."),
  limit: z.coerce.number().int().min(1).max(12).default(5).describe("Maximum transcript candidates to inspect before resolving ambiguity."),
  minConfidence: z.coerce.number().min(0).max(1).default(0.42).describe("Minimum candidate confidence."),
  includeCaptions: z.boolean().default(true).describe("Also search caption overlays already present on the timeline."),
  forceRefresh: z.boolean().default(false).describe("Refresh cached transcription before searching media assets."),
  minGapFrames: z.coerce.number().int().min(1).max(120).default(6).describe("Minimum silence/dead-air gap after the phrase before cut_after_phrase is allowed."),
  maxCutFrames: z.coerce.number().int().min(1).max(300).default(90).describe("Maximum frames to remove after the phrase without asking for confirmation."),
});

const stickerOverlaySchema = z.object({
  query: z.string().min(1).describe("Spoken word or phrase that anchors the sticker timing."),
  description: z.string().min(1).optional().describe("Sticker description to pass to generate_html_sticker, such as 'small animated sparkle sticker'."),
  videoOverlayId: z.union([z.string(), z.number()]).optional().describe("Optional timeline overlay id to constrain transcript search."),
  limit: z.coerce.number().int().min(1).max(12).default(5).describe("Maximum transcript candidates to inspect before resolving ambiguity."),
  minConfidence: z.coerce.number().min(0).max(1).default(0.42).describe("Minimum candidate confidence."),
  includeCaptions: z.boolean().default(true).describe("Also search caption overlays already present on the timeline."),
  forceRefresh: z.boolean().default(false).describe("Refresh cached transcription before searching media assets."),
  durationFrames: z.coerce.number().int().min(12).max(180).default(60).describe("Sticker duration in frames. 60 frames is two seconds at 30fps."),
  offsetFrames: z.coerce.number().int().min(-30).max(30).default(0).describe("Optional timing offset from the matched word start."),
  placement: z.enum(["upper-right", "upper-left", "lower-right", "lower-left"]).default("upper-right").describe("Safe frame zone for the sticker. Defaults away from the usual speaker center."),
  width: z.coerce.number().int().min(64).max(260).default(140).describe("Sticker width in pixels."),
  height: z.coerce.number().int().min(64).max(260).default(140).describe("Sticker height in pixels."),
});

export function createChatTranscriptTools({ userId, projectId }: CreateChatTranscriptToolsOptions) {
  const findTranscriptMoment = tool(
    async (input: z.infer<typeof transcriptMomentSchema>) => {
      const [{ projectService }, media] = await Promise.all([
        import("../services/project-service"),
        import("../services/media"),
      ]);
      const project = await projectService.loadProject(userId, projectId);
      const fps = positiveNumber(project?.fps) ?? DEFAULT_FPS;
      const words = await buildTranscriptWordsFromProject(project, {
        fps,
        userId,
        forceRefresh: input.forceRefresh,
        includeCaptions: input.includeCaptions,
        videoOverlayId: input.videoOverlayId,
        getTranscription: media.getTranscription,
      });
      const lexicalCandidates = findTranscriptMomentCandidates(words, input.query, {
        limit: input.limit,
        minConfidence: input.minConfidence,
      });
      const retrieval = await enrichTranscriptCandidatesWithCanonicalEvidence({
        project, projectId, userId, query: input.query, fps,
        overlayId: input.videoOverlayId, limit: input.limit, lexicalCandidates,
      });
      const candidates = retrieval.candidates;

      return JSON.stringify({
        status: "success",
        data: {
          query: input.query,
          searchedWordCount: words.length,
          returned: candidates.length,
          candidates,
          canonicalEvidence: retrieval.audit,
          message: candidates.length
            ? `Found ${candidates.length} transcript moment candidate(s). Use startFrame/endFrame directly when confidence is high.`
            : `No transcript moment matched "${input.query}". Ask once for a clearer phrase or use get_video_transcription for broader context.`,
        },
      });
    },
    {
      name: "find_transcript_moment",
      description: `Find when a spoken phrase appears in the edited timeline.
Use before any edit request such as "cut where he says X", "add captions on the part about X", "put a motion graphic when she says X", or "add a sound when the word X lands".
Returns deterministic word/frame candidates, confidence, context words, and exact frame hints for cut_section, captions, MG, SFX, and keyframes.
Do not make a destructive edit from a low-confidence or ambiguous candidate; present the candidates and ask once.`,
      schema: transcriptMomentSchema,
    },
  );

  const resolveTranscriptEdit = tool(
    async (input: z.infer<typeof transcriptEditSchema>) => {
      const [{ projectService }, media] = await Promise.all([
        import("../services/project-service"),
        import("../services/media"),
      ]);
      const project = await projectService.loadProject(userId, projectId);
      const fps = positiveNumber(project?.fps) ?? DEFAULT_FPS;
      const words = await buildTranscriptWordsFromProject(project, {
        fps,
        userId,
        forceRefresh: input.forceRefresh,
        includeCaptions: input.includeCaptions,
        videoOverlayId: input.videoOverlayId,
        getTranscription: media.getTranscription,
      });
      const lexicalCandidates = findTranscriptMomentCandidates(words, input.query, {
        limit: input.limit,
        minConfidence: input.minConfidence,
      });
      const retrieval = await enrichTranscriptCandidatesWithCanonicalEvidence({
        project, projectId, userId, query: input.query, fps,
        overlayId: input.videoOverlayId, limit: input.limit, lexicalCandidates,
      });
      const plan = resolveTranscriptEditRange(words, input.query, {
        action: input.action,
        limit: input.limit,
        minConfidence: input.minConfidence,
        minGapFrames: input.minGapFrames,
        maxCutFrames: input.maxCutFrames,
        precomputedCandidates: retrieval.candidates,
      });

      return JSON.stringify({
        status: plan.status === "ready" ? "success" : "error",
        data: {
          ...plan,
          searchedWordCount: words.length,
          canonicalEvidence: retrieval.audit,
        },
        message: plan.message,
      });
    },
    {
      name: "resolve_transcript_edit",
      description: `Resolve a spoken phrase into safe edit parameters for another tool, especially cut_section.
Use before destructive transcript-referenced edits such as "cut the pause after I say pricing is simple" or "remove where I say X".
Returns cut_section-ready startFrame/endFrame only when the phrase match is exact, unambiguous, and the requested range avoids cutting through spoken words. It never mutates the project by itself.`,
      schema: transcriptEditSchema,
    },
  );

  const resolveStickerOverlay = tool(
    async (input: z.infer<typeof stickerOverlaySchema>) => {
      const [{ projectService }, media] = await Promise.all([
        import("../services/project-service"),
        import("../services/media"),
      ]);
      const project = await projectService.loadProject(userId, projectId);
      const fps = positiveNumber(project?.fps) ?? DEFAULT_FPS;
      const words = await buildTranscriptWordsFromProject(project, {
        fps,
        userId,
        forceRefresh: input.forceRefresh,
        includeCaptions: input.includeCaptions,
        videoOverlayId: input.videoOverlayId,
        getTranscription: media.getTranscription,
      });
      const plan = resolveStickerOverlayTiming(words, input.query, {
        description: input.description,
        limit: input.limit,
        minConfidence: input.minConfidence,
        durationFrames: input.durationFrames,
        offsetFrames: input.offsetFrames,
        placement: input.placement,
        width: input.width,
        height: input.height,
      });

      return JSON.stringify({
        status: plan.status === "ready" ? "success" : "error",
        data: {
          ...plan,
          searchedWordCount: words.length,
        },
        message: plan.message,
      });
    },
    {
      name: "resolve_sticker_overlay",
      description: `Resolve a spoken word/phrase into generate_html_sticker-ready timing and safe placement params.
Use before transcript-anchored sticker requests like "add a sparkle sticker near the word win". This tool never generates HTML and never mutates the project; it only returns params for generate_html_sticker when the transcript match is exact and unambiguous.`,
      schema: stickerOverlaySchema,
    },
  );

  return [findTranscriptMoment, resolveTranscriptEdit, resolveStickerOverlay];
}

async function enrichTranscriptCandidatesWithCanonicalEvidence(input: {
  project: unknown;
  projectId: string;
  userId: string;
  query: string;
  fps: number;
  overlayId?: OverlayId;
  limit: number;
  lexicalCandidates: TranscriptMomentCandidate[];
}): Promise<{
  candidates: TranscriptMomentCandidate[];
  audit: {
    mode: "lexical-exact" | "canonical-multimodal";
    auditId: string | null;
    analyzedDocumentCount: number;
    embeddedDocumentCount: number;
  };
}> {
  if (input.lexicalCandidates.some((candidate) => candidate.safeForAutoEdit && candidate.matchType === "phrase")) {
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
    intent: "transcript",
    overlayId: input.overlayId,
    limit: input.limit,
  });
  const semanticCandidates = evidence.candidates
    .filter((candidate) => candidate.accepted && candidate.startFrame != null && candidate.endFrame != null)
    .map((candidate) => canonicalTranscriptCandidate(candidate, evidence.auditId, input.query, input.fps));
  return {
    candidates: mergeTranscriptCandidates(input.lexicalCandidates, semanticCandidates, input.limit),
    audit: {
      mode: "canonical-multimodal",
      auditId: evidence.auditId,
      analyzedDocumentCount: evidence.analyzedDocumentCount,
      embeddedDocumentCount: evidence.embeddedDocumentCount,
    },
  };
}

function canonicalTranscriptCandidate(
  candidate: CanonicalChatEvidenceCandidate,
  auditId: string,
  query: string,
  fps: number,
): TranscriptMomentCandidate {
  const startFrame = candidate.startFrame!;
  const endFrame = Math.max(startFrame + 1, candidate.endFrame!);
  const text = candidate.transcriptText || candidate.text;
  return {
    text,
    startFrame,
    endFrame,
    startMs: Math.round(startFrame / fps * 1_000),
    endMs: Math.round(endFrame / fps * 1_000),
    durationFrames: endFrame - startFrame,
    confidence: round3(candidate.score),
    confidenceLabel: candidate.score >= 0.75 ? "high" : candidate.score >= 0.5 ? "medium" : "low",
    matchType: "multimodal-semantic",
    matchReasons: [
      `canonical-match=${candidate.matchType}`,
      `text-semantic=${candidate.scores.textSemantic ?? "missing"}`,
      `lexical=${candidate.scores.lexical}`,
      `audit=${auditId}`,
    ],
    surroundingWords: candidate.transcriptText,
    source: {
      type: "multimodal-evidence",
      ...(candidate.overlayId != null ? { overlayId: candidate.overlayId } : {}),
      assetId: candidate.assetId,
      ...(candidate.overlayType ? { overlayType: candidate.overlayType } : {}),
      evidenceId: candidate.evidenceId,
      auditId,
      path: candidate.sourcePaths.join(" | "),
      scores: candidate.scores,
      missingModalities: candidate.missingModalities,
      rejectionReasons: candidate.rejectionReasons,
    },
    wordIndexes: [],
    safeForAutoEdit: false,
    useWith: {
      cut_section: {
        startFrame,
        endFrame,
        note: "Semantic segment evidence only. Resolve an exact word range or ask the user before cutting.",
      },
      add_captions: { startFrame, endFrame, text },
      add_motion_graphic: { frame: startFrame, text: truncate(query, 80) },
      add_sfx: { frame: startFrame, sync: "word-start" },
      set_keyframes: { frame: startFrame, note: "Inspect this semantic moment before applying keyframes." },
    },
  };
}

function mergeTranscriptCandidates(
  lexical: TranscriptMomentCandidate[],
  semantic: TranscriptMomentCandidate[],
  limit: number,
): TranscriptMomentCandidate[] {
  const candidates = new Map<string, TranscriptMomentCandidate>();
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

export function findTranscriptMomentCandidates(
  words: TranscriptSearchWord[],
  query: string,
  options: TranscriptMomentOptions = {},
): TranscriptMomentCandidate[] {
  const limit = clampInt(options.limit ?? 5, 1, 12);
  const minConfidence = clamp(options.minConfidence ?? 0.42, 0, 1);
  const normalizedWords = words
    .map((word, index) => ({ word, index, normalized: normalizeToken(word.word) }))
    .filter((item) => item.normalized);
  const queryTokens = tokenize(query);
  if (!queryTokens.length || !normalizedWords.length) return [];

  const queryText = queryTokens.join(" ");
  const candidateMap = new Map<string, TranscriptMomentCandidate>();

  for (const phraseMatch of findPhraseMatches(normalizedWords, queryTokens)) {
    const candidate = buildCandidate(words, phraseMatch.indexes, {
      queryText,
      score: 0.96,
      matchType: "phrase",
      matchReasons: ["contiguous-phrase"],
    });
    candidateMap.set(candidateKey(candidate), candidate);
  }

  const minWindow = Math.max(1, queryTokens.length - 2);
  const maxWindow = Math.min(normalizedWords.length, queryTokens.length + 4);
  for (let start = 0; start < normalizedWords.length; start += 1) {
    for (let size = minWindow; size <= maxWindow; size += 1) {
      const slice = normalizedWords.slice(start, start + size);
      if (slice.length !== size) continue;
      const windowTokens = slice.map((item) => item.normalized);
      const lexicalScore = scoreLexicalWindow(queryTokens, windowTokens);
      const vectorScore = scoreCharacterVector(queryText, windowTokens.join(" "));
      const orderScore = scoreOrderedCoverage(queryTokens, windowTokens);
      const score = clamp((lexicalScore * 0.5) + (vectorScore * 0.3) + (orderScore * 0.2), 0, 0.92);
      if (score < minConfidence) continue;

      const matchType: TranscriptMomentCandidate["matchType"] = vectorScore > lexicalScore + 0.12
        ? "lexical-vector"
        : "fuzzy";
      const candidate = buildCandidate(words, slice.map((item) => item.index), {
        queryText,
        score,
        matchType,
        matchReasons: [
          `lexical=${round3(lexicalScore)}`,
          `vector=${round3(vectorScore)}`,
          `order=${round3(orderScore)}`,
        ],
      });
      const key = candidateKey(candidate);
      const existing = candidateMap.get(key);
      if (!existing || candidate.confidence > existing.confidence) {
        candidateMap.set(key, candidate);
      }
    }
  }

  const candidates = Array.from(candidateMap.values())
    .filter((candidate) => candidate.confidence >= minConfidence)
    .sort((a, b) => b.confidence - a.confidence || a.startFrame - b.startFrame)
    .slice(0, limit);

  const ambiguous = candidates.slice(1).some((candidate) => (
    Math.abs(candidates[0].confidence - candidate.confidence) < 0.08
    && !overlapsCandidate(candidates[0], candidate)
  ));

  return candidates.map((candidate, index) => ({
    ...candidate,
    safeForAutoEdit: index === 0
      && !ambiguous
      && candidate.matchType === "phrase"
      && candidate.confidence >= 0.82,
  }));
}

export function resolveTranscriptEditRange(
  words: TranscriptSearchWord[],
  query: string,
  options: TranscriptEditResolveOptions = {},
): TranscriptEditResolution {
  const action = options.action ?? "cut_after_phrase";
  const candidates = options.precomputedCandidates ?? findTranscriptMomentCandidates(words, query, {
      limit: options.limit ?? 5,
      minConfidence: options.minConfidence ?? 0.42,
    });
  const warnings: string[] = [];

  if (!candidates.length) {
    return {
      status: "no-match",
      action,
      query,
      candidates,
      warnings,
      message: `No transcript phrase matched "${query}".`,
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
      message: `No transcript phrase matched "${query}".`,
    };
  }

  if (!candidate.safeForAutoEdit) {
    const second = candidates[1];
    return {
      status: "ambiguous",
      action,
      query,
      candidates,
      candidate,
      warnings,
      message: second
        ? `Transcript phrase "${query}" is ambiguous between frames ${candidate.startFrame}-${candidate.endFrame} and ${second.startFrame}-${second.endFrame}. Ask the user to choose before cutting.`
        : `Transcript phrase "${query}" was not exact/confident enough for automatic ${action}.`,
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
      message: `Resolved transcript keyframe anchor "${candidate.text}" at frame ${candidate.startFrame}; resolve_keyframe_edit still owns the zoom form.`,
    };
  }

  let startFrame = candidate.startFrame;
  let endFrame = candidate.endFrame;
  let note = `Cut exact spoken phrase "${candidate.text}" only.`;

  if (action === "cut_after_phrase") {
    const gap = resolvePostPhraseGap(words, candidate, {
      minGapFrames: clampInt(options.minGapFrames ?? 6, 1, 120),
      maxCutFrames: clampInt(options.maxCutFrames ?? 90, 1, 300),
    });

    if (!gap.ok) {
      return {
        status: "no-range",
        action,
        query,
        candidates,
        candidate,
        warnings,
        message: gap.message,
      };
    }

    startFrame = gap.startFrame;
    endFrame = gap.endFrame;
    note = `Cut pause/dead air after "${candidate.text}" and before next word "${gap.nextWord}".`;
    warnings.push(...gap.warnings);
  }

  const cutSection = { startFrame, endFrame, note };
  return {
    status: "ready",
    action,
    query,
    candidates,
    candidate,
    cutSection,
    warnings,
    useWith: { cut_section: cutSection },
    message: `Resolved ${action} for "${candidate.text}" to frames ${startFrame}-${endFrame}.`,
  };
}

export function resolveStickerOverlayTiming(
  words: TranscriptSearchWord[],
  query: string,
  options: StickerOverlayResolveOptions = {},
): StickerOverlayResolution {
  const candidates = findTranscriptMomentCandidates(words, query, {
    limit: options.limit ?? 5,
    minConfidence: options.minConfidence ?? 0.42,
  });
  const warnings: string[] = [];

  if (!candidates.length) {
    return {
      status: "no-match",
      query,
      candidates,
      warnings,
      message: `No transcript word or phrase matched "${query}" for sticker placement.`,
    };
  }

  const candidate = candidates[0];
  if (!candidate || !candidate.safeForAutoEdit) {
    const second = candidates[1];
    return {
      status: "ambiguous",
      query,
      candidates,
      candidate,
      warnings,
      message: second
        ? `Sticker anchor "${query}" is ambiguous between frames ${candidate?.startFrame}-${candidate?.endFrame} and ${second.startFrame}-${second.endFrame}. Ask the user to choose before generating a sticker.`
        : `Sticker anchor "${query}" was not exact/confident enough for automatic sticker placement.`,
    };
  }

  const duration = clampInt(options.durationFrames ?? 60, 12, 180);
  const offset = clampInt(options.offsetFrames ?? 0, -30, 30);
  const width = clampInt(options.width ?? 140, 64, 260);
  const height = clampInt(options.height ?? 140, 64, 260);
  const placement = options.placement ?? "upper-right";
  const position = stickerSafePosition(placement);
  const start = Math.max(0, candidate.startFrame + offset);
  const description = options.description?.trim() || `Small animated sticker accent for "${candidate.text}"`;

  if (placement === "upper-right") {
    warnings.push("Using upper-right safe placement because transcript words do not provide screen coordinates.");
  }

  return {
    status: "ready",
    query,
    candidates,
    candidate,
    warnings,
    useWith: {
      generate_html_sticker: {
        start,
        duration,
        description,
        x: position.x,
        y: position.y,
        width,
        height,
        enterAnimation: "pop",
        exitAnimation: "fade",
      },
    },
    message: `Resolved sticker anchor "${candidate.text}" to frame ${start} for generate_html_sticker.`,
  };
}

function stickerSafePosition(placement: StickerOverlayPlacement): { x: string; y: string } {
  switch (placement) {
    case "upper-left":
      return { x: "8%", y: "14%" };
    case "lower-left":
      return { x: "8%", y: "74%" };
    case "lower-right":
      return { x: "78%", y: "74%" };
    case "upper-right":
    default:
      return { x: "78%", y: "14%" };
  }
}
function resolvePostPhraseGap(
  words: TranscriptSearchWord[],
  candidate: TranscriptMomentCandidate,
  options: { minGapFrames: number; maxCutFrames: number },
): { ok: true; startFrame: number; endFrame: number; nextWord: string; warnings: string[] } | { ok: false; message: string } {
  const startFrame = candidate.endFrame;
  const nextWord = words
    .filter((word) => sameTranscriptSource(word.source, candidate.source))
    .filter((word) => word.startFrame >= startFrame)
    .sort((a, b) => a.startFrame - b.startFrame || a.endFrame - b.endFrame)[0];

  if (!nextWord) {
    return {
      ok: false,
      message: `No following word was found after "${candidate.text}", so the post-phrase cut has no safe end boundary.`,
    };
  }

  const gapFrames = nextWord.startFrame - startFrame;
  if (gapFrames < options.minGapFrames) {
    return {
      ok: false,
      message: `Only ${gapFrames} frame(s) of gap after "${candidate.text}"; minimum is ${options.minGapFrames}, so no cut range was produced.`,
    };
  }

  const cappedEndFrame = Math.min(nextWord.startFrame, startFrame + options.maxCutFrames);
  const warnings = cappedEndFrame < nextWord.startFrame
    ? [`Post-phrase gap was capped at ${options.maxCutFrames} frame(s) before the next word at frame ${nextWord.startFrame}.`]
    : [];

  return {
    ok: true,
    startFrame,
    endFrame: cappedEndFrame,
    nextWord: nextWord.word,
    warnings,
  };
}

function sameTranscriptSource(
  left: TranscriptSearchWord["source"],
  right: TranscriptMomentSource,
): boolean {
  if (right.type === "multimodal-evidence") return false;
  return left.type === right.type
    && String(left.overlayId ?? "") === String(right.overlayId ?? "")
    && String(left.assetId ?? "") === String(right.assetId ?? "");
}

async function buildTranscriptWordsFromProject(
  project: any,
  options: {
    fps: number;
    userId: string;
    forceRefresh: boolean;
    includeCaptions: boolean;
    videoOverlayId?: OverlayId;
    getTranscription: GetTranscription;
  },
): Promise<TranscriptSearchWord[]> {
  const overlays = Array.isArray(project?.overlays) ? project.overlays : [];
  const words: TranscriptSearchWord[] = [];
  const mediaOverlays = overlays
    .filter((overlay: any) => isMediaOverlay(overlay))
    .filter((overlay: any) => options.videoOverlayId == null || String(overlay?.id) === String(options.videoOverlayId));

  for (const overlay of mediaOverlays) {
    const assetId = stringValue(overlay?.assetId ?? overlay?.sourceAssetId ?? overlay?.mediaId ?? overlay?.metadata?.assetId);
    if (!assetId) continue;
    try {
      const transcription = await options.getTranscription(assetId, options.userId, {
        forceRefresh: options.forceRefresh,
        preferWordLevel: true,
      });
      words.push(...mapMediaWordsToTimeline(transcription.words ?? [], overlay, options.fps, assetId));
    } catch {
      continue;
    }
  }

  if (options.includeCaptions) {
    const captionOverlays = overlays
      .filter((overlay: any) => isCaptionOverlay(overlay))
      .filter((overlay: any) => options.videoOverlayId == null || String(overlay?.id) === String(options.videoOverlayId));
    for (const overlay of captionOverlays) {
      words.push(...extractCaptionWords(overlay, options.fps));
    }
  }

  return reconcileTranscriptWords(words)
    .filter((word) => word.word.trim() && word.endFrame > word.startFrame)
    .sort((a, b) => a.startFrame - b.startFrame || a.endFrame - b.endFrame);
}

function reconcileTranscriptWords(words: TranscriptSearchWord[]): TranscriptSearchWord[] {
  const reconciled: TranscriptSearchWord[] = [];
  const sorted = [...words].sort((a, b) => a.startFrame - b.startFrame || a.endFrame - b.endFrame);
  for (const candidate of sorted) {
    const normalized = normalizeToken(candidate.word);
    if (!normalized) continue;
    const duplicateIndex = reconciled.findIndex((existing) => (
      normalizeToken(existing.word) === normalized
      && transcriptWordOverlapRatio(existing, candidate) >= 0.6
    ));
    if (duplicateIndex < 0) {
      reconciled.push(candidate);
      continue;
    }
    reconciled[duplicateIndex] = preferredTranscriptWord(reconciled[duplicateIndex], candidate);
  }
  return reconciled;
}

function transcriptWordOverlapRatio(left: TranscriptSearchWord, right: TranscriptSearchWord): number {
  const overlap = Math.max(0, Math.min(left.endFrame, right.endFrame) - Math.max(left.startFrame, right.startFrame));
  const shorterDuration = Math.max(1, Math.min(
    left.endFrame - left.startFrame,
    right.endFrame - right.startFrame,
  ));
  return overlap / shorterDuration;
}

function preferredTranscriptWord(left: TranscriptSearchWord, right: TranscriptSearchWord): TranscriptSearchWord {
  const leftConfidence = numberValue(left.confidence) ?? 0;
  const rightConfidence = numberValue(right.confidence) ?? 0;
  if (Math.abs(leftConfidence - rightConfidence) > 0.02) {
    return rightConfidence > leftConfidence ? right : left;
  }
  const leftPriority = transcriptSourcePriority(left.source.type);
  const rightPriority = transcriptSourcePriority(right.source.type);
  if (leftPriority !== rightPriority) return rightPriority > leftPriority ? right : left;
  return leftConfidence >= rightConfidence ? left : right;
}

function transcriptSourcePriority(sourceType: TranscriptSearchWord["source"]["type"]): number {
  if (sourceType === "video-transcription" || sourceType === "audio-transcription") return 2;
  if (sourceType === "caption-overlay") return 1;
  return 0;
}

function mapMediaWordsToTimeline(
  transcriptionWords: TranscriptionWord[],
  overlay: any,
  fps: number,
  assetId: string,
): TranscriptSearchWord[] {
  const clipFrom = finiteFrame(overlay?.from);
  const clipDuration = Math.max(1, finiteFrame(overlay?.durationInFrames));
  const sourceStartFrame = finiteFrame(overlay?.sourceStartFrame ?? overlay?.videoStartTime ?? overlay?.audioStartFrame);
  const overlayType = stringValue(overlay?.type) ?? "video";

  const mapped: TranscriptSearchWord[] = [];
  for (const word of transcriptionWords) {
    if (
      !Number.isFinite(word.startMs)
      || !Number.isFinite(word.endMs)
      || word.startMs < 0
      || word.endMs <= word.startMs
    ) {
      continue;
    }
    const startSourceFrame = Math.round((word.startMs / 1000) * fps);
    const endSourceFrame = Math.max(startSourceFrame + 1, Math.round((word.endMs / 1000) * fps));
    const startFrame = clipFrom + (startSourceFrame - sourceStartFrame);
    const endFrame = clipFrom + (endSourceFrame - sourceStartFrame);
    mapped.push({
      word: word.word,
      startMs: Math.round((startFrame / fps) * 1000),
      endMs: Math.round((endFrame / fps) * 1000),
      startFrame,
      endFrame,
      confidence: word.confidence,
      speaker: word.speaker,
      source: {
        type: overlayType === "audio" || overlayType === "sound" ? "audio-transcription" : "video-transcription",
        overlayId: overlay?.id,
        assetId,
        overlayType,
      },
    });
  }

  return mapped
    .filter((word) => word.endFrame > clipFrom && word.startFrame < clipFrom + clipDuration)
    .map((word) => ({
      ...word,
      startFrame: Math.max(clipFrom, word.startFrame),
      endFrame: Math.min(clipFrom + clipDuration, word.endFrame),
      startMs: Math.max(0, word.startMs),
      endMs: Math.max(word.startMs + 1, word.endMs),
    }));
}

function extractCaptionWords(overlay: any, fps: number): TranscriptSearchWord[] {
  const words: TranscriptSearchWord[] = [];
  const overlayFrom = finiteFrame(overlay?.from);
  const overlayEnd = overlayFrom + Math.max(1, finiteFrame(overlay?.durationInFrames));
  visitLimited(overlay, (node) => {
    if (!node || typeof node !== "object" || !Array.isArray((node as any).words)) return;
    for (const rawWord of (node as any).words) {
      const text = stringValue(rawWord?.word ?? rawWord?.text ?? rawWord?.content);
      if (!text) continue;
      const startFrame = readWordFrame(
        rawWord,
        ["startFrame", "from"],
        ["startMs"],
        ["startSec", "startSeconds", "start"],
        fps,
      );
      const endFrame = readWordFrame(rawWord, ["endFrame", "to"], ["endMs"], ["endSec", "endSeconds", "end"], fps);
      if (startFrame == null || endFrame == null || endFrame <= startFrame) continue;
      const clampedStart = clampInt(startFrame, overlayFrom, overlayEnd);
      const clampedEnd = clampInt(endFrame, overlayFrom, overlayEnd);
      if (clampedEnd <= clampedStart) continue;
      words.push({
        word: text,
        startMs: Math.round((clampedStart / fps) * 1000),
        endMs: Math.round((clampedEnd / fps) * 1000),
        startFrame: clampedStart,
        endFrame: clampedEnd,
        confidence: numberValue(rawWord?.confidence),
        speaker: integerValue(rawWord?.speaker),
        source: {
          type: "caption-overlay",
          overlayId: overlay?.id,
          overlayType: stringValue(overlay?.type),
        },
      });
    }
  });
  return words;
}

function findPhraseMatches(
  words: Array<{ normalized: string; index: number }>,
  queryTokens: string[],
): Array<{ indexes: number[] }> {
  const matches: Array<{ indexes: number[] }> = [];
  for (let start = 0; start <= words.length - queryTokens.length; start += 1) {
    let matched = true;
    for (let offset = 0; offset < queryTokens.length; offset += 1) {
      if (words[start + offset].normalized !== queryTokens[offset]) {
        matched = false;
        break;
      }
    }
    if (matched) {
      matches.push({ indexes: words.slice(start, start + queryTokens.length).map((item) => item.index) });
    }
  }
  return matches;
}

function buildCandidate(
  allWords: TranscriptSearchWord[],
  wordIndexes: number[],
  options: {
    queryText: string;
    score: number;
    matchType: TranscriptMomentCandidate["matchType"];
    matchReasons: string[];
  },
): TranscriptMomentCandidate {
  const indexes = Array.from(new Set(wordIndexes)).sort((a, b) => a - b);
  const matchedWords = indexes.map((index) => allWords[index]).filter(Boolean);
  const first = matchedWords[0];
  const last = matchedWords[matchedWords.length - 1] ?? first;
  const startFrame = first.startFrame;
  const endFrame = Math.max(startFrame + 1, last.endFrame);
  const text = matchedWords.map((word) => word.word).join(" ");
  const confidenceFromWords = average(matchedWords.map((word) => numberValue(word.confidence)).filter(isFiniteNumber));
  const confidence = round3(clamp(options.score * (0.92 + ((confidenceFromWords ?? 0.85) * 0.08)), 0, 1));

  return {
    text,
    startFrame,
    endFrame,
    startMs: first.startMs,
    endMs: Math.max(first.startMs + 1, last.endMs),
    durationFrames: endFrame - startFrame,
    confidence,
    confidenceLabel: confidence >= 0.75 ? "high" : confidence >= 0.5 ? "medium" : "low",
    matchType: options.matchType,
    matchReasons: options.matchReasons,
    surroundingWords: surroundingWords(allWords, indexes[0], indexes[indexes.length - 1]),
    source: first.source,
    wordIndexes: indexes,
    safeForAutoEdit: false,
    useWith: {
      cut_section: {
        startFrame,
        endFrame,
        note: "Use only when safeForAutoEdit is true, otherwise ask the user to choose a candidate.",
      },
      add_captions: { startFrame, endFrame, text },
      add_motion_graphic: { frame: startFrame, text },
      add_sfx: { frame: startFrame, sync: "word-start" },
      set_keyframes: { frame: startFrame, note: "Anchor keyframe emphasis to this spoken phrase." },
    },
  };
}

function scoreLexicalWindow(queryTokens: string[], windowTokens: string[]): number {
  const querySet = new Set(queryTokens);
  const windowSet = new Set(windowTokens);
  const intersection = Array.from(querySet).filter((token) => windowSet.has(token)).length;
  const union = new Set([...querySet, ...windowSet]).size;
  const exactCoverage = intersection / Math.max(querySet.size, 1);
  const jaccard = intersection / Math.max(union, 1);
  return clamp((exactCoverage * 0.72) + (jaccard * 0.28), 0, 1);
}

function scoreOrderedCoverage(queryTokens: string[], windowTokens: string[]): number {
  let queryIndex = 0;
  for (const token of windowTokens) {
    if (token === queryTokens[queryIndex]) queryIndex += 1;
    if (queryIndex >= queryTokens.length) break;
  }
  return queryIndex / Math.max(queryTokens.length, 1);
}

function scoreCharacterVector(left: string, right: string): number {
  const a = characterNgrams(left);
  const b = characterNgrams(right);
  if (!a.size || !b.size) return 0;
  let dot = 0;
  let aMag = 0;
  let bMag = 0;
  for (const value of a.values()) aMag += value * value;
  for (const value of b.values()) bMag += value * value;
  for (const [gram, value] of a) {
    dot += value * (b.get(gram) ?? 0);
  }
  return clamp(dot / Math.sqrt(aMag * bMag), 0, 1);
}

function characterNgrams(value: string): Map<string, number> {
  const normalized = ` ${value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
  const grams = new Map<string, number>();
  for (let i = 0; i <= normalized.length - 3; i += 1) {
    const gram = normalized.slice(i, i + 3);
    grams.set(gram, (grams.get(gram) ?? 0) + 1);
  }
  return grams;
}

function surroundingWords(words: TranscriptSearchWord[], startIndex: number, endIndex: number): string {
  return words
    .slice(Math.max(0, startIndex - 6), Math.min(words.length, endIndex + 7))
    .map((word) => word.word)
    .join(" ");
}

function candidateKey(candidate: TranscriptMomentCandidate): string {
  return `${candidate.startFrame}:${candidate.endFrame}:${candidate.text.toLowerCase()}`;
}

function overlapsCandidate(left: TranscriptMomentCandidate, right: TranscriptMomentCandidate): boolean {
  return left.startFrame < right.endFrame && right.startFrame < left.endFrame;
}

function tokenize(value: string): string[] {
  return value.split(/\s+/).map(normalizeToken).filter(Boolean);
}

function normalizeToken(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, "");
}

function readWordFrame(
  rawWord: any,
  frameKeys: string[],
  millisecondKeys: string[],
  secondKeys: string[],
  fps: number,
): number | undefined {
  for (const key of frameKeys) {
    const value = integerValue(rawWord?.[key]);
    if (typeof value === "number") return value;
  }
  for (const key of millisecondKeys) {
    const value = numberValue(rawWord?.[key]);
    if (typeof value === "number") return Math.round((value / 1000) * fps);
  }
  for (const key of secondKeys) {
    const value = numberValue(rawWord?.[key]);
    if (typeof value === "number") return Math.round(value * fps);
  }
  return undefined;
}

function isMediaOverlay(overlay: any): boolean {
  const type = stringValue(overlay?.type);
  return type === "video" || type === "audio" || type === "sound";
}

function isCaptionOverlay(overlay: any): boolean {
  const type = stringValue(overlay?.type);
  return type === "caption" || type === "captions";
}

function visitLimited(value: any, visit: (node: unknown) => void): void {
  const queue = [value];
  let visited = 0;
  while (queue.length > 0 && visited < 300) {
    const node = queue.shift();
    visited += 1;
    visit(node);
    if (!node || typeof node !== "object") continue;
    for (const child of Object.values(node)) {
      if (child && typeof child === "object") queue.push(child);
    }
  }
}

function average(values: number[]): number | undefined {
  if (!values.length) return undefined;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function positiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function integerValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : undefined;
}

function finiteFrame(value: unknown): number {
  return Math.max(0, integerValue(value) ?? 0);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 3)).trim()}...`;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
