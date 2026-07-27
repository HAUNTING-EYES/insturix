type ProjectAnalysisKind =
  | 'rawFootageAnalysis'
  | 'segmentAnalysis'
  | 'vjepaAnalysis'
  | 'wav2vecAnalysis'
  | 'momentWeightMap'
  | 'musicAnalysis';

type ProjectAnalysisValues = Partial<Record<ProjectAnalysisKind, unknown>>;

export const PROJECT_ASSET_ANALYSES_COLLECTION = 'editron_asset_analyses';
export const CANONICAL_ASSET_ANALYSES_COLLECTION = 'asset_analyses';

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

type ProjectAssetAnalysisDocument = Record<string, unknown> & {
  projectId?: string;
  assetId?: string;
};

type ProjectAssetAnalysisReadCollection = {
  find(filter: Record<string, unknown>): {
    toArray(): Promise<ProjectAssetAnalysisDocument[]>;
  };
};

type ProjectAssetAnalysisReadDb = {
  collection(name: string): ProjectAssetAnalysisReadCollection;
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

export async function loadCanonicalProjectAssetAnalyses(
  db: ProjectAssetAnalysisReadDb,
  input: {
    projectId: string;
    userId: string;
    assetIds: readonly string[];
  },
): Promise<ProjectAssetAnalysisDocument[]> {
  const projectId = assertProjectId(input.projectId);
  const userId = input.userId.trim();
  if (!userId) throw new Error('userId is required for canonical per-asset analysis reads');

  const assetIds = [...new Set(input.assetIds.map((assetId) => assetId.trim()).filter(Boolean))];
  if (assetIds.length === 0) return [];

  const [projectSnapshots, canonicalAssets] = await Promise.all([
    db.collection(PROJECT_ASSET_ANALYSES_COLLECTION).find({
      projectId,
      assetId: { $in: assetIds },
    }).toArray(),
    db.collection(CANONICAL_ASSET_ANALYSES_COLLECTION).find({
      userId,
      assetId: { $in: assetIds },
      status: 'complete',
    }).toArray(),
  ]);

  const snapshotsByAsset = indexFreshestAnalysis(projectSnapshots);
  const canonicalByAsset = indexFreshestAnalysis(canonicalAssets);

  return assetIds.flatMap((assetId) => {
    const snapshot = snapshotsByAsset.get(assetId);
    const canonical = canonicalByAsset.get(assetId);
    if (!snapshot && !canonical) return [];

    const preferCanonical = canonical && (
      !snapshot || compareAnalysisAuthority(canonical, snapshot) > 0
    );
    const merged = preferCanonical
      ? { ...snapshot, ...canonical }
      : { ...canonical, ...snapshot };
    return [{
      ...merged,
      projectId,
      assetId,
    }];
  });
}

function indexFreshestAnalysis(
  documents: readonly ProjectAssetAnalysisDocument[],
): Map<string, ProjectAssetAnalysisDocument> {
  const indexed = new Map<string, ProjectAssetAnalysisDocument>();
  for (const document of documents) {
    const assetId = typeof document.assetId === 'string' ? document.assetId.trim() : '';
    if (!assetId) continue;
    const current = indexed.get(assetId);
    if (!current || compareAnalysisAuthority(document, current) > 0) {
      indexed.set(assetId, document);
    }
  }
  return indexed;
}

function compareAnalysisAuthority(
  left: ProjectAssetAnalysisDocument,
  right: ProjectAssetAnalysisDocument,
): number {
  const semanticDelta = Number(hasTimeLocalizedSemanticVisual(left))
    - Number(hasTimeLocalizedSemanticVisual(right));
  if (semanticDelta !== 0) return semanticDelta;

  const versionDelta = analysisVersion(left) - analysisVersion(right);
  if (versionDelta !== 0) return versionDelta;

  return analysisTimestamp(left) - analysisTimestamp(right);
}

function hasTimeLocalizedSemanticVisual(document: ProjectAssetAnalysisDocument): boolean {
  const segmentAnalysis = asRecord(document.segmentAnalysis);
  const segments = Array.isArray(segmentAnalysis.segments) ? segmentAnalysis.segments : [];
  return segments.some((value) => {
    const segment = asRecord(value);
    const semanticVisual = asRecord(segment.semanticVisual);
    const windows = Array.isArray(semanticVisual.windows) ? semanticVisual.windows : [];
    return windows.some((windowValue) => {
      const window = asRecord(windowValue);
      return isFiniteNumber(window.startSec)
        && isFiniteNumber(window.endSec)
        && window.endSec > window.startSec;
    });
  });
}

function analysisVersion(document: ProjectAssetAnalysisDocument): number {
  const deepVersion = document.deepAnalysisVersion;
  if (isFiniteNumber(deepVersion)) return deepVersion;
  const segmentVersion = asRecord(document.segmentAnalysis).version;
  return isFiniteNumber(segmentVersion) ? segmentVersion : 0;
}

function analysisTimestamp(document: ProjectAssetAnalysisDocument): number {
  for (const value of [
    document.deepAnalysisUpdatedAt,
    document.updatedAt,
    document.createdAt,
  ]) {
    const timestamp = value instanceof Date ? value.getTime() : Date.parse(String(value ?? ''));
    if (Number.isFinite(timestamp)) return timestamp;
  }
  return 0;
}

function asRecord(value: unknown): Record<string, any> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
