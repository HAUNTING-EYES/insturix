import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { config as loadEnv } from 'dotenv';

import { cleanupDisposableChatBattleFixture } from '../lib/editron/services/chat-edit-battle-fixture-cleanup';
import {
  CHAT_EDIT_BATTLE_SCENARIOS,
  buildChatBattleProjectSnapshot,
  chatBattleToolEventsFromSse,
  extractPersistedChatBattleRenderEvidence,
  getChatEditBattleScenario,
  parseChatBattleSse,
  runChatEditBattleJourney,
  type ChatBattleInvocationEvidence,
  type ChatBattleRenderEvidence,
} from '../lib/editron/services/chat-edit-battle-harness';

export interface ChatBattleCliOptions {
  projectId: string;
  scenarioId: string;
  baseUrl: string;
  authHeaderFile: string;
  outputRoot: string;
  runId: string;
  sessionId?: string;
  selectedOverlayId?: string;
  clientContextPath?: string;
  allowLiveWrite: boolean;
  cleanupFixture: boolean;
}

interface ApiClient {
  baseUrl: string;
  authHeaderFile: string;
}

let cleanupFixtureProjectId: string | null = null;

async function main(): Promise<void> {
  loadEnv({ path: '.env.local', override: false });
  loadEnv({ path: '.env', override: false });
  const argv = process.argv.slice(2);
  if (argv.includes('--list')) {
    console.log(CHAT_EDIT_BATTLE_SCENARIOS.map((item) => `${item.id}\t${item.label}`).join('\n'));
    return;
  }
  const options = parseChatBattleCliArgs(argv);
  if (!options) {
    console.error(usage());
    process.exitCode = 1;
    return;
  }
  const validationError = validateChatBattleCliOptions(options);
  if (validationError) {
    console.error(validationError);
    process.exitCode = 1;
    return;
  }
  const scenario = getChatEditBattleScenario(options.scenarioId)!;
  cleanupFixtureProjectId = options.cleanupFixture ? options.projectId : null;

  const runDir = path.resolve(options.outputRoot, safeSegment(options.runId));
  await mkdir(runDir, { recursive: true });
  const api = await buildApiClient(options.baseUrl, options.authHeaderFile);
  const clientContext = options.clientContextPath
    ? await readJsonRecord(options.clientContextPath)
    : undefined;
  const startedAtHolder = { value: '' };
  let baselineMaterialDigest: string | null = null;
  let latestInvocation: ChatBattleInvocationEvidence | null = null;
  let latestDurableMutationFailure: string | null = null;

  const report = await runChatEditBattleJourney(
    {
      scenarioId: options.scenarioId,
      projectId: options.projectId,
      selectedOverlayId: options.selectedOverlayId,
      clientContext,
      journeyId: options.runId,
      now: () => {
        const value = new Date();
        if (!startedAtHolder.value) startedAtHolder.value = value.toISOString();
        return value;
      },
    },
    {
      loadMongoProject: async (projectId, phase) => {
        if (phase === 'before') {
          const project = await loadMongoProject(projectId);
          baselineMaterialDigest = buildChatBattleProjectSnapshot(project, 'mongo-before').digest;
          return project;
        }
        if (
          baselineMaterialDigest
          && latestInvocation
          && !latestDurableMutationFailure
          && chatBattleInvocationQueuedProjectMutation(latestInvocation)
        ) {
          console.log('[chat-battle] queued edit detected; waiting for material project state to change');
          const settled = await waitForQueuedProjectMutation({
            projectId,
            baselineDigest: baselineMaterialDigest,
          });
          console.log(
            settled.terminalStatus
              ? `[chat-battle] queued edit reached ${settled.terminalStatus} after ${settled.polls} poll(s): ${settled.terminalError ?? 'no error detail'}`
              : settled.changed
                ? `[chat-battle] queued edit settled after ${settled.polls} poll(s)`
                : `[chat-battle] queued edit did not change material state within the settlement deadline (${settled.polls} poll(s))`,
          );
          return settled.project;
        }
        return loadMongoProject(projectId);
      },
      invokeAgent: async ({ scenario, projectId, selectedOverlayId, clientContext: context }) => {
        const invocation = await invokeLiveChatAgent({
          api,
          scenarioPrompt: scenario.prompt,
          projectId,
          sessionId: options.sessionId,
          selectedOverlayId,
          clientContext: context,
          runId: options.runId,
          startedAt: startedAtHolder.value || new Date().toISOString(),
        });
        const dubbingJobId = scenario.id === 'selected-dialogue-dubbing'
          ? extractQueuedDubbingJobId(invocation)
          : null;
        if (!dubbingJobId || !baselineMaterialDigest) {
          latestInvocation = invocation;
          return invocation;
        }

        console.log(`[chat-battle] waiting for dubbing job ${dubbingJobId} to settle`);
        const terminal = await waitForDubbingJobTerminal({
          jobId: dubbingJobId,
          projectId,
        });
        console.log(
          terminal.status === 'completed'
            ? `[chat-battle] dubbing committed after ${terminal.polls} poll(s)`
            : `[chat-battle] dubbing reached ${terminal.status} after ${terminal.polls} poll(s): ${terminal.error ?? 'no error detail'}`,
        );
        latestDurableMutationFailure = terminal.status === 'completed'
          ? null
          : `dubbing-${terminal.status}:${terminal.error ?? 'no error detail'}`;

        try {
          const followUp = await invokeLiveChatAgent({
            api,
            scenarioPrompt: `Check dubbing job ${dubbingJobId} for this project now. Report its exact terminal result and do not queue another job.`,
            projectId,
            sessionId: options.sessionId,
            selectedOverlayId,
            clientContext: context,
            runId: `${options.runId}-dubbing-result`,
            startedAt: startedAtHolder.value || new Date().toISOString(),
          });
          const combined = mergeChatBattleInvocations(invocation, followUp);
          latestInvocation = combined;
          return combined;
        } catch (error) {
          const failedFollowUp = {
            ...invocation,
            error: `Dubbing result follow-up failed: ${error instanceof Error ? error.message : String(error)}`,
          };
          latestInvocation = failedFollowUp;
          return failedFollowUp;
        }
      },
      reloadUiProject: async (projectId) => getJson(api, `/api/services/editron/projects/${encodeURIComponent(projectId)}`),
      captureRenderEvidence: async ({ projectId, mongoAfter, startedAt }) => {
        const initial = extractPersistedChatBattleRenderEvidence(mongoAfter, startedAt);
        if (!shouldPollForFreshChatBattleRenderEvidence({
          requiresRenderedEvidence: scenario.requireRenderedEvidence,
          initialStatus: initial.status,
          invocationError: latestInvocation?.error ?? latestDurableMutationFailure,
        })) return initial;
        console.log('[chat-battle] waiting for fresh rendered evidence');
        return waitForFreshChatBattleRenderEvidence({
          projectId,
          startedAt,
          initialProject: asRecord(mongoAfter),
        });
      },
    },
  );

  const reportPath = path.join(runDir, `${safeSegment(options.scenarioId)}.json`);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`[chat-battle] ${report.verdict.toUpperCase()} ${report.scenarioId}`);
  console.log(`[chat-battle] report=${reportPath}`);
  for (const check of report.checks.filter((item) => item.status !== 'pass')) {
    console.log(`[chat-battle] ${check.status.toUpperCase()} ${check.id}: ${check.summary}`);
  }
  if (report.verdict === 'fail') process.exitCode = 1;
}

export function parseChatBattleCliArgs(argv: string[]): ChatBattleCliOptions | null {
  const options: Partial<ChatBattleCliOptions> = {
    outputRoot: '.calibration-temp/chat-edit-battle',
    runId: `chat-battle-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`,
    allowLiveWrite: false,
    cleanupFixture: true,
  };
  for (const arg of argv) {
    if (arg === '--allow-live-write') options.allowLiveWrite = true;
    else if (arg === '--keep-fixture') options.cleanupFixture = false;
    else if (arg.startsWith('--project=')) options.projectId = valueAfterEquals(arg);
    else if (arg.startsWith('--case=')) options.scenarioId = valueAfterEquals(arg);
    else if (arg.startsWith('--base-url=')) options.baseUrl = valueAfterEquals(arg).replace(/\/$/, '');
    else if (arg.startsWith('--auth-header-file=')) options.authHeaderFile = valueAfterEquals(arg);
    else if (arg.startsWith('--output=')) options.outputRoot = valueAfterEquals(arg);
    else if (arg.startsWith('--run-id=')) options.runId = valueAfterEquals(arg);
    else if (arg.startsWith('--session-id=')) options.sessionId = valueAfterEquals(arg);
    else if (arg.startsWith('--selected-overlay=')) options.selectedOverlayId = valueAfterEquals(arg);
    else if (arg.startsWith('--client-context=')) options.clientContextPath = valueAfterEquals(arg);
  }
  if (!options.projectId || !options.scenarioId || !options.baseUrl || !options.authHeaderFile || !options.outputRoot || !options.runId) return null;
  return options as ChatBattleCliOptions;
}

export function validateChatBattleCliOptions(options: ChatBattleCliOptions): string | null {
  if (!getChatEditBattleScenario(options.scenarioId)) return `Unknown chat battle case: ${options.scenarioId}`;
  if (!options.allowLiveWrite) return 'Live chat battle runs can mutate the project. Pass --allow-live-write and use a disposable fixture project.';
  if (!/^https?:\/\//i.test(options.baseUrl)) return '--base-url must be an absolute HTTP(S) URL.';
  return null;
}

async function invokeLiveChatAgent(input: {
  api: ApiClient;
  scenarioPrompt: string;
  projectId: string;
  sessionId?: string;
  selectedOverlayId?: string;
  clientContext?: Record<string, unknown>;
  runId: string;
  startedAt: string;
}): Promise<ChatBattleInvocationEvidence> {
  const requestBody = buildLiveChatRequestBody(input);
  const headers = await readChatBattleAuthHeaders(input.api.authHeaderFile);
  const response = await fetch(`${input.api.baseUrl}/api/services/editron/chat/stream`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify(requestBody),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`Chat route failed HTTP ${response.status}: ${raw.slice(0, 1_000)}`);
  const records = parseChatBattleSse(raw);
  const parseErrors = records.filter((record) => record.type === 'parse_error');
  if (parseErrors.length > 0) throw new Error(`Chat SSE contained ${parseErrors.length} unparseable event(s).`);
  const done = [...records].reverse().find((record) => record.type === 'done');
  const routeError = [...records].reverse().find((record) => record.type === 'error');
  const responseText = records
    .filter((record) => record.type === 'token')
    .map((record) => typeof record.content === 'string' ? record.content : '')
    .join('');
  return {
    agentRunId: typeof done?.sessionId === 'string' ? `${input.runId}:${done.sessionId}` : input.runId,
    mode: 'live-provider',
    prompt: input.scenarioPrompt,
    responseText,
    toolEvents: chatBattleToolEventsFromSse(records, input.startedAt),
    ...(routeError ? { error: stringValue(routeError.error) ?? 'Chat route emitted an unknown error.' } : {}),
  };
}

export function buildLiveChatRequestBody(input: {
  scenarioPrompt: string;
  projectId: string;
  sessionId?: string;
  selectedOverlayId?: string;
  clientContext?: Record<string, unknown>;
  runId: string;
}): Record<string, unknown> {
  return {
    message: input.scenarioPrompt,
    projectId: input.projectId,
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    operationId: `chat-battle:${safeSegment(input.runId)}`,
    ...(input.selectedOverlayId ? { selectedOverlayId: input.selectedOverlayId } : {}),
    ...(input.clientContext ? { clientContext: input.clientContext } : {}),
  };
}

interface ChatBattleProjectLoaderDependencies {
  findProject(projectId: string): Promise<Record<string, unknown> | null>;
}

let chatBattleMongoClient: { close(): Promise<void> } | null = null;

export async function loadChatBattleMongoProject(
  projectId: string,
  dependencies?: ChatBattleProjectLoaderDependencies,
): Promise<Record<string, unknown>> {
  const findProject = dependencies?.findProject ?? (async (requestedProjectId: string) => {
    const { COLLECTIONS, connectToDatabase } = await import('../lib/editron/db/mongodb');
    const { client, db } = await connectToDatabase();
    chatBattleMongoClient = client;
    return db.collection(COLLECTIONS.PROJECTS).findOne({ projectId: requestedProjectId }) as Promise<Record<string, unknown> | null>;
  });
  const project = await findProject(projectId);
  if (!project) throw new Error(`Project not found in Mongo: ${projectId}`);
  return project;
}

const loadMongoProject = loadChatBattleMongoProject;

async function closeChatBattleMongoConnection(): Promise<void> {
  const client = chatBattleMongoClient;
  chatBattleMongoClient = null;
  if (client) await client.close();
}

export function chatBattleInvocationQueuedProjectMutation(invocation: ChatBattleInvocationEvidence): boolean {
  return invocation.toolEvents.some((event) => {
    const output = parseToolOutputRecord(event.output);
    if (output.status !== 'success') return false;
    const data = asRecord(output.data);
    const dispatchStatus = asRecord(data.dispatch).status;
    const queueStatus = data.queueStatus;
    return dispatchStatus === 'queued'
      || queueStatus === 'queued'
      || queueStatus === 'already-queued';
  });
}

export function extractQueuedDubbingJobId(invocation: ChatBattleInvocationEvidence): string | null {
  for (const event of invocation.toolEvents) {
    if (event.name !== 'dub_selected_dialogue') continue;
    const output = parseToolOutputRecord(event.output);
    if (output.status !== 'success') continue;
    const jobId = asRecord(output.data).jobId;
    if (typeof jobId === 'string' && /^[A-Za-z0-9:_-]{1,200}$/.test(jobId)) return jobId;
  }
  return null;
}

export function mergeChatBattleInvocations(
  initial: ChatBattleInvocationEvidence,
  followUp: ChatBattleInvocationEvidence,
): ChatBattleInvocationEvidence {
  return {
    ...initial,
    agentRunId: `${initial.agentRunId}+${followUp.agentRunId}`,
    responseText: [initial.responseText, followUp.responseText].filter(Boolean).join('\n'),
    toolEvents: [...initial.toolEvents, ...followUp.toolEvents],
    ...(followUp.error ? { error: followUp.error } : initial.error ? { error: initial.error } : {}),
  };
}

export interface QueuedProjectSettlementResult {
  project: Record<string, unknown>;
  changed: boolean;
  polls: number;
  terminalStatus?: 'failed' | 'needs_input' | 'scan_failed';
  terminalError?: string;
}

type DubbingJobTerminalStatus = 'completed' | 'failed' | 'stale' | 'dispatch_failed' | 'timeout' | 'missing';

export interface DubbingJobSettlementResult {
  status: DubbingJobTerminalStatus;
  polls: number;
  error?: string;
}

interface DubbingJobSettlementDependencies {
  loadJob(jobId: string, projectId: string): Promise<Record<string, unknown> | null>;
  now(): number;
  sleep(milliseconds: number): Promise<void>;
}

export async function waitForDubbingJobTerminal(
  input: {
    jobId: string;
    projectId: string;
    timeoutMs?: number;
    pollIntervalMs?: number;
  },
  dependencies: DubbingJobSettlementDependencies = {
    loadJob: loadChatBattleDubbingJob,
    now: () => Date.now(),
    sleep: async (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  },
): Promise<DubbingJobSettlementResult> {
  const timeoutMs = input.timeoutMs
    ?? boundedEnvInteger('EDITRON_CHAT_BATTLE_DUBBING_TIMEOUT_MS', 15 * 60 * 1000, 30_000, 30 * 60 * 1000);
  const pollIntervalMs = input.pollIntervalMs
    ?? boundedEnvInteger('EDITRON_CHAT_BATTLE_SETTLEMENT_POLL_MS', 5_000, 500, 30_000);
  const deadline = dependencies.now() + timeoutMs;
  let polls = 0;

  while (true) {
    polls += 1;
    const job = await dependencies.loadJob(input.jobId, input.projectId);
    if (!job) return { status: 'missing', polls, error: 'dubbing-job-not-found' };
    const status = stringValue(job.status);
    if (status === 'completed') return { status, polls };
    if (status === 'failed' || status === 'stale' || status === 'dispatch_failed') {
      const error = stringValue(job.error);
      return { status, polls, ...(error ? { error } : {}) };
    }
    if (dependencies.now() >= deadline) {
      return { status: 'timeout', polls, error: `dubbing-job-timeout:${status ?? 'unknown'}` };
    }
    await dependencies.sleep(pollIntervalMs);
  }
}

async function loadChatBattleDubbingJob(
  jobId: string,
  projectId: string,
): Promise<Record<string, unknown> | null> {
  const { COLLECTIONS, connectToDatabase } = await import('../lib/editron/db/mongodb');
  const { client, db } = await connectToDatabase();
  chatBattleMongoClient = client;
  return db.collection(COLLECTIONS.CHAT_DUBBING_JOBS)
    .findOne({ _id: jobId, projectId }) as Promise<Record<string, unknown> | null>;
}

export function shouldPollForFreshChatBattleRenderEvidence(input: {
  requiresRenderedEvidence: boolean;
  initialStatus: ChatBattleRenderEvidence['status'];
  invocationError?: string | null;
}): boolean {
  return input.requiresRenderedEvidence
    && input.initialStatus === 'missing'
    && !input.invocationError;
}

interface QueuedProjectSettlementDependencies {
  loadProject(projectId: string): Promise<Record<string, unknown>>;
  now(): number;
  sleep(milliseconds: number): Promise<void>;
}

const QUEUED_MUTATION_FAILURE_STATUSES = new Set(['failed', 'needs_input', 'scan_failed'] as const);
const QUEUED_MUTATION_ACTIVE_STATUSES: ReadonlySet<string> = new Set([
  'analyzing',
  'analyzing_deep',
  'analyzing_visual_cuts',
  'analysis_complete',
  'directing_queued',
  'directing',
] as const);

function queuedMutationTerminalFailure(
  project: Record<string, unknown>,
): Pick<QueuedProjectSettlementResult, 'terminalStatus' | 'terminalError'> | null {
  const status = stringValue(project.autoEditStatus);
  if (!status || !QUEUED_MUTATION_FAILURE_STATUSES.has(status as 'failed' | 'needs_input' | 'scan_failed')) {
    return null;
  }
  const terminalStatus = status as 'failed' | 'needs_input' | 'scan_failed';
  const error = stringValue(project.autoEditError);
  return {
    terminalStatus,
    ...(error ? { terminalError: error } : {}),
  };
}

function queuedMutationIsActive(project: Record<string, unknown>): boolean {
  const status = stringValue(project.autoEditStatus);
  return status != null && QUEUED_MUTATION_ACTIVE_STATUSES.has(status);
}

export async function waitForQueuedProjectMutation(
  input: {
    projectId: string;
    baselineDigest: string;
    timeoutMs?: number;
    pollIntervalMs?: number;
  },
  dependencies: QueuedProjectSettlementDependencies = {
    loadProject: loadMongoProject,
    now: () => Date.now(),
    sleep: async (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  },
): Promise<QueuedProjectSettlementResult> {
  const timeoutMs = input.timeoutMs
    ?? boundedEnvInteger('EDITRON_CHAT_BATTLE_SETTLEMENT_TIMEOUT_MS', 15 * 60 * 1000, 30_000, 30 * 60 * 1000);
  const pollIntervalMs = input.pollIntervalMs
    ?? boundedEnvInteger('EDITRON_CHAT_BATTLE_SETTLEMENT_POLL_MS', 5_000, 500, 30_000);
  const deadline = dependencies.now() + timeoutMs;
  let polls = 0;
  let project = await dependencies.loadProject(input.projectId);

  while (true) {
    polls += 1;
    const terminalFailure = queuedMutationTerminalFailure(project);
    if (terminalFailure) {
      return { project, changed: false, polls, ...terminalFailure };
    }
    const digest = buildChatBattleProjectSnapshot(project, 'mongo-after').digest;
    if (digest !== input.baselineDigest && !queuedMutationIsActive(project)) {
      return { project, changed: true, polls };
    }
    if (dependencies.now() >= deadline) return { project, changed: false, polls };
    await dependencies.sleep(pollIntervalMs);
    project = await dependencies.loadProject(input.projectId);
  }
}

interface RenderEvidenceSettlementDependencies {
  loadProject(projectId: string): Promise<Record<string, unknown>>;
  now(): number;
  sleep(milliseconds: number): Promise<void>;
}

export async function waitForFreshChatBattleRenderEvidence(
  input: {
    projectId: string;
    startedAt: string;
    initialProject: Record<string, unknown>;
    timeoutMs?: number;
    pollIntervalMs?: number;
  },
  dependencies: RenderEvidenceSettlementDependencies = {
    loadProject: loadMongoProject,
    now: () => Date.now(),
    sleep: async (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  },
): Promise<ChatBattleRenderEvidence> {
  const timeoutMs = input.timeoutMs
    ?? boundedEnvInteger('EDITRON_CHAT_BATTLE_RENDER_TIMEOUT_MS', 3 * 60 * 1000, 10_000, 15 * 60 * 1000);
  const pollIntervalMs = input.pollIntervalMs
    ?? boundedEnvInteger('EDITRON_CHAT_BATTLE_RENDER_POLL_MS', 3_000, 500, 30_000);
  const deadline = dependencies.now() + timeoutMs;
  let project = input.initialProject;

  while (true) {
    const evidence = extractPersistedChatBattleRenderEvidence(project, input.startedAt);
    if (evidence.status !== 'missing') return evidence;
    if (dependencies.now() >= deadline) return evidence;
    await dependencies.sleep(pollIntervalMs);
    project = await dependencies.loadProject(input.projectId);
  }
}

function parseToolOutputRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object') return asRecord(value);
  if (typeof value !== 'string' || !value.trim()) return {};
  try {
    return asRecord(JSON.parse(value));
  } catch {
    return {};
  }
}

function boundedEnvInteger(name: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;
}

async function buildApiClient(baseUrl: string, headerFile: string): Promise<ApiClient> {
  await readChatBattleAuthHeaders(headerFile);
  return { baseUrl, authHeaderFile: path.resolve(headerFile) };
}

async function getJson(api: ApiClient, route: string): Promise<Record<string, unknown>> {
  const headers = await readChatBattleAuthHeaders(api.authHeaderFile);
  const response = await fetch(`${api.baseUrl}${route}`, { headers });
  const text = await response.text();
  let payload: Record<string, unknown> = {};
  try {
    payload = text ? asRecord(JSON.parse(text)) : {};
  } catch {
    payload = { raw: text.slice(0, 2_000) };
  }
  if (!response.ok) throw new Error(`GET ${route} failed HTTP ${response.status}: ${stringValue(payload.error) ?? text.slice(0, 500)}`);
  return payload;
}

export async function readChatBattleAuthHeaders(headerFile: string): Promise<Record<string, string>> {
  const raw = await readJsonRecord(headerFile);
  const headers = Object.fromEntries(
    Object.entries(raw).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
  if (!headers.cookie && !headers.authorization) {
    throw new Error('Auth header file must contain cookie or authorization.');
  }
  return headers;
}

async function readJsonRecord(filePath: string): Promise<Record<string, unknown>> {
  return asRecord(JSON.parse(await readFile(path.resolve(filePath), 'utf8')));
}

function usage(): string {
  return [
    'Run one chat-to-edit battle journey against a disposable fixture project:',
    '  npx tsx scripts/run-chat-edit-battle.ts --project=proj_x --case=explicit-text --base-url=https://preview.example --auth-header-file=C:\\tmp\\editron-auth.json --allow-live-write',
    '',
    'List cases:',
    '  npx tsx scripts/run-chat-edit-battle.ts --list',
    '',
    'The runner records Mongo before/after, selected tools and arguments, API reload parity, and fresh rendered evidence. Disposable fixtures are cleaned after the run; pass --keep-fixture only for deliberate debugging.',
  ].join('\n');
}

function valueAfterEquals(value: string): string {
  return value.slice(value.indexOf('=') + 1).trim();
}

function safeSegment(value: string): string {
  return value.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 96) || 'run';
}

function asRecord(value: unknown): Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  void main()
    .catch((error) => {
      console.error(error instanceof Error ? error.stack ?? error.message : String(error));
      process.exitCode = 1;
    })
    .finally(async () => {
      try {
        if (cleanupFixtureProjectId) {
          const cleanup = await cleanupDisposableChatBattleFixture(cleanupFixtureProjectId);
          console.log(`[chat-battle] fixture-cleanup=${JSON.stringify(cleanup)}`);
        }
        await closeChatBattleMongoConnection();
      } catch (error) {
        console.error(error instanceof Error ? error.stack ?? error.message : String(error));
        process.exitCode = 1;
      }
    });
}
