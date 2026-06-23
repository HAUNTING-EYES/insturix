import { createBrandSignalLearningEvent, type BrandSignalLearningEvent } from '@/lib/shared/brand-signal-edit-weighting';

type MetadataRecord = Record<string, unknown>;

export interface ClickatronCommitTaskContext {
  brandId?: string | null;
  projectId?: string | null;
  universalId?: string | null;
  sourceService?: string | null;
  sourceSessionId?: string | null;
  sourceScriptId?: string | null;
  metadata?: MetadataRecord | null;
}

export interface ClickatronCommitVariationContext {
  id: string;
  prompt?: string | null;
  imageRef?: string | null;
  thumbnailRef?: string | null;
  aspectRatio?: string | null;
  modelId?: string | null;
  metadata?: MetadataRecord | null;
}

export interface ClickatronCommitRequestContext {
  sessionId: string;
  variationId: string;
  thumbnailUrl: string;
  editronProjectId?: string | null;
  metadata?: {
    fileSize?: number;
    contentType?: string;
    aspectRatio?: string;
    dimensions?: string;
  } | null;
}

export interface ClickatronThumbnailLinkRecord {
  thumbnailId: string;
  sessionId: string;
  variationId: string;
  thumbnailUrl: string;
  imageRef?: string;
  thumbnailRef?: string;
  prompt?: string;
  aspectRatio?: string;
  modelId?: string;
  sourceService?: string;
  sourceSessionId?: string;
  sourceScriptId?: string;
  projectId?: string;
  brandId?: string;
  committedAt: string;
}

export interface ClickatronThumbnailCommitContext {
  thumbnailId: string;
  brandId?: string;
  projectId?: string;
  universalId?: string;
  linkRecord: ClickatronThumbnailLinkRecord;
  brandEventPayload: MetadataRecord;
  brandLearningEvents: BrandSignalLearningEvent[];
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function asRecord(value: unknown): MetadataRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as MetadataRecord)
    : undefined;
}

function compactRecord<T extends MetadataRecord>(record: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined && value !== null),
  ) as Partial<T>;
}

export function buildClickatronThumbnailCommitContext(
  task: ClickatronCommitTaskContext,
  variation: ClickatronCommitVariationContext,
  request: ClickatronCommitRequestContext,
  committedAt: Date = new Date(),
): ClickatronThumbnailCommitContext {
  const sourceContext = asRecord(task.metadata?.sourceContext);
  const thumbnailId = `clickatron:${request.sessionId}:${request.variationId}`;
  const brandId = nonEmptyString(task.brandId) || nonEmptyString(sourceContext?.brandId);
  const projectId =
    nonEmptyString(request.editronProjectId) ||
    nonEmptyString(task.projectId) ||
    nonEmptyString(sourceContext?.projectId);
  const universalId = nonEmptyString(task.universalId) || nonEmptyString(sourceContext?.universalId);
  const aspectRatio =
    nonEmptyString(request.metadata?.aspectRatio) ||
    nonEmptyString(variation.aspectRatio);
  const committedAtIso = committedAt.toISOString();
  const prompt = nonEmptyString(variation.prompt);
  const imageRef = nonEmptyString(variation.imageRef);
  const thumbnailRef = nonEmptyString(variation.thumbnailRef);
  const modelId = nonEmptyString(variation.modelId);

  const linkRecord = compactRecord({
    thumbnailId,
    sessionId: request.sessionId,
    variationId: request.variationId,
    thumbnailUrl: request.thumbnailUrl,
    imageRef,
    thumbnailRef,
    prompt,
    aspectRatio,
    modelId,
    sourceService: nonEmptyString(task.sourceService) || nonEmptyString(sourceContext?.sourceService),
    sourceSessionId: nonEmptyString(task.sourceSessionId) || nonEmptyString(sourceContext?.sourceSessionId),
    sourceScriptId: nonEmptyString(task.sourceScriptId) || nonEmptyString(sourceContext?.sourceScriptId),
    projectId,
    brandId,
    committedAt: committedAtIso,
  }) as ClickatronThumbnailLinkRecord;

  const brandEventPayload = compactRecord({
    thumbnailId,
    sessionId: request.sessionId,
    variationId: request.variationId,
    thumbnailUrl: request.thumbnailUrl,
    imageRef,
    thumbnailRef,
    prompt,
    aspectRatio,
    modelId,
    fileSize: request.metadata?.fileSize,
    contentType: nonEmptyString(request.metadata?.contentType),
    dimensions: nonEmptyString(request.metadata?.dimensions),
    sourceContext: compactRecord({
      sourceService: linkRecord.sourceService,
      sourceSessionId: linkRecord.sourceSessionId,
      sourceScriptId: linkRecord.sourceScriptId,
      universalId,
      projectId,
      brandId,
    }),
    committedAt: committedAtIso,
  });

  const brandLearningEvents = createClickatronThumbnailLearningEvents({
    thumbnailId,
    sessionId: request.sessionId,
    thumbnailUrl: request.thumbnailUrl,
    committedAt: committedAtIso,
    brandId,
    projectId,
    prompt,
    aspectRatio,
    modelId,
    imageRef,
    thumbnailRef,
  });

  return {
    thumbnailId,
    brandId,
    projectId,
    universalId,
    linkRecord,
    brandEventPayload,
    brandLearningEvents,
  };
}

function createClickatronThumbnailLearningEvents(args: {
  thumbnailId: string;
  sessionId: string;
  thumbnailUrl: string;
  committedAt: string;
  brandId?: string;
  projectId?: string;
  prompt?: string;
  aspectRatio?: string;
  modelId?: string;
  imageRef?: string;
  thumbnailRef?: string;
}): BrandSignalLearningEvent[] {
  if (!args.brandId || !args.thumbnailUrl.trim()) return [];

  return [createBrandSignalLearningEvent({
    service: 'clickatron',
    signalPath: 'assets.socialPreviewImages',
    editType: 'accepted_output_confirmation',
    scope: 'project',
    polarity: 'affirm',
    observedAt: args.committedAt,
    context: {
      brandId: args.brandId,
      projectId: args.projectId,
      contentId: args.sessionId,
      sourceId: args.thumbnailId,
      sourceUrl: args.thumbnailUrl,
    },
    afterValue: [args.thumbnailUrl],
    observedValue: compactRecord({
      prompt: args.prompt,
      aspectRatio: args.aspectRatio,
      modelId: args.modelId,
      imageRef: args.imageRef,
      thumbnailRef: args.thumbnailRef,
    }),
    note: 'Clickatron committed this thumbnail as a selected brand visual output.',
  })];
}
