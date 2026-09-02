import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadEnv } from 'dotenv';
import { MongoClient } from 'mongodb';

import {
  buildEditronFastQaArtifactPaths,
  buildEditronFastQaFixtureState,
  buildEditronFastQaScenarioManifest,
  createEditronFastQaRunId,
  renderEditronFastQaCockpitHtml,
  writeEditronFastQaJson,
} from '../lib/editron/services/editron-fast-user-qa';

interface FastQaOptions {
  baseUrl: string;
  outputRoot: string;
}

interface ProcessResult {
  exitCode: number;
  output: string;
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireFromHere = createRequire(import.meta.url);
const requireFromClerk = createRequire(requireFromHere.resolve('@clerk/nextjs/server'));
const playwrightCliPath = requireFromHere.resolve('@playwright/test/cli');

async function main(): Promise<void> {
  loadEnv({ path: path.join(repoRoot, '.env.local'), override: false });
  loadEnv({ path: path.join(repoRoot, '.env'), override: false });

  const options = parseArgs(process.argv.slice(2));
  const runId = createEditronFastQaRunId();
  const clerkTestEmail = requireEnvironment(
    'E2E_CLERK_USER_EMAIL',
    ['TEST_EMAIL'],
  );
  const fixture = await prepareFastQaFixture(runId, clerkTestEmail);
  const paths = buildEditronFastQaArtifactPaths(
    options.outputRoot,
    runId,
    fixture.projectId,
  );
  const manifest = buildEditronFastQaScenarioManifest({
    projectId: fixture.projectId,
    runId,
    baseUrl: options.baseUrl,
  });
  const childEnvironment: NodeJS.ProcessEnv = {
    ...process.env,
    EDITRON_FAST_QA_PROVIDER_MODE: 'off',
    EDITRON_FAST_QA_RUN_ID: runId,
    EDITRON_FAST_QA_OUTPUT_ROOT: options.outputRoot,
    EDITRON_E2E_BASE_URL: options.baseUrl,
    EDITRON_E2E_PROJECT_ID: fixture.projectId,
    E2E_CLERK_USER_EMAIL: clerkTestEmail,
    EDITRON_E2E_AUTH_STATE_PATH: path.join(paths.root, 'auth', 'clerk-user.json'),
    // Keep the fixture and browser child processes unable to reach an LLM/media
    // provider even if an unrelated setup path is accidentally exercised.
    GEMINI_API_KEY: '',
    GOOGLE_GENERATIVE_AI_API_KEY: '',
    GOOGLE_API_KEY: 'editron-fast-qa-provider-off',
    OPENROUTER_API_KEY: '',
    OPENAI_API_KEY: '',
    ANTHROPIC_API_KEY: '',
    PERPLEXITY_API_KEY: '',
    REPLICATE_API_TOKEN: '',
    FAL_AI_API_KEY: '',
    DEEPGRAM_API_KEY: '',
  };
  await mkdir(paths.root, { recursive: true });

  let fixtureResult: ProcessResult = { exitCode: 1, output: 'Fixture preparation did not run.' };
  let browserResult: ProcessResult = { exitCode: 1, output: 'Browser journey did not run.' };
  let runError: string | null = null;

  try {
    await writeEditronFastQaJson(paths.manifestPath, manifest);
    await writeEditronFastQaJson(paths.fixtureManifestPath, {
      version: manifest.version,
      fixtureOwner: manifest.fixture.owner,
      fixtureCase: manifest.fixture.fixtureCase,
      projectId: fixture.projectId,
      userId: fixture.userId,
      selectedOverlayId: 1,
      creationReceipt: fixture.creationReceipt,
    });
    fixtureResult = {
      exitCode: 0,
      output: `${JSON.stringify(fixture, null, 2)}\n`,
    };
    await writeFile(paths.fixtureLogPath, fixtureResult.output, 'utf8');
    if (fixtureResult.exitCode === 0) {
      browserResult = await runNodeCli(
        playwrightCliPath,
        [
          'test',
          'tests/e2e/editron-fast-user-qa.spec.ts',
          '--config=playwright.fast-qa.config.ts',
          '--project=editron-chat-chromium',
        ],
        childEnvironment,
      );
      await writeFile(paths.browserLogPath, browserResult.output, 'utf8');
    }
  } catch (error) {
    runError = error instanceof Error ? error.stack ?? error.message : String(error);
  }

  const cleanup = await cleanupFixture(fixture.userId, fixture.projectId);
  await writeEditronFastQaJson(paths.cleanupPath, cleanup);

  const journey = await readJsonIfPresent(paths.journeyPath);
  const journeyPassed = Boolean(
    journey
      && typeof journey === 'object'
      && (journey as Record<string, unknown>).status === 'PASS',
  );
  const result = {
    version: manifest.version,
    scenarioId: manifest.scenarioId,
    runId,
    projectId: fixture.projectId,
    baseOrigin: new URL(options.baseUrl).origin,
    status: fixtureResult.exitCode === 0
      && browserResult.exitCode === 0
      && cleanup.status === 'PASS'
      && journeyPassed
      && !runError
      ? 'PASS'
      : 'FAIL',
    layers: {
      exact: readJourneyExactLayer(journey),
      perceptual: { status: 'UNVERIFIABLE', reason: 'Q2 rendered-frame and PCM proof is outside this lane.' },
      human: { status: 'UNVERIFIABLE', reason: 'Human review is not automated in the fast lane.' },
    },
    fixture: { exitCode: fixtureResult.exitCode },
    browser: { exitCode: browserResult.exitCode },
    cleanup,
    journey: journey ?? null,
    artifactRefs: Object.fromEntries(
      Object.entries(paths).filter(([key]) => key.endsWith('Path')),
    ),
    error: runError,
  };
  await writeEditronFastQaJson(paths.resultPath, result);
  await writeFile(
    paths.cockpitPath,
    renderEditronFastQaCockpitHtml({ manifest, result, cleanup }),
    'utf8',
  );

  console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'PASS') process.exitCode = 1;
}

async function prepareFastQaFixture(
  runId: string,
  clerkTestEmail: string,
): Promise<Readonly<{
  projectId: string;
  userId: string;
  creationReceipt: unknown;
}>> {
  const userId = await resolveClerkTestUserId(clerkTestEmail);
  const { projectService } = await import('../lib/editron/services/project-service');
  const project = await projectService.createProject(
    userId,
    `Editron fast QA ${runId}`,
    { aspectRatio: '16:9' },
  );
  try {
    const expectedRevision = await projectService.getProjectRevision(
      userId,
      project.projectId,
    );
    const creationReceipt = await projectService.saveProjectWithReceipt(
      userId,
      project.projectId,
      buildEditronFastQaFixtureState(),
      {
        expectedRevision,
        projectUpdates: {
          metadata: {
            fastUserQa: {
              version: 'editron-fast-user-qa-v1',
              runId,
              disposable: true,
            },
          },
        },
      },
    );
    return Object.freeze({ projectId: project.projectId, userId, creationReceipt });
  } catch (error) {
    await projectService.deleteProject(userId, project.projectId).catch(() => undefined);
    throw error;
  }
}

async function resolveClerkTestUserId(email: string): Promise<string> {
  const { createClerkClient } = requireFromClerk('@clerk/backend') as {
    createClerkClient(input: { secretKey: string }): {
      users: {
        getUserList(input: { emailAddress: string[]; limit: number }): Promise<{
          data: Array<{ id: string }>;
        }>;
      };
    };
  };
  const users = await createClerkClient({
    secretKey: requireEnvironment('CLERK_SECRET_KEY'),
  }).users.getUserList({ emailAddress: [email], limit: 2 });
  if (users.data.length !== 1 || !users.data[0]?.id) {
    throw new Error('Editron fast QA requires exactly one configured Clerk test user.');
  }
  return users.data[0].id;
}

async function cleanupFixture(
  userId: string,
  projectId: string,
): Promise<Record<string, unknown>> {
  let cleanupResult: unknown = null;
  let error: string | null = null;
  try {
    const { projectService } = await import('../lib/editron/services/project-service');
    await projectService.deleteProject(userId, projectId);
    cleanupResult = { projectId, deletedBy: 'ProjectService.deleteProject' };
  } catch (caught) {
    error = caught instanceof Error ? caught.stack ?? caught.message : String(caught);
  }
  let verifiedProjectAbsent = false;
  if (!error) {
    try {
      verifiedProjectAbsent = await isDisposableProjectAbsent(projectId);
    } catch (caught) {
      error = caught instanceof Error ? caught.stack ?? caught.message : String(caught);
    }
  }
  await closeSharedDatabaseClient().catch((caught) => {
    error = error || (caught instanceof Error ? caught.stack ?? caught.message : String(caught));
  });
  return {
    status: !error && verifiedProjectAbsent ? 'PASS' : 'FAIL',
    owner: 'project-service-delete-and-fresh-verification',
    result: cleanupResult,
    verifiedProjectAbsent,
    error,
  };
}

async function closeSharedDatabaseClient(): Promise<void> {
  const { connectToDatabase } = await import('../lib/editron/db/mongodb');
  const { client } = await connectToDatabase();
  await client.close();
}

async function isDisposableProjectAbsent(projectId: string): Promise<boolean> {
  const { COLLECTIONS } = await import('../lib/editron/db/mongodb');
  const uri = process.env.MONGODB_URI?.trim();
  const dbName = (
    process.env.EDITRON_MONGODB_DB_NAME
    || process.env.MONGODB_DB_NAME
  )?.trim();
  if (!uri || !dbName) {
    throw new Error('Fresh cleanup verification requires MongoDB URI and database name.');
  }
  const client = new MongoClient(uri, {
    maxPoolSize: 1,
    minPoolSize: 0,
    serverSelectionTimeoutMS: 5_000,
    connectTimeoutMS: 5_000,
  });
  try {
    await client.connect();
    const db = client.db(dbName);
    const count = await db.collection(COLLECTIONS.PROJECTS).countDocuments({
      projectId,
    }, { limit: 1 });
    return count === 0;
  } finally {
    await client.close();
  }
}

async function runNodeCli(
  cliPath: string,
  args: string[],
  environment: NodeJS.ProcessEnv,
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd: repoRoot,
      env: environment,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let output = '';
    const append = (chunk: Buffer | string) => {
      output += chunk.toString();
      if (output.length > 2_000_000) output = output.slice(-2_000_000);
    };
    child.stdout?.on('data', append);
    child.stderr?.on('data', append);
    child.on('error', reject);
    child.on('close', (exitCode) => resolve({ exitCode: exitCode ?? 1, output }));
  });
}

async function readJsonIfPresent(filePath: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as unknown;
  } catch {
    return null;
  }
}

function readJourneyExactLayer(journey: unknown): unknown {
  if (!journey || typeof journey !== 'object') {
    return { status: 'INFRASTRUCTURE_FAILURE', reason: 'Browser journey did not produce evidence.' };
  }
  const layers = (journey as Record<string, unknown>).layers;
  if (!layers || typeof layers !== 'object' || !('exact' in layers)) {
    return { status: 'INFRASTRUCTURE_FAILURE', reason: 'Browser journey omitted exact evidence.' };
  }
  return (layers as Record<string, unknown>).exact;
}

function parseArgs(argv: string[]): FastQaOptions {
  const options: FastQaOptions = {
    baseUrl: process.env.EDITRON_E2E_BASE_URL?.trim() || 'http://localhost:3000',
    outputRoot: '.calibration-temp/editron-fast-user-qa',
  };
  for (const arg of argv) {
    if (arg.startsWith('--base-url=')) options.baseUrl = valueAfterEquals(arg);
    else if (arg.startsWith('--output=')) options.outputRoot = valueAfterEquals(arg);
    else if (arg === '--help') throw new Error(usage());
    else throw new Error(`Unknown argument ${arg}\n${usage()}`);
  }
  options.baseUrl = normalizeBaseUrl(options.baseUrl);
  if (!options.outputRoot.trim()) throw new Error('--output must not be empty.');
  return options;
}

function normalizeBaseUrl(value: string): string {
  const parsed = new URL(value);
  parsed.pathname = '/';
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString().replace(/\/$/, '');
}

function valueAfterEquals(value: string): string {
  return value.slice(value.indexOf('=') + 1).trim();
}

function requireEnvironment(name: string, aliases: string[] = []): string {
  for (const candidate of [name, ...aliases]) {
    const value = process.env[candidate]?.trim();
    if (value) return value;
  }
  throw new Error(
    `Missing required Editron fast-QA environment variable: ${[name, ...aliases].join(' or ')}`,
  );
}

function usage(): string {
  return 'Usage: pnpm exec tsx scripts/run-editron-fast-user-qa.ts [--base-url=http://localhost:3000] [--output=.calibration-temp/editron-fast-user-qa]';
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
