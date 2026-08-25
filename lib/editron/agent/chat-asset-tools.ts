import { tool } from "@langchain/core/tools";
import { z } from "zod";

import type { MediaAsset } from "../services/asset-resolver";
import type { AssetSearchResult } from "../services/asset-search-service";
import {
  resolveVerifiedUserMediaReplacementFormV1,
  userMediaReplacementOutsideTargetStateSha256V1,
  type UserMediaReplacementEvidenceV1,
  type VerifiedUserMediaReplacementFormV1,
} from "../services/user-media-replacement-form-v1";


export type UserAssetType = "video" | "audio" | "image";
type AddOverlayAssetType = "image" | "video" | "sound";

interface CreateChatAssetToolsOptions {
  userId: string;
  projectId: string;
}

interface TimelineAssetUsage {
  usedInProject: boolean;
  overlayIds: Array<string | number>;
  sceneIndexes: number[];
}

export interface NormalizedAssetCandidate {
  assetId: string;
  type: UserAssetType;
  name: string;
  duration?: number;
  dimensions?: { width: number; height: number };
  thumbnailHint: "available" | "missing";
  tags: string[];
  score: number;
  confidence: number;
  confidenceLabel: "high" | "medium" | "low";
  matchReasons: string[];
  usedInProject: boolean;
  overlayIds: Array<string | number>;
  sceneIndexes: number[];
  useWith: {
    tool: "use_matching_footage" | "add_overlay";
    assetId: string;
    note: string;
  };
}

export type UserAssetOverlayPlacement = "corner" | "center" | "full-frame";
export type UserAssetHorizontalAnchor = "left" | "center" | "right";
export type UserAssetVerticalAnchor = "top" | "center" | "bottom";
export type UserAssetTimingAnchor = "intro" | "outro" | "entire";
export type UserAssetOverlayOperation = "place" | "replace";
export type UserAssetOverlayStatus =
  | "ready"
  | "no-candidate"
  | "ambiguous"
  | "low-confidence"
  | "unsupported-type"
  | "no-target"
  | "unverified-replacement"
  | "conflicting-target";

export interface UserAssetOverlayOptions {
  query: string;
  operation?: UserAssetOverlayOperation;
  placement?: UserAssetOverlayPlacement;
  horizontal?: UserAssetHorizontalAnchor;
  vertical?: UserAssetVerticalAnchor;
  startFrame?: number;
  durationFrames?: number;
  startSeconds?: number;
  endSeconds?: number;
  durationSeconds?: number;
  timingAnchor?: UserAssetTimingAnchor;
  targetOverlayId?: string | number;
  targetSceneIndex?: number;
  sourceStartFrame?: number;
  /** Owner-issued evidence only. This is deliberately absent from the model tool schema. */
  replacementEvidence?: Readonly<UserMediaReplacementEvidenceV1>;
  minConfidence?: number;
  allowLowConfidence?: boolean;
}

export interface UserAssetOverlayResolution {
  status: UserAssetOverlayStatus;
  operation: UserAssetOverlayOperation;
  query: string;
  inferredType?: UserAssetType;
  placement: UserAssetOverlayPlacement;
  candidates: NormalizedAssetCandidate[];
  candidate?: NormalizedAssetCandidate;
  warnings: string[];
  message: string;
  useWith?: {
    add_overlay?: {
      type: AddOverlayAssetType;
      assetId: string;
      start: number;
      duration: number;
      x?: number;
      y?: number;
      width?: number;
      height?: number;
      styles?: Record<string, unknown>;
    };
    use_matching_footage?: {
      overlayId?: string | number;
      sceneIndex?: number;
      assetId: string;
      sourceStartFrame?: number;
    };
    /** Verified final form; the existing resolver remains the sole form owner. */
    verifiedReplacement?: Readonly<VerifiedUserMediaReplacementFormV1>;
  };
}

const assetTypeSchema = z.enum(["video", "audio", "image"]);

const listUserAssetsSchema = z.object({
  type: assetTypeSchema.optional().describe("Optional asset type filter."),
  limit: z.coerce.number().int().min(1).max(50).default(20).describe("Maximum assets to return."),
});

const searchUserAssetsSchema = z.object({
  query: z.string().min(1).describe("Natural-language description of the user's uploaded asset to find."),
  type: assetTypeSchema.optional().describe("Optional asset type filter. Infer this from words like logo=image, clip=video, music=audio."),
  limit: z.coerce.number().int().min(1).max(20).default(8).describe("Maximum candidates to return."),
  minScore: z.coerce.number().min(0).max(1).default(0.25).describe("Minimum confidence score."),
});

const inspectUserAssetSchema = z.object({
  assetId: z.string().min(1).describe("Asset ID returned by list_user_assets or search_user_assets."),
});

const resolveUserAssetOverlaySchema = z.object({
  query: z.string().min(1).describe("Natural-language description of the uploaded asset to place, such as 'my logo' or 'intro image'."),
  operation: z.enum(["place", "replace"]).default("place").describe("Place creates a new overlay. Replace swaps one exact existing video target while preserving its timeline timing and geometry."),
  type: assetTypeSchema.optional().describe("Optional asset type filter. Infer logo/image/photo as image, clip/footage as video, and music/audio as audio."),
  placement: z.enum(["corner", "center", "full-frame"]).default("corner").describe("Requested frame placement. Corner is appropriate for logo bugs; center/full-frame need explicit user intent."),
  horizontal: z.enum(["left", "center", "right"]).optional().describe("Explicit horizontal anchor for corner placement."),
  vertical: z.enum(["top", "center", "bottom"]).optional().describe("Explicit vertical anchor for corner placement."),
  startFrame: z.coerce.number().int().min(0).optional().describe("Timeline frame where the asset overlay should start. Defaults to the intro or outro position inferred from the query."),
  durationFrames: z.coerce.number().int().min(1).max(7200).optional().describe("Overlay duration in frames. Defaults to a short intro/logo dwell for images."),
  startSeconds: z.coerce.number().min(0).optional().describe("User-supplied timeline start in seconds. The server converts it using the project FPS."),
  endSeconds: z.coerce.number().min(0).optional().describe("User-supplied exclusive timeline end in seconds."),
  durationSeconds: z.coerce.number().positive().optional().describe("User-supplied overlay duration in seconds."),
  timingAnchor: z.enum(["intro", "outro", "entire"]).optional().describe("Semantic timeline anchor when the user supplied one instead of absolute seconds."),
  targetOverlayId: z.union([z.string(), z.number()]).optional().describe("Exact existing video overlay to replace. Prefer selectedOverlayId from trusted chat context."),
  targetSceneIndex: z.coerce.number().int().min(0).optional().describe("Compatibility target for a generated scene containing exactly one video overlay. Do not combine with targetOverlayId."),
  sourceStartFrame: z.coerce.number().int().min(0).optional().describe("Optional verified source frame where replacement playback begins. Omit rather than guessing when no source-range evidence exists."),
  minConfidence: z.coerce.number().min(0).max(1).default(0.65).describe("Minimum confidence required to auto-select one asset."),
  allowLowConfidence: z.boolean().default(false).describe("Allow returning add_overlay params even when the best asset candidate is below minConfidence."),
}).strict().superRefine((input, context) => {
  if (
    input.placement !== "corner"
    && (input.horizontal != null || input.vertical != null)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["placement"],
      message: "Horizontal and vertical anchors apply only to corner placement.",
    });
  }
  const hasFrameTiming = input.startFrame != null || input.durationFrames != null;
  const hasSecondTiming = input.startSeconds != null
    || input.endSeconds != null
    || input.durationSeconds != null;
  if (hasFrameTiming && hasSecondTiming) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["startSeconds"],
      message: "Supply timeline constraints in frames or seconds, not both.",
    });
  }
  if (
    input.startSeconds != null
    && input.endSeconds != null
    && input.endSeconds <= input.startSeconds
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["endSeconds"],
      message: "endSeconds must be greater than startSeconds.",
    });
  }
  if (
    input.startSeconds != null
    && input.endSeconds != null
    && input.durationSeconds != null
    && Math.abs((input.endSeconds - input.startSeconds) - input.durationSeconds) > 0.05
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["durationSeconds"],
      message: "durationSeconds must agree with explicit startSeconds and endSeconds.",
    });
  }
  if (
    input.timingAnchor != null
    && (input.startFrame != null || input.startSeconds != null || input.endSeconds != null)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["timingAnchor"],
      message: "Use a semantic timing anchor or an explicit start/end, not both.",
    });
  }
  if (
    input.timingAnchor === "entire"
    && (input.durationFrames != null || input.durationSeconds != null)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["timingAnchor"],
      message: "An entire-timeline placement cannot also specify a duration.",
    });
  }
});

export function createChatAssetTools({ userId, projectId }: CreateChatAssetToolsOptions) {
  const listUserAssets = tool(
    async (input: z.infer<typeof listUserAssetsSchema>) => {
      const { assetResolver } = await import("../services/asset-resolver");
      const usage = await getTimelineAssetUsage(userId, projectId);
      const page = await assetResolver.getUserAssets(userId, 1, input.limit);
      const assets = page.assets
        .filter((asset) => !input.type || asset.type === input.type)
        .map((asset) => normalizeAsset(asset, usage.get(asset.assetId), {
          score: 1,
          matchReasons: ["recent-user-asset"],
        }));

      return JSON.stringify({
        status: "success",
        data: {
          assets,
          total: page.total,
          returned: assets.length,
          message: assets.length
            ? `Found ${assets.length} uploaded asset candidates. Use assetId from these results instead of asking the user for an ID.`
            : "No uploaded assets found for that filter.",
        },
      });
    },
    {
      name: "list_user_assets",
      description: `List the user's uploaded media assets from the existing media library.
Use before asking for asset IDs. Returns assetId, type, name, duration, dimensions, thumbnail hint, tags, confidence, and timeline usage.`,
      schema: listUserAssetsSchema,
    },
  );

  const searchUserAssetsTool = tool(
    async (input: z.infer<typeof searchUserAssetsSchema>) => {
      const { searchUserAssets } = await import("../services/asset-search-service");
      const effectiveType = input.type ?? inferAssetType(input.query);
      const usage = await getTimelineAssetUsage(userId, projectId);
      const semanticResults = await searchUserAssets(userId, input.query, {
        type: effectiveType,
        minScore: input.minScore,
        limit: input.limit,
      });
      const lexicalResults = await searchUserAssetsLexically(userId, input.query, {
        type: effectiveType,
        minScore: input.minScore,
        limit: input.limit,
      });

      const merged = mergeAssetResults(semanticResults, lexicalResults)
        .slice(0, input.limit)
        .map((result) => normalizeSearchResult(result, usage.get(result.assetId)));

      return JSON.stringify({
        status: "success",
        data: {
          query: input.query,
          inferredType: effectiveType,
          assets: merged,
          returned: merged.length,
          message: merged.length
            ? `Found ${merged.length} uploaded asset candidates. For video scene replacement, pass the chosen assetId to use_matching_footage.`
            : `No uploaded assets matched "${input.query}". Try list_user_assets or a broader search phrase before asking the user for an asset ID.`,
        },
      });
    },
    {
      name: "search_user_assets",
      description: `Search the user's uploaded media library by natural language.
Use for requests like "use my logo", "use the clip where I am outside", "find my intro music", or any request that refers to the user's own uploaded assets without an asset ID.
For video scene replacement, use the returned assetId with use_matching_footage.`,
      schema: searchUserAssetsSchema,
    },
  );

  const inspectUserAsset = tool(
    async (input: z.infer<typeof inspectUserAssetSchema>) => {
      const { assetResolver } = await import("../services/asset-resolver");
      const asset = await assetResolver.getAsset(input.assetId, userId);
      if (!asset) {
        return JSON.stringify({ status: "error", message: `Asset not found: ${input.assetId}` });
      }

      const usage = await getTimelineAssetUsage(userId, projectId);
      const normalized = normalizeAsset(asset, usage.get(asset.assetId), {
        score: 1,
        matchReasons: ["direct-asset-inspection"],
      });

      return JSON.stringify({
        status: "success",
        data: {
          asset: {
            ...normalized,
            size: asset.size,
            source: asset.source,
            uploadedAt: asset.uploadedAt,
            analysisStatus: stringField(asset, "analysisStatus"),
            transcription: summarizeTranscription(asset),
          },
          message: `Inspected ${asset.filename}. Use this metadata to decide whether it fits the user's requested edit.`,
        },
      });
    },
    {
      name: "inspect_user_asset",
      description: `Inspect one uploaded media asset by assetId after list_user_assets or search_user_assets returns candidates.
Use this to check duration, dimensions, tags, transcription summary, and whether the asset is already on the current timeline.`,
      schema: inspectUserAssetSchema,
    },
  );

  const resolveUserAssetOverlay = tool(
    async (input: z.infer<typeof resolveUserAssetOverlaySchema>) => {
      const { assetResolver } = await import("../services/asset-resolver");
      const { searchUserAssets } = await import("../services/asset-search-service");
      const { projectService } = await import("../services/project-service");
      const effectiveType = input.type ?? inferAssetType(input.query);
      const usage = await getTimelineAssetUsage(userId, projectId);
      const project = await projectService.loadProject(userId, projectId);
      const exactAsset = await assetResolver.getAsset(input.query.trim(), userId);
      const exactCandidate = exactAsset && (!effectiveType || exactAsset.type === effectiveType)
        ? normalizeAsset(exactAsset, usage.get(exactAsset.assetId), {
            score: 1,
            matchReasons: ["direct-asset-id"],
          })
        : null;
      const candidates = exactCandidate
        ? [exactCandidate]
        : mergeAssetResults(
            await searchUserAssets(userId, input.query, {
              type: effectiveType,
              minScore: 0.2,
              limit: 8,
            }),
            await searchUserAssetsLexically(userId, input.query, {
              type: effectiveType,
              minScore: 0.2,
              limit: 8,
            }),
          )
          .slice(0, 8)
          .map((result) => normalizeSearchResult(result, usage.get(result.assetId)));
      const plan = resolveUserAssetOverlayPlacement(project, candidates, {
        query: input.query,
        operation: input.operation,
        placement: input.placement,
        horizontal: input.horizontal,
        vertical: input.vertical,
        startFrame: input.startFrame,
        durationFrames: input.durationFrames,
        startSeconds: input.startSeconds,
        endSeconds: input.endSeconds,
        durationSeconds: input.durationSeconds,
        timingAnchor: input.timingAnchor,
        targetOverlayId: input.targetOverlayId,
        targetSceneIndex: input.targetSceneIndex,
        sourceStartFrame: input.sourceStartFrame,
        minConfidence: input.minConfidence,
        allowLowConfidence: input.allowLowConfidence,
      });

      return JSON.stringify({
        status: plan.status === "ready" ? "success" : "error",
        data: {
          ...plan,
          searchedAssetCount: candidates.length,
        },
        message: plan.message,
      });
    },
    {
      name: "resolve_user_asset_overlay",
      description: `Resolve a natural-language uploaded-asset request into operation-ready parameters.
Use operation=place for requests like "use my logo in the corner during the intro". Use operation=replace plus one exact targetOverlayId or targetSceneIndex for "replace this clip with my uploaded footage".
This tool never mutates the project. It returns add_overlay or use_matching_footage only after the source and target are unambiguous.
If the best uploaded asset is low-confidence or ambiguous, ask the user to choose from returned candidates instead of guessing.`,
      schema: resolveUserAssetOverlaySchema,
    },
  );

  return [listUserAssets, searchUserAssetsTool, inspectUserAsset, resolveUserAssetOverlay];
}

export function resolveUserAssetOverlayPlacement(
  project: any,
  candidates: NormalizedAssetCandidate[],
  options: UserAssetOverlayOptions,
): UserAssetOverlayResolution {
  const operation = options.operation ?? "place";
  const placement = options.placement ?? inferPlacement(options.query);
  const minConfidence = clamp01(options.minConfidence ?? 0.65);
  const sorted = [...candidates]
    .filter((candidate) => candidate.assetId && candidate.type)
    .sort((a, b) => b.confidence - a.confidence || a.name.localeCompare(b.name));
  const warnings: string[] = [];

  if (!sorted.length) {
    return {
      status: "no-candidate",
      operation,
      query: options.query,
      inferredType: inferAssetType(options.query),
      placement,
      candidates: sorted,
      warnings,
      message: `No uploaded asset candidate matched "${options.query}".`,
    };
  }

  const candidate = sorted[0];
  const second = sorted[1];
  if (!candidate) {
    return {
      status: "no-candidate",
      operation,
      query: options.query,
      inferredType: inferAssetType(options.query),
      placement,
      candidates: sorted,
      warnings,
      message: `No uploaded asset candidate matched "${options.query}".`,
    };
  }

  if (second && candidate.confidence - second.confidence < 0.08) {
    return {
      status: "ambiguous",
      operation,
      query: options.query,
      inferredType: candidate.type,
      placement,
      candidates: sorted,
      candidate,
      warnings,
      message: `Uploaded asset request "${options.query}" is ambiguous between ${candidate.name} and ${second.name}. Ask the user to choose before placing an overlay.`,
    };
  }

  if (candidate.confidence < minConfidence && !options.allowLowConfidence) {
    return {
      status: "low-confidence",
      operation,
      query: options.query,
      inferredType: candidate.type,
      placement,
      candidates: sorted,
      candidate,
      warnings,
      message: `Best uploaded asset candidate "${candidate.name}" has confidence ${candidate.confidence}, below the ${minConfidence} auto-placement floor.`,
    };
  }

  if (operation === "replace") {
    if (candidate.type !== "video") {
      return {
        status: "unsupported-type",
        operation,
        query: options.query,
        inferredType: candidate.type,
        placement,
        candidates: sorted,
        candidate,
        warnings,
        message: `Uploaded asset "${candidate.name}" is ${candidate.type}; replacing timeline footage requires a video asset.`,
      };
    }
    const hasOverlayTarget = options.targetOverlayId != null;
    const hasSceneTarget = options.targetSceneIndex != null;
    if (hasOverlayTarget === hasSceneTarget) {
      return {
        status: hasOverlayTarget ? "conflicting-target" : "no-target",
        operation,
        query: options.query,
        inferredType: candidate.type,
        placement,
        candidates: sorted,
        candidate,
        warnings,
        message: hasOverlayTarget
          ? "Asset replacement received both targetOverlayId and targetSceneIndex. Supply exactly one target."
          : "Asset replacement needs targetOverlayId from the selected timeline clip or one unambiguous targetSceneIndex.",
      };
    }
    let verifiedReplacement: Readonly<VerifiedUserMediaReplacementFormV1> | undefined;
    if (options.replacementEvidence) {
      if (!hasOverlayTarget) {
        return {
          status: "unverified-replacement",
          operation,
          query: options.query,
          inferredType: candidate.type,
          placement,
          candidates: sorted,
          candidate,
          warnings,
          message: "Verified replacement requires one exact targetOverlayId; no mutation form was issued.",
        };
      }
      const targetOverlay = (project?.overlays ?? [])
        .find((overlay: any) => String(overlay.id) === String(options.targetOverlayId));
      if (!targetOverlay || targetOverlay.type !== "video") {
        return {
          status: "no-target",
          operation,
          query: options.query,
          inferredType: candidate.type,
          placement,
          candidates: sorted,
          candidate,
          warnings,
          message: `Verified replacement target ${String(options.targetOverlayId)} was not found as one video overlay.`,
        };
      }
      const verification = resolveVerifiedUserMediaReplacementFormV1({
        projectId: String(project.projectId),
        replacementAssetId: candidate.assetId,
        targetOverlay,
        outsideTargetStateSha256: userMediaReplacementOutsideTargetStateSha256V1(
          project as Record<string, unknown>,
          targetOverlay.id,
        ),
        evidence: options.replacementEvidence,
      });
      if (verification.status !== "READY") {
        return {
          status: "unverified-replacement",
          operation,
          query: options.query,
          inferredType: candidate.type,
          placement,
          candidates: sorted,
          candidate,
          warnings: [...warnings, verification.code],
          message: `Replacement evidence failed closed (${verification.code}); the existing overlay must remain unchanged.`,
        };
      }
      verifiedReplacement = verification.form;
    }
    return {
      status: "ready",
      operation,
      query: options.query,
      inferredType: candidate.type,
      placement,
      candidates: sorted,
      candidate,
      warnings,
      useWith: {
        ...(verifiedReplacement ? { verifiedReplacement } : {}),
        use_matching_footage: {
          ...(hasOverlayTarget ? { overlayId: options.targetOverlayId } : {}),
          ...(hasSceneTarget ? { sceneIndex: Math.round(options.targetSceneIndex!) } : {}),
          assetId: candidate.assetId,
          ...(options.sourceStartFrame != null
            ? { sourceStartFrame: Math.max(0, Math.round(options.sourceStartFrame)) }
            : {}),
        },
      },
      message: `Resolved "${options.query}" to replace the exact timeline target with uploaded video "${candidate.name}".`,
    };
  }

  const overlayType = assetTypeToAddOverlayType(candidate.type);
  if (!overlayType) {
    return {
      status: "unsupported-type",
      operation,
      query: options.query,
      inferredType: candidate.type,
      placement,
      candidates: sorted,
      candidate,
      warnings,
      message: `Uploaded asset type "${candidate.type}" cannot be placed with add_overlay.`,
    };
  }

  const range = resolveAssetOverlayRange(project, candidate, options);
  const geometry = overlayType === "sound"
    ? {}
    : resolveAssetOverlayGeometry(project, candidate, placement, options);
  const styles = overlayType === "image"
    ? { objectFit: "contain", opacity: 1 }
    : overlayType === "video"
      ? { objectFit: placement === "full-frame" ? "cover" : "contain", opacity: 1 }
      : { volume: 0.75 };

  if (candidate.confidence < minConfidence) {
    warnings.push(`Selected below confidence floor because allowLowConfidence=true (${candidate.confidence} < ${minConfidence}).`);
  }

  return {
    status: "ready",
    operation,
    query: options.query,
    inferredType: candidate.type,
    placement,
    candidates: sorted,
    candidate,
    warnings,
    useWith: {
      add_overlay: {
        type: overlayType,
        assetId: candidate.assetId,
        start: range.start,
        duration: range.duration,
        ...geometry,
        styles,
      },
    },
    message: `Resolved "${options.query}" to uploaded asset "${candidate.name}" for add_overlay.`,
  };
}
async function getTimelineAssetUsage(userId: string, projectId: string): Promise<Map<string, TimelineAssetUsage>> {
  const usage = new Map<string, TimelineAssetUsage>();
  try {
    const { projectService } = await import("../services/project-service");
    const project = await projectService.loadProject(userId, projectId);
    for (const overlay of project?.overlays ?? []) {
      const assetId = stringValue(
        (overlay as any)?.assetId
        ?? (overlay as any)?.sourceAssetId
        ?? (overlay as any)?.mediaId
        ?? (overlay as any)?.metadata?.assetId,
      );
      if (!assetId) continue;

      const existing = usage.get(assetId) ?? { usedInProject: true, overlayIds: [], sceneIndexes: [] };
      existing.overlayIds.push((overlay as any).id ?? "unknown");
      const sceneIndex = numberValue((overlay as any)?.metadata?.sceneIndex);
      if (typeof sceneIndex === "number" && !existing.sceneIndexes.includes(sceneIndex)) {
        existing.sceneIndexes.push(sceneIndex);
      }
      usage.set(assetId, existing);
    }
  } catch {
    return usage;
  }
  return usage;
}

async function searchUserAssetsLexically(
  userId: string,
  query: string,
  options: { type?: UserAssetType; minScore: number; limit: number },
): Promise<Array<AssetSearchResult & { matchReasons: string[] }>> {
  const { assetResolver } = await import("../services/asset-resolver");
  const page = await assetResolver.getUserAssets(userId, 1, 100);
  return page.assets
    .filter((asset) => !options.type || asset.type === options.type)
    .map((asset) => {
      const lexical = scoreAssetLexically(asset, query);
      return {
        assetId: asset.assetId,
        filename: asset.filename,
        type: asset.type,
        url: "",
        thumbnail: asset.thumbnail,
        duration: asset.duration,
        dimensions: asset.dimensions,
        tags: tagsFor(asset),
        score: lexical.score,
        matchReasons: lexical.matchReasons,
      };
    })
    .filter((result) => result.score >= options.minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, options.limit);
}

function mergeAssetResults(
  semanticResults: AssetSearchResult[],
  lexicalResults: Array<AssetSearchResult & { matchReasons?: string[] }>,
): Array<AssetSearchResult & { matchReasons?: string[] }> {
  const merged = new Map<string, AssetSearchResult & { matchReasons?: string[] }>();
  const allResults: Array<AssetSearchResult & { matchReasons?: string[] }> = [...semanticResults, ...lexicalResults];
  for (const result of allResults) {
    const existing = merged.get(result.assetId);
    if (!existing || result.score > existing.score) {
      merged.set(result.assetId, result);
    } else if (result.matchReasons?.length) {
      existing.matchReasons = Array.from(new Set([...(existing.matchReasons ?? []), ...result.matchReasons]));
    }
  }
  return Array.from(merged.values()).sort((a, b) => b.score - a.score);
}

function normalizeSearchResult(
  result: AssetSearchResult & { matchReasons?: string[] },
  usage?: TimelineAssetUsage,
): NormalizedAssetCandidate {
  return {
    assetId: result.assetId,
    type: result.type,
    name: result.filename,
    duration: result.duration,
    dimensions: result.dimensions,
    thumbnailHint: result.thumbnail ? "available" : "missing",
    tags: result.tags ?? [],
    score: roundConfidence(result.score),
    confidence: roundConfidence(result.score),
    confidenceLabel: confidenceLabel(result.score),
    matchReasons: result.matchReasons?.length ? result.matchReasons : ["semantic-or-tag-match"],
    usedInProject: usage?.usedInProject ?? false,
    overlayIds: usage?.overlayIds ?? [],
    sceneIndexes: usage?.sceneIndexes ?? [],
    useWith: useHint(result.assetId, result.type),
  };
}

function normalizeAsset(
  asset: MediaAsset,
  usage: TimelineAssetUsage | undefined,
  options: { score: number; matchReasons: string[] },
): NormalizedAssetCandidate {
  return {
    assetId: asset.assetId,
    type: asset.type,
    name: asset.filename,
    duration: asset.duration,
    dimensions: asset.dimensions,
    thumbnailHint: asset.thumbnail ? "available" : "missing",
    tags: tagsFor(asset),
    score: roundConfidence(options.score),
    confidence: roundConfidence(options.score),
    confidenceLabel: confidenceLabel(options.score),
    matchReasons: options.matchReasons,
    usedInProject: usage?.usedInProject ?? false,
    overlayIds: usage?.overlayIds ?? [],
    sceneIndexes: usage?.sceneIndexes ?? [],
    useWith: useHint(asset.assetId, asset.type),
  };
}

function scoreAssetLexically(asset: MediaAsset, query: string): { score: number; matchReasons: string[] } {
  const words = queryWords(query);
  const filename = asset.filename.toLowerCase();
  const tags = tagsFor(asset).map((tag) => tag.toLowerCase());
  const haystack = [filename, ...tags].join(" ");
  const matches = words.filter((word) => haystack.includes(word));
  const exactTag = tags.some((tag) => tag.includes(query.toLowerCase()));
  const exactFilename = filename.includes(query.toLowerCase());

  let score = matches.length / Math.max(words.length, 1);
  if (exactTag) score = Math.max(score, 0.9);
  if (exactFilename) score = Math.max(score, 0.8);

  const matchReasons: string[] = [];
  if (exactFilename) matchReasons.push("filename");
  if (exactTag) matchReasons.push("tag");
  if (matches.length) matchReasons.push("query-words");

  return { score: Math.min(score, 0.95), matchReasons };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function assetTypeToAddOverlayType(type: UserAssetType): AddOverlayAssetType | undefined {
  if (type === "image") return "image";
  if (type === "video") return "video";
  if (type === "audio") return "sound";
  return undefined;
}

function inferPlacement(query: string): UserAssetOverlayPlacement {
  const lower = query.toLowerCase();
  if (/\b(full[- ]?frame|cover|background|entire screen)\b/.test(lower)) return "full-frame";
  if (/\b(center|middle|logo reveal|end card)\b/.test(lower)) return "center";
  return "corner";
}

function resolveAssetOverlayRange(
  project: any,
  candidate: NormalizedAssetCandidate,
  options: UserAssetOverlayOptions,
): { start: number; duration: number } {
  const fps = positiveNumber(project?.fps) ?? 30;
  const projectDuration = positiveNumber(project?.durationInFrames) ?? Math.round(fps * 10);
  const defaultDuration = candidate.type === "audio"
    ? Math.min(projectDuration, Math.max(1, Math.round((candidate.duration ?? 3) * fps)))
    : Math.min(projectDuration, Math.round(fps * 3));
  if (options.timingAnchor === "entire") {
    return { start: 0, duration: Math.max(1, Math.round(projectDuration)) };
  }

  const explicitStart = options.startFrame
    ?? frameFromSeconds(options.startSeconds, fps);
  const explicitEnd = frameFromSeconds(options.endSeconds, fps);
  const requestedDuration = options.durationFrames
    ?? frameFromSeconds(options.durationSeconds, fps)
    ?? (
      explicitEnd != null && explicitStart != null
        ? explicitEnd - explicitStart
        : explicitEnd
    )
    ?? defaultDuration;
  const boundedDuration = clampInt(requestedDuration, 1, Math.max(1, projectDuration));
  const lower = options.query.toLowerCase();
  const inferredOutro = options.timingAnchor === "outro"
    || /\b(outro|ending|closing|end card|final)\b/.test(lower);
  const inferredStart = inferredOutro
    ? Math.max(0, projectDuration - boundedDuration)
    : explicitEnd != null && options.durationSeconds != null
      ? Math.max(0, explicitEnd - boundedDuration)
      : 0;
  const start = clampInt(
    explicitStart ?? inferredStart,
    0,
    Math.max(0, projectDuration - 1),
  );
  const duration = clampInt(
    boundedDuration,
    1,
    Math.max(1, projectDuration - start),
  );
  return { start, duration };
}

function resolveAssetOverlayGeometry(
  project: any,
  candidate: NormalizedAssetCandidate,
  placement: UserAssetOverlayPlacement,
  options: UserAssetOverlayOptions,
): { x: number; y: number; width: number; height: number } {
  const canvas = canvasDimensions(project);
  if (placement === "full-frame") {
    return { x: 0, y: 0, width: canvas.width, height: canvas.height };
  }

  const aspect = positiveNumber(candidate.dimensions?.width) && positiveNumber(candidate.dimensions?.height)
    ? candidate.dimensions!.width / candidate.dimensions!.height
    : 2.4;
  const width = placement === "center"
    ? clampInt(Math.round(canvas.width * 0.28), 180, Math.round(canvas.width * 0.5))
    : clampInt(Math.round(canvas.width * 0.14), 96, 260);
  const height = clampInt(Math.round(width / Math.max(0.5, aspect)), 36, Math.round(canvas.height * 0.24));

  if (placement === "center") {
    return {
      x: Math.round((canvas.width - width) / 2),
      y: Math.round((canvas.height - height) / 2),
      width,
      height,
    };
  }

  const marginX = Math.round(canvas.width * 0.04);
  const marginY = Math.round(canvas.height * 0.05);
  const lower = options.query.toLowerCase();
  const horizontal = options.horizontal
    ?? (/\b(left)\b/.test(lower) ? "left" : "right");
  const vertical = options.vertical
    ?? (/\b(top|upper)\b/.test(lower) ? "top" : "bottom");
  return {
    x: horizontal === "left"
      ? marginX
      : horizontal === "center"
        ? Math.round((canvas.width - width) / 2)
        : Math.max(0, canvas.width - width - marginX),
    y: vertical === "top"
      ? marginY
      : vertical === "center"
        ? Math.round((canvas.height - height) / 2)
        : Math.max(0, canvas.height - height - marginY),
    width,
    height,
  };
}

function frameFromSeconds(seconds: number | undefined, fps: number): number | undefined {
  return seconds == null ? undefined : Math.round(seconds * fps);
}

function canvasDimensions(project: any): { width: number; height: number } {
  const width = positiveNumber(project?.dimensions?.width ?? project?.width ?? project?.canvas?.width) ?? 1920;
  const height = positiveNumber(project?.dimensions?.height ?? project?.height ?? project?.canvas?.height) ?? 1080;
  return { width, height };
}

function positiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}
function inferAssetType(query: string): UserAssetType | undefined {
  const lower = query.toLowerCase();
  if (/\b(logo|image|photo|picture|thumbnail|sticker|poster|graphic)\b/.test(lower)) return "image";
  if (/\b(music|song|audio|sound|sfx|voice|voiceover|beat)\b/.test(lower)) return "audio";
  if (/\b(video|clip|footage|b-roll|broll|scene|shot|outside|screen recording)\b/.test(lower)) return "video";
  return undefined;
}

function useHint(assetId: string, type: UserAssetType): NormalizedAssetCandidate["useWith"] {
  if (type === "video") {
    return {
      tool: "use_matching_footage",
      assetId,
      note: "Use when replacing an existing generated scene; provide the sceneIndex plus this assetId.",
    };
  }
  return {
    tool: "add_overlay",
    assetId,
    note: "Use add_overlay with this assetId when placing this uploaded asset on the timeline.",
  };
}

function summarizeTranscription(asset: MediaAsset): { segmentCount: number; wordCount: number; sampleText?: string } | undefined {
  const transcription = asset.transcription as any;
  if (!transcription) return undefined;
  const segments = Array.isArray(transcription.segments) ? transcription.segments : [];
  const words = Array.isArray(transcription.words) ? transcription.words : [];
  const sampleText = stringValue(transcription.text)
    ?? segments.map((segment: any) => stringValue(segment?.text)).filter(Boolean).slice(0, 3).join(" ");
  return {
    segmentCount: segments.length,
    wordCount: words.length,
    sampleText: sampleText ? sampleText.slice(0, 240) : undefined,
  };
}

function tagsFor(asset: MediaAsset): string[] {
  const tags = (asset as any).tags;
  return Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === "string").slice(0, 12) : [];
}

function queryWords(query: string): string[] {
  return query.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2);
}

function confidenceLabel(score: number): NormalizedAssetCandidate["confidenceLabel"] {
  if (score >= 0.75) return "high";
  if (score >= 0.45) return "medium";
  return "low";
}

function roundConfidence(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 1000) / 1000;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringField(asset: MediaAsset, key: string): string | undefined {
  return stringValue((asset as any)[key]);
}
