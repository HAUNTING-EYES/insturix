import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { getCanonicalDev03Stage123V2 } from '../lib/editron/research/open-ended-planner/dev03-stage123-canonical-v2';
import {
  buildCanonicalDev03BeatWithheldEvidenceV2,
  buildCanonicalDev03MeasuredEvidenceV2,
} from '../lib/editron/research/open-ended-planner/dev03-measured-evidence-v2';
import { DEV03_LOWERING_POLICY_V2R } from '../lib/editron/research/open-ended-planner/dev03-lowering-policy-v2r';
import { lowerV2RBoundIntentGeneric } from '../lib/editron/research/open-ended-planner/generic-lowerer-v2r';
import { executeDev03Stage6GenericLoweredV2 } from '../lib/editron/research/open-ended-planner/dev03-stage6-generic-lowered-executor-v2r';
import { DEV03_STAGE6_ARTIFACT_IDS_V2 } from '../lib/editron/research/open-ended-planner/dev03-stage6-native-proxy-contract-v2';
import { readFile } from 'node:fs/promises';

async function main(): Promise<void> {
  const [audioBytes, analyzerSourceBytes] = await Promise.all([
    readFile(resolve('.calibration-temp/open-ended-planner-v2/development-media/dev03-beats.wav')),
    readFile(resolve('lib/editron/services/media/beat-detection-service.ts')),
  ]);
  const measured = await buildCanonicalDev03MeasuredEvidenceV2({ audioBytes, analyzerSourceBytes });
  const canonical = getCanonicalDev03Stage123V2({
    measuredEvidence: measured,
    withheldEvidence: buildCanonicalDev03BeatWithheldEvidenceV2(),
  });

  const editorialIntent = canonical.editorialIntentV2R;
  const evidenceBoundIntent = canonical.evidenceBoundIntentsV2R.BASELINE;
  const evidencePack = canonical.evidencePacks.BASELINE;

  const lowering = lowerV2RBoundIntentGeneric({
    taskId: 'DEV-03',
    editorialIntent,
    evidenceBoundIntent,
    evidencePack,
    policy: DEV03_LOWERING_POLICY_V2R,
  });

  process.stdout.write(`LOWERING disposition=${lowering.compiled.compileDisposition} zeroAdd=${lowering.zeroAdd} zeroDrop=${lowering.zeroDrop}\n`);
  process.stdout.write(`  compiled=${lowering.compiledOperatorIds.length} selected=${lowering.selectedOperatorIds.length}\n`);
  process.stdout.write(`  compiledIds=${JSON.stringify([...lowering.compiledOperatorIds])}\n`);
  process.stdout.write(`  diagnostics=${JSON.stringify([...lowering.diagnostics])}\n`);

  const ok = lowering.zeroAdd && lowering.zeroDrop && lowering.compiled.compileDisposition === 'COMPILED_RESEARCH_PROXY'
    && lowering.compiledOperatorIds.includes('sync_cuts_to_beats') && lowering.compiledOperatorIds.includes('apply_camera_shake');
  process.stdout.write(`LOWERING_OFFLINE_${ok ? 'PASS' : 'FAIL'}\n`);
  if (!ok) { process.exitCode = 1; return; }

  // Stub renderer: write tiny placeholder files for each artifact, return minimal proof.
  const outDir = resolve('.calibration-temp/open-ended-planner-v2/dev03-offline-probe');
  mkdirSync(outDir, { recursive: true });
  const artifactPaths = {} as Record<string, string>;
  for (const id of DEV03_STAGE6_ARTIFACT_IDS_V2) {
    const p = resolve(outDir, `stub-${id}.bin`);
    writeFileSync(p, Buffer.from([1, 2, 3, 4]));
    artifactPaths[id] = p;
  }
  const stubRenderer = async () => ({
    artifactPaths: artifactPaths as never,
    proof: {
      schemaVersion: 'EDITRON_OE_DEV03_STAGE6_NATIVE_PROXY_V2', renderer: { root: '', assembler: '', visualConsumer: '', audioConsumer: '' },
      composition: { width: 320, height: 180, fpsNumerator: 30, fpsDenominator: 1, durationInFrames: 600 },
      sourceBindings: { videoAssetId: 'dev03-cards', audioAssetId: 'dev03-beats' },
      video: { codec: 'h264', width: 320, height: 180, averageFrameRate: '30/1', decodedFrameCount: 600, durationSeconds: 20, audioStreamCount: 1 },
      visual: { boundarySamples: [], boundaryMeanAbsDiffs: [0, 0, 0], shakeActiveFrame: 480, shakeNeutralFrame: 490, shakeActiveMeanAbsDiff: 1, shakeNeutralMeanAbsDiff: 0 },
      audio: { sampleRateHz: 48000, sourceChannels: 1 as const, baselineChannels: 2 as const, renderedChannels: 2 as const, sourceSampleFrames: 1, baselineSampleFrames: 1, renderedSampleFrames: 1, protectedStartFrame: 250, protectedEndFrame: 350, sourceProtectedRms: 1, baselineProtectedRms: 1, renderedProtectedRms: 1, sourceToRenderedGainRatio: 1, sourceToRenderedCorrelation: 1, baselineToRenderedGainRatio: 1, baselineToRenderedCorrelation: 1, renderedPeak: 1 },
      browserErrors: [], externalCalls: { providerApiCalls: 0 as const, cloudRenderCalls: 0 as const, projectServiceCalls: 0 as const, databaseCalls: 0 as const },
    },
  });

  const execution = await executeDev03Stage6GenericLoweredV2({
    lowering,
    executionId: `dev03-offline-probe-${Date.now()}`,
    createdAt: new Date().toISOString(),
    outputDir: outDir,
    renderer: stubRenderer as never,
  });
  process.stdout.write(`EXECUTOR receiptHash=${execution.receipt.receiptHash}\n`);
  process.stdout.write(`EXECUTOR proof=${JSON.stringify(execution.receipt.proof)}\n`);
  process.stdout.write(`EXECUTOR artifacts=${(execution.receipt.artifacts as unknown[]).length}\n`);
  process.stdout.write(`EXECUTOR_OFFLINE_PASS\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
