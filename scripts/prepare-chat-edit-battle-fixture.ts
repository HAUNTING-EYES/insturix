import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { config as loadEnv } from 'dotenv';

import { cleanupDisposableChatBattleFixture } from '../lib/editron/services/chat-edit-battle-fixture-cleanup';
import {
  persistChatBattleDurableSeeds,
  prepareChatBattleDurableSeeds,
} from '../lib/editron/services/chat-edit-battle-fixture-seeds';
import { getChatEditBattleScenario } from '../lib/editron/services/chat-edit-battle-harness';
import { planChatBattleFixture } from '../lib/editron/services/chat-edit-battle-fixture-plan';
import { loadCanonicalProjectAssetAnalyses } from '../lib/editron/services/project-analysis-storage';
import {
  cloneChatBattleAnalysisDocuments,
  cloneChatBattleUploadBatch,
  inspectChatBattleFixtureCapabilities,
  prepareChatBattleFixture,
} from '../lib/editron/services/chat-edit-battle-fixtures';

interface PrepareFixtureOptions {
  scenarioId?: string;
  fixtureProjectId?: string;
  cleanupProjectId?: string;
  outputRoot: string;
  expiresInHours: number;
}

interface FixtureManifest {
  scenarioId: string;
  fixtureProjectId: string;
  sourceProjectId: string;
  profile: string;
  selectedOverlayId?: string | number;
  sessionId?: string;
  operationId?: string;
  referenceAssetId?: string;
  clientContextPath: string;
  editorUrlPath: string;
  expiresAt: string;
  sourceCapabilities: ReturnType<typeof inspectChatBattleFixtureCapabilities>;
}

async function main(): Promise<void> {
  loadEnv({ path: '.env.local', override: false });
  loadEnv({ path: '.env', override: false });
  const options = parseArgs(process.argv.slice(2));
  if (options.cleanupProjectId) {
    const result = await cleanupDisposableChatBattleFixture(options.cleanupProjectId);
    console.log(`[chat-battle-fixture] cleanup ${JSON.stringify(result)}`);
    return;
  }
  if (!options.scenarioId) throw new Error(usage());

  const scenario = getChatEditBattleScenario(options.scenarioId);
  if (!scenario) throw new Error(`Unknown chat battle case: ${options.scenarioId}`);
  const plan = planChatBattleFixture(scenario);
  const fixtureProjectId = options.fixtureProjectId ?? `proj_chatbattle_${randomUUID().replace(/-/g, '').slice(0, 14)}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + (options.expiresInHours * 60 * 60 * 1000));

  const { COLLECTIONS, connectToDatabase } = await import('../lib/editron/db/mongodb');
  const { client, db } = await connectToDatabase();
  const session = client.startSession();
  try {
    const sourceProject = await db.collection(COLLECTIONS.PROJECTS).findOne({ projectId: plan.sourceProjectId });
    if (!sourceProject) throw new Error(`Fixture source project not found: ${plan.sourceProjectId}`);
    const sourceAssetIds = [...new Set([
      ...asArray(sourceProject.sourceAssetIds),
      ...asArray(sourceProject.overlays).map((value) => asRecord(value).assetId),
    ].filter((value): value is string => typeof value === 'string' && Boolean(value.trim())))];
    const sourceAnalyses = await loadCanonicalProjectAssetAnalyses(db, {
      projectId: plan.sourceProjectId,
      userId: requireString(sourceProject.userId, 'source project userId'),
      assetIds: sourceAssetIds,
    });
    const sourceCapabilities = inspectChatBattleFixtureCapabilities({
      sourceProject: sourceProject as Record<string, unknown>,
      sourceAnalyses: sourceAnalyses as Record<string, unknown>[],
      required: plan.requiredSourceCapabilities,
    });
    if (!sourceCapabilities.ok) {
      throw new Error(
        `Fixture source ${plan.sourceProjectId} cannot prove ${scenario.id}: `
        + `missing ${sourceCapabilities.missing.join(', ')}; `
        + `${sourceCapabilities.semanticVisualAssetIds.length}/${sourceCapabilities.videoAssetIds.length} video assets have semantic visual evidence and `
        + `${sourceCapabilities.spatialVisualAssetIds.length}/${sourceCapabilities.videoAssetIds.length} have spatial visual evidence.`,
      );
    }
    const sourceUploadBatchId = stringValue(sourceProject.sourceUploadBatchId);
    const sourceUploadBatch = plan.requiresUploadBatchClone && sourceUploadBatchId
      ? await db.collection(COLLECTIONS.MEDIA_UPLOAD_BATCHES).findOne({
          uploadBatchId: sourceUploadBatchId,
          userId: sourceProject.userId,
        })
      : null;
    if (plan.requiresUploadBatchClone && !sourceUploadBatch) {
      throw new Error(`Fixture source upload batch not found for ${plan.sourceProjectId}.`);
    }
    const sourceReferenceAsset = scenario.fixtureRequirements.includes('durable-reference-asset')
      ? await db.collection(COLLECTIONS.MEDIA_ASSETS).findOne({
          userId: sourceProject.userId,
          type: 'video',
          assetId: { $in: sourceAssetIds },
        })
      : null;
    const prepared = prepareChatBattleFixture({
      sourceProject: sourceProject as Record<string, unknown>,
      fixtureProjectId,
      plan,
      now,
      expiresInMs: expiresAt.getTime() - now.getTime(),
    });
    const fixtureUploadBatchId = `upload_batch_cb_${fixtureProjectId.replace(/^proj_/, '').slice(0, 80)}`;
    const uploadBatch = sourceUploadBatch
      ? cloneChatBattleUploadBatch(
          sourceUploadBatch as Record<string, unknown>,
          fixtureProjectId,
          fixtureUploadBatchId,
          now,
        )
      : null;
    if (uploadBatch) prepared.project.sourceUploadBatchId = fixtureUploadBatchId;
    const analysisDocuments = cloneChatBattleAnalysisDocuments(
      sourceAnalyses as Record<string, unknown>[],
      fixtureProjectId,
      now,
      prepared.transcriptAssetAlias,
    );
    const transcriptAsset = prepared.transcriptAssetAlias
      ? await cloneTranscriptAssetAlias({
          db,
          userId: requireString(prepared.project.userId, 'source project userId'),
          project: prepared.project,
          alias: prepared.transcriptAssetAlias,
          now,
        })
      : null;
    const completedAnalysisSeed = scenario.fixtureRequirements.includes('completed-clip-analysis-job')
      ? buildCompletedAnalysisSeed(prepared.project, now, expiresAt)
      : null;
    const durableSeeds = prepareChatBattleDurableSeeds({
      scenario,
      project: prepared.project,
      sourceReferenceAsset: sourceReferenceAsset as Record<string, unknown> | null,
      now,
    });

    await session.withTransaction(async () => {
      if (plan.requiresImageAssetAlias) {
        await ensureImageAssetAlias({
          db,
          session,
          userId: requireString(prepared.project.userId, 'source project userId'),
          sourceProject: sourceProject as Record<string, unknown>,
          project: prepared.project,
          now,
        });
      }
      if (transcriptAsset) {
        await db.collection(COLLECTIONS.MEDIA_ASSETS).insertOne(transcriptAsset, { session });
      }
      if (durableSeeds.referenceAsset) {
        await db.collection(COLLECTIONS.MEDIA_ASSETS).insertOne(durableSeeds.referenceAsset, { session });
      }
      await db.collection(COLLECTIONS.PROJECTS).insertOne(prepared.project, { session });
      if (uploadBatch) {
        await db.collection(COLLECTIONS.MEDIA_UPLOAD_BATCHES).insertOne(uploadBatch, { session });
      }
      if (analysisDocuments.length > 0) {
        await db.collection(COLLECTIONS.PROJECT_ASSET_ANALYSES).insertMany(analysisDocuments, { session });
      }
      if (completedAnalysisSeed) {
        await db.collection(COLLECTIONS.CHAT_DEEP_ANALYSIS_JOBS).insertOne(completedAnalysisSeed.job, { session });
        await db.collection(COLLECTIONS.CHAT_SESSIONS).insertOne(completedAnalysisSeed.chatSession, { session });
      }
      if (durableSeeds.chatSessions.length > 0) {
        await db.collection(COLLECTIONS.CHAT_SESSIONS).insertMany(durableSeeds.chatSessions, { session });
      }
    });
    await persistChatBattleDurableSeeds(durableSeeds);

    const fixtureDir = path.resolve(options.outputRoot, fixtureProjectId);
    await mkdir(fixtureDir, { recursive: true });
    const clientContextPath = path.join(fixtureDir, 'client-context.json');
    await writeFile(clientContextPath, `${JSON.stringify(prepared.clientContext, null, 2)}\n`, 'utf8');
    const manifest: FixtureManifest = {
      scenarioId: scenario.id,
      fixtureProjectId,
      sourceProjectId: plan.sourceProjectId,
      profile: plan.profile,
      selectedOverlayId: prepared.selectedOverlayId,
      sessionId: durableSeeds.sessionId ?? completedAnalysisSeed?.sessionId,
      operationId: durableSeeds.operationId,
      referenceAssetId: durableSeeds.referenceAssetId,
      clientContextPath,
      editorUrlPath: `/dashboard/editron/project/${fixtureProjectId}`,
      expiresAt: expiresAt.toISOString(),
      sourceCapabilities,
    };
    const manifestPath = path.join(fixtureDir, 'fixture.json');
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({ ...manifest, manifestPath }, null, 2));
  } finally {
    await session.endSession();
    await client.close();
  }
}

function buildCompletedAnalysisSeed(
  project: Record<string, unknown>,
  now: Date,
  expiresAt: Date,
): {
  job: Record<string, unknown>;
  chatSession: Record<string, unknown>;
  sessionId: string;
} {
  const userId = requireString(project.userId, 'fixture userId');
  const projectId = requireString(project.projectId, 'fixture projectId');
  const overlay = asArray(project.overlays)
    .map(asRecord)
    .find((candidate) => candidate.type === 'video' && stringValue(candidate.assetId));
  if (!overlay) throw new Error('Completed-analysis fixture requires a video overlay with an assetId.');

  const fps = positiveNumber(project.fps) ?? 30;
  const startFrame = nonNegativeInteger(overlay.from);
  const durationInFrames = Math.max(1, nonNegativeInteger(overlay.durationInFrames));
  const endFrame = startFrame + durationInFrames;
  const overlayId = requireString(String(overlay.id), 'analysis overlay id');
  const assetId = requireString(overlay.assetId, 'analysis asset id');
  const jobId = `chatda_fixture_${randomUUID().replace(/-/g, '')}`;
  const sessionId = `sess_fixture_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
  const result = {
    version: 'editron-chat-deep-analysis-result-v1',
    summary: 'The selected shot contains a clearly visible primary subject with stable framing.',
    findings: [{
      kind: 'visual-subject',
      label: 'primary subject',
      confidence: 0.98,
      timeline: { startFrame, endFrame },
      source: { startFrame: 0, endFrame: durationInFrames },
    }],
  };
  const job = {
    _id: jobId,
    version: 'editron-chat-deep-analysis-job-v1',
    status: 'completed',
    projectId,
    userId,
    projectRevision: `battle-fixture:${projectId}`,
    modality: 'video',
    targetMode: 'overlay',
    target: {
      overlayId,
      overlayType: 'video',
      assetId,
      displayName: stringValue(overlay.name) ?? stringValue(overlay.filename),
      fps,
      timeline: { startFrame, endFrame },
      source: { startFrame: 0, endFrame: durationInFrames },
    },
    attemptCount: 1,
    result,
    error: null,
    createdAt: now,
    updatedAt: now,
    completedAt: now,
    expiresAt,
  };
  const chatSession = {
    sessionId,
    userId,
    projectId,
    name: 'Chat battle completed analysis',
    messages: [{
      role: 'assistant',
      content: `Deep analysis job ${jobId} completed for the selected video. Use get_clip_analysis_result with this exact job ID before reporting its findings.`,
      timestamp: now,
    }],
    createdAt: now,
    updatedAt: now,
  };
  project.intelligence = {
    ...asRecord(project.intelligence),
    chatDeepAnalysisJobs: [{ jobId, status: 'completed', result }],
  };
  return { job, chatSession, sessionId };
}

async function cloneTranscriptAssetAlias(input: {
  db: any;
  userId: string;
  project: Record<string, unknown>;
  alias: NonNullable<ReturnType<typeof prepareChatBattleFixture>['transcriptAssetAlias']>;
  now: Date;
}): Promise<Record<string, unknown>> {
  const { COLLECTIONS } = await import('../lib/editron/db/mongodb');
  const assets = input.db.collection(COLLECTIONS.MEDIA_ASSETS);
  const collision = await assets.findOne({
    userId: input.userId,
    assetId: input.alias.fixtureAssetId,
  });
  if (collision) {
    throw new Error(`Transcript fixture asset already exists: ${input.alias.fixtureAssetId}`);
  }
  const source = await assets.findOne({
    userId: input.userId,
    assetId: input.alias.sourceAssetId,
  });
  if (!source) {
    throw new Error(`Transcript fixture source asset not found: ${input.alias.sourceAssetId}`);
  }

  const clone = structuredClone(source) as Record<string, unknown>;
  delete clone._id;
  clone.assetId = input.alias.fixtureAssetId;
  clone.transcription = structuredClone(input.alias.transcription);
  clone.createdAt = input.now;
  clone.updatedAt = input.now;
  clone.uploadedAt = input.now;
  clone.metadata = {
    ...asRecord(clone.metadata),
    battleFixtureAlias: true,
    battleFixtureProjectId: requireString(input.project.projectId, 'fixture projectId'),
    sourceAssetId: input.alias.sourceAssetId,
  };

  const sourceAssetIds = new Set(
    asArray(input.project.sourceAssetIds)
      .filter((value): value is string => typeof value === 'string')
      .map((assetId) => assetId === input.alias.sourceAssetId ? input.alias.fixtureAssetId : assetId),
  );
  sourceAssetIds.add(input.alias.fixtureAssetId);
  input.project.sourceAssetIds = [...sourceAssetIds];
  return clone;
}

async function ensureImageAssetAlias(input: {
  db: any;
  session: any;
  userId: string;
  sourceProject: Record<string, unknown>;
  project: Record<string, unknown>;
  now: Date;
}): Promise<void> {
  const { COLLECTIONS } = await import('../lib/editron/db/mongodb');
  const assets = input.db.collection(COLLECTIONS.MEDIA_ASSETS);
  const existing = await assets.findOne({ userId: input.userId, assetId: 'a_logo123' }, { session: input.session });
  if (existing && existing.type !== 'image') throw new Error('Battle asset alias a_logo123 exists but is not an image.');
  if (!existing) {
    const imageOverlay = asArray(input.sourceProject.overlays)
      .map(asRecord)
      .find((overlay) => overlay.type === 'image');
    const preferredAssetId = stringValue(imageOverlay?.assetId);
    const sourceAsset = preferredAssetId
      ? await assets.findOne({ userId: input.userId, assetId: preferredAssetId }, { session: input.session })
      : await assets.findOne({ userId: input.userId, type: 'image' }, { session: input.session });
    if (!sourceAsset) throw new Error('No owned image asset exists to seed the explicit-asset battle case.');
    const alias = structuredClone(sourceAsset);
    delete alias._id;
    alias.assetId = 'a_logo123';
    alias.filename = `battle-logo-${sourceAsset.filename ?? 'image'}`;
    alias.uploadedAt = input.now;
    alias.createdAt = input.now;
    alias.updatedAt = input.now;
    alias.metadata = { ...asRecord(alias.metadata), battleFixtureAlias: true };
    await assets.insertOne(alias, { session: input.session });
  }
  const sourceAssetIds = new Set(asArray(input.project.sourceAssetIds).filter((value): value is string => typeof value === 'string'));
  sourceAssetIds.add('a_logo123');
  input.project.sourceAssetIds = [...sourceAssetIds];
}

function parseArgs(argv: string[]): PrepareFixtureOptions {
  const options: PrepareFixtureOptions = {
    outputRoot: '.calibration-temp/chat-edit-battle-fixtures',
    expiresInHours: 24,
  };
  for (const arg of argv) {
    if (arg.startsWith('--case=')) options.scenarioId = valueAfterEquals(arg);
    else if (arg.startsWith('--fixture-id=')) options.fixtureProjectId = valueAfterEquals(arg);
    else if (arg.startsWith('--cleanup=')) options.cleanupProjectId = valueAfterEquals(arg);
    else if (arg.startsWith('--output=')) options.outputRoot = valueAfterEquals(arg);
    else if (arg.startsWith('--expires-hours=')) options.expiresInHours = Number(valueAfterEquals(arg));
  }
  if (!Number.isFinite(options.expiresInHours) || options.expiresInHours <= 0 || options.expiresInHours > 168) {
    throw new Error('--expires-hours must be between 0 and 168.');
  }
  return options;
}

function usage(): string {
  return 'Usage: npx tsx scripts/prepare-chat-edit-battle-fixture.ts --case=<scenario-id> [--fixture-id=proj_chatbattle_x]';
}

function valueAfterEquals(value: string): string {
  return value.slice(value.indexOf('=') + 1).trim();
}

function requireString(value: unknown, label: string): string {
  const result = stringValue(value);
  if (!result) throw new Error(`Missing ${label}.`);
  return result;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function positiveNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function nonNegativeInteger(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, any> {
  return value != null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
