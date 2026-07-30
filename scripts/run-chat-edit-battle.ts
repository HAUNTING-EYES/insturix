import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { config as loadEnv } from 'dotenv';

import type { Overlay } from '../components/editron/editor/version-7.0.0/types';
import {
  extractChatFrameCaptureRequest,
  type ChatFrameCaptureRequest,
  type ChatFrameEvidence,
} from '../lib/editron/agent/chat-frame-evidence';
import { captureMgVisualEvidence } from '../lib/editron/motion-graphics/codegen/visual-evidence';
import { readRotatingChatBattleAuthHeaders } from './chat-edit-battle-auth';
import { cleanupDisposableChatBattleFixture } from '../lib/editron/services/chat-edit-battle-fixture-cleanup';
import {
  CHAT_EDIT_BATTLE_SCENARIOS,
  buildChatBattleProjectSnapshot,
  chatBattleInvocationHasSuccessfulMutation,
  chatBattleToolEventsFromSse,
  extractPersistedChatBattleRenderEvidence,
  getChatEditBattleScenario,
  parseChatBattleSse,
  runChatEditBattleJourney,
  type ChatBattleDurableChildOperationEvidence,
  type ChatBattleDurableOperationEvidence,
  type ChatBattleInvocationEvidence,
  type ChatBattleOperationReplayEvidence,
  type ChatBattleRenderEvidence,
} from '../lib/editron/services/chat-edit-battle-harness';

export interface ChatBattleCliOptions {
  projectId: string;
  scenarioId: string;
  baseUrl: string;
  authHeaderFile: string;
  outputRoot: string;
  runId: string;
  operationId?: string;
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
          && (latestInvocation.durableOperations?.length ?? 0) === 0
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
        let invocation = await invokeLiveChatAgent({
          api,
          scenarioPrompt: scenario.prompt,
          projectId,
          sessionId: options.sessionId,
          selectedOverlayId,
          clientContext: context,
          runId: options.runId,
          operationId: options.operationId,
          startedAt: startedAtHolder.value || new Date().toISOString(),
        });
        const frameCaptureEvent = [...invocation.toolEvents]
          .reverse()
          .find((event) => event.name === 'visual_inspect_frame');
        const frameCaptureRequest = frameCaptureEvent
          ? extractChatFrameCaptureRequest(frameCaptureEvent.output)
          : null;
        if (frameCaptureRequest) {
          const continuationSessionId = invocation.sessionId ?? options.sessionId;
          if (!continuationSessionId) {
            throw new Error('Visual-evidence continuation requires the sessionId returned by the first chat round.');
          }
          console.log(`[chat-battle] rendering requested visual evidence at frame ${frameCaptureRequest.frame}`);
          const visualEvidence = await buildChatBattleFrameEvidence(
            await loadMongoProject(projectId),
            frameCaptureRequest,
          );
          const followUp = await invokeLiveChatAgent({
            api,
            scenarioPrompt: scenario.prompt,
            projectId,
            sessionId: continuationSessionId,
            selectedOverlayId,
            clientContext: context,
            runId: `${options.runId}-visual-evidence`,
            operationId: `chat-battle:${safeSegment(`${options.runId}-visual-evidence`)}`,
            startedAt: startedAtHolder.value || new Date().toISOString(),
            visualEvidence,
          });
          invocation = mergeChatBattleInvocations(invocation, followUp);
        }
        const editorialIntentJobId = extractQueuedEditorialIntentJobId(invocation);
        if (editorialIntentJobId) {
          console.log(`[chat-battle] waiting for editorial-intent job ${editorialIntentJobId} to settle`);
          const terminal = await waitForEditorialIntentJobTerminal({
            jobId: editorialIntentJobId,
            projectId,
          });
          console.log(
            `[chat-battle] editorial-intent reached ${terminal.status} after ${terminal.polls} poll(s)`
            + `${terminal.error ? `: ${terminal.error}` : ''}`,
          );
          const durableOperation: ChatBattleDurableOperationEvidence = {
            owner: 'editorial-intent',
            jobId: editorialIntentJobId,
            status: terminal.status,
            materialChange: terminal.materialChange,
            polls: terminal.polls,
            ...(terminal.reason ? { reason: terminal.reason } : {}),
            ...(terminal.error ? { error: terminal.error } : {}),
            ...(terminal.lifecycle ? { lifecycle: terminal.lifecycle } : {}),
            ...(terminal.postconditionStatus ? { postconditionStatus: terminal.postconditionStatus } : {}),
            ...(terminal.pendingChildJobIds?.length
              ? { pendingChildJobIds: terminal.pendingChildJobIds }
              : {}),
            ...(terminal.generatedChildJobIds?.length
              ? { generatedChildJobIds: terminal.generatedChildJobIds }
              : {}),
            ...(terminal.childOperations?.length
              ? { childOperations: terminal.childOperations }
              : {}),
            ...(terminal.evidenceError ? { evidenceError: terminal.evidenceError } : {}),
          };
          const settledInvocation: ChatBattleInvocationEvidence = {
            ...invocation,
            durableOperations: [...(invocation.durableOperations ?? []), durableOperation],
          };
          latestDurableMutationFailure = terminal.status === 'failed'
            || terminal.status === 'dispatch_failed'
            || terminal.status === 'rolled_back'
            || terminal.status === 'timeout'
            || terminal.status === 'missing'
            ? `editorial-intent-${terminal.status}:${terminal.error ?? 'no error detail'}`
            : null;
          latestInvocation = settledInvocation;
          return settledInvocation;
        }
        const referenceStyleJobId = extractQueuedReferenceStyleJobId(invocation);
        if (referenceStyleJobId) {
          console.log(`[chat-battle] waiting for reference-style job ${referenceStyleJobId} to settle`);
          const terminal = await waitForReferenceStyleJobTerminal({
            jobId: referenceStyleJobId,
            projectId,
          });
          console.log(
            `[chat-battle] reference-style reached ${terminal.status} after ${terminal.polls} poll(s)`
            + `${terminal.error ? `: ${terminal.error}` : ''}`,
          );
          const settledInvocation: ChatBattleInvocationEvidence = {
            ...invocation,
            durableOperations: [
              ...(invocation.durableOperations ?? []),
              {
                owner: 'reference-style',
                jobId: referenceStyleJobId,
                status: terminal.status,
                materialChange: terminal.materialChange,
                polls: terminal.polls,
                ...(terminal.error ? { error: terminal.error } : {}),
              },
            ],
          };
          latestDurableMutationFailure = isFailedDurableStatus(terminal.status)
            ? `reference-style-${terminal.status}:${terminal.error ?? 'no error detail'}`
            : null;
          latestInvocation = settledInvocation;
          return settledInvocation;
        }
        const sceneRegeneration = extractCompletedSceneRegenerationReceipt(invocation);
        if (sceneRegeneration) {
          const terminal = await verifyCompletedSceneRegenerationReceipt({
            projectId,
            receipt: sceneRegeneration,
          });
          const settledInvocation: ChatBattleInvocationEvidence = {
            ...invocation,
            durableOperations: [
              ...(invocation.durableOperations ?? []),
              {
                owner: 'scene-regeneration',
                jobId: sceneRegeneration.jobId,
                status: terminal.materialChange ? 'completed' : 'failed',
                materialChange: terminal.materialChange,
                polls: 1,
                ...(terminal.error ? { error: terminal.error } : {}),
              },
            ],
          };
          latestDurableMutationFailure = terminal.materialChange
            ? null
            : `scene-regeneration-failed:${terminal.error ?? 'no error detail'}`;
          latestInvocation = settledInvocation;
          return settledInvocation;
        }
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
        const settledInvocation: ChatBattleInvocationEvidence = {
          ...invocation,
          durableOperations: [
            ...(invocation.durableOperations ?? []),
            {
              owner: 'dubbing',
              jobId: dubbingJobId,
              status: terminal.status,
              materialChange: terminal.status === 'completed',
              polls: terminal.polls,
              ...(terminal.error ? { error: terminal.error } : {}),
            },
          ],
        };

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
          const combined = mergeChatBattleInvocations(settledInvocation, followUp);
          latestInvocation = combined;
          return combined;
        } catch (error) {
          const failedFollowUp = {
            ...settledInvocation,
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
          hasSuccessfulMutation: latestInvocation
            ? chatBattleInvocationHasSuccessfulMutation(latestInvocation)
            : false,
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
    else if (arg.startsWith('--operation-id=')) options.operationId = valueAfterEquals(arg);
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
  operationId?: string;
  startedAt: string;
  visualEvidence?: ChatFrameEvidence;
}): Promise<ChatBattleInvocationEvidence> {
  const requestBody = buildLiveChatRequestBody(input);
  const headers = await readChatBattleAuthHeaders(input.api.authHeaderFile);
  const response = await fetch(`${input.api.baseUrl}/api/services/editron/chat/stream`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify(requestBody),
  });
  const raw = await response.text();
  const replayProtection = parseChatBattleOperationReplayResponse(response.status, raw);
  if (replayProtection) {
    return {
      agentRunId: input.runId,
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      mode: 'live-provider',
      prompt: input.scenarioPrompt,
      responseText: '',
      toolEvents: [],
      replayProtection,
    };
  }
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
    ...(typeof done?.sessionId === 'string'
      ? { sessionId: done.sessionId }
      : input.sessionId
        ? { sessionId: input.sessionId }
        : {}),
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
  operationId?: string;
  visualEvidence?: ChatFrameEvidence;
}): Record<string, unknown> {
  return {
    message: input.scenarioPrompt,
    projectId: input.projectId,
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    operationId: input.operationId ?? `chat-battle:${safeSegment(input.runId)}`,
    ...(input.selectedOverlayId ? { selectedOverlayId: input.selectedOverlayId } : {}),
    ...(input.clientContext ? { clientContext: input.clientContext } : {}),
    ...(input.visualEvidence ? { visualEvidence: input.visualEvidence } : {}),
  };
}

export async function buildChatBattleFrameEvidence(
  projectValue: unknown,
  request: ChatFrameCaptureRequest,
  dependencies: {
    capture: typeof captureMgVisualEvidence;
    now(): number;
  } = {
    capture: captureMgVisualEvidence,
    now: () => Date.now(),
  },
): Promise<ChatFrameEvidence> {
  const project = asRecord(projectValue);
  const playerDimensions = asRecord(project.playerDimensions);
  const dimensions = asRecord(project.dimensions);
  const width = positiveInteger(project.width)
    ?? positiveInteger(playerDimensions.width)
    ?? positiveInteger(dimensions.width);
  const height = positiveInteger(project.height)
    ?? positiveInteger(playerDimensions.height)
    ?? positiveInteger(dimensions.height);
  const fps = positiveNumber(project.fps);
  const durationInFrames = positiveInteger(project.durationInFrames);
  if (!width || !height || !fps || !durationInFrames) {
    throw new Error('Visual-evidence continuation requires persisted canvas dimensions, fps, and duration.');
  }
  if (request.frame < 1 || request.frame >= durationInFrames - 1) {
    throw new Error(
      `Visual-evidence frame ${request.frame} lacks the surrounding edited-timeline context required for verification.`,
    );
  }
  const overlays = Array.isArray(project.overlays) ? project.overlays as Overlay[] : [];
  if (overlays.length === 0) {
    throw new Error('Visual-evidence continuation requires at least one persisted overlay.');
  }

  const captured = await dependencies.capture({
    overlays,
    window: {
      startFrame: request.frame - 1,
      endFrame: request.frame + 2,
      fps,
    },
    canvas: { width, height },
    anchors: { landingFrame: 1 },
  });
  const anchor = captured.frames.find((frame) => frame.role === 'anchor');
  if (!anchor || anchor.coordinate.timelineFrame !== request.frame) {
    throw new Error(
      `Visual-evidence renderer returned frame ${anchor?.coordinate.timelineFrame ?? 'missing'} for requested frame ${request.frame}.`,
    );
  }
  return {
    frame: request.frame,
    question: request.question,
    dataUrl: anchor.imageDataUrl,
    width: captured.canvas.width,
    height: captured.canvas.height,
    capturedAtMs: dependencies.now(),
    source: 'editor-rendered-frame',
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

export function extractQueuedReferenceStyleJobId(
  invocation: ChatBattleInvocationEvidence,
): string | null {
  for (const event of invocation.toolEvents) {
    if (event.name !== 'apply_reference_style') continue;
    const output = parseToolOutputRecord(event.output);
    if (output.status !== 'success') continue;
    const data = asRecord(output.data);
    const jobId = data.jobId;
    const queueStatus = data.queueStatus;
    if (
      typeof jobId === 'string'
      && /^chat_style_[A-Za-z0-9_-]{1,180}$/.test(jobId)
      && ['queued', 'already-queued', 'completed'].includes(String(queueStatus))
    ) return jobId;
  }
  return null;
}

export function extractQueuedEditorialIntentJobId(
  invocation: ChatBattleInvocationEvidence,
): string | null {
  for (const event of invocation.toolEvents) {
    if (event.name !== 'apply_editorial_intent') continue;
    const output = parseToolOutputRecord(event.output);
    if (output.status !== 'success') continue;
    const data = asRecord(output.data);
    const dispatch = asRecord(data.dispatch);
    const authority = asRecord(dispatch.authority);
    const jobId = authority.jobId ?? dispatch.jobId ?? data.jobId;
    if (typeof jobId === 'string' && /^chat_intent_[A-Za-z0-9_-]{1,180}$/.test(jobId)) return jobId;
  }
  return null;
}

export interface CompletedSceneRegenerationReceipt {
  storyboardId: string;
  sceneIndex: number;
  jobId: string;
  beforeAssetId: string;
  afterAssetId: string;
}

export function extractCompletedSceneRegenerationReceipt(
  invocation: ChatBattleInvocationEvidence,
): CompletedSceneRegenerationReceipt | null {
  for (const event of invocation.toolEvents) {
    if (event.name !== 'regenerate_scene') continue;
    const output = parseToolOutputRecord(event.output);
    if (output.status !== 'success') continue;
    const data = asRecord(output.data);
    const storyboardId = stringValue(data.storyboardId);
    const sceneIndex = data.sceneIndex;
    const operations = Array.isArray(data.operations) ? data.operations.map(asRecord) : [];
    const completedImage = operations.find((operation) => (
      operation.target === 'image'
      && operation.status === 'completed'
    ));
    const jobId = stringValue(completedImage?.jobId ?? data.jobId);
    const beforeAssetId = stringValue(completedImage?.beforeAssetId);
    const afterAssetId = stringValue(completedImage?.afterAssetId);
    if (
      !storyboardId
      || !/^[A-Za-z0-9_-]{1,200}$/.test(storyboardId)
      || typeof sceneIndex !== 'number'
      || !Number.isInteger(sceneIndex)
      || sceneIndex < 0
      || !jobId
      || !/^[A-Za-z0-9:_-]{1,400}$/.test(jobId)
      || !beforeAssetId
      || !/^[A-Za-z0-9_-]{1,300}$/.test(beforeAssetId)
      || !afterAssetId
      || !/^[A-Za-z0-9_-]{1,300}$/.test(afterAssetId)
      || beforeAssetId === afterAssetId
    ) {
      return null;
    }
    return { storyboardId, sceneIndex, jobId, beforeAssetId, afterAssetId };
  }
  return null;
}

interface SceneRegenerationVerificationDependencies {
  loadScene(
    projectId: string,
    storyboardId: string,
    sceneIndex: number,
  ): Promise<Record<string, unknown> | null>;
}

export async function verifyCompletedSceneRegenerationReceipt(
  input: {
    projectId: string;
    receipt: CompletedSceneRegenerationReceipt;
  },
  dependencies: SceneRegenerationVerificationDependencies = {
    loadScene: loadChatBattleStoryboardScene,
  },
): Promise<{ materialChange: boolean; error?: string }> {
  const scene = await dependencies.loadScene(
    input.projectId,
    input.receipt.storyboardId,
    input.receipt.sceneIndex,
  );
  if (!scene) {
    return { materialChange: false, error: 'regenerated-storyboard-scene-not-found' };
  }
  const persistedAssetId = stringValue(scene.imageAssetId);
  if (persistedAssetId !== input.receipt.afterAssetId) {
    return {
      materialChange: false,
      error: `regenerated-scene-asset-mismatch:${persistedAssetId ?? 'missing'}`,
    };
  }
  if (persistedAssetId === input.receipt.beforeAssetId) {
    return { materialChange: false, error: 'regenerated-scene-asset-unchanged' };
  }
  return { materialChange: true };
}

export function mergeChatBattleInvocations(
  initial: ChatBattleInvocationEvidence,
  followUp: ChatBattleInvocationEvidence,
): ChatBattleInvocationEvidence {
  return {
    ...initial,
    agentRunId: `${initial.agentRunId}+${followUp.agentRunId}`,
    sessionId: followUp.sessionId ?? initial.sessionId,
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
type EditorialIntentJobTerminalStatus =
  | 'completed'
  | 'completed_unverified'
  | 'declined'
  | 'failed'
  | 'dispatch_failed'
  | 'rolled_back'
  | 'timeout'
  | 'missing';

export interface DubbingJobSettlementResult {
  status: DubbingJobTerminalStatus;
  polls: number;
  error?: string;
}

export interface ReferenceStyleJobSettlementResult {
  status: 'completed' | 'completed_unverified' | 'declined' | 'failed' | 'dispatch_failed' | 'rolled_back' | 'timeout' | 'missing';
  materialChange: boolean;
  polls: number;
  error?: string;
}

export interface EditorialIntentJobSettlementResult {
  status: EditorialIntentJobTerminalStatus;
  materialChange: boolean;
  polls: number;
  reason?: string;
  error?: string;
  lifecycle?: string;
  postconditionStatus?: string;
  pendingChildJobIds?: string[];
  generatedChildJobIds?: string[];
  childOperations?: ChatBattleDurableChildOperationEvidence[];
  evidenceError?: string;
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

export async function waitForReferenceStyleJobTerminal(
  input: {
    jobId: string;
    projectId: string;
    timeoutMs?: number;
    pollIntervalMs?: number;
  },
  dependencies: DubbingJobSettlementDependencies = {
    loadJob: loadChatBattleReferenceStyleJob,
    now: () => Date.now(),
    sleep: async (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  },
): Promise<ReferenceStyleJobSettlementResult> {
  const timeoutMs = input.timeoutMs
    ?? boundedEnvInteger('EDITRON_CHAT_BATTLE_REFERENCE_STYLE_TIMEOUT_MS', 15 * 60 * 1000, 30_000, 30 * 60 * 1000);
  const pollIntervalMs = input.pollIntervalMs
    ?? boundedEnvInteger('EDITRON_CHAT_BATTLE_SETTLEMENT_POLL_MS', 5_000, 500, 30_000);
  const deadline = dependencies.now() + timeoutMs;
  let polls = 0;

  while (true) {
    polls += 1;
    const job = await dependencies.loadJob(input.jobId, input.projectId);
    if (!job) return { status: 'missing', materialChange: false, polls, error: 'reference-style-job-not-found' };
    const status = stringValue(job.status);
    if (status === 'completed' || status === 'completed_unverified') {
      return { status, materialChange: true, polls };
    }
    if (status === 'declined') return { status, materialChange: false, polls };
    if (status === 'failed' || status === 'dispatch_failed' || status === 'rolled_back') {
      const error = stringValue(job.error);
      return { status, materialChange: false, polls, ...(error ? { error } : {}) };
    }
    if (dependencies.now() >= deadline) {
      return {
        status: 'timeout',
        materialChange: false,
        polls,
        error: `reference-style-job-timeout:${status ?? 'unknown'}`,
      };
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
  return db.collection<Record<string, unknown> & { _id: string; projectId: string }>(COLLECTIONS.CHAT_DUBBING_JOBS)
    .findOne({ _id: jobId, projectId }) as Promise<Record<string, unknown> | null>;
}

async function loadChatBattleReferenceStyleJob(
  jobId: string,
  projectId: string,
): Promise<Record<string, unknown> | null> {
  const { COLLECTIONS, connectToDatabase } = await import('../lib/editron/db/mongodb');
  const { client, db } = await connectToDatabase();
  chatBattleMongoClient = client;
  return db.collection<Record<string, unknown> & { _id: string; projectId: string }>(COLLECTIONS.CHAT_REFERENCE_STYLE_JOBS)
    .findOne({ _id: jobId, projectId }) as Promise<Record<string, unknown> | null>;
}

async function loadChatBattleStoryboardScene(
  projectId: string,
  storyboardId: string,
  sceneIndex: number,
): Promise<Record<string, unknown> | null> {
  const { connectToDatabase } = await import('../lib/editron/db/mongodb');
  const { client, db } = await connectToDatabase();
  chatBattleMongoClient = client;
  const storyboard = await db.collection<Record<string, unknown>>('storyboards')
    .findOne({ projectId, storyboardId });
  const scenes = Array.isArray(storyboard?.scenes)
    ? storyboard.scenes.map(asRecord)
    : [];
  return scenes.find((scene) => scene.sceneIndex === sceneIndex) ?? null;
}

function isFailedDurableStatus(status: string): boolean {
  return ['failed', 'dispatch_failed', 'rolled_back', 'stale', 'timeout', 'missing'].includes(status);
}

interface EditorialIntentJobSettlementDependencies {
  loadJob(jobId: string, projectId: string): Promise<Record<string, unknown> | null>;
  loadChildJobs?(
    jobIds: readonly string[],
    projectId: string,
  ): Promise<Record<string, unknown>[]>;
  now(): number;
  sleep(milliseconds: number): Promise<void>;
}

export async function waitForEditorialIntentJobTerminal(
  input: {
    jobId: string;
    projectId: string;
    timeoutMs?: number;
    pollIntervalMs?: number;
  },
  dependencies: EditorialIntentJobSettlementDependencies = {
    loadJob: loadChatBattleEditorialIntentJob,
    loadChildJobs: loadChatBattleMgRenderJobs,
    now: () => Date.now(),
    sleep: async (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  },
): Promise<EditorialIntentJobSettlementResult> {
  const timeoutMs = input.timeoutMs
    ?? boundedEnvInteger('EDITRON_CHAT_BATTLE_EDITORIAL_INTENT_TIMEOUT_MS', 15 * 60 * 1000, 30_000, 30 * 60 * 1000);
  const pollIntervalMs = input.pollIntervalMs
    ?? boundedEnvInteger('EDITRON_CHAT_BATTLE_SETTLEMENT_POLL_MS', 5_000, 500, 30_000);
  const deadline = dependencies.now() + timeoutMs;
  let polls = 0;

  while (true) {
    polls += 1;
    const job = await dependencies.loadJob(input.jobId, input.projectId);
    if (!job) return { status: 'missing', materialChange: false, polls, error: 'editorial-intent-job-not-found' };
    const status = stringValue(job.status);
    const result = asRecord(job.result);
    const overlaysModified = typeof result.overlaysModified === 'number' && Number.isFinite(result.overlaysModified)
      ? result.overlaysModified
      : 0;
    if (status === 'completed' || status === 'completed_unverified') {
      return buildEditorialIntentSettlementEvidence({
        status,
        materialChange: overlaysModified > 0,
        polls,
        job,
        projectId: input.projectId,
        loadChildJobs: dependencies.loadChildJobs,
      });
    }
    if (status === 'declined') {
      return buildEditorialIntentSettlementEvidence({
        status,
        materialChange: false,
        polls,
        job,
        projectId: input.projectId,
        loadChildJobs: dependencies.loadChildJobs,
      });
    }
    if (status === 'failed' || status === 'dispatch_failed' || status === 'rolled_back') {
      const error = stringValue(job.error);
      return buildEditorialIntentSettlementEvidence({
        status,
        materialChange: false,
        polls,
        job,
        projectId: input.projectId,
        loadChildJobs: dependencies.loadChildJobs,
        ...(error ? { error } : {}),
      });
    }
    if (dependencies.now() >= deadline) {
      return buildEditorialIntentSettlementEvidence({
        status: 'timeout',
        materialChange: false,
        polls,
        job,
        projectId: input.projectId,
        loadChildJobs: dependencies.loadChildJobs,
        error: `editorial-intent-job-timeout:${status ?? 'unknown'}`,
      });
    }
    await dependencies.sleep(pollIntervalMs);
  }
}

async function buildEditorialIntentSettlementEvidence(input: {
  status: EditorialIntentJobTerminalStatus;
  materialChange: boolean;
  polls: number;
  job: Record<string, unknown>;
  projectId: string;
  loadChildJobs?: EditorialIntentJobSettlementDependencies['loadChildJobs'];
  error?: string;
}): Promise<EditorialIntentJobSettlementResult> {
  const result = asRecord(input.job.result);
  const postcondition = asRecord(result.postconditionVerification);
  const pendingChildJobIds = uniqueBoundedStrings([
    ...arrayValue(input.job.pendingChildJobIds),
    ...arrayValue(result.pendingChildJobIds),
  ]);
  const generatedChildJobIds = uniqueBoundedStrings(arrayValue(result.generatedChildJobIds));
  let childOperations = childOperationsFromParentResult(result);
  let evidenceError: string | undefined;

  if (pendingChildJobIds.length > 0 && input.loadChildJobs) {
    try {
      const loaded = await input.loadChildJobs(pendingChildJobIds, input.projectId);
      const byId = new Map(loaded.map((job) => [stringValue(job._id), job]));
      const parentEvidenceById = new Map(childOperations.map((child) => [child.jobId, child]));
      childOperations = pendingChildJobIds.map((jobId) => {
        const child = byId.get(jobId);
        return child
          ? childOperationEvidence(child)
          : parentEvidenceById.get(jobId) ?? missingChildOperationEvidence(jobId);
      });
    } catch (error) {
      evidenceError = boundedEvidenceText(error instanceof Error ? error.message : String(error)) ?? undefined;
    }
  }

  const hasAsyncMgEvidence = pendingChildJobIds.length > 0 || childOperations.length > 0;
  const reason = boundedEvidenceText(
    result.reason
    ?? postcondition.reason
    ?? (input.status === 'declined' && hasAsyncMgEvidence
      ? 'all-async-mg-children-produced-no-material-change'
      : null),
  );
  const operationError = boundedEvidenceText(input.error);
  const lifecycle = boundedEvidenceText(result.lifecycle, 240);
  const postconditionStatus = boundedEvidenceText(postcondition.status, 120);
  return {
    status: input.status,
    materialChange: input.materialChange,
    polls: input.polls,
    ...(reason ? { reason } : {}),
    ...(operationError ? { error: operationError } : {}),
    ...(lifecycle ? { lifecycle } : {}),
    ...(postconditionStatus ? { postconditionStatus } : {}),
    ...(pendingChildJobIds.length > 0 ? { pendingChildJobIds } : {}),
    ...(generatedChildJobIds.length > 0 ? { generatedChildJobIds } : {}),
    ...(childOperations.length > 0 ? { childOperations } : {}),
    ...(evidenceError ? { evidenceError } : {}),
  };
}

export function parseChatBattleOperationReplayResponse(
  status: number,
  raw: string,
): ChatBattleOperationReplayEvidence | null {
  if (status !== 409) return null;
  let payload: Record<string, unknown>;
  try {
    payload = asRecord(JSON.parse(raw));
  } catch {
    throw new Error('Chat route returned HTTP 409 without a valid JSON replay receipt.');
  }
  if (payload.code !== 'CHAT_EDIT_OPERATION_REPLAY') {
    throw new Error(`Chat route returned unexpected HTTP 409 response: ${raw.slice(0, 1_000)}`);
  }
  const operationId = stringValue(payload.operationId);
  if (!operationId) {
    throw new Error('Chat replay receipt omitted operationId.');
  }
  return {
    code: 'CHAT_EDIT_OPERATION_REPLAY',
    operationId,
    ...(stringValue(payload.operationStatus) ? { operationStatus: stringValue(payload.operationStatus)! } : {}),
    ...(stringValue(payload.beforeCheckpointId) ? { beforeCheckpointId: stringValue(payload.beforeCheckpointId)! } : {}),
    ...(stringValue(payload.afterCheckpointId) ? { afterCheckpointId: stringValue(payload.afterCheckpointId)! } : {}),
  };
}

function childOperationsFromParentResult(
  result: Record<string, unknown>,
): ChatBattleDurableChildOperationEvidence[] {
  return arrayValue(result.childOutcomes)
    .slice(0, 100)
    .flatMap((value) => {
      const child = asRecord(value);
      const jobId = boundedEvidenceText(child.jobId, 240);
      if (!jobId) return [];
      const status = normalizeChildJobStatus(child.jobStatus);
      const outcome = normalizeChildOutcome(child.outcome, status);
      const reason = boundedEvidenceText(child.reason);
      const error = boundedEvidenceText(child.error);
      return [{
        owner: 'mg-render' as const,
        jobId,
        status,
        outcome,
        ...(reason ? { reason } : {}),
        ...(error ? { error } : {}),
      }];
    });
}

function childOperationEvidence(
  job: Record<string, unknown>,
): ChatBattleDurableChildOperationEvidence {
  const result = asRecord(job.result);
  const requestAudit = asRecord(job.requestAudit);
  const receipt = asRecord(result.receipt);
  const failure = asRecord(receipt.failure);
  const sequence = asRecord(result.sequence);
  const address = asRecord(sequence.address);
  const status = normalizeChildJobStatus(job.status);
  const reason = boundedEvidenceText(result.reason ?? receipt.reason);
  const error = boundedEvidenceText(job.lastError ?? receipt.compileError);
  const providerFailure = compactProviderFailure(failure);
  return {
    owner: 'mg-render',
    jobId: boundedEvidenceText(job._id, 240) ?? 'unknown',
    status,
    outcome: normalizeChildOutcome(result.status ?? receipt.outcome, status),
    ...(boundedEvidenceText(requestAudit.momentId, 240) ? { momentId: boundedEvidenceText(requestAudit.momentId, 240)! } : {}),
    ...(boundedEvidenceText(requestAudit.candidateId, 240) ? { candidateId: boundedEvidenceText(requestAudit.candidateId, 240)! } : {}),
    ...(boundedEvidenceText(requestAudit.factKind, 120) ? { factKind: boundedEvidenceText(requestAudit.factKind, 120)! } : {}),
    ...(boundedEvidenceText(address.sequenceId, 240) ? { sequenceId: boundedEvidenceText(address.sequenceId, 240)! } : {}),
    ...(reason ? { reason } : {}),
    ...(error ? { error } : {}),
    ...(providerFailure ? { providerFailure } : {}),
  };
}

function compactProviderFailure(
  failure: Record<string, unknown>,
): ChatBattleDurableChildOperationEvidence['providerFailure'] | null {
  const provider = boundedEvidenceText(failure.provider, 120);
  const operation = boundedEvidenceText(failure.operation, 120);
  const code = boundedEvidenceText(failure.code, 120);
  const disposition = boundedEvidenceText(failure.disposition, 120);
  const statusCode = typeof failure.statusCode === 'number' && Number.isInteger(failure.statusCode)
    ? failure.statusCode
    : undefined;
  if (!provider && !operation && !code && !disposition && statusCode == null) return null;
  return {
    ...(provider ? { provider } : {}),
    ...(operation ? { operation } : {}),
    ...(code ? { code } : {}),
    ...(disposition ? { disposition } : {}),
    ...(statusCode != null ? { statusCode } : {}),
  };
}

function missingChildOperationEvidence(jobId: string): ChatBattleDurableChildOperationEvidence {
  return {
    owner: 'mg-render',
    jobId,
    status: 'missing',
    outcome: 'unknown',
    error: 'mg-render-child-job-not-found-before-fixture-cleanup',
  };
}

function normalizeChildJobStatus(
  value: unknown,
): ChatBattleDurableChildOperationEvidence['status'] {
  return ['queued', 'running', 'completed', 'failed', 'missing'].includes(String(value))
    ? String(value) as ChatBattleDurableChildOperationEvidence['status']
    : 'unknown';
}

function normalizeChildOutcome(
  value: unknown,
  status: ChatBattleDurableChildOperationEvidence['status'],
): ChatBattleDurableChildOperationEvidence['outcome'] {
  if (['generated', 'declined', 'fallback'].includes(String(value))) {
    return String(value) as ChatBattleDurableChildOperationEvidence['outcome'];
  }
  return status === 'failed' ? 'failed' : 'unknown';
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function uniqueBoundedStrings(values: unknown[]): string[] {
  return [...new Set(values.flatMap((value) => {
    const text = boundedEvidenceText(value, 240);
    return text ? [text] : [];
  }))].sort().slice(0, 100);
}

function boundedEvidenceText(value: unknown, maxLength = 2_000): string | null {
  const text = typeof value === 'string' ? value.trim() : '';
  return text ? text.slice(0, maxLength) : null;
}

async function loadChatBattleEditorialIntentJob(
  jobId: string,
  projectId: string,
): Promise<Record<string, unknown> | null> {
  const { COLLECTIONS, connectToDatabase } = await import('../lib/editron/db/mongodb');
  const { client, db } = await connectToDatabase();
  chatBattleMongoClient = client;
  return db.collection<Record<string, unknown> & { _id: string; projectId: string }>(
    COLLECTIONS.CHAT_EDITORIAL_INTENT_JOBS,
  ).findOne({ _id: jobId, projectId }) as Promise<Record<string, unknown> | null>;
}

async function loadChatBattleMgRenderJobs(
  jobIds: readonly string[],
  projectId: string,
): Promise<Record<string, unknown>[]> {
  if (jobIds.length === 0) return [];
  const { COLLECTIONS, connectToDatabase } = await import('../lib/editron/db/mongodb');
  const { client, db } = await connectToDatabase();
  chatBattleMongoClient = client;
  return db.collection<Record<string, unknown> & { _id: string; projectId: string }>(
    COLLECTIONS.MG_RENDER_JOBS,
  ).find(
    { _id: { $in: [...jobIds] }, projectId },
    {
      projection: {
        _id: 1,
        status: 1,
        requestAudit: 1,
        result: 1,
        lastError: 1,
      },
    },
  ).toArray() as Promise<Record<string, unknown>[]>;
}

export function shouldPollForFreshChatBattleRenderEvidence(input: {
  requiresRenderedEvidence: boolean;
  initialStatus: ChatBattleRenderEvidence['status'];
  invocationError?: string | null;
  hasSuccessfulMutation: boolean;
}): boolean {
  return input.requiresRenderedEvidence
    && input.initialStatus === 'missing'
    && input.hasSuccessfulMutation
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
    ?? boundedEnvInteger('EDITRON_CHAT_BATTLE_RENDER_TIMEOUT_MS', 15 * 60 * 1000, 10_000, 15 * 60 * 1000);
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
  return readRotatingChatBattleAuthHeaders(headerFile);
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

function positiveNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function positiveInteger(value: unknown): number | null {
  const number = positiveNumber(value);
  return number == null ? null : Math.round(number);
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
