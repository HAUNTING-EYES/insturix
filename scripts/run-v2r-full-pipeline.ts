import { mkdirSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { getCanonicalDev01Stage123V2 } from '../lib/editron/research/open-ended-planner/dev01-stage123-canonical-v2';
import { DEV01_LOWERING_POLICY_V2R } from '../lib/editron/research/open-ended-planner/dev01-lowering-policy-v2r';
import { buildDev01TruthfulStageOneTextPacketV2 } from '../lib/editron/research/open-ended-planner/staged-packet-v2';
import { buildV2RPreregistrationManifest } from '../lib/editron/research/open-ended-planner/v2r-preregistration-manifest';
import { buildDevelopmentModelRoutesV2 } from '../lib/editron/research/open-ended-planner/development-cohort-routes-v2';
import { runV2RConnectedEpisodeV2, type V2RConnectedTaskV2 } from '../lib/editron/research/open-ended-planner/v2r-connected-episode-v2r';
import { lowerV2RBoundIntentGeneric } from '../lib/editron/research/open-ended-planner/generic-lowerer-v2r';
import { executeDev01Stage6GenericLoweredV2 } from '../lib/editron/research/open-ended-planner/dev01-stage6-generic-lowered-executor-v2r';

function loadEnvLocal(): Record<string, string> {
  const env: Record<string, string> = {};
  try {
    const raw = readFileSync(resolve('.env.local'), 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const index = trimmed.indexOf('=');
      if (index === -1) continue;
      const key = trimmed.slice(0, index).trim();
      let value = trimmed.slice(index + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      env[key] = value;
    }
  } catch { /* no .env.local */ }
  return env;
}

async function main(): Promise<void> {
  const routeId = process.argv[2] ?? 'OPENAI_LUNA';
  const environment = loadEnvLocal();
  const manifest = buildV2RPreregistrationManifest();
  const canonical = getCanonicalDev01Stage123V2();

  const routes = buildDevelopmentModelRoutesV2({ environment, qwenBudgetMode: 'FAIR_STAGE_BUDGET' });
  const route = routes.find((candidate) => candidate.routeId === routeId);
  if (!route) throw new Error(`ROUTE_MISSING:${routeId}`);

  const task: V2RConnectedTaskV2 = {
    taskId: 'DEV-01',
    conditionId: 'BASELINE',
    executionFormArm: 'FORCED_NATIVE',
    stageOnePacket: buildDev01TruthfulStageOneTextPacketV2('BASELINE'),
    evidencePack: canonical.evidencePacks.BASELINE,
    loweringPolicy: DEV01_LOWERING_POLICY_V2R,
  };

  // 1. Run the model through the connected episode (stages 1-3) + lower.
  const episode = await runV2RConnectedEpisodeV2({ manifest, task, route });
  process.stdout.write(`EPISODE_DISPOSITION ${episode.finalDisposition} stages=${episode.rows.map((row) => `${row.stage}:${row.providerRun.disposition}`).join('|')}\n`);
  const stage2 = episode.rows.find((row) => row.stage === 2)?.providerRun.artifact;
  const stage3 = episode.rows.find((row) => row.stage === 3)?.providerRun.artifact;
  if (!stage2 || !stage3) {
    for (const row of episode.rows) {
      const lastAttempt = row.providerRun.attempts[row.providerRun.attempts.length - 1];
      process.stdout.write(`STAGE_${row.stage} ${row.providerRun.disposition} diag=${JSON.stringify(lastAttempt?.schemaDiagnostics ?? [])}\n`);
    }
    throw new Error(`EPISODE_DID_NOT_PRODUCE_ARTIFACTS:${episode.finalDisposition}`);
  }

  // 2. Re-lower the model's own artifacts to get the full lowering result.
  const lowering = lowerV2RBoundIntentGeneric({
    taskId: 'DEV-01',
    editorialIntent: stage2,
    evidenceBoundIntent: stage3,
    evidencePack: canonical.evidencePacks.BASELINE,
    policy: DEV01_LOWERING_POLICY_V2R,
  });

  const outputDir = resolve('.calibration-temp/open-ended-planner-v2/v2r-full-pipeline');
  mkdirSync(outputDir, { recursive: true });

  // 3. Execute the lowered model plan on an isolated clone + render.
  const execution = await executeDev01Stage6GenericLoweredV2({
    lowering,
    executionId: `v2r-full-${routeId.toLowerCase()}-${Date.now()}`,
    createdAt: new Date().toISOString(),
    outputDir,
  });

  const summary = {
    routeId,
    claimedModelIdentity: route.claimedModelIdentity,
    episodeDisposition: episode.finalDisposition,
    lowering: {
      zeroAdd: lowering.zeroAdd,
      zeroDrop: lowering.zeroDrop,
      compileDisposition: lowering.compiled.compileDisposition,
      compiledOperatorCount: lowering.compiledOperatorIds.length,
      selectedOperatorCount: lowering.selectedOperatorIds.length,
      diagnostics: lowering.diagnostics,
    },
    execution: {
      proof: execution.receipt.proof,
      renderProof: execution.receipt.renderProof,
      artifacts: (execution.receipt.artifacts as Array<{ artifactId: string; byteLength: number }>).map(({ artifactId, byteLength }) => `${artifactId}:${byteLength}b`),
      receiptPath: execution.receiptPath,
    },
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
