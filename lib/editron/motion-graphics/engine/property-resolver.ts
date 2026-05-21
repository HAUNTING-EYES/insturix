import type { MotionTokens } from '../types';
import type { RecipeElement, ResolvedElement, BindingExpr, EntrancePattern, ExitPattern } from './recipe-types';

const CRG_CONSTRAINTS: Record<string, number> = {
  'typography.stat_counter_min_font': 72,
  'typography.lower_third_name_min_font': 48,
  'typography.keyword_highlight_min_font': 48,
  'overlay.graphic_too_small': 72,
};

const ROLE_ENTER_ORDER: Record<string, number> = {
  accent: 1,
  container: 2,
  primary: 3,
  counter: 3,
  label: 4,
  secondary: 4,
  title: 3,
  body: 4,
  words: 1,
  bars: 2,
  labels: 3,
  icon: 2,
};

const ROLE_ENTRANCE_DEFAULTS: Record<string, EntrancePattern> = {
  accent: 'draw',
  container: 'slide-left',
  primary: 'fade',
  secondary: 'fade',
  counter: 'fade',
  label: 'fade',
  title: 'fade',
  body: 'fade',
  words: 'scale-up',
  bars: 'scale-up',
  icon: 'scale-up',
};

const ROLE_EXIT_DEFAULTS: Record<string, ExitPattern> = {
  accent: 'draw-reverse',
  container: 'slide-left',
  primary: 'fade',
  secondary: 'fade',
  counter: 'fade',
  label: 'fade',
  title: 'fade',
  body: 'fade',
  words: 'fade',
  bars: 'scale-down',
  icon: 'fade',
};

function resolveBinding(
  expr: BindingExpr,
  tokens: MotionTokens,
  content: Record<string, unknown>,
): string | number | boolean {
  if (typeof expr === 'number' || typeof expr === 'boolean') return expr;
  if (typeof expr !== 'string') return '';

  if (expr.startsWith('token:')) {
    const path = expr.slice(6);
    const val = getNestedValue(tokens, path);
    if (val === undefined) {
      console.warn(`[MG-Resolve] Token binding "${expr}" resolved to undefined`);
      return '';
    }
    return val as string | number | boolean;
  }

  if (expr.startsWith('content:')) {
    const path = expr.slice(8);
    const val = getNestedValue(content, path);
    if (val === undefined) return '';
    return val as string | number | boolean;
  }

  if (expr.startsWith('constraint:')) {
    const key = expr.slice(11);
    const val = CRG_CONSTRAINTS[key];
    if (val === undefined) {
      console.warn(`[MG-Resolve] CRG constraint "${key}" not found`);
      return 0;
    }
    return val;
  }

  return expr;
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function resolveElements(
  recipeElements: RecipeElement[],
  tokens: MotionTokens,
  content: Record<string, unknown>,
): ResolvedElement[] {
  return recipeElements.map((el) => {
    const resolvedProps: Record<string, string | number | boolean> = {};
    for (const [key, expr] of Object.entries(el.bind)) {
      resolvedProps[key] = resolveBinding(expr, tokens, content);
    }

    const enterOrder = ROLE_ENTER_ORDER[el.role] ?? 5;
    const entrancePattern = el.entranceOverride ?? ROLE_ENTRANCE_DEFAULTS[el.role] ?? tokens.animation.entrancePattern;
    const exitPattern = el.exitOverride ?? ROLE_EXIT_DEFAULTS[el.role] ?? tokens.animation.exitPattern;

    return {
      primitive: el.primitive,
      role: el.role,
      shape: el.shape,
      animation: el.animation,
      enterOrder,
      resolvedProps,
      entrancePattern,
      exitPattern,
    };
  });
}
