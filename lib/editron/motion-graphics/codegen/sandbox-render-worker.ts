import type { NetworkPolicy } from '@vercel/sandbox';

import {
  parseMgRenderWorkerRequest,
  parseMgRenderWorkerResult,
  type MgRenderWorkerRequest,
  type MgRenderWorkerResult,
} from './worker-contract';

type EnvLike = Record<string, string | undefined>;

interface SandboxCommandResult {
  exitCode: number;
  stdout(): Promise<string>;
  stderr(): Promise<string>;
}

interface MgSandbox {
  writeFiles(files: Array<{ path: string; content: Buffer; mode?: number }>): Promise<void>;
  runCommand(params: {
    cmd: string;
    args?: string[];
    cwd?: string;
    env?: Record<string, string>;
    detached?: false;
    timeoutMs?: number;
  }): Promise<SandboxCommandResult>;
  readFileToBuffer(file: { path: string; cwd?: string }): Promise<Buffer | null>;
  delete(): Promise<void>;
}

interface MgSandboxCreateParams {
  name: string;
  source: { type: 'snapshot'; snapshotId: string };
  timeout: number;
  resources: { vcpus: number };
  networkPolicy: NetworkPolicy;
  env: Record<string, string>;
  tags: Record<string, string>;
  persistent: false;
}

export interface ExecuteMgRenderInSandboxOptions {
  request: MgRenderWorkerRequest;
  executionId: string;
  storageAuthorization: { url: string; token: string };
  env?: EnvLike;
  createSandbox?: (params: MgSandboxCreateParams) => Promise<MgSandbox>;
}

export interface MgSandboxRuntimeConfig {
  snapshotId: string;
  appCommit: string;
  timeoutMs: number;
  vcpus: number;
  networkPolicy: NetworkPolicy;
  workerEnv: Record<string, string>;
}

const DEFAULT_TIMEOUT_MS = 20 * 60 * 1_000;
const MIN_TIMEOUT_MS = 5 * 60 * 1_000;
const MAX_TIMEOUT_MS = 45 * 60 * 1_000;

function required(env: EnvLike, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`MG Sandbox: missing ${name}`);
  return value;
}

function boundedInteger(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function httpsUrl(value: string, env: EnvLike): URL {
  const parsed = new URL(value);
  const localDev = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  if (parsed.protocol !== 'https:' && !(env.NODE_ENV !== 'production' && localDev)) {
    throw new Error('MG Sandbox: storage authorization URL must use HTTPS');
  }
  return parsed;
}

export function buildMgSandboxNetworkPolicy(input: {
  authorizationUrl: string;
  r2AccountId: string;
}): NetworkPolicy {
  const authorizationHost = new URL(input.authorizationUrl).hostname;
  return {
    allow: [
      'generativelanguage.googleapis.com',
      `${input.r2AccountId}.r2.cloudflarestorage.com`,
      authorizationHost,
    ],
    subnets: {
      deny: [
        '10.0.0.0/8',
        '100.64.0.0/10',
        '127.0.0.0/8',
        '169.254.0.0/16',
        '172.16.0.0/12',
        '192.168.0.0/16',
      ],
    },
  };
}

export function resolveMgSandboxRuntimeConfig(input: {
  request: MgRenderWorkerRequest;
  storageAuthorization: { url: string; token: string };
  env?: EnvLike;
}): MgSandboxRuntimeConfig {
  const env = input.env ?? process.env;
  const snapshotId = required(env, 'MG_RENDER_SANDBOX_SNAPSHOT_ID');
  const appCommit = required(env, 'MG_RENDER_SANDBOX_APP_COMMIT');
  if (!appCommit.startsWith(input.request.appCommit) && !input.request.appCommit.startsWith(appCommit)) {
    throw new Error(`MG Sandbox: request commit ${input.request.appCommit} does not match snapshot commit ${appCommit}`);
  }
  const authorization = httpsUrl(input.storageAuthorization.url, env);
  const authorizationToken = input.storageAuthorization.token.trim();
  if (!authorizationToken) throw new Error('MG Sandbox: missing job-scoped storage authorization token');
  const r2AccountId = required(env, 'R2_ACCOUNT_ID');
  const geminiApiKey = env.GEMINI_API_KEY?.trim() || env.GOOGLE_API_KEY?.trim();
  if (!geminiApiKey) throw new Error('MG Sandbox: missing GEMINI_API_KEY or GOOGLE_API_KEY');

  const workerEnv: Record<string, string> = {
    NODE_ENV: 'production',
    GEMINI_API_KEY: geminiApiKey,
    R2_ACCESS_KEY_ID: required(env, 'R2_ACCESS_KEY_ID'),
    R2_SECRET_ACCESS_KEY: required(env, 'R2_SECRET_ACCESS_KEY'),
    R2_ACCOUNT_ID: r2AccountId,
    MG_STORAGE_AUTHORIZATION_URL: authorization.toString(),
    MG_STORAGE_AUTHORIZATION_TOKEN: authorizationToken,
  };
  for (const name of ['R2_BUCKET_NAME', 'CDN_WORKER_URL', 'LLM_GENERAL_MODEL', 'LLM_ANALYSIS_MODEL']) {
    const value = env[name]?.trim();
    if (value) workerEnv[name] = value;
  }

  return {
    snapshotId,
    appCommit,
    timeoutMs: boundedInteger(
      env.MG_RENDER_SANDBOX_TIMEOUT_MS,
      DEFAULT_TIMEOUT_MS,
      MIN_TIMEOUT_MS,
      MAX_TIMEOUT_MS,
    ),
    vcpus: boundedInteger(env.MG_RENDER_SANDBOX_VCPUS, 4, 2, 8),
    networkPolicy: buildMgSandboxNetworkPolicy({
      authorizationUrl: authorization.toString(),
      r2AccountId,
    }),
    workerEnv,
  };
}

function sandboxName(jobId: string, executionId: string): string {
  const suffix = executionId.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(-16) || 'run';
  return `mg-${jobId.slice(4, 20)}-${suffix}`.slice(0, 63);
}

async function defaultCreateSandbox(params: MgSandboxCreateParams): Promise<MgSandbox> {
  const { Sandbox } = await import('@vercel/sandbox');
  return Sandbox.create({
    name: params.name,
    source: params.source,
    timeout: params.timeout,
    resources: params.resources,
    networkPolicy: params.networkPolicy,
    env: params.env,
    tags: params.tags,
    persistent: params.persistent,
  });
}

function boundedLog(value: string): string {
  return value.trim().slice(0, 8_000);
}

export async function executeMgRenderInSandbox(
  options: ExecuteMgRenderInSandboxOptions,
): Promise<MgRenderWorkerResult> {
  const request = parseMgRenderWorkerRequest(options.request);
  const config = resolveMgSandboxRuntimeConfig({
    request,
    storageAuthorization: options.storageAuthorization,
    env: options.env,
  });
  const createSandbox = options.createSandbox ?? defaultCreateSandbox;
  const sandbox = await createSandbox({
    name: sandboxName(request.jobId, options.executionId),
    source: { type: 'snapshot', snapshotId: config.snapshotId },
    timeout: config.timeoutMs,
    resources: { vcpus: config.vcpus },
    networkPolicy: config.networkPolicy,
    env: config.workerEnv,
    tags: {
      app: 'editron',
      workload: 'mg-render',
      commit: config.appCommit.slice(0, 12),
      job: request.jobId.slice(4, 20),
    },
    persistent: false,
  });

  const requestPath = `/tmp/${request.jobId}.request.json`;
  const resultPath = `/tmp/${request.jobId}.result.json`;
  let primaryError: unknown;
  try {
    await sandbox.writeFiles([{ path: requestPath, content: Buffer.from(JSON.stringify(request), 'utf8'), mode: 0o600 }]);
    const command = await sandbox.runCommand({
      cmd: './node_modules/.bin/tsx',
      args: ['scripts/editron-mg-render-worker.ts', requestPath, resultPath],
      cwd: '/vercel/sandbox',
      timeoutMs: config.timeoutMs,
    });
    if (command.exitCode !== 0) {
      const stderr = boundedLog(await command.stderr());
      const stdout = boundedLog(await command.stdout());
      throw new Error(`MG Sandbox worker exited ${command.exitCode}: ${stderr || stdout || 'no worker output'}`);
    }
    const resultBuffer = await sandbox.readFileToBuffer({ path: resultPath });
    if (!resultBuffer) throw new Error('MG Sandbox worker completed without a result file');
    const result = parseMgRenderWorkerResult(JSON.parse(resultBuffer.toString('utf8')));
    if (result.jobId !== request.jobId) throw new Error('MG Sandbox returned a result for a different job');
    return result;
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    try {
      await sandbox.delete();
    } catch (cleanupError) {
      if (!primaryError) throw cleanupError;
      console.error('[MG Sandbox] cleanup failed after worker error:', cleanupError);
    }
  }
}
