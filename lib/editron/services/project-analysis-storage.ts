type ProjectAnalysisKind =
  | 'rawFootageAnalysis'
  | 'segmentAnalysis'
  | 'vjepaAnalysis'
  | 'wav2vecAnalysis'
  | 'momentWeightMap'
  | 'musicAnalysis';

type ProjectAnalysisValues = Partial<Record<ProjectAnalysisKind, unknown>>;

export const PROJECT_ASSET_ANALYSES_COLLECTION = 'editron_asset_analyses';

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

type ProjectAssetAnalysisCollection = {
  updateOne(
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
    options: { upsert: true },
  ): Promise<unknown>;
};

type ProjectAssetAnalysisDb = {
  collection(name: string): ProjectAssetAnalysisCollection;
};

function assertProjectId(projectId: string): string {
  const trimmed = projectId.trim();
  if (!trimmed) throw new Error('projectId is required for per-asset analysis storage');
  return trimmed;
}

export function buildProjectAssetAnalysisDocumentUpdate(
  projectId: string,
  assetId: string,
  values: ProjectAnalysisValues,
  updatedAt: Date,
): {
  filter: { projectId: string; assetId: string };
  update: { $set: Record<string, unknown>; $setOnInsert: { createdAt: Date } };
  options: { upsert: true };
} {
  const cleanProjectId = assertProjectId(projectId);
  const cleanAssetId = assetId.trim();
  encodeProjectAnalysisAssetKey(cleanAssetId);

  const set: Record<string, unknown> = {
    projectId: cleanProjectId,
    assetId: cleanAssetId,
    updatedAt,
  };

  for (const [kind, value] of Object.entries(values) as Array<[ProjectAnalysisKind, unknown]>) {
    if (value == null) continue;
    set[kind] = value;
  }

  return {
    filter: { projectId: cleanProjectId, assetId: cleanAssetId },
    update: {
      $set: set,
      $setOnInsert: { createdAt: updatedAt },
    },
    options: { upsert: true },
  };
}

export async function persistProjectAssetAnalysis(
  db: ProjectAssetAnalysisDb,
  projectId: string,
  assetId: string,
  values: ProjectAnalysisValues,
  updatedAt: Date,
): Promise<void> {
  const write = buildProjectAssetAnalysisDocumentUpdate(projectId, assetId, values, updatedAt);
  await db
    .collection(PROJECT_ASSET_ANALYSES_COLLECTION)
    .updateOne(write.filter, write.update, write.options);
}