import type { RecipeElement } from './recipe-types';
import type { MotionTokens } from '../types';
import type { PlannerSignals } from './composition-planner';

export interface CompositionTemplate {
  shapeKind: string;
  compose: (
    content: Record<string, unknown>,
    language: MotionTokens,
    signals: PlannerSignals,
  ) => RecipeElement[];
}

const registry = new Map<string, CompositionTemplate>();

export function registerCompositionTemplate(template: CompositionTemplate): void {
  registry.set(template.shapeKind, template);
}

export function getCompositionTemplate(shapeKind: string): CompositionTemplate | undefined {
  return registry.get(shapeKind);
}
