export type BrandSignalLearningWeightCategory = 'invented' | 'calibrated';

export type BrandSignalWeightingService =
  | 'brand_vault'
  | 'thinkforge'
  | 'clickatron'
  | 'editron'
  | 'alyzitron';

export type BrandSignalEditScope =
  | 'frame'
  | 'scene'
  | 'video'
  | 'project'
  | 'campaign'
  | 'brand'
  | 'user';

export type BrandSignalEditPolarity =
  | 'affirm'
  | 'replace'
  | 'reject'
  | 'suppress';

export type BrandSignalEditEventType =
  | 'direct_review_edit'
  | 'manual_brand_dna_edit'
  | 'passive_voice_fingerprint'
  | 'passive_voice_exemplar'
  | 'generated_output_correction'
  | 'accepted_output_confirmation'
  | 'rejected_candidate';

export type BrandSignalLearningClass =
  | 'hard_fact'
  | 'hard_constraint'
  | 'visual_identity'
  | 'typography_identity'
  | 'strategic_identity'
  | 'voice_rule'
  | 'voice_dial'
  | 'visual_dial'
  | 'motion_dial'
  | 'derived_process'
  | 'soft_preference';

export interface BrandSignalLearningWeight {
  version: 1;
  value: number;
  category: BrandSignalLearningWeightCategory;
  service: BrandSignalWeightingService;
  editType: BrandSignalEditEventType;
  scope: BrandSignalEditScope;
  polarity: BrandSignalEditPolarity;
  signalClass: BrandSignalLearningClass;
  rationale: string;
}

export interface BrandSignalLearningEventContext {
  userId?: string;
  brandId?: string;
  projectId?: string;
  campaignId?: string;
  contentId?: string;
  sourceId?: string;
  sourceUrl?: string;
  frame?: number;
  timestampMs?: number;
}

export interface BrandSignalLearningEvent {
  version: 1;
  id: string;
  service: BrandSignalWeightingService;
  signalPath: string;
  editType: BrandSignalEditEventType;
  scope: BrandSignalEditScope;
  polarity: BrandSignalEditPolarity;
  learningWeight: BrandSignalLearningWeight;
  observedAt: string;
  actorId?: string;
  context: BrandSignalLearningEventContext;
  beforeValue?: unknown;
  afterValue?: unknown;
  observedValue?: unknown;
  note?: string;
}

export interface ResolveBrandSignalEditLearningWeightInput {
  service: BrandSignalWeightingService;
  signalPath: string;
  editType: BrandSignalEditEventType;
  scope?: BrandSignalEditScope;
  polarity?: BrandSignalEditPolarity;
  repetitionCount?: number;
}

export interface CreateBrandSignalLearningEventInput extends ResolveBrandSignalEditLearningWeightInput {
  id?: string;
  observedAt: string;
  actorId?: string;
  context?: BrandSignalLearningEventContext;
  beforeValue?: unknown;
  afterValue?: unknown;
  observedValue?: unknown;
  note?: string;
}

const CATEGORY: BrandSignalLearningWeightCategory = 'invented';

const SERVICE_MULTIPLIERS: Record<BrandSignalWeightingService, number> = {
  brand_vault: 1,
  thinkforge: 0.95,
  editron: 0.8,
  clickatron: 0.78,
  alyzitron: 0.72,
};

const EDIT_TYPE_MULTIPLIERS: Record<BrandSignalEditEventType, number> = {
  direct_review_edit: 1,
  manual_brand_dna_edit: 0.95,
  passive_voice_fingerprint: 0.7,
  passive_voice_exemplar: 0.62,
  generated_output_correction: 0.55,
  accepted_output_confirmation: 0.32,
  rejected_candidate: 0.75,
};

const SCOPE_MULTIPLIERS: Record<BrandSignalEditScope, number> = {
  frame: 0.35,
  scene: 0.45,
  video: 0.55,
  project: 0.65,
  campaign: 0.75,
  brand: 1,
  user: 0.7,
};

const POLARITY_MULTIPLIERS: Record<BrandSignalEditPolarity, number> = {
  replace: 1,
  reject: 0.9,
  suppress: 0.85,
  affirm: 0.7,
};

const SIGNAL_CLASS_WEIGHTS: Record<BrandSignalLearningClass, number> = {
  hard_fact: 1,
  hard_constraint: 1,
  visual_identity: 0.9,
  typography_identity: 0.85,
  strategic_identity: 0.82,
  voice_rule: 0.82,
  voice_dial: 0.64,
  visual_dial: 0.62,
  motion_dial: 0.58,
  derived_process: 0.25,
  soft_preference: 0.55,
};

export function resolveBrandSignalEditLearningWeight(
  input: ResolveBrandSignalEditLearningWeightInput,
): BrandSignalLearningWeight {
  const signalClass = classifyBrandSignalPath(input.signalPath);
  const scope = input.scope ?? defaultScopeForEditType(input.editType);
  const polarity = input.polarity ?? defaultPolarityForEditType(input.editType);
  const repetitionBoost = repetitionMultiplier(input.repetitionCount);
  const value = roundWeight(clamp01(
    SIGNAL_CLASS_WEIGHTS[signalClass] *
      SERVICE_MULTIPLIERS[input.service] *
      EDIT_TYPE_MULTIPLIERS[input.editType] *
      SCOPE_MULTIPLIERS[scope] *
      POLARITY_MULTIPLIERS[polarity] *
      repetitionBoost,
  ));

  return {
    version: 1,
    value,
    category: CATEGORY,
    service: input.service,
    editType: input.editType,
    scope,
    polarity,
    signalClass,
    rationale: [
      `${CATEGORY} v1 weight`,
      `signalClass=${signalClass}`,
      `service=${input.service}`,
      `editType=${input.editType}`,
      `scope=${scope}`,
      `polarity=${polarity}`,
      `repetition=${Math.max(1, input.repetitionCount ?? 1)}`,
    ].join('; '),
  };
}

export function createBrandSignalLearningEvent(
  input: CreateBrandSignalLearningEventInput,
): BrandSignalLearningEvent {
  const signalPath = input.signalPath.trim();
  if (!signalPath) throw new Error('Brand signal learning event requires a signalPath.');
  if (!isIsoDate(input.observedAt)) {
    throw new Error('Brand signal learning event observedAt must be an ISO timestamp.');
  }

  const scope = input.scope ?? defaultScopeForEditType(input.editType);
  const polarity = input.polarity ?? defaultPolarityForEditType(input.editType);
  const learningWeight = resolveBrandSignalEditLearningWeight({
    service: input.service,
    signalPath,
    editType: input.editType,
    scope,
    polarity,
    repetitionCount: input.repetitionCount,
  });

  return {
    version: 1,
    id: input.id ?? learningEventId(input.service, input.editType, signalPath, input.observedAt),
    service: input.service,
    signalPath,
    editType: input.editType,
    scope,
    polarity,
    learningWeight,
    observedAt: input.observedAt,
    actorId: input.actorId,
    context: compactContext(input.context),
    beforeValue: input.beforeValue,
    afterValue: input.afterValue,
    observedValue: input.observedValue,
    note: input.note,
  };
}

export function classifyBrandSignalPath(signalPath: string): BrandSignalLearningClass {
  if (signalPath === 'identity.brandName') return 'hard_fact';
  if (signalPath === 'voice.killList') return 'hard_constraint';
  if (signalPath.startsWith('palette.unsafe')) return 'derived_process';
  if (signalPath === 'palette.contrastBias' || signalPath === 'palette.harmony') return 'derived_process';
  if (signalPath.startsWith('palette.')) return 'visual_identity';
  if (signalPath.startsWith('assets.')) return 'visual_identity';
  if (signalPath.startsWith('typography.')) return 'typography_identity';
  if (
    signalPath === 'identity.industry' ||
    signalPath === 'identity.category' ||
    signalPath === 'identity.audience' ||
    signalPath === 'identity.productServices' ||
    signalPath === 'identity.proofStyle'
  ) {
    return 'strategic_identity';
  }
  if (signalPath === 'voice.recurringPhrases' || signalPath === 'voice.hookArchetypes') return 'voice_rule';
  if (signalPath.startsWith('voice.')) return 'voice_dial';
  if (signalPath.startsWith('visual.')) return 'visual_dial';
  if (signalPath.startsWith('motion.')) return 'motion_dial';
  return 'soft_preference';
}

function defaultScopeForEditType(editType: BrandSignalEditEventType): BrandSignalEditScope {
  if (editType === 'direct_review_edit' || editType === 'manual_brand_dna_edit') return 'brand';
  if (editType === 'passive_voice_fingerprint' || editType === 'passive_voice_exemplar') return 'user';
  if (editType === 'accepted_output_confirmation') return 'project';
  if (editType === 'generated_output_correction' || editType === 'rejected_candidate') return 'frame';
  return 'brand';
}

function defaultPolarityForEditType(editType: BrandSignalEditEventType): BrandSignalEditPolarity {
  if (editType === 'accepted_output_confirmation') return 'affirm';
  if (editType === 'rejected_candidate') return 'reject';
  return 'replace';
}

function repetitionMultiplier(repetitionCount = 1): number {
  const normalized = Math.max(1, Math.floor(repetitionCount));
  return Math.min(1.35, 1 + (normalized - 1) * 0.1);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function roundWeight(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function isIsoDate(value: string): boolean {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function compactContext(context: BrandSignalLearningEventContext = {}): BrandSignalLearningEventContext {
  const compact: BrandSignalLearningEventContext = {};
  if (context.userId !== undefined) compact.userId = context.userId;
  if (context.brandId !== undefined) compact.brandId = context.brandId;
  if (context.projectId !== undefined) compact.projectId = context.projectId;
  if (context.campaignId !== undefined) compact.campaignId = context.campaignId;
  if (context.contentId !== undefined) compact.contentId = context.contentId;
  if (context.sourceId !== undefined) compact.sourceId = context.sourceId;
  if (context.sourceUrl !== undefined) compact.sourceUrl = context.sourceUrl;
  if (context.frame !== undefined) compact.frame = context.frame;
  if (context.timestampMs !== undefined) compact.timestampMs = context.timestampMs;
  return compact;
}

function learningEventId(
  service: BrandSignalWeightingService,
  editType: BrandSignalEditEventType,
  signalPath: string,
  observedAt: string,
): string {
  return [
    'brand_signal_learning',
    service,
    editType,
    idPart(signalPath),
    Date.parse(observedAt) || 0,
  ].join('_');
}

function idPart(value: string): string {
  const cleaned = value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return cleaned.slice(0, 80) || 'unknown';
}
