import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { config as loadEnv } from 'dotenv';

import { CHAT_EDIT_BATTLE_SCENARIOS } from '../lib/editron/services/chat-edit-battle-harness';

const require = createRequire(import.meta.url);
const tsxCliPath = require.resolve('tsx/cli');

interface SuiteOptions {
  baseUrl: string;
  authHeaderFile: string;
  outputRoot: string;
  suiteId: string;
  scenarioIds: string[];
  resume: boolean;
}

interface FixtureManifest {
  fixtureProjectId: string;
  selectedOverlayId?: string | number;
  sessionId?: string;
  clientContextPath: string;
}

interface ScenarioResult {
  scenarioId: string;
  projectId: string;
  runId: string;
  status: 'pass' | 'warn' | 'fail' | 'infrastructure-fail';
  exitCode: number;
  reportPath?: string;
  failedChecks: string[];
  error?: string;
}

interface SuiteSummary {
  suiteId: string;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  baseUrl: string;
  scenarioCount: number;
  completedCount: number;
  passCount: number;
  warnCount: number;
  failCount: number;
  infrastructureFailCount: number;
  results: ScenarioResult[];
}

async function main(): Promise<void> {
  loadEnv({ path: '.env.local', override: false, quiet: true });
  loadEnv({ path: '.env', override: false, quiet: true });

  const options = parseSuiteArgs(process.argv.slice(2));
  const scenarios = resolveScenarios(options.scenarioIds);
  const suiteDir = path.resolve(options.outputRoot, safeSegment(options.suiteId));
  const summaryPath = path.join(suiteDir, 'suite-summary.json');
  await mkdir(suiteDir, { recursive: true });

  const existing = options.resume ? await readExistingSummary(summaryPath) : null;
  const completedIds = new Set(existing?.results.map((result) => result.scenarioId) ?? []);
  const summary: SuiteSummary = existing ?? {
    suiteId: options.suiteId,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    baseUrl: options.baseUrl,
    scenarioCount: scenarios.length,
    completedCount: 0,
    passCount: 0,
    warnCount: 0,
    failCount: 0,
    infrastructureFailCount: 0,
    results: [],
  };

  console.log(`[chat-battle-suite] suite=${options.suiteId} scenarios=${scenarios.length} resume=${options.resume}`);
  for (const [index, scenario] of scenarios.entries()) {
    if (completedIds.has(scenario.id)) {
      console.log(`[chat-battle-suite] SKIP ${index + 1}/${scenarios.length} ${scenario.id} (already recorded)`);
      continue;
    }

    const fixtureProjectId = buildFixtureProjectId(options.suiteId, index);
    const runId = `${safeSegment(options.suiteId)}-${String(index + 1).padStart(3, '0')}`;
    console.log(`[chat-battle-suite] START ${index + 1}/${scenarios.length} ${scenario.id}`);
    const result = await runScenario({
      options,
      scenarioId: scenario.id,
      fixtureProjectId,
      runId,
    });
    summary.results.push(result);
    recalculateSummary(summary, scenarios.length);
    await writeSummary(summaryPath, summary);
    console.log(`[chat-battle-suite] ${result.status.toUpperCase()} ${scenario.id}`);
  }

  summary.completedAt = new Date().toISOString();
  recalculateSummary(summary, scenarios.length);
  await writeSummary(summaryPath, summary);
  console.log(`[chat-battle-suite] summary=${summaryPath}`);
  console.log(
    `[chat-battle-suite] complete pass=${summary.passCount} warn=${summary.warnCount} fail=${summary.failCount} infrastructure=${summary.infrastructureFailCount}`,
  );
  if (summary.failCount > 0 || summary.infrastructureFailCount > 0) process.exitCode = 1;
}

async function runScenario(input: {
  options: SuiteOptions;
  scenarioId: string;
  fixtureProjectId: string;
  runId: string;
}): Promise<ScenarioResult> {
  const fixtureRoot = path.resolve('.calibration-temp/chat-edit-battle-fixtures');
  const manifestPath = path.join(fixtureRoot, input.fixtureProjectId, 'fixture.json');
  const reportPath = path.resolve(
    input.options.outputRoot,
    safeSegment(input.runId),
    `${safeSegment(input.scenarioId)}.json`,
  );

  try {
    const prepare = await runTsx([
      'scripts/prepare-chat-edit-battle-fixture.ts',
      `--case=${input.scenarioId}`,
      `--fixture-id=${input.fixtureProjectId}`,
    ]);
    if (prepare !== 0) {
      return infrastructureFailure(input, prepare, 'Fixture preparation failed.');
    }

    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as FixtureManifest;
    const runArgs = [
      'scripts/run-chat-edit-battle.ts',
      `--project=${input.fixtureProjectId}`,
      `--case=${input.scenarioId}`,
      `--base-url=${input.options.baseUrl}`,
      `--auth-header-file=${path.resolve(input.options.authHeaderFile)}`,
      `--client-context=${manifest.clientContextPath}`,
      `--output=${path.resolve(input.options.outputRoot)}`,
      `--run-id=${input.runId}`,
      '--allow-live-write',
    ];
    if (manifest.selectedOverlayId != null) {
      runArgs.push(`--selected-overlay=${String(manifest.selectedOverlayId)}`);
    }
    if (manifest.sessionId) runArgs.push(`--session-id=${manifest.sessionId}`);
    const exitCode = await runTsx(runArgs);
    const report = await readJsonIfPresent(reportPath);
    if (!report) {
      return infrastructureFailure(input, exitCode, 'Scenario process produced no report.');
    }
    const failedChecks = asArray(report.checks)
      .map(asRecord)
      .filter((check) => check.status !== 'pass')
      .map((check) => String(check.id ?? 'unknown-check'));
    const reportVerdict = String(report.verdict ?? 'fail');
    return {
      scenarioId: input.scenarioId,
      projectId: input.fixtureProjectId,
      runId: input.runId,
      status: exitCode !== 0
        ? 'fail'
        : reportVerdict === 'pass' || reportVerdict === 'warn'
          ? reportVerdict
          : 'fail',
      exitCode,
      reportPath,
      failedChecks,
    };
  } catch (error) {
    return infrastructureFailure(
      input,
      1,
      error instanceof Error ? error.stack ?? error.message : String(error),
    );
  } finally {
    await runTsx([
      'scripts/prepare-chat-edit-battle-fixture.ts',
      `--cleanup=${input.fixtureProjectId}`,
    ], { suppressFailure: true });
  }
}

function parseSuiteArgs(argv: string[]): SuiteOptions {
  const partial: Partial<SuiteOptions> = {
    outputRoot: '.calibration-temp/chat-edit-battle',
    suiteId: `live-suite-${new Date().toISOString().replace(/[:.]/g, '-')}`,
    scenarioIds: [],
    resume: false,
  };
  for (const arg of argv) {
    if (arg === '--resume') partial.resume = true;
    else if (arg.startsWith('--base-url=')) partial.baseUrl = valueAfterEquals(arg).replace(/\/$/, '');
    else if (arg.startsWith('--auth-header-file=')) partial.authHeaderFile = valueAfterEquals(arg);
    else if (arg.startsWith('--output=')) partial.outputRoot = valueAfterEquals(arg);
    else if (arg.startsWith('--suite-id=')) partial.suiteId = valueAfterEquals(arg);
    else if (arg.startsWith('--cases=')) {
      partial.scenarioIds = valueAfterEquals(arg).split(',').map((value) => value.trim()).filter(Boolean);
    }
  }
  if (!partial.baseUrl || !/^https?:\/\//i.test(partial.baseUrl)) {
    throw new Error('--base-url must be an absolute HTTP(S) URL.');
  }
  if (!partial.authHeaderFile) throw new Error('--auth-header-file is required.');
  return partial as SuiteOptions;
}

function resolveScenarios(ids: string[]) {
  if (ids.length === 0) return CHAT_EDIT_BATTLE_SCENARIOS;
  const wanted = new Set(ids);
  const scenarios = CHAT_EDIT_BATTLE_SCENARIOS.filter((scenario) => wanted.has(scenario.id));
  const missing = ids.filter((id) => !scenarios.some((scenario) => scenario.id === id));
  if (missing.length > 0) throw new Error(`Unknown chat battle case(s): ${missing.join(', ')}`);
  return scenarios;
}

function buildFixtureProjectId(suiteId: string, index: number): string {
  const suite = safeSegment(suiteId).replace(/[^a-z0-9_-]/gi, '').slice(0, 18).toLowerCase() || 'suite';
  return `proj_cb_${suite}_${String(index + 1).padStart(3, '0')}_${randomUUID().slice(0, 6)}`;
}

async function runTsx(
  args: string[],
  options: { suppressFailure?: boolean } = {},
): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [tsxCliPath, ...args], {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('close', (code) => {
      const exitCode = code ?? 1;
      if (exitCode !== 0 && !options.suppressFailure) {
        console.log(`[chat-battle-suite] subprocess exited ${exitCode}: ${args[0]}`);
      }
      resolve(exitCode);
    });
  });
}

function infrastructureFailure(
  input: { scenarioId: string; fixtureProjectId: string; runId: string },
  exitCode: number,
  error: string,
): ScenarioResult {
  return {
    scenarioId: input.scenarioId,
    projectId: input.fixtureProjectId,
    runId: input.runId,
    status: 'infrastructure-fail',
    exitCode,
    failedChecks: [],
    error,
  };
}

function recalculateSummary(summary: SuiteSummary, scenarioCount: number): void {
  summary.updatedAt = new Date().toISOString();
  summary.scenarioCount = scenarioCount;
  summary.completedCount = summary.results.length;
  summary.passCount = summary.results.filter((result) => result.status === 'pass').length;
  summary.warnCount = summary.results.filter((result) => result.status === 'warn').length;
  summary.failCount = summary.results.filter((result) => result.status === 'fail').length;
  summary.infrastructureFailCount = summary.results.filter((result) => result.status === 'infrastructure-fail').length;
}

async function readExistingSummary(filePath: string): Promise<SuiteSummary | null> {
  return (await readJsonIfPresent(filePath)) as SuiteSummary | null;
}

async function readJsonIfPresent(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    await access(filePath);
    return JSON.parse(await readFile(filePath, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function writeSummary(filePath: string, summary: SuiteSummary): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
}

function valueAfterEquals(value: string): string {
  return value.slice(value.indexOf('=') + 1).trim();
}

function safeSegment(value: string): string {
  return value.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 96) || 'run';
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
