import path from 'node:path';

import { config as loadEnv } from 'dotenv';

import { executeStage25Rhc04RenderedGeneratedProofV1 }
  from '../lib/editron/research/open-ended-planner/stage25-rhc04-rendered-generated-proof-v1';

const repoRoot = process.cwd();
const environmentPath = process.env.EDITRON_RHC04_SANDBOX_ENV_FILE?.trim()
  || path.resolve(repoRoot, '.env.local.vercel');
loadEnv({ path: environmentPath, override: false, quiet: true });

const snapshotId = required('MG_RENDER_SANDBOX_SNAPSHOT_ID');
const snapshotCommit = required('MG_RENDER_SANDBOX_APP_COMMIT');
const createdAt = new Date().toISOString();
const executionId = `rhc04-live-${createdAt.replace(/[-:.TZ]/g, '')}`;
const outputDirectory = path.resolve(
  repoRoot,
  '.calibration-temp',
  'open-ended-planner-v2',
  'stage25-rhc04-live-render-v1',
  executionId,
);

const result = await executeStage25Rhc04RenderedGeneratedProofV1({
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
  requestIds: {
    initial: result.receipt.sandboxProof.initial.requestId,
    corrected: result.receipt.sandboxProof.corrected.requestId,
  },
  hostReceiptSha256: {
    initial: result.receipt.sandboxProof.initial.hostReceiptSha256,
    corrected: result.receipt.sandboxProof.corrected.hostReceiptSha256,
  },
  programSha256: {
    initial: result.receipt.generatedPrograms.initial.programSha256,
    corrected: result.receipt.generatedPrograms.corrected.programSha256,
  },
  renderedCorrectionDisposition:
    result.receipt.renderedCorrectionProof.technicalDisposition,
  staleRevisionDisposition:
    result.receipt.projectServiceProposalProof.staleRevise.disposition,
  exactBaseRevisionDisposition:
    result.receipt.projectServiceProposalProof.exactBaseRevise.disposition,
  humanCorrectionTime:
    result.receipt.correctionMeasurement.humanHandsOnCorrectionTime,
  providerExecutionCost:
    result.receipt.correctionMeasurement.providerExecutionCost,
  evidenceRoot: result.hostPaths.outputRoot,
  initialReviewProxyPath: result.hostPaths.initialPlayablePath,
  correctedReviewProxyPath: result.hostPaths.correctedPlayablePath,
}, null, 2));

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`RHC04 live generated proof missing ${name}`);
  return value;
}
