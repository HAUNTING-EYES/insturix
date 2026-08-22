import { promises as fs } from 'node:fs';
import path from 'node:path';

import { config as loadEnv } from 'dotenv';

import { proveSealedHoldoutH03HybridOutcomeV3R2 }
  from '../lib/editron/research/open-ended-planner/sealed-holdout-h03-hybrid-proof-v3r2';
import { prepareSealedH03V3R2ProofFixture }
  from '../tests/editron/helpers/sealed-holdout-h03-v3r2-proof-driver';

const SOURCE_ORIGIN = 'SYNTHETIC_CONTRACT_CALLBACK_NOT_PROVIDER_OUTPUT' as const;
const repoRoot = path.resolve(process.cwd());
const sandboxEnvPath = path.join(
  repoRoot,
  '.calibration-temp',
  'vercel-sandbox-env.local',
);

loadEnv({ path: sandboxEnvPath, override: false, quiet: true });

const startedAt = new Date();
const runId = `h03-live-sandbox-v3r2-${safeTimestamp(startedAt)}`;
const outputRoot = path.join(
  repoRoot,
  '.calibration-temp',
  'open-ended-planner-v2',
  'sealed-holdout-h03-live-sandbox-v3r2',
);
const outputDirectory = path.join(outputRoot, runId);

await fs.mkdir(outputRoot, { recursive: true });
await fs.mkdir(outputDirectory, { recursive: false });

try {
  // The fixture callback is deliberately synthetic. The default proof executor
  // below is deliberately not injected: it must create the real Vercel microVM.
  const fixture = await prepareSealedH03V3R2ProofFixture(
    path.join(outputDirectory, 'fixture'),
  );
  const receipt = await proveSealedHoldoutH03HybridOutcomeV3R2({
    manifest: fixture.manifest,
    caseId: 'HOLD-03:C1',
    connectedEpisode: fixture.connected,
    trace: fixture.trace,
    evaluation: fixture.evaluation,
    mediaManifest: fixture.mediaManifest,
    outputDirectory: path.join(outputDirectory, 'proof'),
    executionId: runId,
    createdAt: startedAt.toISOString(),
    sandboxEnvironment: {
      snapshotId: requiredEnv('MG_RENDER_SANDBOX_SNAPSHOT_ID'),
      snapshotCommit: requiredEnv('MG_RENDER_SANDBOX_APP_COMMIT'),
    },
    repoRoot,
  });
  const summary = {
    version: 'EDITRON_OE_H03_LIVE_SANDBOX_SMOKE_V3R2',
    sourceOrigin: SOURCE_ORIGIN,
    modelPerformanceClaim: 'NONE',
    projectMutation: 'NONE',
    caseId: receipt.caseId,
    assessment: receipt.assessment,
    receiptSha256: receipt.receiptSha256,
    programHash: receipt.generatedSourceLineage.programHash,
    sourceBundleHash: receipt.generatedSourceLineage.sourceBundleHash,
    sandboxHostReceiptHash: receipt.sandboxProof.hostReceiptHash,
    sandboxProductionProof: receipt.sandboxProof.productionSandbox,
    sandboxDeleted: receipt.sandboxProof.sandboxDeleted,
    networkPolicy: receipt.sandboxProof.networkPolicy,
    outputVideoSha256: receipt.outputArtifact.sha256,
    resultPath: path.join(outputDirectory, 'receipt.json'),
  } as const;
  await Promise.all([
    writeJson(path.join(outputDirectory, 'receipt.json'), receipt),
    writeJson(path.join(outputDirectory, 'summary.json'), summary),
  ]);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
} catch (error) {
  await writeJson(path.join(outputDirectory, 'failure.json'), {
    version: 'EDITRON_OE_H03_LIVE_SANDBOX_FAILURE_V3R2',
    sourceOrigin: SOURCE_ORIGIN,
    modelPerformanceClaim: 'NONE',
    projectMutation: 'NONE',
    failedAt: new Date().toISOString(),
    error: boundedError(error),
  });
  throw error;
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`H03_LIVE_SANDBOX_ENV_MISSING:${name}`);
  return value;
}

function safeTimestamp(value: Date): string {
  return value.toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  const partialPath = `${filePath}.partial`;
  await fs.writeFile(partialPath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  await fs.rename(partialPath, filePath);
}

function boundedError(error: unknown): string {
  const message = error instanceof Error
    ? error.stack ?? error.message
    : String(error);
  return message.trim().slice(0, 4_000);
}
