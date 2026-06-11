export const CLICKATRON_CREATIVE_SPEC_VERSION = 1;

export const CLICKATRON_CREATIVE_KINDS = ['single_post_visual', 'carousel'] as const;
export const CLICKATRON_ASSET_INTENTS = ['post_graphic', 'carousel', 'blog_header', 'thread_visual', 'ad_creative'] as const;
export const CLICKATRON_PLATFORMS = ['generic', 'instagram', 'linkedin', 'x', 'facebook', 'youtube', 'tiktok', 'pinterest'] as const;
export const CLICKATRON_VISUAL_MODES = ['auto', 'photo', 'illustration', 'product_mockup', 'text_forward_graphic', 'diagram', 'mixed'] as const;
export const CLICKATRON_TEXT_DENSITIES = ['none', 'low', 'medium', 'high'] as const;
export const CLICKATRON_TEXT_POLICIES = ['editable_text_layers', 'minimal_generated_text', 'no_generated_text'] as const;
export const CLICKATRON_TEXT_ROLES = ['hook', 'headline', 'subheadline', 'body', 'cta', 'badge', 'label'] as const;
export const CLICKATRON_VALIDATION_STATUSES = ['ready', 'needs_user_input', 'stale', 'invalid'] as const;
export const CLICKATRON_VALIDATION_SEVERITIES = ['info', 'warning', 'error'] as const;

export type ClickatronCreativeKind = typeof CLICKATRON_CREATIVE_KINDS[number];
export type ClickatronAssetIntent = typeof CLICKATRON_ASSET_INTENTS[number];
export type ClickatronPlatform = typeof CLICKATRON_PLATFORMS[number];
export type ClickatronVisualMode = typeof CLICKATRON_VISUAL_MODES[number];
export type ClickatronTextDensity = typeof CLICKATRON_TEXT_DENSITIES[number];
export type ClickatronTextPolicy = typeof CLICKATRON_TEXT_POLICIES[number];
export type ClickatronTextRole = typeof CLICKATRON_TEXT_ROLES[number];
export type ClickatronValidationStatus = typeof CLICKATRON_VALIDATION_STATUSES[number];
export type ClickatronValidationSeverity = typeof CLICKATRON_VALIDATION_SEVERITIES[number];

export interface ClickatronCreativeSource {
  sourceService?: 'thinkforge';
  sourceSessionId?: string;
  sourceScriptId?: string;
  sourceBlockIds: string[];
  contentHash?: string;
  revisionId?: string;
}

export interface ClickatronCreativeCalendarScope {
  contentCardId?: string;
  campaignId?: string;
  calendarItemId?: string;
  seriesId?: string;
}

export interface ClickatronCreativeUserIntent {
  visualMode: ClickatronVisualMode;
  tone?: string;
  textDensity?: ClickatronTextDensity;
  wantsCarousel?: boolean;
  notes?: string;
}

export interface ClickatronCreativeBrief {
  objective: string;
  coreMessage: string;
  audience?: string;
  hook?: string;
  keyClaims?: string[];
  cta?: string;
  visualMetaphor?: string;
}

export interface ClickatronCreativeBrandContext {
  brandId?: string;
  brandSnapshotId?: string;
  hardConstraints?: string[];
  softPreferences?: string[];
}

export interface ClickatronTextLayer {
  id: string;
  text: string;
  role: ClickatronTextRole;
  priority: number;
  sourceBlockId?: string;
  maxLines?: number;
  locked?: boolean;
}

export interface ClickatronCarouselSlideSpec {
  id: string;
  index: number;
  title?: string;
  sourceBlockIds?: string[];
  imagePrompt: string;
  layoutIntent?: string;
  textLayers?: ClickatronTextLayer[];
  altText?: string;
}

export interface ClickatronCreativeRenderPlan {
  textPolicy: ClickatronTextPolicy;
  imagePrompt: string;
  negativePrompt?: string;
  layoutIntent?: string;
  textLayers?: ClickatronTextLayer[];
  slides?: ClickatronCarouselSlideSpec[];
}

export interface ClickatronCreativeValidationIssue {
  code: string;
  message: string;
  severity: ClickatronValidationSeverity;
}

export interface ClickatronCreativeValidation {
  status: ClickatronValidationStatus;
  issues?: ClickatronCreativeValidationIssue[];
  needsUserInput?: string[];
}

export interface ClickatronCreativeSpec {
  schemaVersion: typeof CLICKATRON_CREATIVE_SPEC_VERSION;
  kind: ClickatronCreativeKind;
  assetIntent: ClickatronAssetIntent;
  platform: ClickatronPlatform;
  aspectRatio: string;
  source: ClickatronCreativeSource;
  calendar?: ClickatronCreativeCalendarScope;
  userIntent: ClickatronCreativeUserIntent;
  creativeBrief: ClickatronCreativeBrief;
  brand?: ClickatronCreativeBrandContext;
  renderPlan: ClickatronCreativeRenderPlan;
  validation: ClickatronCreativeValidation;
}

export interface ThinkForgeBlockExportMeta {
  clickatron?: ClickatronCreativeSpec;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value;
}

function readString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value.trim();
}

function readOptionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return readString(value, field);
}

function readBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'boolean') throw new Error(`${field} must be a boolean`);
  return value;
}

function readNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${field} must be a finite number`);
  }
  return value;
}

function readOptionalNumber(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  return readNumber(value, field);
}

function readEnum<T extends readonly string[]>(value: unknown, allowed: T, field: string): T[number] {
  const next = readString(value, field);
  if (!allowed.includes(next)) {
    throw new Error(`${field} must be one of: ${allowed.join(', ')}`);
  }
  return next as T[number];
}

function readOptionalStringArray(value: unknown, field: string): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  const result = value.map((entry, index) => readString(entry, `${field}[${index}]`));
  return result.length > 0 ? result : undefined;
}

function readStringArray(value: unknown, field: string): string[] {
  const result = readOptionalStringArray(value, field);
  if (!result || result.length === 0) {
    throw new Error(`${field} must include at least one string`);
  }
  return result;
}

function normalizeSource(value: unknown): ClickatronCreativeSource {
  const input = requireRecord(value, 'source');
  const sourceService = readOptionalString(input.sourceService, 'source.sourceService');
  if (sourceService !== undefined && sourceService !== 'thinkforge') {
    throw new Error('source.sourceService must be thinkforge when provided');
  }
  return {
    ...(sourceService ? { sourceService: 'thinkforge' as const } : {}),
    ...(readOptionalString(input.sourceSessionId, 'source.sourceSessionId') ? { sourceSessionId: readString(input.sourceSessionId, 'source.sourceSessionId') } : {}),
    ...(readOptionalString(input.sourceScriptId, 'source.sourceScriptId') ? { sourceScriptId: readString(input.sourceScriptId, 'source.sourceScriptId') } : {}),
    sourceBlockIds: readStringArray(input.sourceBlockIds, 'source.sourceBlockIds'),
    ...(readOptionalString(input.contentHash, 'source.contentHash') ? { contentHash: readString(input.contentHash, 'source.contentHash') } : {}),
    ...(readOptionalString(input.revisionId, 'source.revisionId') ? { revisionId: readString(input.revisionId, 'source.revisionId') } : {}),
  };
}

function normalizeCalendar(value: unknown): ClickatronCreativeCalendarScope | undefined {
  if (value === undefined || value === null) return undefined;
  const input = requireRecord(value, 'calendar');
  const calendar = {
    ...(readOptionalString(input.contentCardId, 'calendar.contentCardId') ? { contentCardId: readString(input.contentCardId, 'calendar.contentCardId') } : {}),
    ...(readOptionalString(input.campaignId, 'calendar.campaignId') ? { campaignId: readString(input.campaignId, 'calendar.campaignId') } : {}),
    ...(readOptionalString(input.calendarItemId, 'calendar.calendarItemId') ? { calendarItemId: readString(input.calendarItemId, 'calendar.calendarItemId') } : {}),
    ...(readOptionalString(input.seriesId, 'calendar.seriesId') ? { seriesId: readString(input.seriesId, 'calendar.seriesId') } : {}),
  };
  return Object.keys(calendar).length > 0 ? calendar : undefined;
}

function normalizeUserIntent(value: unknown): ClickatronCreativeUserIntent {
  const input = requireRecord(value, 'userIntent');
  return {
    visualMode: readEnum(input.visualMode, CLICKATRON_VISUAL_MODES, 'userIntent.visualMode'),
    ...(readOptionalString(input.tone, 'userIntent.tone') ? { tone: readString(input.tone, 'userIntent.tone') } : {}),
    ...(input.textDensity !== undefined ? { textDensity: readEnum(input.textDensity, CLICKATRON_TEXT_DENSITIES, 'userIntent.textDensity') } : {}),
    ...(readBoolean(input.wantsCarousel, 'userIntent.wantsCarousel') !== undefined ? { wantsCarousel: readBoolean(input.wantsCarousel, 'userIntent.wantsCarousel') } : {}),
    ...(readOptionalString(input.notes, 'userIntent.notes') ? { notes: readString(input.notes, 'userIntent.notes') } : {}),
  };
}

function normalizeCreativeBrief(value: unknown): ClickatronCreativeBrief {
  const input = requireRecord(value, 'creativeBrief');
  return {
    objective: readString(input.objective, 'creativeBrief.objective'),
    coreMessage: readString(input.coreMessage, 'creativeBrief.coreMessage'),
    ...(readOptionalString(input.audience, 'creativeBrief.audience') ? { audience: readString(input.audience, 'creativeBrief.audience') } : {}),
    ...(readOptionalString(input.hook, 'creativeBrief.hook') ? { hook: readString(input.hook, 'creativeBrief.hook') } : {}),
    ...(readOptionalStringArray(input.keyClaims, 'creativeBrief.keyClaims') ? { keyClaims: readStringArray(input.keyClaims, 'creativeBrief.keyClaims') } : {}),
    ...(readOptionalString(input.cta, 'creativeBrief.cta') ? { cta: readString(input.cta, 'creativeBrief.cta') } : {}),
    ...(readOptionalString(input.visualMetaphor, 'creativeBrief.visualMetaphor') ? { visualMetaphor: readString(input.visualMetaphor, 'creativeBrief.visualMetaphor') } : {}),
  };
}

function normalizeBrand(value: unknown): ClickatronCreativeBrandContext | undefined {
  if (value === undefined || value === null) return undefined;
  const input = requireRecord(value, 'brand');
  const brand = {
    ...(readOptionalString(input.brandId, 'brand.brandId') ? { brandId: readString(input.brandId, 'brand.brandId') } : {}),
    ...(readOptionalString(input.brandSnapshotId, 'brand.brandSnapshotId') ? { brandSnapshotId: readString(input.brandSnapshotId, 'brand.brandSnapshotId') } : {}),
    ...(readOptionalStringArray(input.hardConstraints, 'brand.hardConstraints') ? { hardConstraints: readStringArray(input.hardConstraints, 'brand.hardConstraints') } : {}),
    ...(readOptionalStringArray(input.softPreferences, 'brand.softPreferences') ? { softPreferences: readStringArray(input.softPreferences, 'brand.softPreferences') } : {}),
  };
  return Object.keys(brand).length > 0 ? brand : undefined;
}

function normalizeTextLayer(value: unknown, field: string): ClickatronTextLayer {
  const input = requireRecord(value, field);
  const priority = readNumber(input.priority, `${field}.priority`);
  if (priority < 0 || priority > 100) {
    throw new Error(`${field}.priority must be between 0 and 100`);
  }
  const maxLines = readOptionalNumber(input.maxLines, `${field}.maxLines`);
  if (maxLines !== undefined && maxLines < 1) {
    throw new Error(`${field}.maxLines must be at least 1`);
  }
  return {
    id: readString(input.id, `${field}.id`),
    text: readString(input.text, `${field}.text`),
    role: readEnum(input.role, CLICKATRON_TEXT_ROLES, `${field}.role`),
    priority,
    ...(readOptionalString(input.sourceBlockId, `${field}.sourceBlockId`) ? { sourceBlockId: readString(input.sourceBlockId, `${field}.sourceBlockId`) } : {}),
    ...(maxLines !== undefined ? { maxLines } : {}),
    ...(readBoolean(input.locked, `${field}.locked`) !== undefined ? { locked: readBoolean(input.locked, `${field}.locked`) } : {}),
  };
}

function normalizeTextLayers(value: unknown, field: string): ClickatronTextLayer[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  const result = value.map((entry, index) => normalizeTextLayer(entry, `${field}[${index}]`));
  return result.length > 0 ? result : undefined;
}

function normalizeSlide(value: unknown, field: string): ClickatronCarouselSlideSpec {
  const input = requireRecord(value, field);
  const index = readNumber(input.index, `${field}.index`);
  if (!Number.isInteger(index) || index < 0) {
    throw new Error(`${field}.index must be a non-negative integer`);
  }
  return {
    id: readString(input.id, `${field}.id`),
    index,
    ...(readOptionalString(input.title, `${field}.title`) ? { title: readString(input.title, `${field}.title`) } : {}),
    ...(readOptionalStringArray(input.sourceBlockIds, `${field}.sourceBlockIds`) ? { sourceBlockIds: readStringArray(input.sourceBlockIds, `${field}.sourceBlockIds`) } : {}),
    imagePrompt: readString(input.imagePrompt, `${field}.imagePrompt`),
    ...(readOptionalString(input.layoutIntent, `${field}.layoutIntent`) ? { layoutIntent: readString(input.layoutIntent, `${field}.layoutIntent`) } : {}),
    ...(normalizeTextLayers(input.textLayers, `${field}.textLayers`) ? { textLayers: normalizeTextLayers(input.textLayers, `${field}.textLayers`) } : {}),
    ...(readOptionalString(input.altText, `${field}.altText`) ? { altText: readString(input.altText, `${field}.altText`) } : {}),
  };
}

function normalizeSlides(value: unknown): ClickatronCarouselSlideSpec[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) throw new Error('renderPlan.slides must be an array');
  const result = value.map((entry, index) => normalizeSlide(entry, `renderPlan.slides[${index}]`));
  return result.length > 0 ? result : undefined;
}

function normalizeRenderPlan(value: unknown): ClickatronCreativeRenderPlan {
  const input = requireRecord(value, 'renderPlan');
  return {
    textPolicy: readEnum(input.textPolicy, CLICKATRON_TEXT_POLICIES, 'renderPlan.textPolicy'),
    imagePrompt: readString(input.imagePrompt, 'renderPlan.imagePrompt'),
    ...(readOptionalString(input.negativePrompt, 'renderPlan.negativePrompt') ? { negativePrompt: readString(input.negativePrompt, 'renderPlan.negativePrompt') } : {}),
    ...(readOptionalString(input.layoutIntent, 'renderPlan.layoutIntent') ? { layoutIntent: readString(input.layoutIntent, 'renderPlan.layoutIntent') } : {}),
    ...(normalizeTextLayers(input.textLayers, 'renderPlan.textLayers') ? { textLayers: normalizeTextLayers(input.textLayers, 'renderPlan.textLayers') } : {}),
    ...(normalizeSlides(input.slides) ? { slides: normalizeSlides(input.slides) } : {}),
  };
}

function normalizeValidationIssue(value: unknown, field: string): ClickatronCreativeValidationIssue {
  const input = requireRecord(value, field);
  return {
    code: readString(input.code, `${field}.code`),
    message: readString(input.message, `${field}.message`),
    severity: readEnum(input.severity, CLICKATRON_VALIDATION_SEVERITIES, `${field}.severity`),
  };
}

function normalizeValidation(value: unknown): ClickatronCreativeValidation {
  const input = requireRecord(value, 'validation');
  const issues = input.issues === undefined || input.issues === null
    ? undefined
    : Array.isArray(input.issues)
      ? input.issues.map((entry, index) => normalizeValidationIssue(entry, `validation.issues[${index}]`))
      : (() => { throw new Error('validation.issues must be an array'); })();
  return {
    status: readEnum(input.status, CLICKATRON_VALIDATION_STATUSES, 'validation.status'),
    ...(issues && issues.length > 0 ? { issues } : {}),
    ...(readOptionalStringArray(input.needsUserInput, 'validation.needsUserInput') ? { needsUserInput: readStringArray(input.needsUserInput, 'validation.needsUserInput') } : {}),
  };
}

export function normalizeClickatronCreativeSpec(input: unknown): ClickatronCreativeSpec {
  const value = requireRecord(input, 'exportMeta.clickatron');
  const schemaVersion = readNumber(value.schemaVersion, 'schemaVersion');
  if (schemaVersion !== CLICKATRON_CREATIVE_SPEC_VERSION) {
    throw new Error(`schemaVersion must be ${CLICKATRON_CREATIVE_SPEC_VERSION}`);
  }

  const kind = readEnum(value.kind, CLICKATRON_CREATIVE_KINDS, 'kind');
  const renderPlan = normalizeRenderPlan(value.renderPlan);
  if (kind === 'carousel' && (!renderPlan.slides || renderPlan.slides.length === 0)) {
    throw new Error('carousel specs require at least one renderPlan.slides item');
  }

  return {
    schemaVersion: CLICKATRON_CREATIVE_SPEC_VERSION,
    kind,
    assetIntent: readEnum(value.assetIntent, CLICKATRON_ASSET_INTENTS, 'assetIntent'),
    platform: readEnum(value.platform, CLICKATRON_PLATFORMS, 'platform'),
    aspectRatio: readString(value.aspectRatio, 'aspectRatio'),
    source: normalizeSource(value.source),
    ...(normalizeCalendar(value.calendar) ? { calendar: normalizeCalendar(value.calendar) } : {}),
    userIntent: normalizeUserIntent(value.userIntent),
    creativeBrief: normalizeCreativeBrief(value.creativeBrief),
    ...(normalizeBrand(value.brand) ? { brand: normalizeBrand(value.brand) } : {}),
    renderPlan,
    validation: normalizeValidation(value.validation),
  };
}

export function isClickatronCreativeSpec(input: unknown): input is ClickatronCreativeSpec {
  try {
    normalizeClickatronCreativeSpec(input);
    return true;
  } catch {
    return false;
  }
}

export function normalizeThinkForgeBlockExportMeta(input: unknown): ThinkForgeBlockExportMeta | undefined {
  if (input === undefined || input === null) return undefined;
  const value = requireRecord(input, 'exportMeta');
  const clickatron = value.clickatron === undefined
    ? undefined
    : normalizeClickatronCreativeSpec(value.clickatron);
  return clickatron ? { clickatron } : undefined;
}

export function isThinkForgeBlockExportMeta(input: unknown): input is ThinkForgeBlockExportMeta {
  try {
    normalizeThinkForgeBlockExportMeta(input);
    return true;
  } catch {
    return false;
  }
}
