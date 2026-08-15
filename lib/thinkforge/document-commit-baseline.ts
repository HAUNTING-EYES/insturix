export interface ThinkForgeDocumentCommitBaseline {
  scriptId: string;
  version: number;
}

export function createThinkForgeDocumentCommitBaseline(
  scriptId: string,
  version: number,
): ThinkForgeDocumentCommitBaseline {
  const normalizedScriptId = scriptId.trim();
  if (!normalizedScriptId) throw new Error('A document ID is required to capture a commit baseline.');
  if (!Number.isInteger(version) || version < 0) {
    throw new Error('A document commit baseline requires a non-negative integer version.');
  }
  return { scriptId: normalizedScriptId, version };
}

export function resolveThinkForgeCommitBaseVersion(
  baseline: ThinkForgeDocumentCommitBaseline | null,
  targetScriptId: string,
): number {
  const normalizedTargetId = targetScriptId.trim();
  if (!normalizedTargetId) throw new Error('A target document ID is required before commit.');
  return baseline?.scriptId === normalizedTargetId ? baseline.version : 0;
}
