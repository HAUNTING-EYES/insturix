type ProjectAnalysisKind =
  | 'rawFootageAnalysis'
  | 'segmentAnalysis'
  | 'vjepaAnalysis'
  | 'wav2vecAnalysis'
  | 'momentWeightMap'
  | 'musicAnalysis';

type ProjectAnalysisValues = Partial<Record<ProjectAnalysisKind, unknown>>;

const PROJECT_ANALYSIS_FIELD_BY_KIND: Record<ProjectAnalysisKind, string> = {
  rawFootageAnalysis: 'rawFootageAnalysisByAsset',
  segmentAnalysis: 'segmentAnalysisByAsset',
  vjepaAnalysis: 'vjepaAnalysisByAsset',
  wav2vecAnalysis: 'wav2vecAnalysisByAsset',
  momentWeightMap: 'momentWeightMapByAsset',
  musicAnalysis: 'musicAnalysisByAsset',
};

export function encodeProjectAnalysisAssetKey(assetId: string): string {
  const trimmed = assetId.trim();
  if (!trimmed) throw new Error('assetId is required for per-asset analysis storage');
  return Buffer.from(trimmed, 'utf8').toString('base64url');
}

export function projectAnalysisAssetPath(kind: ProjectAnalysisKind, assetId: string): string {
  return `${PROJECT_ANALYSIS_FIELD_BY_KIND[kind]}.${encodeProjectAnalysisAssetKey(assetId)}`;
}

export function buildProjectAnalysisAssetSet(
  assetId: string,
  values: ProjectAnalysisValues,
  updatedAt: Date,
): Record<string, unknown> {
  const key = encodeProjectAnalysisAssetKey(assetId);
  const set: Record<string, unknown> = {
    [`analysisAssetIndex.${key}`]: { assetId, updatedAt },
  };

  for (const [kind, value] of Object.entries(values) as Array<[ProjectAnalysisKind, unknown]>) {
    if (value == null) continue;
    set[`${PROJECT_ANALYSIS_FIELD_BY_KIND[kind]}.${key}`] = value;
  }

  return set;
}
