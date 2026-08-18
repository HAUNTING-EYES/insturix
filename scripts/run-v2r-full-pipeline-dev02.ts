import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import dev02Stage3EvidenceJson from '../tests/fixtures/editron/open-ended-planner-v2/dev02-stage3-evidence-pack-v2.json';
import { DEV02_LOWERING_POLICY_V2R } from '../lib/editron/research/open-ended-planner/dev02-lowering-policy-v2r';
import { buildDevelopmentReferenceImageSequenceStageOnePacketV2 } from '../lib/editron/research/open-ended-planner/staged-packet-v2';
import { buildV2RPreregistrationManifest } from '../lib/editron/research/open-ended-planner/v2r-preregistration-manifest';
import { buildDevelopmentModelRoutesV2 } from '../lib/editron/research/open-ended-planner/development-cohort-routes-v2';
import { runV2RConnectedEpisodeV2, type V2RConnectedTaskV2 } from '../lib/editron/research/open-ended-planner/v2r-connected-episode-v2r';
import { lowerV2RBoundIntentGeneric } from '../lib/editron/research/open-ended-planner/generic-lowerer-v2r';

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

function buildDev02Task(): V2RConnectedTaskV2 {
  return {
    taskId: 'DEV-02',
    conditionId: 'BASELINE',
    executionFormArm: 'FREE_CHOICE',
    stageOnePacket: buildDevelopmentReferenceImageSequenceStageOnePacketV2('DEV-02', 'BASELINE'),
    evidencePack: dev02Stage3EvidenceJson as Record<string, unknown>,
    loweringPolicy: DEV02_LOWERING_POLICY_V2R,
  };
}

async function main(): Promise<void> {
  const routeId = process.argv[2] ?? 'OPENAI_LUNA';
  const environment = loadEnvLocal();
  const manifest = buildV2RPreregistrationManifest();

  const routes = buildDevelopmentModelRoutesV2({ environment, qwenBudgetMode: 'FAIR_STAGE_BUDGET' });
  const route = routes.find((candidate) => candidate.routeId === routeId);
  if (!route) throw new Error(`ROUTE_MISSING:${routeId}`);

  const task = buildDev02Task();

  const episode = await runV2RConnectedEpisodeV2({ manifest, task, route });
  process.stdout.write(`EPISODE_DISPOSITION ${episode.finalDisposition} stages=${episode.rows.map((row) => `${row.stage}:${row.providerRun.disposition}`).join('|')}\n`);

  const lineageDir = resolve('.calibration-temp/open-ended-planner-v2/v2r-full-pipeline-dev02');
  mkdirSync(lineageDir, { recursive: true });
  const lineageStamp = new Date().toISOString().replace(/[:.]/g, '-');
  const lineagePath = resolve(lineageDir, `v2r-dev02-episode-${routeId.toLowerCase()}-${lineageStamp}.json`);
  writeFileSync(lineagePath, `${JSON.stringify(episode, null, 2)}\n`, 'utf8');
  process.stdout.write(`EPISODE_LINEAGE ${lineagePath}\n`);

  const stage2 = episode.rows.find((row) => row.stage === 2)?.providerRun.artifact as Record<string, unknown> | undefined;
  const stage3 = episode.rows.find((row) => row.stage === 3)?.providerRun.artifact as Record<string, unknown> | undefined;
  if (!stage2 || !stage3) {
    for (const row of episode.rows) {
      const lastAttempt = row.providerRun.attempts[row.providerRun.attempts.length - 1];
      process.stdout.write(`STAGE_${row.stage} ${row.providerRun.disposition} diag=${JSON.stringify(lastAttempt?.schemaDiagnostics ?? [])}\n`);
    }
    throw new Error(`EPISODE_DID_NOT_PRODUCE_ARTIFACTS:${episode.finalDisposition}`);
  }

  const lowering = lowerV2RBoundIntentGeneric({
    taskId: 'DEV-02',
    editorialIntent: stage2,
    evidenceBoundIntent: stage3,
    evidencePack: task.evidencePack,
    policy: DEV02_LOWERING_POLICY_V2R,
  });

  const routeDecision = (stage2.routeDecision ?? {}) as { scopeClassification?: string };
  const stage3Disposition = String(stage3.stageDisposition ?? '');
  const unresolved = Array.isArray(stage3.unresolvedRequirements) ? (stage3.unresolvedRequirements as Array<{ kind?: string; disposition?: string }>) : [];
  const capabilityGapDeclared = unresolved.some((entry) => entry.kind === 'CAPABILITY' && entry.disposition === 'CAPABILITY_GAP');
  const selectedGeneratedIsland = lowering.selectedOperatorIds.includes('generated_composition_program');
  const generatedNotCompilable = lowering.diagnostics.some((diagnostic) => diagnostic.includes('LOWERING_OPERATOR_NOT_COMPILABLE') && diagnostic.includes('generated_composition_program'));
  const mutationOperators = lowering.compiledOperatorIds.filter((operatorId) => !['read_project_file', 'get_timeline_view', 'inspect_user_asset', 'resolve_user_asset_overlay', 'search_user_assets', 'list_user_assets'].includes(operatorId));

  const honestGap = lowering.compiled.compileDisposition === 'CAPABILITY_GAP'
    && lowering.zeroAdd && lowering.zeroDrop
    && mutationOperators.length === 0
    && selectedGeneratedIsland && generatedNotCompilable;

  const summary = {
    routeId,
    claimedModelIdentity: route.claimedModelIdentity,
    episodeDisposition: episode.finalDisposition,
    modelRouting: {
      stage2ScopeClassification: routeDecision.scopeClassification ?? null,
      stage3Disposition,
      capabilityGapInUnresolvedRequirements: capabilityGapDeclared,
      selectedGeneratedIsland,
    },
    lowering: {
      compileDisposition: lowering.compiled.compileDisposition,
      zeroAdd: lowering.zeroAdd,
      zeroDrop: lowering.zeroDrop,
      compiledOperatorIds: [...lowering.compiledOperatorIds],
      selectedOperatorIds: [...lowering.selectedOperatorIds],
      mutationOperatorsCompiled: mutationOperators,
      generatedNotCompilable,
      diagnostics: lowering.diagnostics,
    },
    HONEST_CAPABILITY_GAP: honestGap,
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (!honestGap) process.exitCode = 2;
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
