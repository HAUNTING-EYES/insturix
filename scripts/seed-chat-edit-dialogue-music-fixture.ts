import { config as loadEnv } from 'dotenv';
import { pathToFileURL } from 'node:url';

import {
  inspectChatBattleFixtureCapabilities,
} from '../lib/editron/services/chat-edit-battle-fixtures';
import { resolveRenderableAudio } from '../lib/editron/shared/render-request-payload';

const TARGET_PROJECT_ID = 'proj_chatbattle_dialogue_music_v1';
const DIALOGUE_PROJECT_ID = 'proj_FYZeVGomJuSh';
const MUSIC_PROJECT_ID = 'proj_chatbattle_impact_audio_v1';

async function main(): Promise<void> {
  loadEnvironment(process.argv.slice(2));
  const { COLLECTIONS, connectToDatabase } = await import('../lib/editron/db/mongodb');
  const { client, db } = await connectToDatabase();
  const session = client.startSession();

  try {
    const [dialogueProject, musicProject] = await Promise.all([
      db.collection(COLLECTIONS.PROJECTS).findOne({ projectId: DIALOGUE_PROJECT_ID }),
      db.collection(COLLECTIONS.PROJECTS).findOne({ projectId: MUSIC_PROJECT_ID }),
    ]);
    if (!dialogueProject) throw new Error(`Missing dialogue source ${DIALOGUE_PROJECT_ID}.`);
    if (!musicProject) throw new Error(`Missing music source ${MUSIC_PROJECT_ID}.`);

    const userId = requiredString(dialogueProject.userId, 'dialogue source userId');
    if (requiredString(musicProject.userId, 'music source userId') !== userId) {
      throw new Error('Dialogue and music fixture sources must have the same owner.');
    }

    const dialogueOverlays = records(dialogueProject.overlays);
    const musicOverlay = records(musicProject.overlays).find((overlay) => (
      overlay.type === 'sound'
      && isMusicOverlay(overlay)
      && hasBeatGrid(overlay)
      && isRenderableAudio(overlay)
    ));
    if (!musicOverlay) {
      throw new Error(`${MUSIC_PROJECT_ID} has no independently renderable music with a beat grid.`);
    }

    const dialogueVideos = dialogueOverlays.filter((overlay) => (
      overlay.type === 'video'
      && overlay.hasNativeAudio === true
      && isRenderableAudio(overlay)
    ));
    if (dialogueVideos.length === 0) {
      throw new Error(`${DIALOGUE_PROJECT_ID} has no attested native-dialogue video.`);
    }

    const musicFrames = positiveInteger(musicOverlay.durationInFrames);
    const dialogueFrames = positiveInteger(dialogueProject.durationInFrames);
    const fps = positiveInteger(dialogueProject.fps);
    const durationInFrames = Math.min(musicFrames, dialogueFrames);
    const now = new Date();
    const project = buildFixtureProject({
      dialogueProject: dialogueProject as Record<string, unknown>,
      dialogueOverlays,
      musicOverlay,
      durationInFrames,
      fps,
      userId,
      now,
    });
    const sourceAnalyses = await db.collection(COLLECTIONS.PROJECT_ASSET_ANALYSES)
      .find({ projectId: DIALOGUE_PROJECT_ID })
      .toArray();
    const analyses = sourceAnalyses.map((source) => {
      const clone = structuredClone(source) as Record<string, unknown>;
      delete clone._id;
      clone.projectId = TARGET_PROJECT_ID;
      clone.createdAt = now;
      clone.updatedAt = now;
      return clone;
    });

    const capabilityReport = inspectChatBattleFixtureCapabilities({
      sourceProject: project,
      sourceAnalyses: analyses,
      required: [
        'renderable-native-audio',
        'speech-timing',
        'renderable-music',
        'music-beat-grid',
      ],
    });
    if (!capabilityReport.ok) {
      throw new Error(
        `Refusing to seed ${TARGET_PROJECT_ID}: missing ${capabilityReport.missing.join(', ')}.`,
      );
    }

    await session.withTransaction(async () => {
      await db.collection(COLLECTIONS.PROJECTS).replaceOne(
        { projectId: TARGET_PROJECT_ID },
        project,
        { upsert: true, session },
      );
      await db.collection(COLLECTIONS.PROJECT_ASSET_ANALYSES).deleteMany(
        { projectId: TARGET_PROJECT_ID },
        { session },
      );
      if (analyses.length > 0) {
        await db.collection(COLLECTIONS.PROJECT_ASSET_ANALYSES).insertMany(
          analyses,
          { session },
        );
      }
    });

    console.log(JSON.stringify({
      projectId: TARGET_PROJECT_ID,
      durationInFrames,
      analysisDocumentCount: analyses.length,
      capabilities: capabilityReport.required,
      status: 'ready',
    }, null, 2));
  } finally {
    await session.endSession();
    await client.close();
  }
}

function buildFixtureProject(input: {
  dialogueProject: Record<string, unknown>;
  dialogueOverlays: Record<string, unknown>[];
  musicOverlay: Record<string, unknown>;
  durationInFrames: number;
  fps: number;
  userId: string;
  now: Date;
}): Record<string, unknown> {
  const project = structuredClone(input.dialogueProject);
  delete project._id;
  delete project.qualityReview;
  project.projectId = TARGET_PROJECT_ID;
  project.userId = input.userId;
  project.name = 'Chat battle source: attested dialogue and beat-grid music';
  project.title = project.name;
  project.status = 'ready';
  project.durationInFrames = input.durationInFrames;
  project.createdAt = input.now;
  project.updatedAt = input.now;
  delete project.expiresAt;

  const retained = input.dialogueOverlays
    .filter((overlay) => overlay.type !== 'sound')
    .flatMap((overlay) => trimOverlay(overlay, input.durationInFrames, input.fps));
  const music = structuredClone(input.musicOverlay);
  music.id = 940730000001;
  music.from = 0;
  music.durationInFrames = input.durationInFrames;
  music.startFromSound = 0;
  music.metadata = {
    source: 'chat-battle-dialogue-music-source',
    sourceProjectId: MUSIC_PROJECT_ID,
    sourceOverlayId: input.musicOverlay.id,
    beatGrid: structuredClone(record(input.musicOverlay.metadata).beatGrid),
  };
  project.overlays = [...retained, music];
  project.sourceAssetIds = uniqueStrings(
    records(project.overlays).map((overlay) => overlay.assetId),
  );
  project.metadata = {
    ...record(project.metadata),
    battleFixtureSource: {
      version: 'editron-chat-battle-dialogue-music-v1',
      dialogueProjectId: DIALOGUE_PROJECT_ID,
      musicProjectId: MUSIC_PROJECT_ID,
      seededAt: input.now.toISOString(),
    },
  };
  project.intelligence = stripRenderedEvidence(record(project.intelligence));
  return project;
}

function trimOverlay(
  source: Record<string, unknown>,
  durationInFrames: number,
  fps: number,
): Record<string, unknown>[] {
  const from = nonNegativeInteger(source.from);
  if (from >= durationInFrames) return [];
  const overlay = structuredClone(source);
  overlay.durationInFrames = Math.min(
    positiveInteger(overlay.durationInFrames),
    durationInFrames - from,
  );
  if (overlay.type === 'caption') {
    const endMs = Math.round((durationInFrames / fps) * 1_000);
    overlay.words = records(overlay.words).filter((word) => (
      nonNegativeNumber(word.startMs) < endMs
    ));
    overlay.captions = records(overlay.captions).filter((caption) => (
      nonNegativeNumber(caption.startMs) < endMs
    ));
  }
  return [overlay];
}

function isRenderableAudio(overlay: Record<string, unknown>): boolean {
  try {
    return resolveRenderableAudio(overlay).overlay !== null;
  } catch {
    return false;
  }
}

function isMusicOverlay(overlay: Record<string, unknown>): boolean {
  const rights = record(overlay.musicRights ?? overlay.audioRights);
  const assetId = optionalString(overlay.assetId)?.toLowerCase() ?? '';
  return overlay.row === 1
    || rights.mediaRole === 'music'
    || assetId.startsWith('bgm_');
}

function hasBeatGrid(overlay: Record<string, unknown>): boolean {
  const beatGrid = record(overlay.beatGrid ?? record(overlay.metadata).beatGrid);
  return records(beatGrid.beats).some((beat) => nonNegativeNumber(beat.frame) >= 0)
    && values(beatGrid.downbeats).some((frame) => nonNegativeNumber(frame) >= 0);
}

function stripRenderedEvidence(value: Record<string, unknown>): Record<string, unknown> {
  const intelligence = structuredClone(value);
  delete intelligence.phase0RenderedStillEvidence;
  delete intelligence.phase0RenderedQualityGate;
  delete intelligence.phase0RenderedAestheticReport;
  return intelligence;
}

function loadEnvironment(args: string[]): void {
  const explicit = args.find((arg) => arg.startsWith('--env='))?.slice('--env='.length);
  if (explicit) loadEnv({ path: explicit, override: true, quiet: true });
  loadEnv({ path: '.env.local', override: false, quiet: true });
  loadEnv({ path: '.env', override: false, quiet: true });
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(record) : [];
}

function record(value: unknown): Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function values(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function uniqueStrings(value: unknown[]): string[] {
  return [...new Set(value.flatMap((item) => {
    const result = optionalString(item);
    return result ? [result] : [];
  }))];
}

function requiredString(value: unknown, label: string): string {
  const result = optionalString(value);
  if (!result) throw new Error(`${label} is missing.`);
  return result;
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function positiveInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`Expected a positive frame count, received ${String(value)}.`);
  }
  return Math.round(value);
}

function nonNegativeInteger(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.round(value))
    : 0;
}

function nonNegativeNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : -1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
