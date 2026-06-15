import type { ProjectLink } from "@/lib/shared/project-links";
import {
  normalizeClickatronCreativeSpec,
  type ClickatronCreativeSpec,
  type ClickatronCreativeValidation,
} from "@/lib/thinkforge/schemas/clickatron-creative-contract";
import type { ThinkForgeBlock } from "@/lib/thinkforge/schemas/thinkforge-block";
import type { ProjectMeta } from "@/lib/thinkforge/state/types";

const PROJECT_META_KEYS = [
  "idea",
  "purpose",
  "style",
  "format",
  "platform",
  "tone",
  "sessionName",
  "brandId",
  "brandBrief",
  "clientId",
  "clientName",
  "campaignId",
  "campaignName",
  "seriesId",
  "calendarItemId",
  "contentCardId",
] as const;

export interface ThinkToClickContextInput {
  sessionId: string;
  scriptId?: string;
  projectId?: string;
  projectMeta?: ProjectMeta | null;
  projectLink?: Pick<ProjectLink, "universalId" | "brandId" | "sourceScriptId"> | null;
  creativeSpec?: ClickatronCreativeSpec | null;
  signalTrace?: unknown;
  title?: string;
  aspectRatio?: string;
  scenesCount?: number;
}

export interface ThinkToClickSessionDraft {
  prompt: string;
  aspectRatio: string;
  kind: ClickatronCreativeSpec["kind"];
  platform: ClickatronCreativeSpec["platform"];
  assetIntent: ClickatronCreativeSpec["assetIntent"];
  readyToGenerate: boolean;
  validation: ClickatronCreativeValidation;
  metadata: Record<string, unknown>;
}

export interface ThinkToClickContext {
  sourceService: "thinkforge";
  sourceSessionId: string;
  sourceScriptId?: string;
  universalId?: string;
  brandId?: string;
  projectId?: string;
  metadata: Record<string, unknown>;
  sessionDraft?: ThinkToClickSessionDraft;
}

export function toNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function pickThinkForgeProjectMeta(projectMeta?: ProjectMeta | null): Record<string, unknown> | undefined {
  if (!projectMeta) return undefined;

  const picked = PROJECT_META_KEYS.reduce<Record<string, unknown>>((acc, key) => {
    const value = projectMeta[key];
    if (typeof value === "string" && value.trim().length > 0) {
      acc[key] = value.trim();
    }
    return acc;
  }, {});

  return Object.keys(picked).length > 0 ? picked : undefined;
}

function compactRecord<T extends Record<string, unknown>>(record: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined && value !== null),
  ) as Partial<T>;
}

function toPlainRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

export function findClickatronCreativeSpecInBlocks(blocks?: ThinkForgeBlock[] | null): ClickatronCreativeSpec | undefined {
  if (!Array.isArray(blocks)) return undefined;
  for (const block of blocks) {
    const candidate = block.exportMeta?.clickatron;
    if (candidate) {
      return normalizeClickatronCreativeSpec(candidate);
    }
  }
  return undefined;
}

function buildClickatronSessionPrompt(creativeSpec: ClickatronCreativeSpec): string {
  const slideLines = creativeSpec.renderPlan.slides?.map((slide) => {
    const title = toNonEmptyString(slide.title);
    return `Slide ${slide.index + 1}${title ? ` (${title})` : ""}: ${slide.imagePrompt}`;
  });

  return [
    creativeSpec.renderPlan.imagePrompt,
    creativeSpec.renderPlan.layoutIntent ? `Layout intent: ${creativeSpec.renderPlan.layoutIntent}` : undefined,
    slideLines && slideLines.length > 0 ? `Carousel slide plan:\n${slideLines.join("\n")}` : undefined,
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 4000);
}

function buildClickatronSessionDraft(
  creativeSpec: ClickatronCreativeSpec | undefined,
  metadata: Record<string, unknown>,
): ThinkToClickSessionDraft | undefined {
  if (!creativeSpec) return undefined;
  return {
    prompt: buildClickatronSessionPrompt(creativeSpec),
    aspectRatio: creativeSpec.aspectRatio,
    kind: creativeSpec.kind,
    platform: creativeSpec.platform,
    assetIntent: creativeSpec.assetIntent,
    readyToGenerate: creativeSpec.validation.status === "ready",
    validation: creativeSpec.validation,
    metadata,
  };
}

export function buildThinkToClickContext(input: ThinkToClickContextInput): ThinkToClickContext {
  const sourceSessionId = toNonEmptyString(input.sessionId);
  if (!sourceSessionId) {
    throw new Error("ThinkForge sessionId is required for Clickatron handoff");
  }

  const sourceScriptId =
    toNonEmptyString(input.scriptId) ||
    toNonEmptyString(input.projectLink?.sourceScriptId);
  const brandId =
    toNonEmptyString(input.projectMeta?.brandId) ||
    toNonEmptyString(input.projectLink?.brandId);
  const universalId = toNonEmptyString(input.projectLink?.universalId);
  const projectId = toNonEmptyString(input.projectId);
  const projectMeta = pickThinkForgeProjectMeta(input.projectMeta);
  const creativeSpec = input.creativeSpec
    ? normalizeClickatronCreativeSpec(input.creativeSpec)
    : undefined;
  const signalTrace = toPlainRecord(input.signalTrace);

  const sourceContext = compactRecord({
    sourceService: "thinkforge",
    sourceSessionId,
    sourceScriptId,
    universalId,
    brandId,
    projectId,
  });

  const clickatron = compactRecord({
    title: toNonEmptyString(input.title),
    aspectRatio: toNonEmptyString(creativeSpec?.aspectRatio) || toNonEmptyString(input.aspectRatio),
    scenesCount: typeof input.scenesCount === "number" ? input.scenesCount : undefined,
    creativeSpec,
  });

  const metadata = compactRecord({
    handoff: "think-to-click",
    sourceContext,
    thinkforge: compactRecord({
      sessionId: sourceSessionId,
      scriptId: sourceScriptId,
      projectMeta,
      signalTrace,
    }),
    projectLink: universalId ? { universalId } : undefined,
    clickatron: Object.keys(clickatron).length > 0 ? clickatron : undefined,
  });
  const sessionDraft = buildClickatronSessionDraft(creativeSpec, metadata);

  return {
    sourceService: "thinkforge",
    sourceSessionId,
    ...(sourceScriptId ? { sourceScriptId } : {}),
    ...(universalId ? { universalId } : {}),
    ...(brandId ? { brandId } : {}),
    ...(projectId ? { projectId } : {}),
    metadata,
    ...(sessionDraft ? { sessionDraft } : {}),
  };
}
