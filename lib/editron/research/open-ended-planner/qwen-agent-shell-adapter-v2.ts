import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  canonicalizeJsonV1,
  deepFreezeV1,
  hashCanonicalJsonV1,
  sha256TextV1,
} from './contracts-v1';
import type { ProviderAttemptRecordV2, ProviderStageRunV2 } from './provider-transport-v2';
import {
  V2R_MAX_PROVIDER_ATTEMPTS_PER_STAGE,
  V2R_PROVIDER_ATTEMPT_NUMBERS,
} from './per-attempt-budget-v2r';
import {
  validateProviderStageArtifactV2,
  type HashedStagePacketV2,
} from './staged-packet-v2';
import {
  executeQwenDirectProviderV2,
  type QwenProviderExecutionV2,
  type QwenProviderExecutorV2,
} from './qwen-direct-provider-v2';

type JsonRecord = Record<string, unknown>;

export async function runQwenProviderStageV2(input: {
  artifact: HashedStagePacketV2;
  apiKey: string;
  budgetMode: 'FAIR_STAGE_BUDGET' | 'ASYNC_QUALITY_DIAGNOSTIC';
  diagnosticTimeoutOverrideMs?: number;
  execute?: QwenProviderExecutorV2;
}): Promise<Readonly<ProviderStageRunV2>> {
  if (!input.apiKey.trim()) throw new Error('QWEN_AGENT_SHELL_KEY_MISSING');
  validateDiagnosticTimeout(input);
  await verifyAttachments(input.artifact);
  const workingDirectory = await mkdtemp(path.join(os.tmpdir(), 'editron-qwen-stage-'));
  const attempts: ProviderAttemptRecordV2[] = [];
  let acceptedArtifact: JsonRecord | undefined;
  let sessionId: string | undefined;
  let priorDiagnostics: string[] = [];
  const execute = input.execute ?? executeQwenDirectProviderV2;
  let priorResponse = '';
  try {
    for (const attempt of V2R_PROVIDER_ATTEMPT_NUMBERS) {
      if (attempt === V2R_MAX_PROVIDER_ATTEMPTS_PER_STAGE && !priorDiagnostics.length) break;
      const prompt = attempt === 1
        ? buildInitialPrompt(input.artifact)
        : buildRepairPrompt(input.artifact, priorDiagnostics, priorResponse);
      const timeoutMs = input.budgetMode === 'FAIR_STAGE_BUDGET'
        ? input.artifact.packet.stageBudget.maxWallClockMs
        : input.diagnosticTimeoutOverrideMs ?? input.artifact.packet.stageBudget.maxWallClockMs * 8;
      const reasoningBudgetTokens = input.budgetMode === 'FAIR_STAGE_BUDGET'
        ? input.artifact.packet.stageBudget.maxReasoningTokens
        : input.artifact.packet.stageBudget.maxReasoningTokens * 8;
      const visibleOutputBudgetTokens = input.artifact.packet.stageBudget.maxVisibleOutputTokens;
      let result: Readonly<QwenProviderExecutionV2>;
      try {
        result = await execute({
          prompt, attempt, sessionId,
          attachmentPaths: input.artifact.transportAttachments.map(({ artifactPath }) => path.resolve(artifactPath)),
          workingDirectory, apiKey: input.apiKey, timeoutMs,
          reasoningBudgetTokens, visibleOutputBudgetTokens,
        });
      } catch (error) {
        const diagnostics = [`QWEN_EXECUTION_FAILED:${safeMessage(error)}`];
        const failed = { stdout: '', stderr: '', exitCode: null, timedOut: false, latencyMs: 0 };
        attempts.push(attemptRecord({
          artifact: input.artifact,
          attempt,
          prompt,
          result: failed,
          parsed: { text: '', eventDiagnostics: diagnostics },
          disposition: 'PROVIDER_ERROR',
          diagnostics,
          budgetMode: input.budgetMode,
          reasoningBudgetTokens,
          visibleOutputBudgetTokens,
        }));
        break;
      }
      const parsed = parseQwenTransportEvents(result.stdout);
      sessionId = parsed.sessionId ?? sessionId;
      const evaluated = evaluateText(input.artifact, parsed.text);
      const budgetDiagnostics = input.budgetMode === 'FAIR_STAGE_BUDGET'
        ? inspectBudget(input.artifact, result, parsed.tokens)
        : [];
      const disposition = result.failureDisposition ?? (result.timedOut ? 'PROVIDER_TIMEOUT'
        : result.exitCode !== 0 ? 'PROVIDER_ERROR'
        : parsed.eventDiagnostics.length ? 'PROVIDER_ERROR'
        : budgetDiagnostics.length ? 'BUDGET_EXCEEDED'
        : parsed.tokens?.finishReason === 'length' ? 'TRUNCATED'
        : evaluated.disposition);
      const diagnostics = [
        ...parsed.eventDiagnostics,
        ...budgetDiagnostics,
        ...evaluated.diagnostics,
      ];
      attempts.push(attemptRecord({
        artifact: input.artifact, attempt, prompt, result, parsed, disposition, diagnostics,
        rawText: parsed.text, budgetMode: input.budgetMode,
        reasoningBudgetTokens, visibleOutputBudgetTokens,
      }));
      if (disposition === 'ARTIFACT_ACCEPTED' && evaluated.artifact) {
        acceptedArtifact = evaluated.artifact;
        break;
      }
      priorDiagnostics = disposition === 'MALFORMED_JSON' || disposition === 'SCHEMA_INVALID'
        ? diagnostics : [];
      priorResponse = parsed.text;
    }
  } finally {
    await removeVerifiedTemporaryDirectory(workingDirectory);
  }
  const disposition = attempts.at(-1)?.disposition ?? 'TRANSPORT_INVALID';
  return deepFreezeV1({
    runVersion: 'EDITRON_OE_PROVIDER_STAGE_RUN_V2',
    authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION',
    packetHash: input.artifact.packetHash,
    disposition,
    attempts,
    ...(acceptedArtifact ? { artifact: acceptedArtifact } : {}),
  });
}

function validateDiagnosticTimeout(input: {
  artifact: HashedStagePacketV2;
  budgetMode: 'FAIR_STAGE_BUDGET' | 'ASYNC_QUALITY_DIAGNOSTIC';
  diagnosticTimeoutOverrideMs?: number;
}): void {
  const value = input.diagnosticTimeoutOverrideMs;
  if (value === undefined) return;
  if (input.budgetMode !== 'ASYNC_QUALITY_DIAGNOSTIC') {
    throw new Error('QWEN_DIAGNOSTIC_TIMEOUT_REQUIRES_ASYNC_MODE');
  }
  if (!Number.isSafeInteger(value)
    || value < input.artifact.packet.stageBudget.maxWallClockMs
    || value > 900_000) {
    throw new Error('QWEN_DIAGNOSTIC_TIMEOUT_INVALID');
  }
}

function buildInitialPrompt(artifact: HashedStagePacketV2): string {
  return canonicalizeJsonV1({
    benchmarkContract: 'EDITRON_QWEN_AGENT_SHELL_STAGE_V2',
    packetHash: artifact.packetHash,
    transportHash: artifact.transportHash,
    packet: artifact.packet,
    attachmentBindings: artifact.transportAttachments.map((attachment) => ({
      assetId: attachment.assetId,
      mimeType: attachment.mimeType,
      artifactSha256: attachment.artifactSha256,
      bytes: attachment.bytes,
      ...(attachment.evidenceRole ? { evidenceRole: attachment.evidenceRole } : {}),
      ...(attachment.bundleSha256 ? { bundleSha256: attachment.bundleSha256 } : {}),
      ...(attachment.sequenceIndex === undefined ? {} : { sequenceIndex: attachment.sequenceIndex }),
      ...(attachment.referenceTick === undefined ? {} : { referenceTick: attachment.referenceTick }),
      ...(attachment.timestampMilliseconds === undefined
        ? {} : { timestampMilliseconds: attachment.timestampMilliseconds }),
    })),
    responseRule: 'Return exactly one JSON object matching packet.outputContract. No markdown, prose, tools, web research, files, or project mutation.',
  });
}

function buildRepairPrompt(
  artifact: HashedStagePacketV2,
  diagnostics: readonly string[],
  priorResponse: string,
): string {
  return canonicalizeJsonV1({
    repairContract: 'EDITRON_QWEN_AGENT_SHELL_SCHEMA_REPAIR_V2',
    packetHash: artifact.packetHash,
    diagnostics,
    priorResponse,
    responseRule: 'Correct the prior response and return exactly one JSON object matching the original output contract. No markdown or prose.',
  });
}

async function verifyAttachments(artifact: HashedStagePacketV2): Promise<void> {
  for (const attachment of artifact.transportAttachments) {
    const bytes = await readFile(attachment.artifactPath);
    const hash = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
    if (bytes.byteLength !== attachment.bytes || hash !== attachment.artifactSha256) {
      throw new Error(`QWEN_AGENT_SHELL_ATTACHMENT_DRIFT:${attachment.assetId}`);
    }
  }
}

function evaluateText(artifact: HashedStagePacketV2, text: string): {
  disposition: ProviderAttemptRecordV2['disposition']; diagnostics: string[]; artifact?: JsonRecord;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { disposition: 'MALFORMED_JSON', diagnostics: ['INVALID_JSON'] };
  }
  const diagnostics = validateProviderStageArtifactV2(artifact, parsed);
  if (diagnostics.length) return { disposition: 'SCHEMA_INVALID', diagnostics: [...diagnostics] };
  return { disposition: 'ARTIFACT_ACCEPTED', diagnostics: [], artifact: parsed as JsonRecord };
}

function parseQwenTransportEvents(stdout: string): {
  text: string; sessionId?: string; tokens?: TokenTelemetryV2; eventDiagnostics: string[];
} {
  const textParts: string[] = [];
  let sessionId: string | undefined;
  let tokens: TokenTelemetryV2 | undefined;
  const eventDiagnostics: string[] = [];
  for (const line of stdout.split(/\r?\n/).filter(Boolean)) {
    let event: JsonRecord;
    try { event = JSON.parse(line) as JsonRecord; } catch { eventDiagnostics.push('QWEN_TRANSPORT_EVENT_JSON_INVALID'); continue; }
    if (typeof event.sessionID === 'string') sessionId = event.sessionID;
    const part = record(event.part);
    if (event.type === 'text' && typeof part.text === 'string') textParts.push(part.text);
    if (event.type === 'step_finish') tokens = tokenTelemetry(record(part.tokens), part.reason);
    if (event.type === 'error') eventDiagnostics.push('QWEN_TRANSPORT_ERROR_EVENT');
  }
  if (!textParts.length) eventDiagnostics.push('QWEN_TRANSPORT_TEXT_MISSING');
  if (!tokens) eventDiagnostics.push('QWEN_TRANSPORT_USAGE_MISSING');
  return { text: textParts.join(''), ...(sessionId ? { sessionId } : {}), ...(tokens ? { tokens } : {}), eventDiagnostics };
}

interface TokenTelemetryV2 {
  input: number; output: number; reasoning: number; total: number;
  cacheRead: number; cacheWrite: number; finishReason: string | null;
}

function tokenTelemetry(value: JsonRecord, reason: unknown): TokenTelemetryV2 | undefined {
  const cache = record(value.cache);
  const fields = [value.input, value.output, value.reasoning, value.total, cache.read, cache.write];
  if (fields.some((field) => !Number.isSafeInteger(field) || Number(field) < 0)) return undefined;
  return {
    input: Number(value.input), output: Number(value.output), reasoning: Number(value.reasoning),
    total: Number(value.total), cacheRead: Number(cache.read), cacheWrite: Number(cache.write),
    finishReason: typeof reason === 'string' ? reason : null,
  };
}

function inspectBudget(
  artifact: HashedStagePacketV2,
  result: Readonly<QwenProviderExecutionV2>,
  tokens: TokenTelemetryV2 | undefined,
): string[] {
  if (!tokens) return ['TELEMETRY_UNVERIFIABLE'];
  const budget = artifact.packet.stageBudget;
  return [
    ...(result.latencyMs > budget.maxWallClockMs ? ['WALL_CLOCK_LIMIT'] : []),
    ...(tokens.input > budget.maxInputTokens ? ['INPUT_TOKEN_LIMIT'] : []),
    ...(tokens.output > budget.maxVisibleOutputTokens ? ['VISIBLE_OUTPUT_TOKEN_LIMIT'] : []),
    ...(tokens.reasoning > budget.maxReasoningTokens ? ['REASONING_TOKEN_LIMIT'] : []),
  ];
}

function attemptRecord(input: {
  artifact: HashedStagePacketV2; attempt: 1 | 2; prompt: string;
  result: Readonly<QwenProviderExecutionV2>;
  parsed: ReturnType<typeof parseQwenTransportEvents>;
  disposition: ProviderAttemptRecordV2['disposition']; diagnostics: string[];
  rawText?: string; budgetMode: 'FAIR_STAGE_BUDGET' | 'ASYNC_QUALITY_DIAGNOSTIC';
  reasoningBudgetTokens: number; visibleOutputBudgetTokens: number;
}): ProviderAttemptRecordV2 {
  const tokens = input.parsed.tokens;
  return {
    provider: 'alibaba-token-plan-direct', model: 'qwen3.8-max', requestedModel: 'qwen3.8-max',
    providerModel: input.result.providerModel ?? null, providerSystemFingerprint: null,
    providerRequestId: input.result.providerRequestId ?? null,
    inputArm: input.artifact.packet.inputArm, executionFormArm: input.artifact.packet.executionFormArm,
    attempt: input.attempt, inputTokens: tokens?.input ?? null, cachedInputTokens: tokens?.cacheRead ?? null,
    cacheWriteInputTokens: tokens?.cacheWrite ?? null,
    cacheMissInputTokens: tokens ? Math.max(0, tokens.input - tokens.cacheRead) : null,
    visibleOutputTokens: tokens?.output ?? null, reasoningTokens: tokens?.reasoning ?? null,
    totalTokens: tokens?.total ?? null, finishReason: tokens?.finishReason ?? null,
    truncated: tokens ? tokens.finishReason === 'length' : null, latencyMs: input.result.latencyMs,
    providerCostUsd: null,
    parseStatus: input.disposition === 'ARTIFACT_ACCEPTED' ? 'SCHEMA_VALID' : input.disposition,
    schemaDiagnostics: [...input.diagnostics],
    artifactSha256: input.disposition === 'ARTIFACT_ACCEPTED'
      ? hashCanonicalJsonV1(JSON.parse(input.rawText ?? '') as unknown) : null,
    disposition: input.disposition, schemaMode: null,
    promptHash: sha256TextV1(input.prompt),
    requestHash: input.result.providerRequestHash ?? hashCanonicalJsonV1({
      packetHash: input.artifact.packetHash, transportHash: input.artifact.transportHash,
      attempt: input.attempt, promptHash: sha256TextV1(input.prompt), budgetMode: input.budgetMode,
      reasoningBudgetTokens: input.reasoningBudgetTokens,
      visibleOutputBudgetTokens: input.visibleOutputBudgetTokens,
    }),
    providerResponseEnvelopeHash: input.result.providerResponseHash ?? null,
    rawResponse: input.rawText ?? null,
    rawResponseHash: input.rawText === undefined ? null : sha256TextV1(input.rawText),
    detail: `${input.result.transportKind ?? 'INJECTED_QWEN_EXECUTOR'}:${input.budgetMode}`,
  };
}

export async function executeQwenOpenCodeDiagnosticV2(
  input: Parameters<QwenProviderExecutorV2>[0],
): Promise<QwenProviderExecutionV2> {
  const config = JSON.stringify({
    $schema: 'https://opencode.ai/config.json',
    enabled_providers: ['qwen-token-plan'], permission: 'deny', share: 'disabled',
    model: 'qwen-token-plan/qwen3.8-max',
    agent: { 'editron-benchmark': {
      description: 'Schema-only Editron benchmark respondent', mode: 'primary',
      model: 'qwen-token-plan/qwen3.8-max', temperature: 0, steps: 1,
      thinking_budget: input.reasoningBudgetTokens,
      maxOutputTokens: input.visibleOutputBudgetTokens,
      prompt: 'Return only the requested JSON artifact. Do not use tools, files, web research, or project mutation.',
      permission: 'deny',
    } },
    provider: { 'qwen-token-plan': {
      npm: '@ai-sdk/openai-compatible', name: 'Qwen Token Plan',
      options: {
        baseURL: 'https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1',
        apiKey: '{env:EDITRON_QWEN_TOKEN_PLAN_KEY}',
      },
      models: { 'qwen3.8-max': {
        name: 'Qwen 3.8 Max', reasoning: true,
        limit: { context: 262144, output: input.visibleOutputBudgetTokens },
        options: {
          thinking_budget: input.reasoningBudgetTokens,
        },
      } },
    } },
  });
  const args = [
    'run', '--format', 'json', '--pure', '--agent', 'editron-benchmark',
    '--model', 'qwen-token-plan/qwen3.8-max', '--dir', input.workingDirectory,
    ...(input.sessionId ? ['--session', input.sessionId] : []),
    ...input.attachmentPaths.flatMap((file) => ['--file', file]),
  ];
  const result = await executeProcess({
    command: await resolveOpenCodeExecutable(), args,
    stdin: input.prompt, cwd: input.workingDirectory, timeoutMs: input.timeoutMs,
    environment: {
      ...process.env,
      OPENCODE_CONFIG_CONTENT: config,
      EDITRON_QWEN_TOKEN_PLAN_KEY: input.apiKey,
    },
  });
  return { ...result, transportKind: 'OPENCODE_AGENT_SHELL' };
}

async function resolveOpenCodeExecutable(): Promise<string> {
  if (process.platform !== 'win32') return 'opencode';
  const appData = process.env.APPDATA?.trim();
  if (!appData) throw new Error('OPENCODE_APPDATA_MISSING');
  const executable = path.join(appData, 'npm', 'node_modules', 'opencode-ai', 'bin', 'opencode.exe');
  await access(executable);
  return executable;
}

function executeProcess(input: {
  command: string; args: readonly string[]; stdin: string; cwd: string;
  timeoutMs: number; environment: NodeJS.ProcessEnv;
}): Promise<QwenProviderExecutionV2> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const child = spawn(input.command, input.args, {
      cwd: input.cwd, env: input.environment, windowsHide: true, shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = ''; let stderr = ''; let timedOut = false; let outputExceeded = false;
    const limit = 16 * 1024 * 1024;
    const append = (current: string, chunk: Buffer) => {
      const next = current + chunk.toString('utf8');
      if (Buffer.byteLength(next, 'utf8') > limit) { outputExceeded = true; child.kill(); }
      return next;
    };
    child.stdout.on('data', (chunk: Buffer) => { stdout = append(stdout, chunk); });
    child.stderr.on('data', (chunk: Buffer) => { stderr = append(stderr, chunk); });
    child.on('error', reject);
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, input.timeoutMs);
    child.on('close', (exitCode) => {
      clearTimeout(timer);
      resolve({
        stdout, stderr: outputExceeded ? `${stderr}\nOPENCODE_OUTPUT_LIMIT` : stderr,
        exitCode, timedOut, latencyMs: Math.max(0, Date.now() - started),
      });
    });
    child.stdin.end(input.stdin, 'utf8');
  });
}

async function removeVerifiedTemporaryDirectory(directory: string): Promise<void> {
  const resolved = path.resolve(directory);
  if (path.dirname(resolved) !== path.resolve(os.tmpdir())
    || !path.basename(resolved).startsWith('editron-qwen-stage-')) {
    throw new Error('QWEN_AGENT_SHELL_TEMP_BOUNDARY_INVALID');
  }
  await rm(resolved, { recursive: true, force: true });
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function safeMessage(error: unknown): string {
  const value = error instanceof Error ? error.message : String(error);
  return value.replace(/[\r\n]+/g, ' ').slice(0, 300);
}
