import {
  createBrandSignalLearningEvent,
  type BrandSignalEditScope,
  type BrandSignalLearningEvent,
} from '@/lib/shared/brand-signal-edit-weighting';

export type EditronUserOverrideKind = 'transition_style' | 'filter_preset';

export interface EditronUserOverrideLearningInput {
  userId: string;
  projectId: string;
  brandId?: string;
  actorId?: string;
  observedAt: string;
  kind: EditronUserOverrideKind;
  beforeValue: unknown;
  afterValue: unknown;
  overlayId?: string | number;
  frame?: number;
  timestampMs?: number;
  note?: string;
}

export function createEditronUserOverrideLearningEvent(
  input: EditronUserOverrideLearningInput,
): BrandSignalLearningEvent {
  const scope: BrandSignalEditScope = typeof input.frame === 'number' || typeof input.timestampMs === 'number'
    ? 'frame'
    : 'project';

  return createBrandSignalLearningEvent({
    service: 'editron',
    signalPath: signalPathForEditronOverride(input.kind),
    editType: 'generated_output_correction',
    scope,
    polarity: 'replace',
    observedAt: input.observedAt,
    actorId: input.actorId ?? input.userId,
    context: {
      userId: input.userId,
      brandId: input.brandId,
      projectId: input.projectId,
      sourceId: input.overlayId === undefined ? undefined : String(input.overlayId),
      frame: input.frame,
      timestampMs: input.timestampMs,
    },
    beforeValue: input.beforeValue,
    afterValue: input.afterValue,
    note: input.note,
  });
}

export function signalPathForEditronOverride(kind: EditronUserOverrideKind): string {
  switch (kind) {
    case 'transition_style':
      return 'motion.transitionSharpness';
    case 'filter_preset':
      return 'visual.contrastPreference';
    default:
      return exhaustive(kind);
  }
}

function exhaustive(value: never): never {
  throw new Error(`Unsupported Editron user override kind: ${String(value)}`);
}
