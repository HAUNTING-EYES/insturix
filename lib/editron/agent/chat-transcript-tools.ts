import { tool } from "@langchain/core/tools";
import { z } from "zod";

import type { TranscriptionWord } from "../services/media/types";

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

export interface TranscriptMomentCandidate {
  text: string;
  startFrame: number;
  endFrame: number;
  startMs: number;
  endMs: number;
  durationFrames: number;
  confidence: number;
  confidenceLabel: "high" | "medium" | "low";
  matchType: "phrase" | "fuzzy" | "lexical-vector";
  matchReasons: string[];
  surroundingWords: string;
  source: TranscriptSearchWord["source"];
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

export type TranscriptEditAction = "cut_phrase" | "cut_after_phrase";
export type TranscriptEditResolutionStatus = "ready" | "no-match" | "ambiguous" | "no-range";

export interface TranscriptEditResolveOptions extends TranscriptMomentOptions {
  action?: TranscriptEditAction;
  minGapFrames?: number;
  maxCutFrames?: number;
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
  action: z.enum(["cut_phrase", "cut_after_phrase"]).default("cut_after_phrase").describe("Use cut_after_phrase for pauses/dead air after the phrase; use cut_phrase only when the spoken words themselves should be removed."),
  videoOverlayId: z.union([z.string(), z.number()]).optional().describe("Optional timeline overlay id to constrain transcript search."),
  limit: z.coerce.number().int().min(1).max(12).default(5).describe("Maximum transcript candidates to inspect before resolving ambiguity."),
  minConfidence: z.coerce.number().min(0).max(1).default(0.42).describe("Minimum candidate confidence."),
  includeCaptions: z.boolean().default(true).describe("Also search caption overlays already present on the timeline."),
  forceRefresh: z.boolean().default(false).describe("Refresh cached transcription before searching media assets."),
  minGapFrames: z.coerce.number().int().min(1).max(120).default(6).describe("Minimum silence/dead-air gap after the phrase before cut_after_phrase is allowed."),
  maxCutFrames: z.coerce.number().int().min(1).max(300).default(90).describe("Maximum frames to remove after the phrase without asking for confirmation."),
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
      const candidates = findTranscriptMomentCandidates(words, input.query, {
        limit: input.limit,
        minConfidence: input.minConfidence,
      });

      return JSON.stringify({
        status: "success",
        data: {
          query: input.query,
          searchedWordCount: words.length,
          returned: candidates.length,
          candidates,
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
      const plan = resolveTranscriptEditRange(words, input.query, {
        action: input.action,
        limit: input.limit,
        minConfidence: input.minConfidence,
        minGapFrames: input.minGapFrames,
        maxCutFrames: input.maxCutFrames,
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
      name: "resolve_transcript_edit",
      description: `Resolve a spoken phrase into safe edit parameters for another tool, especially cut_section.
Use before destructive transcript-referenced edits such as "cut the pause after I say pricing is simple" or "remove where I say X".
Returns cut_section-ready startFrame/endFrame only when the phrase match is exact, unambiguous, and the requested range avoids cutting through spoken words. It never mutates the project by itself.`,
      schema: transcriptEditSchema,
    },
  );

  return [findTranscriptMoment, resolveTranscriptEdit];
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
  const candidates = findTranscriptMomentCandidates(words, query, {
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
  right: TranscriptSearchWord["source"],
): boolean {
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

  return words
    .filter((word) => word.word.trim() && word.endFrame > word.startFrame)
    .sort((a, b) => a.startFrame - b.startFrame || a.endFrame - b.endFrame);
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

  return transcriptionWords
    .map((word) => {
      const startSourceFrame = Math.round((word.startMs / 1000) * fps);
      const endSourceFrame = Math.max(startSourceFrame + 1, Math.round((word.endMs / 1000) * fps));
      const startFrame = clipFrom + (startSourceFrame - sourceStartFrame);
      const endFrame = clipFrom + (endSourceFrame - sourceStartFrame);
      return {
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
      } satisfies TranscriptSearchWord;
    })
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
      const startFrame = readWordFrame(rawWord, ["startFrame", "from"], overlayFrom, fps);
      const endFrame = readWordFrame(rawWord, ["endFrame", "to"], startFrame + Math.round(0.18 * fps), fps);
      const clampedStart = clampInt(startFrame, overlayFrom, overlayEnd);
      const clampedEnd = clampInt(Math.max(endFrame, clampedStart + 1), overlayFrom, overlayEnd);
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
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function readWordFrame(rawWord: any, frameKeys: string[], fallbackFrame: number, fps: number): number {
  for (const key of frameKeys) {
    const value = integerValue(rawWord?.[key]);
    if (typeof value === "number") return value;
  }
  const startMs = numberValue(rawWord?.startMs ?? rawWord?.start);
  if (typeof startMs === "number") {
    return Math.round(startMs > 1000 ? (startMs / 1000) * fps : startMs * fps);
  }
  return fallbackFrame;
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

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}