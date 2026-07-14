import { createHash, randomUUID } from 'crypto';
import { execFile } from 'child_process';
import { existsSync } from 'fs';
import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { promisify } from 'util';
import { pathToFileURL } from 'url';

import { config as loadEnv } from 'dotenv';

import {
  EDITRON_BATTLE_CONTRACT_TESTS,
  buildEditronBattleReport,
  renderEditronBattleReportHtml,
  type BuildEditronBattleReportInput,
  type EditronBattleApiEvidence,
  type EditronBattleMgFrameProbe,
  type EditronBattleScenario,
  type EditronBattleStaticSuiteEvidence,
} from '../lib/editron/services/editron-battle-test-contract';
import { buildPhase0ArtifactPaths } from '../lib/editron/services/phase0-artifact-paths';
import { buildPhase0FixtureManifest, type Phase0FixtureManifest, type Phase0FixtureProject } from '../lib/editron/services/phase0-fixture-manifest';
import { sequenceFrameUrls } from '../lib/editron/motion-graphics/codegen/render/sequence-playback';

const execFileAsync = promisify(execFile);
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_POLL_MS = 5_000;
let fatalArtifactDir: string | null = null;

export interface BattleCliOptions {
  projectId?: string;
  uploadBatchId?: string;
  files: string[];
  intakePath?: string;
  baseUrl?: string;
  authHeaderFile?: string;
  comparisonProjectId?: string;
  scenario: EditronBattleScenario;
  outputRoot: string;
  runId: string;
  timeoutMs: number;
  pollMs: number;
  allowLiveWrite: boolean;
  runContracts: boolean;
  render: boolean;
  persistPhase0: boolean;
  expectedSourceDurationSec?: number;
}

interface CommandEvidence {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

interface ApiClient {
  baseUrl: string;
  headers: Record<string, string>;
}

interface LocalMediaProbe {
  duration?: number;
  dimensions?: { width: number; height: number };
}

interface UploadResult {
  uploadBatchId: string;
  assetIds: string[];
  sourceDurationSec: number;
}

async function main(): Promise<void> {
  loadBattleEnv();
  const options = parseBattleCliArgs(process.argv.slice(2), process.env);
  if (!options) {
    console.error(usage());
    process.exitCode = 1;
    return;
  }
  const validationError = validateOptions(options);
  if (validationError) {
    console.error(`Battle test configuration error: ${validationError}\n\n${usage()}`);
    process.exitCode = 1;
    return;
  }

  const runDir = path.resolve(options.outputRoot, options.runId);
  fatalArtifactDir = runDir;
  const eventsPath = path.join(runDir, 'events.jsonl');
  await mkdir(runDir, { recursive: true });
  const event = async (stage: string, status: string, detail: Record<string, unknown> = {}) => {
    const record = { at: new Date().toISOString(), stage, status, ...detail };
    await writeFile(eventsPath, `${JSON.stringify(record)}\n`, { encoding: 'utf8', flag: 'a' });
    console.log(`[battle:${stage}] ${status}`);
  };

  await event('run', 'started', { runId: options.runId, scenario: options.scenario });
  const staticSuite = options.runContracts
    ? await runContractSuite(event, path.join(runDir, 'contracts.log'))
    : { status: 'not-run', command: null, exitCode: null, durationMs: null } satisfies EditronBattleStaticSuiteEvidence;
  if (staticSuite.status === 'failed') {
    await event('contracts', 'failed', { exitCode: staticSuite.exitCode });
    await writePreflightFailure(options, runDir, staticSuite);
    process.exitCode = 1;
    return;
  }

  const api = options.baseUrl && options.authHeaderFile
    ? await buildApiClient(options.baseUrl, options.authHeaderFile)
    : null;
  const intake = options.intakePath ? await readJsonRecord(options.intakePath) : {};
  let projectId = options.projectId;
  let uploadBatchId = options.uploadBatchId;
  let expectedSourceDurationSec = options.expectedSourceDurationSec;

  if (options.files.length > 0) {
    if (!api) throw new Error('Fresh upload mode requires --base-url and --auth-header-file');
    const uploaded = await uploadFixture(api, options.files, intake, event);
    uploadBatchId = uploaded.uploadBatchId;
    expectedSourceDurationSec ??= uploaded.sourceDurationSec || undefined;
  }

  let batchApiEvidence: Record<string, unknown> | null = null;
  if (uploadBatchId && api) {
    batchApiEvidence = await pollBatch(api, uploadBatchId, options.timeoutMs, options.pollMs, event);
    projectId = stringField(batchApiEvidence, 'projectId') ?? projectId;
    if (!projectId) {
      if (!options.allowLiveWrite) throw new Error('Batch has no project yet; rerun with --allow-live-write to create the edit');
      const created = await postJson(api, '/api/services/editron/auto-edit/from-batch', { uploadBatchId, ...intake });
      projectId = requiredString(created, 'projectId');
      await event('compose', 'project-created', { projectId, uploadBatchId, status: created.status });
    }
  }

  if (!projectId) throw new Error('No projectId could be resolved');
  let projectReloadEvidence: EditronBattleApiEvidence['projectReload'];
  if (api) {
    const terminal = await pollProject(api, projectId, options.timeoutMs, options.pollMs, event);
    projectReloadEvidence = { ok: true, status: terminal.httpStatus };
  }

  const phase0Root = battlePhase0OutputRoot(options.runId);
  const phase0RunId = 'truth';
  const phase0 = await runPhase0(projectId, phase0Root, phase0RunId, options.render, options.persistPhase0, path.join(runDir, 'phase0.log'), event);
  const phase0Paths = buildPhase0ArtifactPaths(projectId, { rootDir: phase0Root, runId: phase0RunId });

  const { client, collections } = await loadDatabaseEvidence(projectId, uploadBatchId);
  try {
    const project = collections.project as unknown as Phase0FixtureProject;
    const assets = collections.assets;
    const mgJobs = collections.mgJobs;
    const batch = collections.batch ?? batchApiEvidence;
    let manifest: Phase0FixtureManifest;
    if (existsSync(phase0Paths.manifestPath)) {
      manifest = JSON.parse(await readFile(phase0Paths.manifestPath, 'utf8')) as Phase0FixtureManifest;
    } else {
      manifest = buildPhase0FixtureManifest(project, {
        capturedAt: new Date().toISOString(),
        source: 'battle-test-metadata-fallback',
        artifactDir: phase0Paths.runDir,
      });
    }
    await event('truth', phase0.exitCode === 0 ? 'captured' : 'capture-failed', {
      phase0ExitCode: phase0.exitCode,
      manifestPath: phase0Paths.manifestPath,
    });

    const mgFrameProbes = await probeMgSequences(assets, event);
    const mediaEvidence = await probeMediaAssets(assets, event);
    const chatIsolation = api
      ? await exerciseChatIsolation(api, projectId, options.comparisonProjectId, event)
      : undefined;
    const apiEvidence: EditronBattleApiEvidence | undefined = api ? {
      projectReload: projectReloadEvidence ?? { ok: true, status: 200 },
      media: mediaEvidence,
      chatIsolation,
    } : undefined;

    const report = buildEditronBattleReport({
      runId: options.runId,
      mode: options.files.length > 0 ? 'fresh-upload' : uploadBatchId ? 'existing-batch' : 'existing-project',
      scenario: options.scenario,
      project,
      manifest,
      batch,
      assets,
      mgJobs,
      mgFrameProbes,
      apiEvidence,
      staticSuite,
      expectedSourceDurationSec,
      requireRenderedEvidence: options.render,
    });
    const reportJson = path.join(runDir, 'report.json');
    const reportHtml = path.join(runDir, 'report.html');
    await writeFile(reportJson, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    await writeFile(reportHtml, renderEditronBattleReportHtml(report), 'utf8');
    await event('run', report.verdict, { reportJson, reportHtml, summary: report.summary });
    console.log(JSON.stringify({
      verdict: report.verdict,
      projectId,
      uploadBatchId,
      reportJson,
      reportHtml,
      eventsPath,
      summary: report.summary,
    }, null, 2));
    process.exitCode = report.verdict === 'fail' ? 1 : 0;
  } finally {
    await client.close();
  }
}

export function parseBattleCliArgs(argv: string[], env: Partial<NodeJS.ProcessEnv> = process.env): BattleCliOptions | null {
  const options: BattleCliOptions = {
    files: [],
    scenario: 'auto',
    outputRoot: env.EDITRON_BATTLE_TEST_DIR ?? path.resolve(process.cwd(), '.calibration-temp', 'editron-battle'),
    runId: `battle_${new Date().toISOString().replace(/[:.]/g, '-')}`,
    timeoutMs: numberArg(env.EDITRON_BATTLE_TEST_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    pollMs: numberArg(env.EDITRON_BATTLE_TEST_POLL_MS, DEFAULT_POLL_MS),
    allowLiveWrite: false,
    runContracts: true,
    render: true,
    persistPhase0: false,
  };
  for (const arg of argv) {
    if (arg === '--allow-live-write') options.allowLiveWrite = true;
    else if (arg === '--skip-contract-tests') options.runContracts = false;
    else if (arg === '--metadata-only') options.render = false;
    else if (arg === '--persist-phase0') options.persistPhase0 = true;
    else if (arg.startsWith('--project=')) options.projectId = valueAfterEquals(arg);
    else if (arg.startsWith('--batch=')) options.uploadBatchId = valueAfterEquals(arg);
    else if (arg.startsWith('--file=')) options.files.push(path.resolve(valueAfterEquals(arg)));
    else if (arg.startsWith('--intake=')) options.intakePath = path.resolve(valueAfterEquals(arg));
    else if (arg.startsWith('--base-url=')) options.baseUrl = valueAfterEquals(arg).replace(/\/$/, '');
    else if (arg.startsWith('--auth-header-file=')) options.authHeaderFile = path.resolve(valueAfterEquals(arg));
    else if (arg.startsWith('--comparison-project=')) options.comparisonProjectId = valueAfterEquals(arg);
    else if (arg.startsWith('--scenario=')) options.scenario = valueAfterEquals(arg) as EditronBattleScenario;
    else if (arg.startsWith('--output=')) options.outputRoot = path.resolve(valueAfterEquals(arg));
    else if (arg.startsWith('--run-id=')) options.runId = safeRunId(valueAfterEquals(arg));
    else if (arg.startsWith('--timeout-ms=')) options.timeoutMs = numberArg(valueAfterEquals(arg), DEFAULT_TIMEOUT_MS);
    else if (arg.startsWith('--poll-ms=')) options.pollMs = numberArg(valueAfterEquals(arg), DEFAULT_POLL_MS);
    else if (arg.startsWith('--expected-source-seconds=')) options.expectedSourceDurationSec = numberArg(valueAfterEquals(arg), 0) || undefined;
    else return null;
  }
  return options;
}

export function validateOptions(options: BattleCliOptions): string | null {
  const modes = Number(Boolean(options.projectId)) + Number(Boolean(options.uploadBatchId)) + Number(options.files.length > 0);
  if (modes !== 1) return 'Choose exactly one source: --project, --batch, or one or more --file arguments.';
  if (!['auto', 'speech-led', 'visual-only', 'mixed', 'music-led', 'hinglish', 'mg-worthy'].includes(options.scenario)) return `Unsupported scenario: ${options.scenario}`;
  if (options.files.length > 0 && !options.allowLiveWrite) return 'Fresh files require --allow-live-write.';
  if (options.files.length > 0 && (!options.baseUrl || !options.authHeaderFile)) return 'Fresh upload requires --base-url and --auth-header-file.';
  if (options.uploadBatchId && (!options.baseUrl || !options.authHeaderFile)) return 'Existing batch mode requires --base-url and --auth-header-file so its durable state can be resolved.';
  for (const file of options.files) if (!existsSync(file)) return `Fixture file does not exist: ${file}`;
  if (options.intakePath && !existsSync(options.intakePath)) return `Intake JSON does not exist: ${options.intakePath}`;
  if (options.authHeaderFile && !existsSync(options.authHeaderFile)) return `Auth header JSON does not exist: ${options.authHeaderFile}`;
  if (options.timeoutMs < 60_000) return '--timeout-ms must be at least 60000.';
  if (options.pollMs < 1_000) return '--poll-ms must be at least 1000.';
  return null;
}

export function battleContractInvocation(execPath: string = process.execPath): { command: string; args: string[] } {
  return {
    command: execPath,
    args: [path.resolve(process.cwd(), 'node_modules', 'vitest', 'vitest.mjs'), 'run', ...EDITRON_BATTLE_CONTRACT_TESTS],
  };
}

export function battlePhase0OutputRoot(runId: string, cwd: string = process.cwd()): string {
  return path.resolve(cwd, '.calibration-temp', 'phase0-fixtures', 'editron-battle', safeRunId(runId));
}
export function battlePhase0Invocation(
  projectId: string,
  outputRoot: string,
  runId: string,
  render: boolean,
  persist: boolean,
  execPath: string = process.execPath,
): { command: string; args: string[] } {
  const args = ['--import', 'tsx', 'scripts/build-editron-phase0-fixture.ts', projectId, outputRoot, `--run-id=${runId}`, '--keep-runs=3'];
  if (render) args.push('--render');
  if (persist) args.push('--persist');
  return { command: execPath, args };
}

async function runContractSuite(event: (stage: string, status: string, detail?: Record<string, unknown>) => Promise<void>, logPath: string): Promise<EditronBattleStaticSuiteEvidence> {
  const invocation = battleContractInvocation();
  await event('contracts', 'running', { testCount: EDITRON_BATTLE_CONTRACT_TESTS.length });
  const result = await runCommand(invocation.command, invocation.args, 15 * 60 * 1000);
  await writeCommandLog(logPath, invocation, result);
  return {
    status: result.exitCode === 0 ? 'passed' : 'failed',
    command: `${invocation.command} ${invocation.args.join(' ')}`,
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    outputTail: tail(`${result.stdout}
${result.stderr}`, 12_000),
  };
}

async function uploadFixture(api: ApiClient, files: string[], intake: Record<string, unknown>, event: (stage: string, status: string, detail?: Record<string, unknown>) => Promise<void>): Promise<UploadResult> {
  const uploadBatchId = `upload_batch_battle_${randomUUID()}`;
  const assetIds: string[] = [];
  let sourceDurationSec = 0;
  for (const filePath of files) {
    const filename = path.basename(filePath);
    const contentType = mimeType(filePath);
    const bytes = await readFile(filePath);
    const probe = await probeLocalMedia(filePath);
    if (mediaType(contentType) === 'video') sourceDurationSec += probe.duration ?? 0;
    await event('upload', 'requesting-url', { filename, size: bytes.length, contentType });
    const signed = await postJson(api, '/api/services/editron/media/upload/url', { filename, contentType });
    const uploadUrl = requiredString(signed, 'uploadUrl');
    const uploadResponse = await fetch(uploadUrl, { method: 'PUT', headers: { 'content-type': contentType }, body: bytes });
    if (!uploadResponse.ok) throw new Error(`Storage upload failed for ${filename}: HTTP ${uploadResponse.status}`);
    const registered = await postJson(api, '/api/services/editron/media/upload', {
      assetId: requiredString(signed, 'assetId'),
      gcsPath: signed.gcsPath,
      readUrl: signed.readUrl,
      readUrlExpiresAt: signed.readUrlExpiresAt,
      filename,
      contentType,
      size: bytes.length,
      type: mediaType(contentType),
      uploadBatchId,
      uploadBatchIntake: intake,
      ...(probe.duration != null ? { duration: probe.duration } : {}),
      ...(probe.dimensions ? { dimensions: probe.dimensions } : {}),
    });
    const assetId = requiredString(registered, 'assetId');
    assetIds.push(assetId);
    await event('upload', 'registered', { filename, assetId, uploadBatchId, probe });
  }
  return { uploadBatchId, assetIds, sourceDurationSec: round(sourceDurationSec) };
}

async function pollBatch(api: ApiClient, uploadBatchId: string, timeoutMs: number, pollMs: number, event: (stage: string, status: string, detail?: Record<string, unknown>) => Promise<void>): Promise<Record<string, unknown>> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await getJson(api, `/api/services/editron/media/batches/${encodeURIComponent(uploadBatchId)}`);
    const batch = asRecord(response.batch);
    const status = stringField(batch, 'status');
    await event('analysis', status ?? 'unknown', { counts: batch.counts, canCreateProject: batch.canCreateProject });
    if (status === 'ready' || status === 'needs_attention') return batch;
    await sleep(pollMs);
  }
  throw new Error(`Upload batch ${uploadBatchId} did not reach a terminal analysis state within ${timeoutMs}ms`);
}

async function pollProject(api: ApiClient, projectId: string, timeoutMs: number, pollMs: number, event: (stage: string, status: string, detail?: Record<string, unknown>) => Promise<void>): Promise<{ project: Record<string, unknown>; httpStatus: number }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await requestJson(api, `/api/services/editron/projects/${encodeURIComponent(projectId)}`);
    const project = asRecord(result.data.project);
    const status = stringField(project, 'autoEditStatus');
    await event('director', status ?? 'unknown', { projectId, overlayCount: Array.isArray(project.overlays) ? project.overlays.length : 0 });
    if (status === 'complete' || status === 'needs_review') return { project, httpStatus: result.status };
    if (status === 'failed') throw new Error(`Director failed: ${stringField(project, 'autoEditError') ?? 'unknown error'}`);
    await sleep(pollMs);
  }
  throw new Error(`Project ${projectId} did not reach a terminal state within ${timeoutMs}ms`);
}

async function runPhase0(projectId: string, outputRoot: string, runId: string, render: boolean, persist: boolean, logPath: string, event: (stage: string, status: string, detail?: Record<string, unknown>) => Promise<void>): Promise<CommandEvidence> {
  const invocation = battlePhase0Invocation(projectId, outputRoot, runId, render, persist);
  await event('truth', 'running', { render, persist });
  const result = await runCommand(invocation.command, invocation.args, 20 * 60 * 1000);
  await writeCommandLog(logPath, invocation, result);
  return result;
}
async function loadDatabaseEvidence(projectId: string, uploadBatchId?: string) {
  const { COLLECTIONS, connectToDatabase } = await import('../lib/editron/db/mongodb');
  const { client, db } = await connectToDatabase();
  const project = await db.collection(COLLECTIONS.PROJECTS).findOne({ projectId });
  if (!project) {
    await client.close();
    throw new Error(`Project not found in Mongo: ${projectId}`);
  }
  const overlays = Array.isArray(project.overlays) ? project.overlays : [];
  const assetIds = new Set<string>();
  for (const value of Array.isArray(project.sourceAssetIds) ? project.sourceAssetIds : []) if (typeof value === 'string') assetIds.add(value);
  for (const overlay of overlays) if (overlay && typeof overlay === 'object' && typeof (overlay as Record<string, unknown>).assetId === 'string') assetIds.add((overlay as Record<string, unknown>).assetId as string);
  const assets = await db.collection(COLLECTIONS.MEDIA_ASSETS).find({
    $or: [{ assetId: { $in: [...assetIds] } }, { projectId, type: 'sequence' }],
  }).toArray();
  const mgJobs = (await db.collection(COLLECTIONS.MG_RENDER_JOBS).find({ projectId }).sort({ createdAt: 1 }).toArray())
    .filter((job) => isProductionMgRenderJobForProject(job, projectId));
  const batch = uploadBatchId ? await db.collection(COLLECTIONS.MEDIA_UPLOAD_BATCHES).findOne({ uploadBatchId }) : null;
  return { client, collections: { project, assets, mgJobs, batch } };
}

async function probeMgSequences(assets: Array<Record<string, unknown>>, event: (stage: string, status: string, detail?: Record<string, unknown>) => Promise<void>): Promise<EditronBattleMgFrameProbe[]> {
  const sequenceAssets = assets.filter((asset) => stringField(asset, 'type') === 'sequence');
  const probes: EditronBattleMgFrameProbe[] = [];
  const sharp = sequenceAssets.length > 0 ? (await import('sharp')).default : null;
  for (const asset of sequenceAssets) {
    const assetId = stringField(asset, 'assetId') ?? 'unknown-sequence';
    try {
      const sequenceId = requiredString(asset, 'sequenceId');
      const frameCount = requiredPositiveInteger(asset, 'frameCount');
      const cdnBaseUrl = stringField(asset, 'cdnBaseUrl') ?? stringField(asRecord(asset.address), 'cdnBaseUrl');
      if (!cdnBaseUrl) throw new Error('missing cdnBaseUrl');
      const urls = sequenceFrameUrls({ sequenceId, frameCount, cdnBaseUrl });
      const indexes = [...new Set([0, Math.floor((frameCount - 1) / 2), frameCount - 1])];
      const sampledUrls = indexes.map((index) => urls[index]);
      const hashes: string[] = [];
      const alpha: boolean[] = [];
      for (const url of sampledUrls) {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
        const buffer = Buffer.from(await response.arrayBuffer());
        hashes.push(createHash('sha256').update(buffer).digest('hex'));
        const metadata = await sharp!(buffer).metadata();
        alpha.push(metadata.hasAlpha === true || metadata.channels === 4);
      }
      const probe = { assetId, frameUrls: sampledUrls, reachable: true, alphaPreserved: alpha.every(Boolean), animated: new Set(hashes).size > 1, hashes };
      probes.push(probe);
      await event('ai-mg', 'frames-probed', probe);
    } catch (error) {
      const probe = { assetId, frameUrls: [], reachable: false, alphaPreserved: null, animated: null, hashes: [], error: errorMessage(error) };
      probes.push(probe);
      await event('ai-mg', 'probe-failed', probe);
    }
  }
  return probes;
}

async function probeMediaAssets(assets: Array<Record<string, unknown>>, event: (stage: string, status: string, detail?: Record<string, unknown>) => Promise<void>): Promise<NonNullable<EditronBattleApiEvidence['media']>> {
  const evidence: NonNullable<EditronBattleApiEvidence['media']> = [];
  for (const asset of assets.filter((item) => stringField(item, 'type') !== 'sequence').slice(0, 24)) {
    const assetId = stringField(asset, 'assetId') ?? 'unknown';
    const url = stringField(asset, 'publicUrl') ?? stringField(asset, 'cachedUrl');
    if (!url) {
      evidence.push({ assetId, url: '', ok: false, status: null, error: 'no resolvable URL persisted' });
      continue;
    }
    try {
      const response = await fetch(url, { headers: { range: 'bytes=0-1' } });
      const ok = response.ok || response.status === 206;
      evidence.push({ assetId, url, ok, status: response.status, contentType: response.headers.get('content-type') ?? undefined });
      await response.body?.cancel();
    } catch (error) {
      evidence.push({ assetId, url, ok: false, status: null, error: errorMessage(error) });
    }
  }
  await event('media', 'probed', { sampled: evidence.length, failed: evidence.filter((item) => !item.ok).length });
  return evidence;
}

async function exerciseChatIsolation(api: ApiClient, projectId: string, comparisonProjectId: string | undefined, event: (stage: string, status: string, detail?: Record<string, unknown>) => Promise<void>): Promise<NonNullable<EditronBattleApiEvidence['chatIsolation']>> {
  if (!comparisonProjectId) return { status: 'not-run', primaryProjectId: projectId, error: 'Pass --comparison-project to exercise isolation.' };
  let sessionId: string | undefined;
  let cleanupSucceeded = false;
  try {
    const created = await postJson(api, '/api/services/editron/chat/sessions/create', { projectId });
    sessionId = requiredString(created, 'sessionId');
    const primary = await getJson(api, `/api/services/editron/chat/sessions/list?projectId=${encodeURIComponent(projectId)}`);
    const comparison = await getJson(api, `/api/services/editron/chat/sessions/list?projectId=${encodeURIComponent(comparisonProjectId)}`);
    const inPrimary = asRecords(primary.sessions).some((item) => stringField(item, 'sessionId') === sessionId || stringField(item, 'id') === sessionId);
    const leaked = asRecords(comparison.sessions).some((item) => stringField(item, 'sessionId') === sessionId || stringField(item, 'id') === sessionId);
    const deleted = await requestJson(api, `/api/services/editron/chat/sessions/${encodeURIComponent(sessionId)}/delete`, { method: 'DELETE' });
    cleanupSucceeded = deleted.status >= 200 && deleted.status < 300;
    const status = inPrimary && !leaked && cleanupSucceeded ? 'passed' : 'failed';
    await event('chat', status, { sessionId, inPrimary, leaked, cleanupSucceeded });
    return { status, primaryProjectId: projectId, comparisonProjectId, canarySessionId: sessionId, leakedIntoComparison: leaked, cleanupSucceeded };
  } catch (error) {
    if (sessionId && !cleanupSucceeded) {
      try {
        const deleted = await requestJson(api, `/api/services/editron/chat/sessions/${encodeURIComponent(sessionId)}/delete`, { method: 'DELETE' });
        cleanupSucceeded = deleted.status >= 200 && deleted.status < 300;
      } catch {
        cleanupSucceeded = false;
      }
    }
    return { status: 'failed', primaryProjectId: projectId, comparisonProjectId, canarySessionId: sessionId, cleanupSucceeded, error: errorMessage(error) };
  }
}

async function buildApiClient(baseUrl: string, headerFile: string): Promise<ApiClient> {
  const raw = await readJsonRecord(headerFile);
  const headers = Object.fromEntries(Object.entries(raw).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  if (!headers.cookie && !headers.authorization) throw new Error('Auth header file must contain cookie or authorization');
  return { baseUrl, headers };
}

async function getJson(api: ApiClient, route: string): Promise<Record<string, unknown>> {
  return (await requestJson(api, route)).data;
}

async function postJson(api: ApiClient, route: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  return (await requestJson(api, route, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })).data;
}

async function requestJson(api: ApiClient, route: string, init: RequestInit = {}): Promise<{ status: number; data: Record<string, unknown> }> {
  const response = await fetch(`${api.baseUrl}${route}`, { ...init, headers: { ...api.headers, ...headersRecord(init.headers) } });
  const text = await response.text();
  let data: Record<string, unknown> = {};
  try { data = text ? asRecord(JSON.parse(text)) : {}; } catch { data = { raw: text.slice(0, 2_000) }; }
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${route} failed HTTP ${response.status}: ${stringField(data, 'error') ?? text.slice(0, 500)}`);
  return { status: response.status, data };
}

async function probeLocalMedia(filePath: string): Promise<LocalMediaProbe> {
  const result = await runCommand('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height', '-of', 'json', filePath], 30_000);
  if (result.exitCode !== 0) throw new Error(`ffprobe failed for ${filePath}: ${result.stderr || result.stdout}`);
  const parsed = asRecord(JSON.parse(result.stdout));
  const format = asRecord(parsed.format);
  const streams = asRecords(parsed.streams);
  const visual = streams.find((stream) => ['video'].includes(stringField(stream, 'codec_type') ?? ''));
  const duration = numericString(format.duration);
  const width = visual ? numberField(visual, 'width') : 0;
  const height = visual ? numberField(visual, 'height') : 0;
  return {
    ...(duration > 0 ? { duration: round(duration) } : {}),
    ...(width > 0 && height > 0 ? { dimensions: { width, height } } : {}),
  };
}

async function runCommand(command: string, args: string[], timeout: number): Promise<CommandEvidence> {
  const started = Date.now();
  try {
    const result = await execFileAsync(command, args, { cwd: process.cwd(), timeout, maxBuffer: 20 * 1024 * 1024, windowsHide: true });
    return { exitCode: 0, stdout: result.stdout ?? '', stderr: result.stderr ?? '', durationMs: Date.now() - started };
  } catch (error) {
    const value = error as Error & { code?: number | string; stdout?: string; stderr?: string };
    return { exitCode: typeof value.code === 'number' ? value.code : 1, stdout: value.stdout ?? '', stderr: value.stderr ?? value.message, durationMs: Date.now() - started };
  }
}

async function writeCommandLog(
  filePath: string,
  invocation: { command: string; args: string[] },
  result: CommandEvidence,
): Promise<void> {
  await writeFile(filePath, [
    `command: ${JSON.stringify(invocation.command)}`,
    `args: ${JSON.stringify(invocation.args)}`,
    `exitCode: ${result.exitCode}`,
    `durationMs: ${result.durationMs}`,
    '',
    '--- stdout ---',
    result.stdout,
    '',
    '--- stderr ---',
    result.stderr,
    '',
  ].join('\n'), 'utf8');
}

async function writePreflightFailure(options: BattleCliOptions, runDir: string, staticSuite: EditronBattleStaticSuiteEvidence): Promise<void> {
  const report = {
    version: 'editron-battle-test-preflight-v1',
    runId: options.runId,
    verdict: 'fail',
    reason: 'static-contract-suite-failed',
    staticSuite,
  };
  await writeFile(path.join(runDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

function usage(): string {
  return [
    'Editron battle test:',
    '  Existing project: npx tsx scripts/run-editron-battle-test.ts --project=proj_x --scenario=auto',
    '  Existing batch:   npx tsx scripts/run-editron-battle-test.ts --batch=upload_batch_x --base-url=https://preview --auth-header-file=C:\\tmp\\editron-auth.json',
    '  Fresh upload:     npx tsx scripts/run-editron-battle-test.ts --file=C:\\fixtures\\a.mp4 --file=C:\\fixtures\\b.png --intake=C:\\fixtures\\intake.json --allow-live-write --base-url=https://preview --auth-header-file=C:\\tmp\\editron-auth.json',
    '',
    'Defaults: pinned contract tests ON, rendered Phase 0 evidence ON, live writes OFF.',
    'Use --metadata-only only for diagnostics; it cannot prove aesthetics.',
  ].join('\n');
}

function loadBattleEnv(): void {
  loadEnv({ path: '.env.local', override: false });
  loadEnv({ path: '.env', override: false });
}

function mimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const types: Record<string, string> = {
    '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.mkv': 'video/x-matroska',
    '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.aac': 'audio/aac',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  };
  const value = types[ext];
  if (!value) throw new Error(`Unsupported battle fixture extension: ${ext}`);
  return value;
}

function mediaType(contentType: string): 'video' | 'audio' | 'image' {
  if (contentType.startsWith('video/')) return 'video';
  if (contentType.startsWith('audio/')) return 'audio';
  return 'image';
}

function headersRecord(value: HeadersInit | undefined): Record<string, string> {
  if (!value) return {};
  return Object.fromEntries(new Headers(value).entries());
}

function asRecord(value: unknown): Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

export function isProductionMgRenderJobForProject(job: unknown, projectId: string): boolean {
  const request = asRecord(asRecord(job).request);
  const input = asRecord(request.input);
  return stringField(input, 'momentId')?.startsWith(`${projectId}:`) === true;
}

function stringField(value: Record<string, unknown>, key: string): string | null {
  const field = value[key];
  return typeof field === 'string' && field.trim() ? field.trim() : null;
}

function numberField(value: Record<string, unknown>, key: string): number {
  const field = value[key];
  return typeof field === 'number' && Number.isFinite(field) ? field : 0;
}

function numericString(value: unknown): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function requiredString(value: Record<string, unknown>, key: string): string {
  const field = stringField(value, key);
  if (!field) throw new Error(`Missing ${key}`);
  return field;
}

function requiredPositiveInteger(value: Record<string, unknown>, key: string): number {
  const field = numberField(value, key);
  if (!Number.isInteger(field) || field <= 0) throw new Error(`Invalid ${key}`);
  return field;
}

function valueAfterEquals(arg: string): string {
  const value = arg.slice(arg.indexOf('=') + 1).trim();
  if (!value) throw new Error(`Missing value for ${arg.split('=')[0]}`);
  return value;
}

function numberArg(value: string | undefined, fallback: number): number {
  const parsed = value ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function safeRunId(value: string): string {
  const safe = value.replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 120);
  if (!safe) throw new Error('run-id is empty after normalization');
  return safe;
}

function tail(value: string, length: number): string {
  return value.length <= length ? value : value.slice(value.length - length);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readJsonRecord(filePath: string): Promise<Record<string, unknown>> {
  return asRecord(JSON.parse(await readFile(filePath, 'utf8')));
}

const isMain = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
  : false;

if (isMain) {
  main().catch(async (error) => {
    if (fatalArtifactDir) {
      await mkdir(fatalArtifactDir, { recursive: true });
      await writeFile(path.join(fatalArtifactDir, 'fatal-error.json'), `${JSON.stringify({
        version: 'editron-battle-test-fatal-v1',
        failedAt: new Date().toISOString(),
        error: errorMessage(error),
      }, null, 2)}\n`, 'utf8').catch(() => undefined);
    }
    console.error(`Editron battle test failed: ${errorMessage(error)}`);
    process.exitCode = 1;
  });
}
