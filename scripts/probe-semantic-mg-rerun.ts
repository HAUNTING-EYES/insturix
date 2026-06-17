import { config } from 'dotenv';
import { MongoClient } from 'mongodb';
import * as fs from 'fs';
import * as path from 'path';

import type { EditDecision, EditDecisionList } from '../lib/editron/services/reactive-edit-engine';
import type { CreativeIntentPlan } from '../lib/editron/services/unified-edit-intelligence';
import {
  evaluateRealProjectMgTasteGate,
  type RealProjectMgTasteGateInput,
} from '../lib/editron/motion-graphics/engine/eval/real-project-mg-taste-gate';

config({ path: '.env.local' });
ensureReadOnlyProbeEnv();

type TranslateCreativeIntentToEDL = typeof import('../lib/editron/services/intent-translator')['translateCreativeIntentToEDL'];

interface TimedWord {
  word: string;
  startMs: number;
  endMs: number;
}

interface SceneFrameContext {
  sceneIndex: number;
  fromFrame: number;
  durationFrames: number;
  voiceoverWords: TimedWord[];
  onScreenText?: string[];
}

interface Args {
  projectId?: string;
  maxScenes?: number;
  maxDecisions?: number;
  candidateOnly: boolean;
  outDir: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    candidateOnly: false,
    outDir: path.resolve(process.cwd(), '.calibration-temp', 'semantic-mg-rerun'),
  };
  for (const arg of argv) {
    if (arg.startsWith('--max-scenes=')) args.maxScenes = numeric(arg.slice('--max-scenes='.length));
    else if (arg.startsWith('--max-decisions=')) args.maxDecisions = numeric(arg.slice('--max-decisions='.length));
    else if (arg === '--candidate-only') args.candidateOnly = true;
    else if (arg.startsWith('--out=')) args.outDir = path.resolve(process.cwd(), arg.slice('--out='.length));
    else if (!args.projectId) args.projectId = arg;
  }
  return args;
}

function usage(): never {
  console.error('Usage: npx tsx scripts/probe-semantic-mg-rerun.ts <projectId> [--max-scenes=40] [--max-decisions=40] [--candidate-only] [--out=.calibration-temp/semantic-mg-rerun]');
  process.exit(1);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.projectId) usage();

  console.log('Importing live MG translator/executor...');
  const { translateCreativeIntentToEDL } = await import('../lib/editron/services/intent-translator');

  const uri = process.env.MONGODB_URI ?? '';
  if (!uri) {
    console.error('MONGODB_URI missing. Put it in .env.local or the process environment.');
    process.exit(1);
  }

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
  console.log(`Loading project ${args.projectId}...`);
  await client.connect();
  try {
    const db = client.db('editron_prev');
    const project = await db.collection('projects').findOne({ projectId: args.projectId });
    if (!project) {
      console.error(`Project not found: ${args.projectId}`);
      process.exit(1);
    }

    const fps = numeric(project.fps) ?? 30;
    const overlays = Array.isArray(project.overlays) ? project.overlays as Array<Record<string, unknown>> : [];
    const transcriptWords = extractTranscriptWords(project.rawFootageAnalysis?.transcription?.words);
    const sourceSegments = extractTranscriptSegments(project.rawFootageAnalysis?.segments, transcriptWords);
    const scenes = buildSceneContexts(sourceSegments, transcriptWords, fps, args.maxScenes);
    console.log(`Built ${scenes.length} transcript scenes from ${transcriptWords.length} timed words.`);
    if (scenes.length === 0) {
      console.error('No timed transcript scenes available for semantic MG replay.');
      process.exit(1);
    }

    const graphicsDensity = resolveGraphicsDensity(project.genreParameters ?? project.genreParametersSignalComputed);
    const plan = buildEmptyGraphicIntentPlan(String(project.projectId ?? args.projectId), scenes);
    const translation = translateCreativeIntentToEDL(
      plan,
      scenes,
      new Map(),
      overlays as any,
      fps,
      graphicsDensity,
      objectRecord(project.genreParameters ?? project.genreParametersSignalComputed) ?? undefined,
    );
    const graphicDecisions = translation.decisions.filter((decision) => decision.type === 'graphic');
    const replayGraphicDecisions = args.maxDecisions
      ? graphicDecisions.slice(0, args.maxDecisions)
      : graphicDecisions;
    console.log(`Translated ${graphicDecisions.length} graphic decisions; replaying ${replayGraphicDecisions.length}.`);
    const artifactProjectId = `${String(project.projectId ?? args.projectId)}-semantic-rerun`;
    const projectOutDir = path.join(args.outDir, String(project.projectId ?? args.projectId));
    fs.mkdirSync(projectOutDir, { recursive: true });
    if (args.candidateOnly) {
      const reportPath = path.join(projectOutDir, 'semantic-mg-candidates.json');
      fs.writeFileSync(reportPath, JSON.stringify({
        projectId: String(project.projectId ?? args.projectId),
        artifactProjectId,
        replayMode: 'candidate-only-transcript-semantic-facts',
        writesToMongo: false,
        input: {
          fps,
          scenes: scenes.length,
          transcriptWords: transcriptWords.length,
          originalMotionGraphics: overlays.filter((overlay) => overlay.type === 'motion-graphic').length,
          graphicsDensity,
        },
        translation: {
          stats: translation.stats,
          warnings: translation.warnings,
          graphicDecisions: graphicDecisions.length,
          replayedGraphicDecisions: replayGraphicDecisions.length,
          factKinds: factKindCounts(graphicDecisions),
          sampleGraphicDecisions: graphicDecisions.slice(0, 24),
        },
      }, null, 2));
      console.log(`Candidate-only report -> ${reportPath}`);
      return;
    }

    const edl = buildGraphicOnlyEDL(String(project.projectId ?? args.projectId), replayGraphicDecisions, fps, project.durationInFrames);

    const { executeEDL } = await import('../lib/editron/services/edl-executor');
    const replayOverlays = deepClone(overlays)
      .filter((overlay) => overlay.type !== 'motion-graphic' && overlay.type !== 'html-scene');
    const canvas = inferCanvas(overlays, numeric(project.width), numeric(project.height));
    console.log('Executing graphic-only EDL on cloned overlays...');
    const execution = await executeEDL(
      edl,
      String(project.projectId ?? args.projectId),
      String(project.userId ?? ''),
      replayOverlays as any,
      canvas,
      new Map(),
      graphicsDensity,
    );

    const motionGraphics = replayOverlays
      .filter((overlay) => overlay.type === 'motion-graphic')
      .sort((a, b) => (numeric(a.from) ?? 0) - (numeric(b.from) ?? 0));
    const gateInput: RealProjectMgTasteGateInput = {
      projectId: `${String(project.projectId ?? args.projectId)}-semantic-rerun`,
      fps,
      durationInFrames: numeric(project.durationInFrames),
      width: canvas.width,
      height: canvas.height,
      genreParameters: objectRecord(project.genreParameters ?? project.genreParametersSignalComputed) ?? {},
      overlays: replayOverlays,
    };
    const gate = evaluateRealProjectMgTasteGate(gateInput);

    const stillInputPath = path.resolve(process.cwd(), '.calibration-temp', `${artifactProjectId}-mgs.json`);
    fs.writeFileSync(stillInputPath, JSON.stringify({
      projectId: artifactProjectId,
      width: canvas.width,
      height: canvas.height,
      mgs: motionGraphics.map((overlay) => ({
        ...overlay,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
      })),
    }, null, 2));

    const reportPath = path.join(projectOutDir, 'semantic-mg-rerun.json');
    fs.writeFileSync(reportPath, JSON.stringify({
      projectId: String(project.projectId ?? args.projectId),
      artifactProjectId,
      replayMode: 'transcript-semantic-facts-only',
      writesToMongo: false,
      input: {
        fps,
        scenes: scenes.length,
        transcriptWords: transcriptWords.length,
        originalMotionGraphics: overlays.filter((overlay) => overlay.type === 'motion-graphic').length,
        graphicsDensity,
      },
      translation: {
        stats: translation.stats,
        warnings: translation.warnings,
        graphicDecisions: graphicDecisions.length,
        replayedGraphicDecisions: replayGraphicDecisions.length,
        factKinds: factKindCounts(graphicDecisions),
        sampleGraphicDecisions: graphicDecisions.slice(0, 12),
      },
      execution: {
        ...execution,
        budgetRejectedZoomAssetIds: [...execution.budgetRejectedZoomAssetIds],
        zoomedAssetIds: [...execution.zoomedAssetIds],
      },
      renderedMotionGraphics: motionGraphics.length,
      gate,
      artifacts: {
        stillInput: stillInputPath,
        renderCommand: `npx tsx scripts/render-mg-stills.ts ${artifactProjectId}`,
      },
    }, null, 2));

    console.log(`Semantic MG rerun probe: ${String(project.projectId ?? args.projectId)}`);
    console.log(`Scenes=${scenes.length} words=${transcriptWords.length} density=${graphicsDensity}`);
    console.log(`Translated graphic decisions=${graphicDecisions.length} replayed=${replayGraphicDecisions.length}`);
    console.log(`Executed=${execution.decisionsExecuted} skipped=${execution.decisionsSkipped} newMGs=${motionGraphics.length}`);
    console.log(`Taste gate=${gate.status} score=${gate.score}`);
    console.log(JSON.stringify(gate.summary, null, 2));
    for (const finding of gate.findings) {
      console.log(`${finding.severity.toUpperCase()} ${finding.code}: ${finding.message}`);
      console.log(JSON.stringify(finding.evidence, null, 2));
    }
    console.log(`Report -> ${reportPath}`);
    console.log(`Still input -> ${stillInputPath}`);
    console.log(`Render stills -> npx tsx scripts/render-mg-stills.ts ${artifactProjectId}`);
  } finally {
    await client.close();
  }
}

function buildEmptyGraphicIntentPlan(projectId: string, scenes: SceneFrameContext[]): CreativeIntentPlan {
  return {
    projectId,
    generatedAt: new Date(0),
    sceneIntents: scenes.map((scene) => ({
      sceneIndex: scene.sceneIndex,
      decisiveMoment: 'semantic transcript evidence',
      zoomIntent: 'none',
      pacingIntent: 'hold-natural',
      transitionIn: 'hard-cut',
      transitionOut: 'hard-cut',
      audioIntent: { nativeAudio: 'keep-full' },
      graphicIntents: [],
      shakeIntent: 'none',
      reasoning: 'Read-only semantic MG replay; empty LLM graphicIntents prove deterministic fact extraction.',
    })),
    stats: {
      totalScenes: scenes.length,
      zoomCount: 0,
      graphicCount: 0,
      transitionCount: 0,
    },
  };
}

function buildGraphicOnlyEDL(
  projectId: string,
  decisions: ReturnType<TranslateCreativeIntentToEDL>['decisions'],
  fps: number,
  durationInFrames: unknown,
): EditDecisionList {
  const editDecisions: EditDecision[] = decisions.map((decision, index) => ({
    type: 'graphic',
    frame: decision.frame,
    durationFrames: decision.durationFrames,
    priority: 2,
    source: decision.sources.join('+') || 'semantic-mg-rerun',
    sources: decision.sources,
    signal: 'semantic-mg-rerun',
    reason: decision.reason,
    params: decision.params,
    confidence: decision.confidence,
    trigger: {
      track: 'transcript',
      signal: 'licensed-semantic-mg-fact',
      confidence: decision.confidence,
    },
    action: {
      tool: 'motion-graphic',
      params: decision.params,
    },
  }));
  const averageConfidence = editDecisions.length > 0
    ? editDecisions.reduce((sum, decision) => sum + decision.confidence, 0) / editDecisions.length
    : 0;
  const durationFramesNumber = numeric(durationInFrames) ?? Math.max(...editDecisions.map((decision) => decision.frame + (decision.durationFrames ?? fps * 3)), fps * 30);
  const minutes = Math.max(durationFramesNumber / fps / 60, 1 / 60);
  return {
    projectId,
    generatedAt: new Date(0),
    totalDecisions: editDecisions.length,
    decisions: editDecisions,
    stats: {
      cutsPerMinute: 0 / minutes,
      transitionCount: 0,
      graphicCount: editDecisions.length,
      zoomCount: 0,
      speedChangeCount: 0,
      averageConfidence,
    },
  };
}

function extractTranscriptWords(words: unknown): TimedWord[] {
  if (!Array.isArray(words)) return [];
  return words
    .map((word) => {
      const record = objectRecord(word);
      if (!record) return null;
      const text = typeof record.word === 'string' ? record.word : typeof record.text === 'string' ? record.text : '';
      const startMs = readTimeMs(record, ['startMs', 'start', 'startTime']);
      const endMs = readTimeMs(record, ['endMs', 'end', 'endTime']);
      if (!text.trim() || startMs == null || endMs == null || endMs <= startMs) return null;
      return { word: text.trim(), startMs, endMs };
    })
    .filter((word): word is TimedWord => word !== null)
    .sort((a, b) => a.startMs - b.startMs);
}

function extractTranscriptSegments(segments: unknown, words: TimedWord[]): Array<{ text: string; startMs: number; endMs: number }> {
  if (Array.isArray(segments)) {
    const parsed = segments
      .map((segment) => {
        const record = objectRecord(segment);
        if (!record) return null;
        const startMs = readTimeMs(record, ['startMs', 'start', 'startTime']);
        const endMs = readTimeMs(record, ['endMs', 'end', 'endTime']);
        const text = typeof record.text === 'string' ? record.text : '';
        if (startMs == null || endMs == null || endMs <= startMs) return null;
        return { text, startMs, endMs };
      })
      .filter((segment): segment is { text: string; startMs: number; endMs: number } => segment !== null)
      .sort((a, b) => a.startMs - b.startMs);
    if (parsed.length > 0) return parsed;
  }

  const fallback: Array<{ text: string; startMs: number; endMs: number }> = [];
  for (let index = 0; index < words.length; index += 18) {
    const chunk = words.slice(index, index + 18);
    if (chunk.length === 0) continue;
    fallback.push({
      text: chunk.map((word) => word.word).join(' '),
      startMs: chunk[0].startMs,
      endMs: chunk[chunk.length - 1].endMs,
    });
  }
  return fallback;
}

function buildSceneContexts(
  segments: Array<{ text: string; startMs: number; endMs: number }>,
  words: TimedWord[],
  fps: number,
  maxScenes?: number,
): SceneFrameContext[] {
  return segments
    .slice(0, maxScenes ?? segments.length)
    .map((segment, index) => {
      const sceneWords = words
        .filter((word) => word.startMs < segment.endMs && word.endMs > segment.startMs)
        .map((word) => ({
          word: word.word,
          startMs: Math.max(0, word.startMs - segment.startMs),
          endMs: Math.max(1, word.endMs - segment.startMs),
        }));
      return {
        sceneIndex: index,
        fromFrame: Math.round((segment.startMs / 1000) * fps),
        durationFrames: Math.max(1, Math.round(((segment.endMs - segment.startMs) / 1000) * fps)),
        voiceoverWords: sceneWords,
        onScreenText: [],
      };
    })
    .filter((scene) => scene.voiceoverWords.length > 0);
}

function factKindCounts(decisions: ReturnType<TranslateCreativeIntentToEDL>['decisions']): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const decision of decisions) {
    const match = decision.reason.match(/^semantic-fact:([^:]+):/);
    const key = match?.[1] ?? String(decision.params.kind ?? decision.params.factKind ?? 'unknown');
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function resolveGraphicsDensity(genreParameters: unknown): 'heavy' | 'moderate' | 'minimal' {
  const density = objectRecord(genreParameters) ? numeric(objectRecord(genreParameters)?.graphic_density) : undefined;
  if ((density ?? 0) >= 0.7) return 'heavy';
  if ((density ?? 0) >= 0.25) return 'moderate';
  return 'minimal';
}

function inferCanvas(
  overlays: Array<Record<string, unknown>>,
  width?: number,
  height?: number,
): { width: number; height: number } {
  const firstVisual = overlays.find((overlay) => overlay.type === 'video' || overlay.type === 'image' || overlay.type === 'motion-graphic');
  return {
    width: width ?? numeric(firstVisual?.width) ?? 1920,
    height: height ?? numeric(firstVisual?.height) ?? 1080,
  };
}

function readTimeMs(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    if (!(key in record)) continue;
    const raw = numeric(record[key]);
    if (raw == null) continue;
    if (key.toLowerCase().endsWith('ms')) return raw;
    return raw > 10_000 ? raw : raw * 1000;
  }
  return undefined;
}

function numeric(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function objectRecord(value: unknown): Record<string, any> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : null;
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function ensureReadOnlyProbeEnv(): void {
  if (!process.env.GCS_BUCKET_NAME) process.env.GCS_BUCKET_NAME = 'read-only-mg-probe';
  if (!process.env.GOOGLE_CLOUD_CREDENTIALS) {
    process.env.GOOGLE_CLOUD_CREDENTIALS = Buffer.from(JSON.stringify({
      type: 'service_account',
      project_id: 'read-only-mg-probe',
      private_key_id: 'read-only',
      private_key: '-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASC\n-----END PRIVATE KEY-----\n',
      client_email: 'read-only-mg-probe@example.invalid',
      client_id: '0',
      auth_uri: 'https://accounts.google.com/o/oauth2/auth',
      token_uri: 'https://oauth2.googleapis.com/token',
      auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
      client_x509_cert_url: 'https://www.googleapis.com/robot/v1/metadata/x509/read-only-mg-probe%40example.invalid',
    })).toString('base64');
  }
}

main().catch((error) => {
  console.error('ERROR:', error instanceof Error ? error.stack : error);
  process.exit(1);
});
