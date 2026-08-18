import { mkdirSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { getCanonicalDev03Stage123V2 } from '../lib/editron/research/open-ended-planner/dev03-stage123-canonical-v2';
import {
  buildCanonicalDev03BeatWithheldEvidenceV2,
  buildCanonicalDev03MeasuredEvidenceV2,
} from '../lib/editron/research/open-ended-planner/dev03-measured-evidence-v2';
import { DEV03_LOWERING_POLICY_V2R } from '../lib/editron/research/open-ended-planner/dev03-lowering-policy-v2r';
import { lowerV2RBoundIntentGeneric } from '../lib/editron/research/open-ended-planner/generic-lowerer-v2r';
import { executeDev03Stage6GenericLoweredV2 } from '../lib/editron/research/open-ended-planner/dev03-stage6-generic-lowered-executor-v2r';

// Completes the DEV-03 stage-6 isolated execution + render from an already-saved
// episode lineage (stage-2/stage-3 model artifacts), without re-calling the model.
// Usage: npx tsx scripts/complete-dev03-render-from-lineage.ts <lineageJsonPath> <routeLabel>

async function main(): Promise<void> {
  const lineagePath = process.argv[2];
  const routeLabel = (process.argv[3] ?? 'unknown').toLowerCase();
  if (!lineagePath) throw new Error('USAGE: complete-dev03-render-from-lineage.ts <lineageJsonPath> <routeLabel>');

  const episode = JSON.parse(readFileSync(resolve(lineagePath), 'utf8')) as {
    rows: Array<{ stage: number; providerRun: { artifact?: Record<string, unknown> } }>;
  };
  const stage2 = episode.rows.find((row) => row.stage === 2)?.providerRun.artifact;
  const stage3 = episode.rows.find((row) => row.stage === 3)?.providerRun.artifact;
  if (!stage2 || !stage3) throw new Error('LINEAGE_MISSING_STAGE_ARTIFACTS');

  const [audioBytes, analyzerSourceBytes] = await Promise.all([
    readFile(resolve('.calibration-temp/open-ended-planner-v2/development-media/dev03-beats.wav')),
    readFile(resolve('lib/editron/services/media/beat-detection-service.ts')),
  ]);
  const measured = await buildCanonicalDev03MeasuredEvidenceV2({ audioBytes, analyzerSourceBytes });
  const canonical = getCanonicalDev03Stage123V2({
    measuredEvidence: measured,
    withheldEvidence: buildCanonicalDev03BeatWithheldEvidenceV2(),
  });

  const lowering = lowerV2RBoundIntentGeneric({
    taskId: 'DEV-03',
    editorialIntent: stage2,
    evidenceBoundIntent: stage3,
    evidencePack: canonical.evidencePacks.BASELINE as Record<string, unknown>,
    policy: DEV03_LOWERING_POLICY_V2R,
  });
  process.stdout.write(`LOWERING zeroAdd=${lowering.zeroAdd} zeroDrop=${lowering.zeroDrop} disposition=${lowering.compiled.compileDisposition} compiled=${lowering.compiledOperatorIds.length}/${lowering.selectedOperatorIds.length} diag=${JSON.stringify(lowering.diagnostics)}\n`);

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputDir = resolve(`.calibration-temp/open-ended-planner-v2/v2r-full-pipeline-dev03/render-${routeLabel}-resume-${stamp}`);
  mkdirSync(outputDir, { recursive: true });

  const execution = await executeDev03Stage6GenericLoweredV2({
    lowering,
    executionId: `v2r-dev03-resume-${routeLabel}-${Date.now()}`,
    createdAt: new Date().toISOString(),
    outputDir,
  });

  const renderProof = execution.receipt.renderProof as { browserErrors?: string[]; visual?: unknown; audio?: unknown; externalCalls?: unknown };
  process.stdout.write(`${JSON.stringify({
    proof: execution.receipt.proof,
    browserErrors: renderProof.browserErrors,
    visual: renderProof.visual,
    audio: renderProof.audio,
    externalCalls: renderProof.externalCalls,
    artifacts: (execution.receipt.artifacts as Array<{ artifactId: string; byteLength: number }>).map(({ artifactId, byteLength }) => `${artifactId}:${byteLength}b`),
    receiptPath: execution.receiptPath,
  }, null, 2)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
