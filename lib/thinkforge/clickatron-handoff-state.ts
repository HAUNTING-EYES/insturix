import {
  normalizeClickatronCreativeSpec,
  type ClickatronCreativeKind,
  type ClickatronCreativeSpec,
  type ClickatronCreativeValidationIssue,
  type ClickatronPlatform,
  type ClickatronTextDensity,
  type ClickatronValidationStatus,
  type ClickatronVisualMode,
} from "@/lib/thinkforge/schemas/clickatron-creative-contract";
import { toNonEmptyString, type ThinkToClickContext } from "@/lib/thinkforge/clickatron-context";
import type { ThinkForgeBlock } from "@/lib/thinkforge/schemas/thinkforge-block";
import {
  resolveClickatronLogoOverlay,
  type ClickatronLogoOverlayPlacement,
  type ClickatronLogoOverlayScale,
  type ClickatronLogoOverlayTreatment,
} from "@/lib/clickatron/brand-logo-overlay-contract";

export type ThinkToClickHandoffStatus = ClickatronValidationStatus | "missing_sidecar";

export interface ThinkToClickUserVisualChoices {
  kind?: ClickatronCreativeKind;
  platform?: ClickatronPlatform;
  aspectRatio?: string;
  visualMode?: ClickatronVisualMode;
  textDensity?: ClickatronTextDensity;
  vibe?: string;
  imageStyle?: string;
  notes?: string;
  slideCount?: number | string;
  approvedVisualPlan?: boolean | string;
  logoTreatment?: ClickatronLogoOverlayTreatment;
  logoPlacement?: ClickatronLogoOverlayPlacement;
  logoScale?: ClickatronLogoOverlayScale;
}

export interface ThinkToClickSessionPayloadPreview {
  prompt: string;
  aspectRatio: string;
  kind: ClickatronCreativeKind;
  platform: ClickatronPlatform;
  assetIntent: ClickatronCreativeSpec["assetIntent"];
  readyToGenerate: boolean;
  sourceService: "thinkforge";
  sourceSessionId: string;
  sourceScriptId?: string;
  universalId?: string;
  brandId?: string;
  projectId?: string;
  metadata: Record<string, unknown>;
}

export interface ThinkToClickHandoffState {
  status: ThinkToClickHandoffStatus;
  canSendToClickatron: boolean;
  isBlocked: boolean;
  issues: ClickatronCreativeValidationIssue[];
  requiredUserInput: string[];
  approval?: {
    visualPlanRequired: boolean;
    visualPlanApproved: boolean;
    reasonCodes: string[];
  };
  display: {
    statusLabel: string;
    readinessCopy: string;
    kind?: ClickatronCreativeKind;
    platform?: ClickatronPlatform;
    aspectRatio?: string;
    assetIntent?: ClickatronCreativeSpec["assetIntent"];
    visualChoices?: Required<Pick<ThinkToClickUserVisualChoices, "kind" | "platform" | "aspectRatio" | "visualMode">> &
      Omit<ThinkToClickUserVisualChoices, "kind" | "platform" | "aspectRatio" | "visualMode">;
    objective?: string;
    coreMessage?: string;
    imagePrompt?: string;
    negativePrompt?: string;
    layoutIntent?: string;
    textPolicy?: ClickatronCreativeSpec["renderPlan"]["textPolicy"];
    slideCount: number;
    textLayerCount: number;
    brandConstraintCount: number;
    sourceSnippets: Array<{ label: string; kind?: ThinkForgeBlock["kind"]; found: boolean; text?: string }>;
    slides: Array<{ index: number; label: string; title?: string; imagePrompt: string; layoutIntent?: string; sourceLabels: string[] }>;
  };
  debug: {
    sourceBlockIds: string[];
    missingSourceBlockIds: string[];
    contentHash?: string;
    revisionId?: string;
    contentCardId?: string;
    campaignId?: string;
    calendarItemId?: string;
    seriesId?: string;
    sourceSessionId?: string;
    sourceScriptId?: string;
    error?: string;
    creativeSpec?: ClickatronCreativeSpec;
  };
  payloadPreview?: ThinkToClickSessionPayloadPreview;
}

export interface ThinkToClickHandoffInput {
  context: ThinkToClickContext;
  blocks?: ThinkForgeBlock[] | null;
  currentContentHash?: string | null;
  userVisualChoices?: ThinkToClickUserVisualChoices | null;
}

type SourceSummary = {
  sourceBlockIds: string[];
  missingSourceBlockIds: string[];
  snippets: ThinkToClickHandoffState["display"]["sourceSnippets"];
  labelByBlockId: Map<string, string>;
};

const STATUS_COPY: Record<ThinkToClickHandoffStatus, { label: string; readinessCopy: string }> = {
  ready: { label: "Ready", readinessCopy: "This ThinkForge output has a validated Clickatron brief." },
  needs_user_input: { label: "Needs user input", readinessCopy: "Clickatron needs a small visual choice before this can be sent." },
  stale: { label: "Stale", readinessCopy: "The handoff no longer matches the current ThinkForge content." },
  invalid: { label: "Invalid", readinessCopy: "The Clickatron handoff data is malformed and must be regenerated." },
  missing_sidecar: { label: "Missing sidecar", readinessCopy: "This ThinkForge output has no Clickatron creative sidecar yet." },
};

const VISUAL_PLAN_APPROVAL_ISSUE_CODES = new Set([
  "derived_from_visible_content",
  "carousel_slides_derived_from_single_prompt",
  "carousel_slides_recovered_from_visible_blocks",
]);

function hasApprovedVisualPlan(choices?: ThinkToClickUserVisualChoices | null): boolean {
  return choices?.approvedVisualPlan === true || choices?.approvedVisualPlan === "true";
}

function visualPlanApprovalReasonCodes(issues: ClickatronCreativeValidationIssue[]): string[] {
  return [...new Set(issues.map((issue) => issue.code).filter((code) => VISUAL_PLAN_APPROVAL_ISSUE_CODES.has(code)))];
}

export function buildThinkToClickHandoffState(input: ThinkToClickHandoffInput): ThinkToClickHandoffState {
  const parsed = readCreativeSpec(input.context);
  if (!parsed.spec) {
    const status = parsed.error ? "invalid" : "missing_sidecar";
    const issue = parsed.error
      ? issueOf("invalid_creative_spec", parsed.error, "error")
      : issueOf("missing_clickatron_sidecar", "No Clickatron creative sidecar was found in the ThinkForge handoff metadata.", "warning");
    return blockedState(input.context, status, [issue], parsed.error);
  }

  const source = summarizeSourceBlocks(parsed.spec, input.blocks);
  const validation = effectiveValidation(parsed.spec, input, source.missingSourceBlockIds);
  const payloadPreview = buildClickatronSessionPayloadPreview(input.context);
  if (!payloadPreview) {
    validation.status = "invalid";
    validation.issues.push(issueOf("missing_session_draft", "Clickatron session draft is missing from the ThinkForge context.", "error"));
  }

  const effectivePayloadPreview = payloadPreview
    ? { ...payloadPreview, readyToGenerate: validation.status === "ready" }
    : undefined;
  const canSendToClickatron = validation.status === "ready" && Boolean(effectivePayloadPreview?.readyToGenerate);
  return {
    status: validation.status,
    canSendToClickatron,
    isBlocked: !canSendToClickatron,
    issues: validation.issues,
    requiredUserInput: validation.requiredUserInput,
    ...(validation.approval ? { approval: validation.approval } : {}),
    display: displayFor(parsed.spec, validation.status, source, input.userVisualChoices),
    debug: debugFor(parsed.spec, input.context, source, parsed.error),
    ...(effectivePayloadPreview ? { payloadPreview: effectivePayloadPreview } : {}),
  };
}

export function buildClickatronSessionPayloadPreview(context: ThinkToClickContext): ThinkToClickSessionPayloadPreview | undefined {
  const draft = context.sessionDraft;
  if (!draft) return undefined;
  return compact({
    prompt: draft.prompt,
    aspectRatio: draft.aspectRatio,
    kind: draft.kind,
    platform: draft.platform,
    assetIntent: draft.assetIntent,
    readyToGenerate: draft.readyToGenerate,
    sourceService: "thinkforge" as const,
    sourceSessionId: context.sourceSessionId,
    sourceScriptId: context.sourceScriptId,
    universalId: context.universalId,
    brandId: context.brandId,
    projectId: context.projectId,
    metadata: draft.metadata || context.metadata,
  }) as ThinkToClickSessionPayloadPreview;
}

function summarizeSourceBlocks(spec: ClickatronCreativeSpec, blocks?: ThinkForgeBlock[] | null): SourceSummary {
  const sourceBlockIds = collectSourceBlockIds(spec);
  const blockById = new Map((blocks || []).map((block) => [block.id, block]));
  const labelByBlockId = new Map<string, string>();
  const snippets = sourceBlockIds.map((blockId, index) => {
    const block = blockById.get(blockId);
    const label = block ? `${labelKind(block.kind)} ${index + 1}` : `Source block ${index + 1}`;
    labelByBlockId.set(blockId, label);
    return compact({ label, kind: block?.kind, found: Boolean(block), text: block ? snippetFor(block) : undefined });
  }) as SourceSummary["snippets"];

  return {
    sourceBlockIds,
    missingSourceBlockIds: Array.isArray(blocks) ? sourceBlockIds.filter((blockId) => !blockById.has(blockId)) : [],
    snippets,
    labelByBlockId,
  };
}

function effectiveValidation(
  spec: ClickatronCreativeSpec,
  input: ThinkToClickHandoffInput,
  missingSourceBlockIds: string[],
): {
  status: ClickatronValidationStatus;
  issues: ClickatronCreativeValidationIssue[];
  requiredUserInput: string[];
  approval?: NonNullable<ThinkToClickHandoffState["approval"]>;
} {
  let status = spec.validation.status;
  const issues = [...(spec.validation.issues || [])];
  let requiredUserInput = [...(spec.validation.needsUserInput || [])];
  const storedHash = toNonEmptyString(spec.source.contentHash);
  const currentHash = toNonEmptyString(input.currentContentHash);

  if (storedHash && currentHash && storedHash !== currentHash) {
    status = status === "invalid" ? status : "stale";
    issues.push(issueOf("content_hash_mismatch", "The current ThinkForge content hash differs from the Clickatron sidecar.", "warning"));
  }
  if (missingSourceBlockIds.length > 0) {
    status = status === "invalid" ? status : "stale";
    issues.push(issueOf("source_blocks_missing", "One or more source blocks referenced by the sidecar are missing.", "warning"));
  }

  const reasonCodes = visualPlanApprovalReasonCodes(issues);
  const visualPlanRequired = status === "needs_user_input" && reasonCodes.length > 0;
  const visualPlanApproved = visualPlanRequired && hasApprovedVisualPlan(input.userVisualChoices);
  const approval = visualPlanRequired || visualPlanApproved
    ? { visualPlanRequired: true, visualPlanApproved, reasonCodes }
    : undefined;

  if (visualPlanApproved) {
    status = "ready";
    requiredUserInput = [];
    issues.push(issueOf("visual_plan_approved_by_user", "User reviewed and approved the derived Clickatron visual plan.", "info"));
  }

  const logoOverlay = resolveClickatronLogoOverlay(input.userVisualChoices);
  if (logoOverlay.status === "invalid") {
    if (status !== "invalid" && status !== "stale") status = "needs_user_input";
    requiredUserInput = [...new Set([...requiredUserInput, logoOverlay.message])];
    issues.push(issueOf("approved_logo_overlay_incomplete", logoOverlay.message, "warning"));
  }

  return { status, issues, requiredUserInput, ...(approval ? { approval } : {}) };
}

function displayFor(
  spec: ClickatronCreativeSpec,
  status: ThinkToClickHandoffStatus,
  source: SourceSummary,
  choices?: ThinkToClickUserVisualChoices | null,
): ThinkToClickHandoffState["display"] {
  const copy = STATUS_COPY[status];
  const slides = (spec.renderPlan.slides || []).map((slide) =>
    compact({
      index: slide.index,
      label: `Slide ${slide.index + 1}`,
      title: toNonEmptyString(slide.title),
      imagePrompt: slide.imagePrompt,
      layoutIntent: toNonEmptyString(slide.layoutIntent),
      sourceLabels: (slide.sourceBlockIds || []).map((blockId) => source.labelByBlockId.get(blockId) || "Source block"),
    }),
  ) as ThinkToClickHandoffState["display"]["slides"];

  return compact({
    statusLabel: copy.label,
    readinessCopy: copy.readinessCopy,
    kind: spec.kind,
    platform: spec.platform,
    aspectRatio: spec.aspectRatio,
    assetIntent: spec.assetIntent,
    visualChoices: resolvedChoices(spec, choices),
    objective: spec.creativeBrief.objective,
    coreMessage: spec.creativeBrief.coreMessage,
    imagePrompt: spec.renderPlan.imagePrompt,
    negativePrompt: toNonEmptyString(spec.renderPlan.negativePrompt),
    layoutIntent: toNonEmptyString(spec.renderPlan.layoutIntent),
    textPolicy: spec.renderPlan.textPolicy,
    slideCount: slides.length,
    textLayerCount: textLayerCount(spec),
    brandConstraintCount: (spec.brand?.hardConstraints?.length || 0) + (spec.brand?.softPreferences?.length || 0),
    sourceSnippets: source.snippets,
    slides,
  }) as ThinkToClickHandoffState["display"];
}

function blockedState(
  context: ThinkToClickContext,
  status: ThinkToClickHandoffStatus,
  issues: ClickatronCreativeValidationIssue[],
  error?: string,
): ThinkToClickHandoffState {
  const copy = STATUS_COPY[status];
  return {
    status,
    canSendToClickatron: false,
    isBlocked: true,
    issues,
    requiredUserInput: [],
    display: {
      statusLabel: copy.label,
      readinessCopy: copy.readinessCopy,
      slideCount: 0,
      textLayerCount: 0,
      brandConstraintCount: 0,
      sourceSnippets: [],
      slides: [],
    },
    debug: compact({ sourceBlockIds: [], missingSourceBlockIds: [], sourceSessionId: context.sourceSessionId, sourceScriptId: context.sourceScriptId, error }),
  };
}

function debugFor(spec: ClickatronCreativeSpec, context: ThinkToClickContext, source: SourceSummary, error?: string): ThinkToClickHandoffState["debug"] {
  return compact({
    sourceBlockIds: source.sourceBlockIds,
    missingSourceBlockIds: source.missingSourceBlockIds,
    contentHash: spec.source.contentHash,
    revisionId: spec.source.revisionId,
    contentCardId: spec.calendar?.contentCardId,
    campaignId: spec.calendar?.campaignId,
    calendarItemId: spec.calendar?.calendarItemId,
    seriesId: spec.calendar?.seriesId,
    sourceSessionId: spec.source.sourceSessionId || context.sourceSessionId,
    sourceScriptId: spec.source.sourceScriptId || context.sourceScriptId,
    error,
    creativeSpec: spec,
  });
}

function readCreativeSpec(context: ThinkToClickContext): { spec?: ClickatronCreativeSpec; error?: string } {
  const clickatron = recordOf(context.metadata.clickatron);
  if (!clickatron || clickatron.creativeSpec === undefined || clickatron.creativeSpec === null) return {};
  try {
    return { spec: normalizeClickatronCreativeSpec(clickatron.creativeSpec) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function resolvedChoices(spec: ClickatronCreativeSpec, choices?: ThinkToClickUserVisualChoices | null) {
  return compact({
    kind: choices?.kind || spec.kind,
    platform: choices?.platform || spec.platform,
    aspectRatio: toNonEmptyString(choices?.aspectRatio) || spec.aspectRatio,
    visualMode: choices?.visualMode || spec.userIntent.visualMode,
    textDensity: choices?.textDensity || spec.userIntent.textDensity,
    vibe: toNonEmptyString(choices?.vibe),
    imageStyle: toNonEmptyString(choices?.imageStyle),
    notes: toNonEmptyString(choices?.notes),
    slideCount: choices?.slideCount ?? (spec.kind === "carousel" ? spec.renderPlan.slides?.length : undefined),
    approvedVisualPlan: hasApprovedVisualPlan(choices) || undefined,
    logoTreatment: choices?.logoTreatment,
    logoPlacement: choices?.logoPlacement,
    logoScale: choices?.logoScale,
  });
}

function collectSourceBlockIds(spec: ClickatronCreativeSpec): string[] {
  const ids = [
    ...spec.source.sourceBlockIds,
    ...(spec.renderPlan.textLayers || []).map((layer) => layer.sourceBlockId),
    ...(spec.renderPlan.slides || []).flatMap((slide) => [
      ...(slide.sourceBlockIds || []),
      ...(slide.textLayers || []).map((layer) => layer.sourceBlockId),
    ]),
  ];
  return [...new Set(ids.map(toNonEmptyString).filter((id): id is string => Boolean(id)))];
}

function textLayerCount(spec: ClickatronCreativeSpec): number {
  return (spec.renderPlan.textLayers?.length || 0) + (spec.renderPlan.slides || []).reduce((count, slide) => count + (slide.textLayers?.length || 0), 0);
}

function snippetFor(block: ThinkForgeBlock): string | undefined {
  const text = toNonEmptyString(extractText(block.content)) || toNonEmptyString(block.scene?.visualDescription) || toNonEmptyString(block.meta?.goal);
  return text ? (text.length <= 160 ? text : `${text.slice(0, 157).trimEnd()}...`) : undefined;
}

function extractText(value: unknown): string {
  const chunks: string[] = [];
  const walk = (node: unknown) => {
    if (typeof node === "string") return chunks.push(node);
    if (Array.isArray(node)) return node.forEach(walk);
    if (!isRecord(node)) return;
    const text = toNonEmptyString(node.text);
    if (text) chunks.push(text);
    walk(node.content);
    walk(node.children);
  };
  walk(value);
  return chunks.join(" ").replace(/\s+/g, " ").trim();
}

function issueOf(code: string, message: string, severity: ClickatronCreativeValidationIssue["severity"]): ClickatronCreativeValidationIssue {
  return { code, message, severity };
}

function labelKind(kind: ThinkForgeBlock["kind"]): string {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

function recordOf(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compact<T extends Record<string, unknown>>(record: T): T {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined && value !== null)) as T;
}
