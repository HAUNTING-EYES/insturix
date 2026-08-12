export interface ParsedPortGroupV1 {
  raw: string;
  names: string[];
  optional: boolean;
  typeExpression?: string;
}

export interface PortContractV1 {
  groups: ParsedPortGroupV1[];
  byName: Map<string, ParsedPortGroupV1>;
  errors: string[];
}

export type PortCompatibilityV1 = 'COMPATIBLE' | 'INCOMPATIBLE' | 'UNVERIFIABLE';

export function parsePortContractV1(descriptors: unknown): PortContractV1 {
  const groups: ParsedPortGroupV1[] = [];
  const byName = new Map<string, ParsedPortGroupV1>();
  const errors: string[] = [];
  if (!Array.isArray(descriptors)) return { groups, byName, errors: ['Port descriptors must be an array'] };
  for (const [index, descriptor] of descriptors.entries()) {
    if (typeof descriptor !== 'string' || !descriptor.trim()) {
      errors.push(`Port descriptor ${index} must be a non-empty string`);
      continue;
    }
    const colon = descriptor.indexOf(':');
    const nameExpression = (colon < 0 ? descriptor : descriptor.slice(0, colon)).trim();
    const optional = nameExpression.endsWith('?');
    const names = (optional ? nameExpression.slice(0, -1) : nameExpression)
      .split('-or-')
      .map((name) => name.trim())
      .filter(Boolean);
    const typeExpression = colon < 0 ? undefined : descriptor.slice(colon + 1).trim() || undefined;
    if (names.length === 0) {
      errors.push(`Port descriptor ${descriptor} has no name`);
      continue;
    }
    const group = { raw: descriptor, names, optional, ...(typeExpression ? { typeExpression } : {}) };
    groups.push(group);
    for (const name of names) {
      if (byName.has(name)) errors.push(`Port name ${name} is declared more than once`);
      else byName.set(name, group);
    }
  }
  return { groups, byName, errors };
}

export function validatePortValueV1(
  value: unknown,
  typeExpression: string | undefined,
  projectDurationFrames: number | undefined,
): string | undefined {
  if (!typeExpression) return undefined;
  const range = parseNumericRange(typeExpression);
  if (range) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return `must be a finite number in ${typeExpression}`;
    if (Number.isInteger(range.minimum) && Number.isInteger(range.maximum) && !Number.isSafeInteger(value)) {
      return `must be an integer in ${typeExpression}`;
    }
    if (value < range.minimum || value > range.maximum) return `must be within ${typeExpression}`;
    return undefined;
  }
  if (typeExpression.includes('|')) {
    const choices = typeExpression.split('|');
    return typeof value === 'string' && choices.includes(value) ? undefined : `must be one of ${typeExpression}`;
  }
  if (typeExpression === 'boolean') return typeof value === 'boolean' ? undefined : 'must be boolean';
  if (typeExpression === 'number') return typeof value === 'number' && Number.isFinite(value) ? undefined : 'must be a finite number';
  if (['integer', 'frame', 'frames', 'global-frame', 'exclusive-global-frame'].includes(typeExpression)) {
    if (!Number.isSafeInteger(value) || (value as number) < 0) return `must be a nonnegative ${typeExpression}`;
    if (typeExpression.includes('global-frame') && projectDurationFrames !== undefined && (value as number) > projectDurationFrames) {
      return `must not exceed project duration ${projectDurationFrames}`;
    }
    return undefined;
  }
  if (typeExpression === 'frame-range') {
    if (!Array.isArray(value) || value.length !== 2 || !value.every(Number.isSafeInteger)) return 'must be a two-integer frame range';
    const [start, end] = value as number[];
    if (start < 0 || end <= start) return 'must be an increasing nonnegative frame range';
    if (projectDurationFrames !== undefined && end > projectDurationFrames) return `must end within project duration ${projectDurationFrames}`;
    return undefined;
  }
  const minimumArrayLength = typeExpression.match(/\[(\d+)\+\]$/)?.[1];
  if (minimumArrayLength) {
    if (!Array.isArray(value) || value.length < Number(minimumArrayLength)) {
      return `must be an array with at least ${minimumArrayLength} entries`;
    }
    if (typeExpression.startsWith('local-keyframe')) return validateLocalKeyframes(value);
    return undefined;
  }
  if (typeExpression.endsWith('[]')) return Array.isArray(value) ? undefined : 'must be an array';
  if (
    typeExpression === 'text'
    || typeExpression === 'id'
    || typeExpression.endsWith('-id')
    || typeExpression.endsWith('overlay-id')
  ) return typeof value === 'string' && value.length > 0 ? undefined : `must be a non-empty ${typeExpression}`;
  return undefined;
}

export function comparePortTypesV1(
  sourceType: string | undefined,
  targetType: string | undefined,
): PortCompatibilityV1 {
  if (!sourceType || !targetType) return 'UNVERIFIABLE';
  if (sourceType === targetType) return 'COMPATIBLE';
  const sourceFamily = portTypeFamily(sourceType);
  const targetFamily = portTypeFamily(targetType);
  if (!sourceFamily || !targetFamily) return 'INCOMPATIBLE';
  return sourceFamily === targetFamily ? 'COMPATIBLE' : 'INCOMPATIBLE';
}

function parseNumericRange(value: string): { minimum: number; maximum: number } | undefined {
  const match = value.match(/^(-?\d+(?:\.\d+)?)\.\.(-?\d+(?:\.\d+)?)$/);
  if (!match) return undefined;
  return { minimum: Number(match[1]), maximum: Number(match[2]) };
}

function portTypeFamily(typeExpression: string): string | undefined {
  if (parseNumericRange(typeExpression) || typeExpression === 'number') return 'number';
  if (['integer', 'frame', 'frames', 'global-frame', 'exclusive-global-frame'].includes(typeExpression)) return 'number';
  if (typeExpression === 'text' || typeExpression === 'id' || typeExpression.endsWith('-id')) return 'string';
  if (typeExpression.includes('|')) return 'string';
  if (typeExpression.endsWith('[]') || /\[\d+\+\]$/.test(typeExpression)) return 'array';
  return undefined;
}

function validateLocalKeyframes(value: unknown[]): string | undefined {
  let previousFrame = -1;
  for (const entry of value) {
    if (!isRecord(entry) || !Number.isSafeInteger(entry.frame) || (entry.frame as number) < 0) {
      return 'must contain local keyframes with nonnegative integer frames';
    }
    if ((entry.frame as number) <= previousFrame) return 'must contain strictly increasing local keyframes';
    previousFrame = entry.frame as number;
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
