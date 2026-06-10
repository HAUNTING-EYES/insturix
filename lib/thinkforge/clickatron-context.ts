import type { ProjectLink } from "@/lib/shared/project-links";
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
] as const;

export interface ThinkToClickContextInput {
  sessionId: string;
  scriptId?: string;
  projectId?: string;
  projectMeta?: ProjectMeta | null;
  projectLink?: Pick<ProjectLink, "universalId" | "brandId" | "sourceScriptId"> | null;
  title?: string;
  aspectRatio?: string;
  scenesCount?: number;
}

export interface ThinkToClickContext {
  sourceService: "thinkforge";
  sourceSessionId: string;
  sourceScriptId?: string;
  universalId?: string;
  brandId?: string;
  projectId?: string;
  metadata: Record<string, unknown>;
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
    aspectRatio: toNonEmptyString(input.aspectRatio),
    scenesCount: typeof input.scenesCount === "number" ? input.scenesCount : undefined,
  });

  const metadata = compactRecord({
    handoff: "think-to-click",
    sourceContext,
    thinkforge: compactRecord({
      sessionId: sourceSessionId,
      scriptId: sourceScriptId,
      projectMeta,
    }),
    projectLink: universalId ? { universalId } : undefined,
    clickatron: Object.keys(clickatron).length > 0 ? clickatron : undefined,
  });

  return {
    sourceService: "thinkforge",
    sourceSessionId,
    ...(sourceScriptId ? { sourceScriptId } : {}),
    ...(universalId ? { universalId } : {}),
    ...(brandId ? { brandId } : {}),
    ...(projectId ? { projectId } : {}),
    metadata,
  };
}
