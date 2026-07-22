import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { config as loadEnv } from 'dotenv';

import { cleanupDisposableChatBattleFixture } from '../lib/editron/services/chat-edit-battle-fixture-cleanup';
import { getChatEditBattleScenario } from '../lib/editron/services/chat-edit-battle-harness';
import { planChatBattleFixture } from '../lib/editron/services/chat-edit-battle-fixture-plan';
import {
  cloneChatBattleAnalysisDocuments,
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
  clientContextPath: string;
  editorUrlPath: string;
  expiresAt: string;
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
    const sourceAnalyses = await db.collection(COLLECTIONS.PROJECT_ASSET_ANALYSES)
      .find({ projectId: plan.sourceProjectId })
      .toArray();
    const prepared = prepareChatBattleFixture({
      sourceProject: sourceProject as Record<string, unknown>,
      fixtureProjectId,
      plan,
      now,
      expiresInMs: expiresAt.getTime() - now.getTime(),
    });
    const analysisDocuments = cloneChatBattleAnalysisDocuments(
      sourceAnalyses as Record<string, unknown>[],
      fixtureProjectId,
      now,
    );

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
      await db.collection(COLLECTIONS.PROJECTS).insertOne(prepared.project, { session });
      if (analysisDocuments.length > 0) {
        await db.collection(COLLECTIONS.PROJECT_ASSET_ANALYSES).insertMany(analysisDocuments, { session });
      }
    });

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
      clientContextPath,
      editorUrlPath: `/dashboard/editron/project/${fixtureProjectId}`,
      expiresAt: expiresAt.toISOString(),
    };
    const manifestPath = path.join(fixtureDir, 'fixture.json');
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({ ...manifest, manifestPath }, null, 2));
  } finally {
    await session.endSession();
    await client.close();
  }
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
