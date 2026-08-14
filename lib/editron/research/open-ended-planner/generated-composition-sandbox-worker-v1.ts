import { createHash } from 'node:crypto';
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';

import { renderGeneratedCompositionProxyInsideSandboxV1 } from './generated-composition-proxy-renderer-v1';
import {
  parseGeneratedCompositionSandboxRequestV1,
  type GeneratedCompositionSandboxOutputKindV1,
  type GeneratedCompositionSandboxRequestV1,
  type GeneratedCompositionSandboxWorkerResultV1,
} from './generated-composition-sandbox-contract-v1';

const FORBIDDEN_ENVIRONMENT_KEYS = [
  'OPENAI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'DEEPSEEK_API_KEY', 'QWEN_API_KEY',
  'DATABASE_URL', 'MONGODB_URI', 'R2_SECRET_ACCESS_KEY', 'VERCEL_OIDC_TOKEN',
] as const;

export function assertGeneratedCompositionSandboxEnvironmentV1(
  environment: Readonly<Record<string, string | undefined>>,
): void {
  const exposed = FORBIDDEN_ENVIRONMENT_KEYS.filter((key) => Boolean(environment[key]?.trim()));
  if (exposed.length) throw new Error(`Generated composition sandbox received forbidden environment: ${exposed.join(',')}`);
}

export async function executeGeneratedCompositionSandboxWorkerV1(
  value: unknown,
  options: { repoRoot?: string; environment?: Readonly<Record<string, string | undefined>> } = {},
): Promise<Readonly<GeneratedCompositionSandboxWorkerResultV1>> {
  const request = parseGeneratedCompositionSandboxRequestV1(value);
  const startedAt = Date.now();
  const inputRoot = path.resolve('/tmp/editron-gcp-inputs', request.requestId);
  try {
    assertGeneratedCompositionSandboxEnvironmentV1(options.environment ?? process.env);
    const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
    const apiPath = path.resolve(repoRoot, 'lib/editron/research/open-ended-planner/generated-composition-api-v1.tsx');
    if (await sha256File(apiPath) !== request.apiImplementationHash) {
      throw new Error('Generated composition sandbox API implementation hash drift');
    }
    await fs.rm(inputRoot, { recursive: true, force: true });
    await fs.mkdir(inputRoot, { recursive: true });
    const materialized = await materializeInputs(request, inputRoot);
    const proxyReceipt = await renderGeneratedCompositionProxyInsideSandboxV1({
      program: request.program,
      sourceBundle: request.sourceBundle,
      evidencePack: request.evidencePack,
      referenceBlueprint: request.referenceBlueprint,
      supplementalFacts: request.supplementalFacts,
      expectedProgramHash: request.programHash,
      expectedSourceBundleHash: request.sourceBundleHash,
      materializedInputs: materialized,
    }, {
      repoRoot,
      workspaceRoot: path.resolve('/tmp/editron-gcp', request.requestId),
      apiImplementationPath: apiPath,
      proofFrames: request.proofFrames,
      includePlayableProxy: true,
    });
    if (!proxyReceipt.playableProxy) throw new Error('Generated composition sandbox playable proxy is missing');
    const receiptPath = path.join(proxyReceipt.workspaceDir, 'receipt.json');
    const outputs = await Promise.all([
      ...proxyReceipt.stills.map(({ path: outputPath, sha256 }) => output('STILL', outputPath, sha256)),
      output('CONTACT_SHEET', proxyReceipt.contactSheet.path, proxyReceipt.contactSheet.sha256),
      output('PLAYABLE_PROXY', proxyReceipt.playableProxy.path, proxyReceipt.playableProxy.sha256),
      output('PROXY_RECEIPT', receiptPath),
    ]);
    const usage = measuredUsage(startedAt, request.resources.vcpus);
    if (usage.wallTimeMs > request.resources.wallTimeMs || usage.cpuUpperBoundMs > request.resources.maxCpuMs) {
      return failure(request, usage, 'RESOURCE_BUDGET_EXCEEDED', 'Generated composition sandbox exceeded its declared resource budget');
    }
    if (outputs.reduce((sum, item) => sum + item.byteLength, 0) > request.resources.maxOutputBytes) {
      return failure(request, usage, 'OUTPUT_BUDGET_EXCEEDED', 'Generated composition sandbox outputs exceeded their declared byte budget');
    }
    return Object.freeze({
      ...resultIdentity(request, usage), status: 'RENDERED' as const,
      proxyReceiptHash: proxyReceipt.receiptHash, outputs,
    });
  } catch (error) {
    return failure(request, measuredUsage(startedAt, request.resources.vcpus), 'RENDER_FAILED', errorMessage(error));
  } finally {
    await fs.rm(inputRoot, { recursive: true, force: true });
  }
}

async function materializeInputs(
  request: GeneratedCompositionSandboxRequestV1,
  inputRoot: string,
): Promise<{ assetPaths: Record<string, string>; fontPaths: Record<string, string> }> {
  const assetPaths: Record<string, string> = {};
  const fontPaths: Record<string, string> = {};
  for (const input of request.inputs) {
    const target = path.resolve(inputRoot, `${input.bindingId}-${input.fileName}`);
    if (!target.startsWith(inputRoot + path.sep)) throw new Error('Generated composition sandbox input path escaped');
    await fs.writeFile(target, Buffer.from(input.data, 'base64'), { mode: 0o600 });
    if (await sha256File(target) !== input.contentSha256) throw new Error(`Generated composition sandbox materialized input drift: ${input.bindingId}`);
    if (input.kind === 'SOURCE_MEDIA') assetPaths[input.bindingId] = target;
    else fontPaths[input.bindingId] = target;
  }
  return { assetPaths, fontPaths };
}

async function output(kind: GeneratedCompositionSandboxOutputKindV1, outputPath: string, knownHash?: string) {
  const stat = await fs.lstat(outputPath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Generated composition sandbox output is not a regular file: ${outputPath}`);
  const contentSha256 = await sha256File(outputPath);
  if (knownHash && knownHash !== contentSha256) throw new Error(`Generated composition sandbox renderer output hash drift: ${outputPath}`);
  return { kind, path: outputPath, contentSha256, byteLength: stat.size } as const;
}

function measuredUsage(startedAt: number, vcpus: number) {
  const wallTimeMs = Math.max(0, Date.now() - startedAt);
  return { wallTimeMs, cpuUpperBoundMs: wallTimeMs * vcpus };
}

function resultIdentity(request: GeneratedCompositionSandboxRequestV1, usage: { wallTimeMs: number; cpuUpperBoundMs: number }) {
  return {
    version: request.version, requestId: request.requestId, executionId: request.executionId,
    appCommit: request.appCommit, programHash: request.programHash, sourceBundleHash: request.sourceBundleHash,
    completedAt: new Date().toISOString(), ...usage, stateEffects: [] as const,
  };
}

function failure(request: GeneratedCompositionSandboxRequestV1, usage: { wallTimeMs: number; cpuUpperBoundMs: number }, code: string, message: string) {
  return Object.freeze({ ...resultIdentity(request, usage), status: 'FAILED' as const, failure: { code, message: message.slice(0, 8_000) } });
}

function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
async function sha256File(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  await new Promise<void>((resolve, reject) => { const stream = createReadStream(filePath); stream.on('data', (chunk) => hash.update(chunk)); stream.on('error', reject); stream.on('end', resolve); });
  return hash.digest('hex');
}
