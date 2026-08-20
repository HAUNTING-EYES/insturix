import {
  THINKFORGE_CAROUSEL_AUTHORING_BATCH_MAX_SLIDES,
  THINKFORGE_CAROUSEL_MIN_SLIDES,
} from '../schemas/carousel-capabilities';
import { THINKFORGE_MAX_PRODUCTION_OUTPUT_DURATION_SECONDS } from '../production/output-duration-capability';

export type ContentCardStatus = 'scheduled' | 'draft' | 'published' | 'in_production';
export type ContentPlanningClickatronStatus =
  | 'not_needed'
  | 'missing_sidecar'
  | 'needs_user_input'
  | 'ready'
  | 'sent'
  | 'generated'
  | 'stale'
  | 'invalid';

export interface ContentCardPublishWindow {
  start?: string;
  end?: string;
  timezone?: string;
  label?: string;
}

export interface ContentCardTrendContext {
  trendId?: string;
  source: 'manual' | 'public_trend' | 'news' | 'meme' | 'social' | string;
  title: string;
  summary?: string;
  url?: string;
  provenance: string[];
  nicheMatch?: number;
  brandFit?: number;
  expiresAt?: string;
  repurposingAngle?: string;
  status?: 'suggested' | 'accepted' | 'dismissed' | 'expired';
}

export interface ContentCardClickatronState {
  status: ContentPlanningClickatronStatus;
  creativeSpecId?: string;
  sessionId?: string;
  sourceScriptId?: string;
  lastHandoffAt?: string;
  notes?: string;
}

export interface ContentCardIdeaSnapshot {
  id?: string | number;
  idea: string;
  purpose: string;
  style: string;
  format: string;
  platform: string;
  tone: string;
}

export interface ContentCard {
  id: string;
  title: string;
  date: string;
  platform: 'youtube' | 'instagram' | 'linkedin' | string;
  status: ContentCardStatus;
  /** CalOS editorial stage (display-only; set by toContentCard from the deliverable column). */
  editorialStatus?: string;
  /** CalOS image fields (display-only; projected by toContentCard from deliverable columns). The
   *  finished still, the pending image prompt, and the derived lifecycle that drives the modal's
   *  "Make image" action. Never written back into the stored card. */
  assetUrl?: string | null;
  imagePrompt?: string | null;
  imageStatus?: 'none' | 'promptReady' | 'generating' | 'ready' | 'failed';
  imageError?: string | null;
  tags: string[];
  aiScore?: number;
  ideaId?: string;
  sessionId?: string;
  scriptPreview?: string;
  customTags: string[];
  idea?: ContentCardIdeaSnapshot;
  details?: string;
  plannedDates: string[];
  createdAt?: string;
  updatedAt?: string;
  brandId?: string;
  projectId?: string;
  clientId?: string;
  clientName?: string;
  campaignId?: string;
  campaignName?: string;
  seriesId?: string;
  calendarItemId?: string;
  contentFormat?: string;
  /** Exact user-owned carousel form. Required by CalOS before carousel generation. */
  carouselSlideCount?: number;
  /** User-requested runtime input. Editron/ThinkForge production-brief resolution remains authoritative. */
  targetDurationSeconds?: number;
  publishWindow?: ContentCardPublishWindow;
  trendContext?: ContentCardTrendContext;
  clickatron?: ContentCardClickatronState;
}

export type ContentCardStorageRecord = ContentCard & { userId: string };
export interface NormalizeContentCardOptions {
  userId: string;
  now?: Date | string;
  idFactory?: () => string;
}

export class ContentCardValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContentCardValidationError';
  }
}

export function isContentCardValidationError(error: unknown): error is ContentCardValidationError {
  return error instanceof ContentCardValidationError;
}

export function normalizeContentCardForStorage(input: unknown, options: NormalizeContentCardOptions): ContentCardStorageRecord {
  const record = requireRecord(input, 'content card');
  const now = isoNow(options.now);
  const plannedDates = readStringArray(record.plannedDates, 'plannedDates')
    ?? (readOptionalString(record.date, 'date') ? [readString(record.date, 'date')] : [now]);
  const card = compact({
    id: readOptionalString(record.id, 'id') ?? options.idFactory?.() ?? defaultCardId(),
    title: readString(record.title, 'title'),
    date: readOptionalString(record.date, 'date') ?? plannedDates[0] ?? now,
    platform: readOptionalString(record.platform, 'platform') ?? 'generic',
    status: normalizeStatus(record.status),
    tags: readStringArray(record.tags, 'tags') ?? [],
    aiScore: normalizeScore(record.aiScore),
    ideaId: readOptionalString(record.ideaId, 'ideaId'),
    sessionId: readOptionalString(record.sessionId, 'sessionId'),
    scriptPreview: readOptionalString(record.scriptPreview, 'scriptPreview'),
    customTags: readStringArray(record.customTags, 'customTags') ?? [],
    idea: normalizeIdea(record.idea),
    details: readOptionalString(record.details, 'details'),
    plannedDates,
    createdAt: readOptionalString(record.createdAt, 'createdAt') ?? now,
    updatedAt: readOptionalString(record.updatedAt, 'updatedAt') ?? now,
    brandId: readOptionalString(record.brandId, 'brandId'),
    projectId: readOptionalString(record.projectId, 'projectId'),
    clientId: readOptionalString(record.clientId, 'clientId'),
    clientName: readOptionalString(record.clientName, 'clientName'),
    campaignId: readOptionalString(record.campaignId, 'campaignId'),
    campaignName: readOptionalString(record.campaignName, 'campaignName'),
    seriesId: readOptionalString(record.seriesId, 'seriesId'),
    calendarItemId: readOptionalString(record.calendarItemId, 'calendarItemId'),
    contentFormat: readOptionalString(record.contentFormat, 'contentFormat'),
    carouselSlideCount: normalizeCarouselSlideCount(record.carouselSlideCount),
    targetDurationSeconds: normalizeTargetDuration(record.targetDurationSeconds),
    publishWindow: normalizePublishWindow(record.publishWindow),
    trendContext: normalizeTrendContext(record.trendContext),
    clickatron: normalizeClickatronState(record.clickatron),
    userId: options.userId,
  });
  return card as ContentCardStorageRecord;
}

export function mergeContentCardUpdate(existing: unknown, updates: unknown, options: NormalizeContentCardOptions): ContentCardStorageRecord {
  const existingCard = normalizeContentCardForStorage(existing, options);
  return normalizeContentCardForStorage(
    {
      ...existingCard,
      ...requireRecord(updates, 'updates'),
      id: existingCard.id,
      userId: options.userId,
      createdAt: existingCard.createdAt,
      updatedAt: isoNow(options.now),
    },
    options,
  );
}

export function contentCardClientView(record: ContentCardStorageRecord): ContentCard {
  const { userId: _userId, ...card } = record;
  return card;
}

function normalizeStatus(value: unknown): ContentCardStatus {
  const status = readOptionalString(value, 'status') ?? 'draft';
  return status === 'scheduled' || status === 'draft' || status === 'published' || status === 'in_production'
    ? status
    : 'draft';
}

function normalizeClickatronState(value: unknown): ContentCardClickatronState {
  const record = isRecord(value) ? value : {};
  const status = readOptionalString(record.status, 'clickatron.status') ?? 'not_needed';
  const validStatus = [
    'not_needed',
    'missing_sidecar',
    'needs_user_input',
    'ready',
    'sent',
    'generated',
    'stale',
    'invalid',
  ].includes(status) ? status as ContentPlanningClickatronStatus : 'not_needed';
  return compact({
    status: validStatus,
    creativeSpecId: readOptionalString(record.creativeSpecId, 'clickatron.creativeSpecId'),
    sessionId: readOptionalString(record.sessionId, 'clickatron.sessionId'),
    sourceScriptId: readOptionalString(record.sourceScriptId, 'clickatron.sourceScriptId'),
    lastHandoffAt: readOptionalString(record.lastHandoffAt, 'clickatron.lastHandoffAt'),
    notes: readOptionalString(record.notes, 'clickatron.notes'),
  }) as ContentCardClickatronState;
}

function normalizePublishWindow(value: unknown): ContentCardPublishWindow | undefined {
  if (!isRecord(value)) return undefined;
  const result = compact({
    start: readOptionalString(value.start, 'publishWindow.start'),
    end: readOptionalString(value.end, 'publishWindow.end'),
    timezone: readOptionalString(value.timezone, 'publishWindow.timezone'),
    label: readOptionalString(value.label, 'publishWindow.label'),
  });
  return Object.keys(result).length ? result as ContentCardPublishWindow : undefined;
}

function normalizeTrendContext(value: unknown): ContentCardTrendContext | undefined {
  if (!isRecord(value)) return undefined;
  const title = readOptionalString(value.title, 'trendContext.title');
  if (!title) return undefined;
  const status = readOptionalString(value.status, 'trendContext.status');
  return compact({
    trendId: readOptionalString(value.trendId, 'trendContext.trendId'),
    source: readOptionalString(value.source, 'trendContext.source') ?? 'manual',
    title,
    summary: readOptionalString(value.summary, 'trendContext.summary'),
    url: readOptionalString(value.url, 'trendContext.url'),
    provenance: readStringArray(value.provenance, 'trendContext.provenance') ?? [],
    nicheMatch: normalizeRatio(value.nicheMatch),
    brandFit: normalizeRatio(value.brandFit),
    expiresAt: readOptionalString(value.expiresAt, 'trendContext.expiresAt'),
    repurposingAngle: readOptionalString(value.repurposingAngle, 'trendContext.repurposingAngle'),
    status: status === 'suggested' || status === 'accepted' || status === 'dismissed' || status === 'expired' ? status : undefined,
  }) as ContentCardTrendContext;
}

function normalizeIdea(value: unknown): ContentCardIdeaSnapshot | undefined {
  if (!isRecord(value)) return undefined;
  const idea = readOptionalString(value.idea, 'idea.idea');
  if (!idea) return undefined;
  return compact({
    id: typeof value.id === 'number' ? value.id : readOptionalString(value.id, 'idea.id'),
    idea,
    purpose: readOptionalString(value.purpose, 'idea.purpose') ?? '',
    style: readOptionalString(value.style, 'idea.style') ?? '',
    format: readOptionalString(value.format, 'idea.format') ?? '',
    platform: readOptionalString(value.platform, 'idea.platform') ?? '',
    tone: readOptionalString(value.tone, 'idea.tone') ?? '',
  }) as ContentCardIdeaSnapshot;
}

function readStringArray(value: unknown, field: string): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) throw new ContentCardValidationError(`${field} must be an array`);
  return value.map((entry, index) => readString(entry, `${field}[${index}]`));
}

function normalizeScore(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : undefined;
}

function normalizeTargetDuration(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (
    typeof value !== 'number'
    || !Number.isInteger(value)
    || value < 1
    || value > THINKFORGE_MAX_PRODUCTION_OUTPUT_DURATION_SECONDS
  ) {
    throw new ContentCardValidationError(
      `targetDurationSeconds must be a whole number from 1 to ${THINKFORGE_MAX_PRODUCTION_OUTPUT_DURATION_SECONDS}`,
    );
  }
  return value;
}

function normalizeCarouselSlideCount(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (
    typeof value !== 'number'
    || !Number.isInteger(value)
    || value < THINKFORGE_CAROUSEL_MIN_SLIDES
    || value > THINKFORGE_CAROUSEL_AUTHORING_BATCH_MAX_SLIDES
  ) {
    throw new ContentCardValidationError(
      `carouselSlideCount must be a whole number from ${THINKFORGE_CAROUSEL_MIN_SLIDES} to ${THINKFORGE_CAROUSEL_AUTHORING_BATCH_MAX_SLIDES}`,
    );
  }
  return value;
}

function normalizeRatio(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : undefined;
}

function readString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new ContentCardValidationError(`${field} must be a non-empty string`);
  return value.trim();
}

function readOptionalString(value: unknown, field: string): string | undefined {
  return value === undefined || value === null || value === '' ? undefined : readString(value, field);
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) throw new ContentCardValidationError(`${field} must be an object`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function compact<T extends Record<string, unknown>>(record: T): T {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined && value !== null)) as T;
}

function isoNow(value: Date | string | undefined): string {
  return typeof value === 'string' ? value : (value ?? new Date()).toISOString();
}

function defaultCardId(): string {
  return `card_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}
