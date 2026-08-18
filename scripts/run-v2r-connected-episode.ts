import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { getCanonicalDev01Stage123V2 } from '../lib/editron/research/open-ended-planner/dev01-stage123-canonical-v2';
import { DEV01_LOWERING_POLICY_V2R } from '../lib/editron/research/open-ended-planner/dev01-lowering-policy-v2r';
import { buildDev01TruthfulStageOneTextPacketV2 } from '../lib/editron/research/open-ended-planner/staged-packet-v2';
import { buildV2RPreregistrationManifest } from '../lib/editron/research/open-ended-planner/v2r-preregistration-manifest';
import { buildDevelopmentModelRoutesV2 } from '../lib/editron/research/open-ended-planner/development-cohort-routes-v2';
import { runV2RConnectedEpisodeV2, type V2RConnectedTaskV2 } from '../lib/editron/research/open-ended-planner/v2r-connected-episode-v2r';

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
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      env[key] = value;
    }
  } catch {
    // no .env.local
  }
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

  const startedAt = Date.now();
  const receipt = await runV2RConnectedEpisodeV2({ manifest, task, route });
  const elapsedMs = Date.now() - startedAt;

  const outputDir = resolve('.calibration-temp/open-ended-planner-v2/v2r-live');
  mkdirSync(outputDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputPath = resolve(outputDir, `v2r-connected-${routeId.toLowerCase()}-dev01-${stamp}.json`);
  writeFileSync(outputPath, `${JSON.stringify({ elapsedMs, receipt }, null, 2)}\n`, 'utf8');

  const summary = {
    routeId,
    claimedModelIdentity: receipt.claimedModelIdentity,
    finalDisposition: receipt.finalDisposition,
    stagesCompleted: receipt.rows.map(({ stage }) => stage),
    stageDispositions: receipt.rows.map(({ providerRun }) => providerRun.disposition),
    lowering: receipt.lowering,
    actualProviderCostUsd: receipt.actualProviderCostUsd,
    elapsedMs,
    outputPath,
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
