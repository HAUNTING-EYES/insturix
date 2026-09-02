import path from 'node:path';

import { config as loadEnv } from 'dotenv';

import { executeStage25Rhc02RenderedHybridProofV1 }
  from '../lib/editron/research/open-ended-planner/stage25-rhc02-rendered-hybrid-proof-v1';

const repoRoot = process.cwd();
const environmentPath = process.env.EDITRON_RHC02_SANDBOX_ENV_FILE?.trim()
  || path.resolve(repoRoot, '.env.local.vercel');
loadEnv({ path: environmentPath, override: false, quiet: true });

const snapshotId = required('MG_RENDER_SANDBOX_SNAPSHOT_ID');
const snapshotCommit = required('MG_RENDER_SANDBOX_APP_COMMIT');
const createdAt = new Date().toISOString();
const executionId = `rhc02-live-${createdAt.replace(/[-:.TZ]/g, '')}`;
const outputDirectory = path.resolve(
  repoRoot,
  '.calibration-temp',
  'open-ended-planner-v2',
  'stage25-rhc02-live-render-v1',
  executionId,
);

const result = await executeStage25Rhc02RenderedHybridProofV1({
  outputDirectory,
  executionId,
  createdAt,
  sandboxEnvironment: { snapshotId, snapshotCommit },
  repoRoot,
});

console.log(JSON.stringify({
  taskId: result.receipt.taskId,
  assessment: result.receipt.assessment,
  receiptSha256: result.receipt.receiptSha256,
  requestId: result.receipt.sandboxProof.requestId,
  hostReceiptSha256: result.receipt.sandboxProof.hostReceiptSha256,
  programSha256: result.receipt.generatedProgram.programSha256,
  workerImplementationSha256: result.receipt.generatedProgram.workerImplementationSha256,
  nativeAudioPcmEquivalence:
    result.receipt.hybridAvProof.proof.nativeAudioPcmEquivalence,
  outsideTargetUnchanged:
    result.receipt.hybridAvProof.proof.outsideTargetUnchanged,
  humanQuality: result.receipt.humanQuality,
  evidenceRoot: result.hostPaths.outputRoot,
  reviewProxyPath: result.hostPaths.hybridReviewPath,
}, null, 2));

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`RHC02 live hybrid proof missing ${name}`);
  return value;
}
