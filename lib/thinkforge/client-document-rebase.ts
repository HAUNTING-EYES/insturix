import { validateTiptapJSON } from './schemas/tiptap-validation';
import type { TiptapJSON } from './schemas/tiptap-schema';

export interface ThinkForgeDocumentRevision {
  title: string;
  richText: Record<string, unknown>;
}

export interface ThinkForgeDocumentRebaseConflict {
  path: string;
  reason: 'overlapping_change' | 'delete_modify';
}

export type ThinkForgeDocumentRebaseResult =
  | { status: 'merged'; title: string; richText: TiptapJSON }
  | { status: 'conflict'; conflicts: ThinkForgeDocumentRebaseConflict[] };

interface SequenceEdit {
  start: number;
  end: number;
  replacement: unknown[];
  source: 'local' | 'remote';
}

const CONFLICT = Symbol('thinkforge-document-rebase-conflict');
const MAX_LCS_CELLS = 1_000_000;

export function rebaseThinkForgeDocument(input: {
  base: ThinkForgeDocumentRevision;
  local: ThinkForgeDocumentRevision;
  remote: ThinkForgeDocumentRevision;
}): ThinkForgeDocumentRebaseResult {
  const base = validateTiptapJSON(input.base.richText);
  const local = validateTiptapJSON(input.local.richText);
  const remote = validateTiptapJSON(input.remote.richText);
  const conflicts: ThinkForgeDocumentRebaseConflict[] = [];

  const title = mergeValue(input.base.title, input.local.title, input.remote.title, '$.title', conflicts);
  const richText = mergeValue(base, local, remote, '$.richText', conflicts);

  if (title === CONFLICT || richText === CONFLICT || conflicts.length > 0) {
    return { status: 'conflict', conflicts: dedupeConflicts(conflicts) };
  }

  return {
    status: 'merged',
    title: title as string,
    richText: validateTiptapJSON(richText),
  };
}

function mergeValue(
  base: unknown,
  local: unknown,
  remote: unknown,
  path: string,
  conflicts: ThinkForgeDocumentRebaseConflict[],
): unknown | typeof CONFLICT {
  if (deepEqual(local, remote)) return local;
  if (deepEqual(local, base)) return remote;
  if (deepEqual(remote, base)) return local;

  if (typeof base === 'string' && typeof local === 'string' && typeof remote === 'string') {
    const merged = mergeSequence(
      tokenize(base),
      tokenize(local),
      tokenize(remote),
      path,
      conflicts,
    );
    return merged === CONFLICT ? CONFLICT : merged.join('');
  }

  if (Array.isArray(base) && Array.isArray(local) && Array.isArray(remote)) {
    return mergeSequence(base, local, remote, path, conflicts);
  }

  if (isRecord(base) && isRecord(local) && isRecord(remote)) {
    const merged: Record<string, unknown> = {};
    const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);
    for (const key of keys) {
      const baseHas = Object.prototype.hasOwnProperty.call(base, key);
      const localHas = Object.prototype.hasOwnProperty.call(local, key);
      const remoteHas = Object.prototype.hasOwnProperty.call(remote, key);
      const childPath = `${path}.${key}`;

      if (!baseHas) {
        if (localHas && remoteHas && deepEqual(local[key], remote[key])) merged[key] = local[key];
        else if (localHas && !remoteHas) merged[key] = local[key];
        else if (!localHas && remoteHas) merged[key] = remote[key];
        else if (localHas && remoteHas) recordConflict(conflicts, childPath, 'overlapping_change');
        continue;
      }

      if (!localHas && !remoteHas) continue;
      if (!localHas) {
        if (deepEqual(remote[key], base[key])) continue;
        recordConflict(conflicts, childPath, 'delete_modify');
        continue;
      }
      if (!remoteHas) {
        if (deepEqual(local[key], base[key])) continue;
        recordConflict(conflicts, childPath, 'delete_modify');
        continue;
      }

      const child = mergeValue(base[key], local[key], remote[key], childPath, conflicts);
      if (child !== CONFLICT) merged[key] = child;
    }
    return conflicts.length > 0 ? CONFLICT : merged;
  }

  recordConflict(conflicts, path, 'overlapping_change');
  return CONFLICT;
}

function mergeSequence(
  base: unknown[],
  local: unknown[],
  remote: unknown[],
  path: string,
  conflicts: ThinkForgeDocumentRebaseConflict[],
): unknown[] | typeof CONFLICT {
  const edits: SequenceEdit[] = [
    ...diffSequence(base, local).map((edit) => ({ ...edit, source: 'local' as const })),
    ...diffSequence(base, remote).map((edit) => ({ ...edit, source: 'remote' as const })),
  ].sort(compareEdits);
  const resolved: SequenceEdit[] = [];

  for (const edit of edits) {
    const overlapIndex = resolved.findIndex((candidate) => editsOverlap(candidate, edit));
    if (overlapIndex === -1) {
      resolved.push(edit);
      continue;
    }

    const existing = resolved[overlapIndex];
    if (existing.source === edit.source) {
      recordConflict(conflicts, `${path}[${Math.min(existing.start, edit.start)}]`, 'overlapping_change');
      continue;
    }
    if (existing.start === edit.start
      && existing.end === edit.end
      && deepEqual(existing.replacement, edit.replacement)) {
      continue;
    }

    const replacedCount = existing.end - existing.start;
    if (existing.start === edit.start
      && existing.end === edit.end
      && replacedCount === 1
      && existing.replacement.length === 1
      && edit.replacement.length === 1) {
      const localReplacement = existing.source === 'local' ? existing.replacement[0] : edit.replacement[0];
      const remoteReplacement = existing.source === 'remote' ? existing.replacement[0] : edit.replacement[0];
      const merged = mergeValue(
        base[existing.start],
        localReplacement,
        remoteReplacement,
        `${path}[${existing.start}]`,
        conflicts,
      );
      if (merged !== CONFLICT) {
        resolved[overlapIndex] = { ...existing, replacement: [merged], source: 'local' };
      }
      continue;
    }

    recordConflict(
      conflicts,
      `${path}[${Math.min(existing.start, edit.start)}]`,
      existing.replacement.length === 0 || edit.replacement.length === 0
        ? 'delete_modify'
        : 'overlapping_change',
    );
  }

  if (conflicts.length > 0) return CONFLICT;

  resolved.sort(compareEdits);
  const output: unknown[] = [];
  let cursor = 0;
  for (const edit of resolved) {
    output.push(...base.slice(cursor, edit.start), ...edit.replacement);
    cursor = edit.end;
  }
  output.push(...base.slice(cursor));
  return output;
}

function diffSequence(base: unknown[], target: unknown[]): Omit<SequenceEdit, 'source'>[] {
  if (deepEqual(base, target)) return [];
  if ((base.length + 1) * (target.length + 1) > MAX_LCS_CELLS) {
    return [singleContiguousEdit(base, target)];
  }

  const baseKeys = base.map(fingerprint);
  const targetKeys = target.map(fingerprint);
  const width = target.length + 1;
  const matrix = new Uint32Array((base.length + 1) * width);
  for (let i = base.length - 1; i >= 0; i -= 1) {
    for (let j = target.length - 1; j >= 0; j -= 1) {
      matrix[i * width + j] = baseKeys[i] === targetKeys[j]
        ? matrix[(i + 1) * width + j + 1] + 1
        : Math.max(matrix[(i + 1) * width + j], matrix[i * width + j + 1]);
    }
  }

  const matches: Array<[number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < base.length && j < target.length) {
    if (baseKeys[i] === targetKeys[j]) {
      matches.push([i, j]);
      i += 1;
      j += 1;
    } else if (matrix[(i + 1) * width + j] >= matrix[i * width + j + 1]) {
      i += 1;
    } else {
      j += 1;
    }
  }

  const edits: Omit<SequenceEdit, 'source'>[] = [];
  let baseCursor = 0;
  let targetCursor = 0;
  for (const [baseIndex, targetIndex] of [...matches, [base.length, target.length] as [number, number]]) {
    if (baseCursor !== baseIndex || targetCursor !== targetIndex) {
      edits.push({
        start: baseCursor,
        end: baseIndex,
        replacement: target.slice(targetCursor, targetIndex),
      });
    }
    baseCursor = baseIndex + 1;
    targetCursor = targetIndex + 1;
  }
  return edits;
}

function singleContiguousEdit(base: unknown[], target: unknown[]): Omit<SequenceEdit, 'source'> {
  let prefix = 0;
  while (prefix < base.length && prefix < target.length && deepEqual(base[prefix], target[prefix])) prefix += 1;
  let baseSuffix = base.length;
  let targetSuffix = target.length;
  while (baseSuffix > prefix
    && targetSuffix > prefix
    && deepEqual(base[baseSuffix - 1], target[targetSuffix - 1])) {
    baseSuffix -= 1;
    targetSuffix -= 1;
  }
  return { start: prefix, end: baseSuffix, replacement: target.slice(prefix, targetSuffix) };
}

function editsOverlap(left: SequenceEdit, right: SequenceEdit): boolean {
  const leftInsertion = left.start === left.end;
  const rightInsertion = right.start === right.end;
  if (leftInsertion && rightInsertion) return left.start === right.start;
  if (leftInsertion) return left.start >= right.start && left.start < right.end;
  if (rightInsertion) return right.start >= left.start && right.start < left.end;
  return Math.max(left.start, right.start) < Math.min(left.end, right.end);
}

function compareEdits(left: SequenceEdit, right: SequenceEdit): number {
  return left.start - right.start || left.end - right.end || left.source.localeCompare(right.source);
}

function tokenize(value: string): string[] {
  return value.match(/\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu) ?? [];
}

function fingerprint(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(fingerprint).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${fingerprint(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? String(value);
}

function deepEqual(left: unknown, right: unknown): boolean {
  return fingerprint(left) === fingerprint(right);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function recordConflict(
  conflicts: ThinkForgeDocumentRebaseConflict[],
  path: string,
  reason: ThinkForgeDocumentRebaseConflict['reason'],
): void {
  conflicts.push({ path, reason });
}

function dedupeConflicts(conflicts: ThinkForgeDocumentRebaseConflict[]): ThinkForgeDocumentRebaseConflict[] {
  return conflicts.filter((conflict, index) => (
    conflicts.findIndex((candidate) => candidate.path === conflict.path && candidate.reason === conflict.reason) === index
  ));
}
