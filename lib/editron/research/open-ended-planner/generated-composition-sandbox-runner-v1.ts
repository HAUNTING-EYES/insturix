import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { hashCanonicalJsonV1 } from './contracts-v1';
import {
  buildGeneratedCompositionSandboxHostReceiptV1,
  parseGeneratedCompositionSandboxRequestV1,
  parseGeneratedCompositionSandboxWorkerResultV1,
  type GeneratedCompositionSandboxHostReceiptV1,
  type GeneratedCompositionSandboxRequestV1,
  type GeneratedCompositionSandboxWorkerResultV1,
} from './generated-composition-sandbox-contract-v1';

const SANDBOX_ROOT = '/vercel/sandbox';
const ENTRY_PATH = 'scripts/editron-generated-composition-sandbox-entry-v1.ts';
const ENTRY_SOURCE = `import { promises as fs } from 'node:fs';
import { executeGeneratedCompositionSandboxWorkerV1 } from '../lib/editron/research/open-ended-planner/generated-composition-sandbox-worker-v1';
const [requestPath, resultPath] = process.argv.slice(2);
if (!requestPath || !resultPath) throw new Error('Generated composition sandbox entry requires request and result paths');
const request = JSON.parse(await fs.readFile(requestPath, 'utf8'));
const result = await executeGeneratedCompositionSandboxWorkerV1(request);
await fs.writeFile(resultPath, JSON.stringify(result), { encoding: 'utf8', mode: 0o600 });
`;

export const GENERATED_COMPOSITION_SANDBOX_OVERLAY_PATHS_V1 = [
  'lib/editron/research/open-ended-planner/contracts-v1.ts',
  'lib/editron/research/open-ended-planner/generated-composition-program-v1.ts',
  'lib/editron/research/open-ended-planner/generated-composition-program-verifier-v1.ts',
  'lib/editron/research/open-ended-planner/generated-composition-api-v1.tsx',
  'lib/editron/research/open-ended-planner/generated-composition-avc-metadata-v1.ts',
  'lib/editron/research/open-ended-planner/generated-composition-playable-proxy-v1.ts',
  'lib/editron/research/open-ended-planner/generated-composition-proxy-renderer-v1.ts',
  'lib/editron/research/open-ended-planner/generated-composition-sandbox-contract-v1.ts',
  'lib/editron/research/open-ended-planner/generated-composition-sandbox-worker-v1.ts',
  'lib/editron/freeform-glm/ollama-client.ts',
  'lib/editron/freeform-trace/instrument.ts',
  'lib/editron/freeform-trace/types.ts',
  'lib/editron/services/media/ffmpeg-runtime.ts',
] as const;

interface SandboxCommandV1 { exitCode: number; stdout(): Promise<string>; stderr(): Promise<string> }
interface SandboxV1 {
  writeFiles(files: Array<{ path: string; content: Uint8Array; mode?: number }>): Promise<void>;
  runCommand(params: { cmd: string; args: string[]; cwd: string; env: Record<string, string>; timeoutMs: number }): Promise<SandboxCommandV1>;
  readFileToBuffer(file: { path: string }): Promise<Buffer | null>;
  delete(): Promise<void>;
}
interface SandboxCreateParamsV1 {
  name: string; source: { type: 'snapshot'; snapshotId: string }; timeout: number; resources: { vcpus: number };
  networkPolicy: 'deny-all'; env: Record<string, string>; tags: Record<string, string>; persistent: false;
}

export interface GeneratedCompositionSandboxOverlayV1 {
  workerImplementationHash: string;
  files: readonly { path: string; content: Buffer; sha256: string }[];
}

export interface ExecuteGeneratedCompositionSandboxOptionsV1 {
  request: GeneratedCompositionSandboxRequestV1;
  env?: Readonly<Record<string, string | undefined>>;
  repoRoot?: string;
  createSandbox?: (params: SandboxCreateParamsV1) => Promise<SandboxV1>;
}

export interface ExecuteGeneratedCompositionSandboxResultV1 {
  receipt: Readonly<GeneratedCompositionSandboxHostReceiptV1>;
  workerResult: Readonly<GeneratedCompositionSandboxWorkerResultV1>;
  outputBytes: Readonly<Record<string, Uint8Array>>;
}

export async function resolveGeneratedCompositionSandboxOverlayV1(repoRoot = process.cwd()): Promise<GeneratedCompositionSandboxOverlayV1> {
  const files = await Promise.all(GENERATED_COMPOSITION_SANDBOX_OVERLAY_PATHS_V1.map(async (relativePath) => {
    const content = await fs.readFile(path.resolve(repoRoot, relativePath));
    return { path: relativePath, content, sha256: sha256(content) };
  }));
  const entry = { path: ENTRY_PATH, content: Buffer.from(ENTRY_SOURCE, 'utf8'), sha256: sha256(Buffer.from(ENTRY_SOURCE, 'utf8')) };
  const all = [...files, entry].sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  return { workerImplementationHash: hashCanonicalJsonV1(all.map(({ path: filePath, sha256: fileHash }) => ({ path: filePath, sha256: fileHash }))), files: all };
}

export async function executeGeneratedCompositionInSandboxV1(
  options: ExecuteGeneratedCompositionSandboxOptionsV1,
): Promise<ExecuteGeneratedCompositionSandboxResultV1> {
  const request = parseGeneratedCompositionSandboxRequestV1(options.request);
  const env = options.env ?? process.env;
  const snapshotId = required(env, 'MG_RENDER_SANDBOX_SNAPSHOT_ID');
  const snapshotCommit = required(env, 'MG_RENDER_SANDBOX_APP_COMMIT');
  if (snapshotCommit !== request.appCommit) throw new Error('Generated composition sandbox snapshot commit drift');
  const overlay = await resolveGeneratedCompositionSandboxOverlayV1(path.resolve(options.repoRoot ?? process.cwd()));
  if (overlay.workerImplementationHash !== request.workerImplementationHash) throw new Error('Generated composition sandbox worker implementation hash drift');
  const createSandbox = options.createSandbox ?? defaultCreateSandbox;
  const sandbox = await createSandbox({
    name: sandboxName(request), source: { type: 'snapshot', snapshotId }, timeout: request.resources.wallTimeMs + 60_000,
    resources: { vcpus: request.resources.vcpus }, networkPolicy: 'deny-all', env: {}, persistent: false,
    tags: { app: 'editron', workload: 'gcp-proxy', commit: snapshotCommit.slice(0, 12), request: request.requestId.slice(0, 12) },
  });
  let capture: Awaited<ReturnType<typeof runSandbox>> | undefined;
  let runError: unknown;
  let cleanupError: unknown;
  try { capture = await runSandbox(sandbox, request, overlay); } catch (error) { runError = error; }
  try { await sandbox.delete(); } catch (error) { cleanupError = error; }
  if (runError && cleanupError) throw new AggregateError([runError, cleanupError], 'Generated composition sandbox execution and teardown failed');
  if (runError) throw runError;
  if (cleanupError) throw cleanupError;
  if (!capture) throw new Error('Generated composition sandbox produced no capture');
  const receipt = buildGeneratedCompositionSandboxHostReceiptV1({
    request, result: capture.result, snapshotId, sandboxDeleted: true, networkPolicy: 'DENY_ALL', persistent: false,
    command: capture.command, outputBytes: capture.outputBytes,
  });
  return Object.freeze({ receipt, workerResult: capture.result, outputBytes: Object.freeze(capture.outputBytes) });
}

async function runSandbox(sandbox: SandboxV1, request: GeneratedCompositionSandboxRequestV1, overlay: GeneratedCompositionSandboxOverlayV1) {
  const requestPath = `/tmp/${request.requestId}.gcp-request.json`;
  const resultPath = `/tmp/${request.requestId}.gcp-result.json`;
  await sandbox.writeFiles([
    ...overlay.files.map(({ path: filePath, content }) => ({ path: path.posix.join(SANDBOX_ROOT, filePath), content, mode: 0o600 })),
    { path: requestPath, content: Buffer.from(JSON.stringify(request), 'utf8'), mode: 0o600 },
  ]);
  const executed = await sandbox.runCommand({
    cmd: './node_modules/.bin/tsx', args: [ENTRY_PATH, requestPath, resultPath], cwd: SANDBOX_ROOT,
    env: {}, timeoutMs: request.resources.wallTimeMs + 5_000,
  });
  const command = { exitCode: executed.exitCode, stdout: bounded(await executed.stdout()), stderr: bounded(await executed.stderr()) };
  if (command.exitCode !== 0) throw new Error(`Generated composition sandbox worker exited ${command.exitCode}: ${command.stderr || command.stdout || 'no output'}`);
  const resultBuffer = await sandbox.readFileToBuffer({ path: resultPath });
  if (!resultBuffer) throw new Error('Generated composition sandbox worker did not write a result');
  const result = parseGeneratedCompositionSandboxWorkerResultV1(JSON.parse(resultBuffer.toString('utf8')));
  if (result.status !== 'RENDERED') throw new Error(`Generated composition sandbox worker failed: ${result.failure.code}/${result.failure.message}`);
  const outputBytes: Record<string, Uint8Array> = {};
  for (const output of result.outputs) {
    const bytes = await sandbox.readFileToBuffer({ path: output.path });
    if (!bytes) throw new Error(`Generated composition sandbox output is missing: ${output.path}`);
    outputBytes[output.path] = bytes;
  }
  return { result, command, outputBytes };
}

async function defaultCreateSandbox(params: SandboxCreateParamsV1): Promise<SandboxV1> {
  const { Sandbox } = await import('@vercel/sandbox');
  const sandbox = await Sandbox.create(params as unknown as Parameters<typeof Sandbox.create>[0]);
  return {
    writeFiles: (files) => sandbox.writeFiles(files), runCommand: (command) => sandbox.runCommand(command),
    readFileToBuffer: (file) => sandbox.readFileToBuffer(file), delete: () => sandbox.delete(),
  };
}

function required(env: Readonly<Record<string, string | undefined>>, name: string): string { const value = env[name]?.trim(); if (!value) throw new Error(`Generated composition sandbox missing ${name}`); return value; }
function sandboxName(request: GeneratedCompositionSandboxRequestV1): string { return `gcp-${request.requestId.slice(0, 24)}`; }
function bounded(value: string): string { return value.trim().slice(0, 8_000); }
function sha256(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }
