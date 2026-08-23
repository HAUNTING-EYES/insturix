import { hashCanonicalJsonV1, type JsonValueV1 } from './contracts-v1';
import type { Project } from '../../services/project-service';

/** Canonical proposal-visible Project state; storage identity and revision live in separate receipts. */
export function projectProposalStateV2R(project: Readonly<Project>): JsonValueV1 {
  const {
    _id: _ignoredId,
    createdAt: _ignoredCreatedAt,
    updatedAt: _ignoredUpdatedAt,
    projectRevision: _ignoredRevision,
    ...state
  } = project;
  return normalizeJson(state, '$');
}

export function changedProjectProposalPathsV2R(
  left: JsonValueV1,
  right: JsonValueV1,
  path = '$',
): string[] {
  if (hashCanonicalJsonV1(left) === hashCanonicalJsonV1(right)) return [];
  if (Array.isArray(left) && Array.isArray(right)) {
    const paths = Array.from({ length: Math.max(left.length, right.length) }, (_, index) => (
      index < left.length && index < right.length
        ? changedProjectProposalPathsV2R(left[index], right[index], `${path}[${index}]`)
        : [`${path}[${index}]`]
    )).flat();
    return paths.length ? paths : [path];
  }
  if (isJsonObject(left) && isJsonObject(right)) {
    const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
    const paths = keys.flatMap((key) => (
      key in left && key in right
        ? changedProjectProposalPathsV2R(left[key], right[key], `${path}.${key}`)
        : [`${path}.${key}`]
    ));
    return paths.length ? paths : [path];
  }
  return [path];
}

export function isoProjectProposalDateV2R(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('PROJECTSERVICE_PROPOSAL_DATE_INVALID');
  return date.toISOString();
}

function normalizeJson(value: unknown, path: string): JsonValueV1 {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value) && !Object.is(value, -0)) return value;
  if (value instanceof Date) return isoProjectProposalDateV2R(value);
  if (Array.isArray(value)) {
    if (Array.from({ length: value.length }, (_, index) => index)
      .some((index) => !(index in value))) {
      throw new Error(`PROJECTSERVICE_PROPOSAL_STATE_SPARSE_ARRAY:${path}`);
    }
    return value.map((entry, index) => normalizeJson(entry, `${path}[${index}]`));
  }
  if (!value || typeof value !== 'object') {
    throw new Error(`PROJECTSERVICE_PROPOSAL_STATE_UNSUPPORTED:${path}`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`PROJECTSERVICE_PROPOSAL_STATE_NON_PLAIN_OBJECT:${path}`);
  }
  const output: Record<string, JsonValueV1> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    const child = (value as Record<string, unknown>)[key];
    if (child === undefined) {
      throw new Error(`PROJECTSERVICE_PROPOSAL_STATE_UNDEFINED:${path}.${key}`);
    }
    output[key] = normalizeJson(child, `${path}.${key}`);
  }
  return output;
}

function isJsonObject(value: JsonValueV1): value is { [key: string]: JsonValueV1 } {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
