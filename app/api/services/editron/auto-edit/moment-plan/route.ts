import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getDatabase, COLLECTIONS } from '@/lib/editron/db/mongodb';
import type { ProductionBrief } from '@/lib/editron/production-brief/production-brief';
import { readProjectAssetAnalyses } from '@/lib/editron/storyline/asset-analysis-reader';
import { buildAssetContextMap, scenesFromAssetAnalyses } from '@/lib/editron/storyline/multi-asset-compose';
import { checkMomentCoverage, planProjectEdit, type MomentRequestInput } from '@/lib/editron/storyline/moment-planning-service';
import { cutToMoment } from '@/lib/editron/storyline/cutting';
import type { CoverageQuery } from '@/lib/editron/storyline/coverage';
import type { Scene } from '@/lib/editron/storyline/scene';
import { generateEditronEmbedding } from '@/lib/editron/services/gemini-embedding';

export const runtime = 'nodejs';
export const maxDuration = 120;

type MomentPlanMode = 'plan' | 'coverage' | 'cut';

type MomentPlanRequest = {
  projectId?: string;
  mode?: MomentPlanMode;
  requests?: Array<{ text?: string; priority?: 'must' | 'nice' }>;
  query?: string;
  sceneId?: string;
  source?: string;
};

type ProjectDoc = {
  projectId: string;
  userId: string;
  productionBrief?: ProductionBrief;
  sourceAssetIds?: string[];
  sourceUploadBatchId?: string;
};

type MediaAssetDoc = {
  assetId: string;
  cachedUrl?: string | null;
  gcsPath?: string | null;
  thumbnailUrl?: string | null;
  thumbnail?: string | null;
  uploadedAt?: Date | string | null;
  dominantColors?: string[] | null;
};

function cleanString(value: unknown, limit = 4000): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, limit) : undefined;
}

function parseJsonObject(text: string): Record<string, any> | null {
  const cleaned = text.replace(/```json|```/g, '').trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, any> : null;
  } catch {
    return null;
  }
}

function defaultBrief(): ProductionBrief {
  return {
    output: { platform: 'unspecified', format: 'auto-edit', count: 1, aspectRatio: '16:9', targetDurationSec: null },
    brand: null,
    entryPoint: 'upload',
    resolution: { fieldConfidence: {}, confirmed: [], inferred: [] },
  };
}

function projectBrief(project: ProjectDoc): ProductionBrief {
  const brief = project.productionBrief;
  return brief?.output && brief.resolution && brief.entryPoint ? brief : defaultBrief();
}

function normalizeRequests(input: unknown): MomentRequestInput[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const source = item as { text?: unknown; priority?: unknown };
      const text = cleanString(source.text, 1000);
      if (!text) return null;
      const priority = source.priority === 'must' || source.priority === 'nice' ? source.priority : undefined;
      return { text, ...(priority ? { priority } : {}) };
    })
    .filter((item): item is MomentRequestInput => item !== null)
    .slice(0, 24);
}

function createdAt(value: unknown): Date | undefined {
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : undefined;
  }
  return undefined;
}

function mediaFilter(project: ProjectDoc, userId: string): Record<string, unknown> | null {
  const ids = Array.isArray(project.sourceAssetIds) ? project.sourceAssetIds.filter(Boolean) : [];
  if (ids.length > 0) return { userId, assetId: { $in: ids } };
  if (project.sourceUploadBatchId) return { userId, uploadBatchId: project.sourceUploadBatchId };
  return null;
}

async function loadScenes(db: any, project: ProjectDoc, userId: string): Promise<Scene[]> {
  const analyses = await readProjectAssetAnalyses(db, project.projectId);
  const filter = mediaFilter(project, userId);
  const mediaAssets = filter
    ? await db.collection(COLLECTIONS.MEDIA_ASSETS).find(filter, {
      projection: {
        _id: 0,
        assetId: 1,
        cachedUrl: 1,
        gcsPath: 1,
        thumbnailUrl: 1,
        thumbnail: 1,
        uploadedAt: 1,
        dominantColors: 1,
      },
    }).toArray() as MediaAssetDoc[]
    : [];
  const assetContexts = buildAssetContextMap(mediaAssets.map((asset) => ({
    assetId: asset.assetId,
    cachedUrl: asset.cachedUrl,
    gcsPath: asset.gcsPath,
    thumbnailUrl: asset.thumbnailUrl ?? asset.thumbnail,
    createdAt: createdAt(asset.uploadedAt),
    dominantColors: asset.dominantColors,
  })));
  return scenesFromAssetAnalyses(analyses, { assetContexts });
}

async function appEmbed(text: string): Promise<number[]> {
  return await generateEditronEmbedding(text, { taskType: 'SEMANTIC_SIMILARITY' }) ?? [];
}

function mimeTypeForSource(source: string): string {
  const lower = source.toLowerCase().split('?')[0];
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.mov')) return 'video/quicktime';
  return 'video/mp4';
}

async function vlmVerify(query: CoverageQuery, scene: Scene): Promise<{ confirmed: boolean; note?: string }> {
  if (!/^https?:\/\//i.test(scene.source)) return { confirmed: false, note: 'scene_source_not_public_url' };
  const { getAnalysisModel } = await import('@/lib/editron/utils/gemini-model-factory');
  const model = await getAnalysisModel();
  const result = await model.generateContent({
    contents: [{
      role: 'user',
      parts: [
        { fileData: { fileUri: scene.source, mimeType: mimeTypeForSource(scene.source) } },
        { text: `Look only at ${scene.startTime.toFixed(2)}s-${scene.endTime.toFixed(2)}s of this source. Does it depict this requested moment: "${query.text}"? Return JSON only: {"confirmed":true|false,"note":"short evidence"}. Do not infer from transcript alone.` },
      ],
    }],
    generationConfig: { temperature: 0, seed: 42, responseMimeType: 'application/json' },
  });
  const parsed = parseJsonObject(result.response.text());
  return { confirmed: parsed?.confirmed === true, note: cleanString(parsed?.note, 240) };
}

async function vlmCut(request: { text: string }, scene: Scene): Promise<{ present: boolean; windows: Array<{ startSec: number; endSec: number; confidence: number }>; note?: string }> {
  if (!/^https?:\/\//i.test(scene.source)) return { present: false, windows: [], note: 'scene_source_not_public_url' };
  const { getAnalysisModel } = await import('@/lib/editron/utils/gemini-model-factory');
  const model = await getAnalysisModel();
  const result = await model.generateContent({
    contents: [{
      role: 'user',
      parts: [
        { fileData: { fileUri: scene.source, mimeType: mimeTypeForSource(scene.source) } },
        { text: `Find the exact window(s), in absolute source seconds, where this requested moment appears: "${request.text}". Only search inside ${scene.startTime.toFixed(2)}s-${scene.endTime.toFixed(2)}s. Return JSON only: {"present":true|false,"windows":[{"startSec":0,"endSec":0,"confidence":0.0}],"note":"short evidence"}.` },
      ],
    }],
    generationConfig: { temperature: 0, seed: 42, responseMimeType: 'application/json' },
  });
  const parsed = parseJsonObject(result.response.text()) ?? {};
  const windows = Array.isArray(parsed.windows)
    ? parsed.windows.map((w: any) => ({ startSec: Number(w.startSec), endSec: Number(w.endSec), confidence: Number(w.confidence) }))
    : [];
  return { present: parsed.present === true, windows, note: cleanString(parsed.note, 240) };
}

function findScene(scenes: readonly Scene[], body: MomentPlanRequest, coverageScene?: Scene): Scene | undefined {
  if (body.sceneId) return scenes.find((scene) => scene.id === body.sceneId);
  if (body.source) return scenes.find((scene) => scene.source === body.source);
  return coverageScene;
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const body = await request.json() as MomentPlanRequest;
    const projectId = cleanString(body.projectId, 160);
    if (!projectId) return NextResponse.json({ success: false, error: 'projectId is required' }, { status: 400 });

    const mode: MomentPlanMode = body.mode === 'coverage' || body.mode === 'cut' ? body.mode : 'plan';
    const db = await getDatabase();
    const project = await db.collection(COLLECTIONS.PROJECTS).findOne({ projectId, userId }) as ProjectDoc | null;
    if (!project) return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 });

    const scenes = await loadScenes(db, project, userId);
    if (scenes.length === 0) {
      return NextResponse.json({ success: false, error: 'Project has no composable asset analyses yet.' }, { status: 409 });
    }

    if (mode === 'plan') {
      const requests = normalizeRequests(body.requests);
      if (requests.length === 0) return NextResponse.json({ success: false, error: 'requests are required for plan mode' }, { status: 400 });
      const result = await planProjectEdit(scenes, projectBrief(project), requests, { embed: appEmbed, verify: vlmVerify });
      return NextResponse.json({ success: true, mode, projectId, sceneCount: scenes.length, ...result });
    }

    const query = cleanString(body.query, 1000);
    if (!query) return NextResponse.json({ success: false, error: 'query is required' }, { status: 400 });
    const coverage = await checkMomentCoverage(scenes, query, { embed: appEmbed, verify: vlmVerify });
    if (mode === 'coverage') {
      return NextResponse.json({ success: true, mode, projectId, sceneCount: scenes.length, coverage });
    }

    const scene = findScene(scenes, body, coverage.best?.scene);
    if (!scene) return NextResponse.json({ success: false, error: 'No scene available for cut mode' }, { status: 404 });
    const cut = await cutToMoment(scene, { text: query }, vlmCut);
    return NextResponse.json({ success: true, mode, projectId, sceneCount: scenes.length, coverage, cut });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[auto-edit/moment-plan] failed:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}