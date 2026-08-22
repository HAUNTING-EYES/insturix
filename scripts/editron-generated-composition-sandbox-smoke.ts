import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { config as loadEnv } from 'dotenv';

import {
  executeGeneratedCompositionInSandboxV1,
  resolveGeneratedCompositionSandboxOverlayV1,
} from '../lib/editron/research/open-ended-planner/generated-composition-sandbox-runner-v1';
import { buildGeneratedCompositionSandboxRequestV1 } from '../lib/editron/research/open-ended-planner/generated-composition-sandbox-contract-v1';
import {
  DEV02_GENERATED_COMPOSITION_BLUEPRINT_V1,
  DEV02_GENERATED_COMPOSITION_EVIDENCE_PACK_V1,
  DEV02_GENERATED_COMPOSITION_PROGRAM_V1,
  DEV02_GENERATED_COMPOSITION_SOURCE_BUNDLE_V1,
  DEV02_GENERATED_COMPOSITION_SUPPLEMENTAL_FACTS_V1,
} from '../tests/fixtures/editron/open-ended-planner-v2/dev02-generated-composition-program-v1';

const repoRoot = process.cwd();
loadEnv({ path: path.join(repoRoot, '.env.local.vercel'), override: false, quiet: true });

const snapshotCommit = required('MG_RENDER_SANDBOX_APP_COMMIT');
const mediaRoot = path.join(repoRoot, '.calibration-temp', 'open-ended-planner-v2', 'development-media');
const apiPath = path.join(repoRoot, 'lib', 'editron', 'research', 'open-ended-planner', 'generated-composition-api-v1.tsx');
const fontPath = path.join(repoRoot, 'node_modules', 'next', 'dist', 'compiled', '@vercel', 'og', 'noto-sans-v27-latin-regular.ttf');
const [wide, close, font, apiImplementationHash, overlay] = await Promise.all([
  fs.readFile(path.join(mediaRoot, 'dev02-wide.mp4')),
  fs.readFile(path.join(mediaRoot, 'dev02-close.mp4')),
  fs.readFile(fontPath),
  sha256File(apiPath),
  resolveGeneratedCompositionSandboxOverlayV1(repoRoot),
]);

const executionId = `dev02-sandbox-${Date.now()}`;
const request = buildGeneratedCompositionSandboxRequestV1({
  executionId,
  createdAt: new Date().toISOString(),
  appCommit: snapshotCommit,
  apiImplementationHash,
  workerImplementationHash: overlay.workerImplementationHash,
  program: DEV02_GENERATED_COMPOSITION_PROGRAM_V1,
  sourceBundle: DEV02_GENERATED_COMPOSITION_SOURCE_BUNDLE_V1,
  evidencePack: DEV02_GENERATED_COMPOSITION_EVIDENCE_PACK_V1,
  referenceBlueprint: DEV02_GENERATED_COMPOSITION_BLUEPRINT_V1,
  supplementalFacts: DEV02_GENERATED_COMPOSITION_SUPPLEMENTAL_FACTS_V1,
  proofFrames: [0, 24, 108, 144, 145, 179],
  inputs: [
    { kind: 'SOURCE_MEDIA', bindingId: 'dev02-wide', fileName: 'dev02-wide.mp4', bytes: wide },
    { kind: 'SOURCE_MEDIA', bindingId: 'dev02-close', fileName: 'dev02-close.mp4', bytes: close },
    { kind: 'FONT', bindingId: 'font-noto-sans-v27-regular', fileName: 'noto-sans.ttf', bytes: font },
  ],
  // Keep the smoke request inside the program-owned limits used by Stage 6. A
  // smaller harness-only ceiling can misclassify a valid current renderer as
  // a capability failure before its playable-proxy proof is materialized.
  resources: {
    wallTimeMs: DEV02_GENERATED_COMPOSITION_PROGRAM_V1.resourceBudget.maxWallTimeMs,
    maxCpuMs: DEV02_GENERATED_COMPOSITION_PROGRAM_V1.resourceBudget.maxCpuMs,
    vcpus: 1,
    memoryMiB: 2_048,
    maxOutputBytes: Math.min(
      DEV02_GENERATED_COMPOSITION_PROGRAM_V1.resourceBudget.maxOutputBytes,
      64 * 1_024 * 1_024,
    ),
  },
});

const executed = await executeGeneratedCompositionInSandboxV1({ request, repoRoot });
const artifactRoot = path.join(repoRoot, '.calibration-temp', 'open-ended-planner-v2', 'generated-composition-sandbox', request.requestId);
await fs.mkdir(path.join(artifactRoot, 'outputs'), { recursive: true });
const remoteRoot = `/tmp/editron-gcp/${request.requestId}/`;
for (const [remotePath, bytes] of Object.entries(executed.outputBytes)) {
  if (!remotePath.startsWith(remoteRoot) || remotePath.includes('..')) throw new Error(`Unsafe sandbox output path: ${remotePath}`);
  const relativePath = path.posix.relative(remoteRoot, remotePath);
  const localPath = path.resolve(artifactRoot, 'outputs', ...relativePath.split('/'));
  const outputRoot = path.resolve(artifactRoot, 'outputs');
  if (!localPath.startsWith(outputRoot + path.sep)) throw new Error(`Sandbox output escaped local evidence root: ${remotePath}`);
  await fs.mkdir(path.dirname(localPath), { recursive: true });
  await fs.writeFile(localPath, bytes);
}
await Promise.all([
  fs.writeFile(path.join(artifactRoot, 'request.json'), JSON.stringify(request, null, 2), 'utf8'),
  fs.writeFile(path.join(artifactRoot, 'worker-result.json'), JSON.stringify(executed.workerResult, null, 2), 'utf8'),
  fs.writeFile(path.join(artifactRoot, 'host-receipt.json'), JSON.stringify(executed.receipt, null, 2), 'utf8'),
  fs.writeFile(path.join(artifactRoot, 'summary.json'), JSON.stringify({
    requestId: request.requestId,
    executionId,
    programHash: request.programHash,
    sourceBundleHash: request.sourceBundleHash,
    apiImplementationHash,
    workerImplementationHash: overlay.workerImplementationHash,
    workerStatus: executed.workerResult.status,
    hostReceiptHash: executed.receipt.receiptHash,
    proof: executed.receipt.proof,
    artifactRoot,
  }, null, 2), 'utf8'),
]);

console.log(JSON.stringify({
  requestId: request.requestId,
  programHash: request.programHash,
  workerStatus: executed.workerResult.status,
  wallTimeMs: executed.workerResult.wallTimeMs,
  cpuUpperBoundMs: executed.workerResult.cpuUpperBoundMs,
  hostReceiptHash: executed.receipt.receiptHash,
  artifactRoot,
}, null, 2));

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Generated composition sandbox smoke missing ${name}`);
  return value;
}

async function sha256File(filePath: string): Promise<string> {
  return createHash('sha256').update(await fs.readFile(filePath)).digest('hex');
}
