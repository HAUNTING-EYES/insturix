import { tool } from "@langchain/core/tools";
import { z } from "zod";

import { assetResolver, type MediaAsset } from "../services/asset-resolver";
import { searchUserAssets, type AssetSearchResult } from "../services/asset-search-service";
import { projectService } from "../services/project-service";

type UserAssetType = "video" | "audio" | "image";

interface CreateChatAssetToolsOptions {
  userId: string;
  projectId: string;
}

interface TimelineAssetUsage {
  usedInProject: boolean;
  overlayIds: Array<string | number>;
  sceneIndexes: number[];
}

interface NormalizedAssetCandidate {
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

export function createChatAssetTools({ userId, projectId }: CreateChatAssetToolsOptions) {
  const listUserAssets = tool(
    async (input: z.infer<typeof listUserAssetsSchema>) => {
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

  return [listUserAssets, searchUserAssetsTool, inspectUserAsset];
}

async function getTimelineAssetUsage(userId: string, projectId: string): Promise<Map<string, TimelineAssetUsage>> {
  const usage = new Map<string, TimelineAssetUsage>();
  try {
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
