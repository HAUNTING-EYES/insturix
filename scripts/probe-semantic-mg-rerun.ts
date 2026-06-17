import { config } from 'dotenv';
import { MongoClient } from 'mongodb';
import * as fs from 'fs';
import * as path from 'path';

import { ROW } from '../lib/pipeline/scene-to-editron';
import { resolveMotionTokens } from '../lib/editron/data/motion-theme-resolver';
import { normalizeMotionGraphicContent } from '../lib/editron/services/mg-content-atoms';
import { resolveAtomicPlacement } from '../lib/editron/services/atomic-placement';
import {
  applyMgExpressionAuthorityToRecipe,
  applyMgExpressionAuthorityToScores,
  resolveMgExpressionAuthority,
} from '../lib/editron/services/mg-expression-authority';
import { planComposition, type MgOverlayScores } from '../lib/editron/motion-graphics/engine/composition-planner';
import { checkCompositionStructure } from '../lib/editron/motion-graphics/engine/structural-gate';
import { buildAtomicOverlayPlan } from '../lib/editron/motion-graphics/engine/atomic-overlay-plan';
import { decideAtomicOverlay } from '../lib/editron/motion-graphics/engine/atomic-overlay-decision';
import {
  resolveSemanticMgLedgerGate,
  selectSemanticMgCandidate,
} from '../lib/editron/motion-graphics/engine/semantic-mg-candidates';
import type { EditDecision } from '../lib/editron/services/reactive-edit-engine';
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

  console.log('Importing live MG translator...');
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

    const replayOverlays = deepClone(overlays)
      .filter((overlay) => overlay.type !== 'motion-graphic' && overlay.type !== 'html-scene');
    const canvas = inferCanvas(overlays, numeric(project.width), numeric(project.height));
    console.log('Replaying semantic MG decisions through MG-only composition path...');
    const execution = replaySemanticMotionGraphics(
      String(project.projectId ?? args.projectId),
      replayGraphicDecisions,
      replayOverlays,
      canvas,
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
      replayMode: 'transcript-semantic-facts-mg-only-composition',
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
    console.log(`Replayed=${execution.decisionsExecuted} skipped=${execution.decisionsSkipped} newMGs=${motionGraphics.length}`);
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

interface MgReplayResult {
  decisionsExecuted: number;
  decisionsSkipped: number;
  overlaysCreated: number;
  overlaysModified: number;
  errors: string[];
  rejectedDecisions: Array<{
    type: string;
    frame: number;
    reason: string;
    params?: Record<string, unknown>;
  }>;
}

function replaySemanticMotionGraphics(
  projectId: string,
  decisions: ReturnType<TranslateCreativeIntentToEDL>['decisions'],
  overlays: Array<Record<string, unknown>>,
  canvas: { width: number; height: number },
  graphicsDensity: 'heavy' | 'moderate' | 'minimal',
): MgReplayResult {
  const result: MgReplayResult = {
    decisionsExecuted: 0,
    decisionsSkipped: 0,
    overlaysCreated: 0,
    overlaysModified: 0,
    errors: [],
    rejectedDecisions: [],
  };
  const idEpoch = deterministicEpoch(projectId);

  decisions.forEach((decision, index) => {
    const replayDecision: EditDecision = {
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
    };
    try {
      const overlay = composeSemanticMotionGraphicOverlay(
        replayDecision,
        overlays,
        canvas,
        idEpoch,
        index,
        graphicsDensity,
      );
      if (!overlay) {
        result.decisionsSkipped++;
        result.rejectedDecisions.push({
          type: 'graphic',
          frame: replayDecision.frame,
          reason: 'MG-only replay skipped decision before composition',
          params: {
            text: String(replayDecision.params.text ?? replayDecision.params.title ?? '').slice(0, 80),
            factKind: replayDecision.params.factKind,
          },
        });
        return;
      }
      overlays.push(overlay);
      result.decisionsExecuted++;
      result.overlaysCreated++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.decisionsSkipped++;
      result.errors.push(`graphic@${replayDecision.frame}: ${message}`);
      result.rejectedDecisions.push({
        type: 'graphic',
        frame: replayDecision.frame,
        reason: message,
        params: {
          text: String(replayDecision.params.text ?? replayDecision.params.title ?? '').slice(0, 80),
          factKind: replayDecision.params.factKind,
        },
      });
    }
  });

  return result;
}

function composeSemanticMotionGraphicOverlay(
  decision: EditDecision,
  overlays: Array<Record<string, unknown>>,
  canvas: { width: number; height: number },
  idEpoch: number,
  decisionIndex: number,
  graphicsDensity: 'heavy' | 'moderate' | 'minimal',
): Record<string, unknown> | null {
  const {
    brand,
    signals: _signalsForContent,
    mgOverlayScores,
    graphicType: _graphicTypeForContent,
    creativeDecisionType: _creativeDecisionTypeForContent,
    placementAdjustment: _placementAdjustmentForContent,
    position,
    ...contentParamsForNormalization
  } = decision.params;
  const normalizedGraphicContent = normalizeMotionGraphicContent(contentParamsForNormalization);
  const contentMap = normalizedGraphicContent.content;

  if (!hasRenderableGraphicContent(contentMap)) return null;

  const semanticMgLedgerGate = resolveSemanticMgLedgerGate(normalizedGraphicContent.semanticMgCandidateLedger);
  if (!semanticMgLedgerGate.allow) return null;

  const semanticMgCandidateSelection = selectSemanticMgCandidate(normalizedGraphicContent.semanticMgCandidateLedger);
  const rawSignals = buildProbeMotionGraphicSignalSnapshot(decision);
  const tokens = resolveMotionTokens(rawSignals, objectRecord(brand) ?? {});
  const requestedPlacementRegion = normalizePlacementRegion(position);
  const atomicPlacement = resolveAtomicPlacement({
    family: 'graphic',
    signals: rawSignals,
    requestedRegion: requestedPlacementRegion as any,
  });
  const placementRegion = atomicPlacement.candidateRegion ?? requestedPlacementRegion;
  let scores = objectRecord(mgOverlayScores) as MgOverlayScores | undefined;

  const mgExpressionAuthority = resolveMgExpressionAuthority({
    content: contentMap,
    structure: normalizedGraphicContent.structure,
    semanticAtoms: normalizedGraphicContent.semanticAtoms,
    signals: rawSignals,
    placementRegion,
    graphicsDensity,
    ...(semanticMgCandidateSelection.selectedCandidate
      ? { semanticCandidate: semanticMgCandidateSelection.selectedCandidate }
      : {}),
  });
  if (!mgExpressionAuthority.allowMotionGraphic) return null;

  scores = applyMgExpressionAuthorityToScores(scores, mgExpressionAuthority);
  const recipe = applyMgExpressionAuthorityToRecipe(
    planComposition(
      { content: contentMap, triggerMoment: decision.reason },
      tokens,
      rawSignals,
      scores,
    ),
    mgExpressionAuthority,
  );
  const gateResult = checkCompositionStructure(recipe, tokens);
  const atomicOverlayPlan = buildAtomicOverlayPlan(recipe, tokens, contentMap, rawSignals, scores, objectRecord(brand) ?? {});
  const atomicOverlayDecision = decideAtomicOverlay(atomicOverlayPlan);
  const snappedFrame = findClipAtFrame(decision.frame, overlays, 20) ?? decision.frame;
  const baseDuration = resolveGraphicDwellFrames(decision.durationFrames ?? 90, decision.params, contentMap);
  const compositionDuration = Math.max(
    mgExpressionAuthority.duration.minFrames,
    Math.min(
      mgExpressionAuthority.duration.maxFrames,
      Math.round(baseDuration * mgExpressionAuthority.duration.multiplier),
    ),
  );

  return {
    id: deterministicOverlayId(idEpoch, 'graphic', decision.frame, decisionIndex),
    type: 'motion-graphic',
    from: snappedFrame,
    durationInFrames: compositionDuration,
    row: ROW.BGM,
    left: 0,
    top: 0,
    width: canvas.width,
    height: canvas.height,
    isDragging: false,
    rotation: 0,
    recipe,
    resolvedTokens: tokens,
    contentSignals: rawSignals,
    content: contentMap,
    styles: { opacity: 1, backgroundColor: 'transparent' },
    metadata: {
      sourceType: 'semantic-mg-rerun-probe',
      graphicType: 'atomic-graphic',
      compositionEngine: true,
      placementRegion,
      atomicPlacement,
      atomicOverlayPlan,
      atomicOverlayDecision,
      atomicPlanObserveMode: true,
      structuralGate: gateResult,
      mgExpressionAuthority,
      visualExplanationContract: mgExpressionAuthority.visualExplanationContract,
      semanticMgCandidateLedger: normalizedGraphicContent.semanticMgCandidateLedger,
      semanticMgCandidateSelection,
      contentStructure: normalizedGraphicContent.structure,
      semanticAtoms: normalizedGraphicContent.semanticAtoms,
      edlSource: decision.source,
      edlReason: decision.reason,
    },
  };
}

function deterministicEpoch(projectId: string): number {
  let idEpoch = 2166136261 >>> 0;
  for (let index = 0; index < projectId.length; index += 1) {
    idEpoch ^= projectId.charCodeAt(index);
    idEpoch = Math.imul(idEpoch, 16777619) >>> 0;
  }
  return idEpoch;
}

function deterministicOverlayId(epoch: number, decisionType: string, frame: number, index: number): number {
  let hash = 2166136261 >>> 0;
  const source = `${epoch}|${decisionType}|${frame}|${index}`;
  for (let sourceIndex = 0; sourceIndex < source.length; sourceIndex += 1) {
    hash ^= source.charCodeAt(sourceIndex);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return epoch * 1_000_000 + (hash % 1_000_000);
}

function hasRenderableGraphicContent(content: Record<string, unknown>): boolean {
  const renderableKeys = [
    'text',
    'keyword',
    'title',
    'body',
    'value',
    'label',
    'name',
    'quote',
    'from',
    'to',
    'items',
    'values',
    'labels',
  ];
  return renderableKeys.some((key) => hasNonEmptyValue(content[key]));
}

function hasNonEmptyValue(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim().length > 0;
  return value !== undefined && value !== null;
}

function buildProbeMotionGraphicSignalSnapshot(decision: EditDecision): Record<string, number | string> {
  const raw = objectRecord(decision.params.signals) ?? {};
  const snapshot: Record<string, number | string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'number' && Number.isFinite(value)) snapshot[key] = value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      snapshot[key] = Number.isFinite(parsed) ? parsed : value.trim();
    }
  }
  const salience = numeric(decision.params.salience);
  if (salience != null && snapshot.salience == null) snapshot.salience = salience;
  if (snapshot.emotional_arousal == null) snapshot.emotional_arousal = 0.45;
  if (snapshot.pacing_velocity == null) snapshot.pacing_velocity = 0.45;
  if (snapshot.visual_dependency == null) snapshot.visual_dependency = 0.5;
  return snapshot;
}

function normalizePlacementRegion(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  const record = objectRecord(value);
  if (!record) return undefined;
  const x = numeric(record.x);
  const y = numeric(record.y);
  if (x == null || y == null) return undefined;
  if (y < 0.34) return x < 0.4 ? 'top-left' : x > 0.6 ? 'top-right' : 'top-center';
  if (y > 0.66) return x < 0.4 ? 'bottom-left' : x > 0.6 ? 'bottom-right' : 'bottom-center';
  return x < 0.4 ? 'middle-left' : x > 0.6 ? 'middle-right' : 'center';
}

function findClipAtFrame(
  frame: number,
  overlays: Array<Record<string, unknown>>,
  tolerance: number,
): number | undefined {
  const exact = overlays.find((overlay) => {
    const from = numeric(overlay.from);
    const duration = numeric(overlay.durationInFrames);
    return overlay.type === 'video'
      && from != null
      && duration != null
      && from <= frame
      && from + duration > frame;
  });
  if (exact) return frame;

  let bestFrame: number | undefined;
  let bestDrift = Infinity;
  for (const overlay of overlays) {
    if (overlay.type !== 'video') continue;
    const from = numeric(overlay.from);
    const duration = numeric(overlay.durationInFrames);
    if (from == null || duration == null) continue;
    const end = from + duration;
    const beforeDrift = from - frame;
    const afterDrift = frame - end + 1;
    if (beforeDrift >= 0 && beforeDrift <= tolerance && beforeDrift < bestDrift) {
      bestDrift = beforeDrift;
      bestFrame = from + 1;
    }
    if (afterDrift >= 0 && afterDrift <= tolerance && afterDrift < bestDrift) {
      bestDrift = afterDrift;
      bestFrame = end - 1;
    }
  }
  return bestFrame;
}

function resolveGraphicDwellFrames(
  baseDurationFrames: number,
  params: Record<string, unknown>,
  content: Record<string, unknown>,
): number {
  const base = Math.max(30, Math.round(baseDurationFrames || 90));
  const isScalarStat = content.value != null && !Array.isArray(content.values);
  const maxDwell = isScalarStat ? Math.min(base, 72) : base;
  const words = readableGraphicWords(content);
  const readFrames = words > 0
    ? Math.max(36, Math.min(maxDwell, Math.round(12 + words * 10)))
    : maxDwell;
  const startMs = numeric(params.targetWordStartMs);
  const endMs = numeric(params.targetWordEndMs);
  if (startMs != null && endMs != null && endMs > startMs) {
    const wordFrames = Math.round(((endMs - startMs) / 1000) * 30);
    return Math.max(36, Math.min(maxDwell, Math.max(readFrames, wordFrames + 24)));
  }
  return readFrames;
}

function readableGraphicWords(content: Record<string, unknown>): number {
  const text = [
    content.value,
    content.label,
    content.title,
    content.body,
    content.quote,
    content.name,
    content.text,
  ]
    .filter((value): value is string | number => typeof value === 'string' || typeof value === 'number')
    .map(String)
    .join(' ')
    .trim();
  return text ? text.split(/\s+/).filter(Boolean).length : 0;
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
