import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { getCanonicalDev04ConnectedChainV2 } from '../lib/editron/research/open-ended-planner/dev04-capability-gap-chain-v2';
import { DEV04_LOWERING_POLICY_V2R } from '../lib/editron/research/open-ended-planner/dev04-lowering-policy-v2r';
import { buildCanonicalTextStageOnePacketV2 } from '../lib/editron/research/open-ended-planner/staged-packet-v2';
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

function buildDev04Task(): V2RConnectedTaskV2 {
  const canonical = getCanonicalDev04ConnectedChainV2();
  const stageOneInput = {
    taskId: 'DEV-04',
    conditionId: 'BASELINE',
    request: 'Put the title behind the moving person for the whole shot so their changing outline always stays in front. Do not hide the title when they are not crossing it.',
    projectFacts: {
      projectId: 'oe-dev-04',
      projectRevision: 'R2',
      timebase: { coordinateDomain: 'PROJECT_TICK', rate: { numerator: '30', denominator: '1' }, duration: { start: '0', endExclusive: '240' } },
    },
    evidenceAvailability: [{ evidenceId: 'EV-DEV04-V1', kind: 'VISUAL_OCCLUSION_OBSERVATION' }],
    mediaPolicy: 'HASH_BOUND_SYNTHETIC_BENCHMARK_EVIDENCE_ONLY_NO_MEDIA_EGRESS',
  };
  return {
    taskId: 'DEV-04',
    conditionId: 'BASELINE',
    executionFormArm: 'FREE_CHOICE',
    stageOnePacket: buildCanonicalTextStageOnePacketV2({
      taskId: 'DEV-04',
      conditionId: 'BASELINE',
      canonicalInput: stageOneInput,
    }),
    evidencePack: canonical.evidencePacks.BASELINE as Record<string, unknown>,
    loweringPolicy: DEV04_LOWERING_POLICY_V2R,
  };
}

async function main(): Promise<void> {
  const routeId = process.argv[2] ?? 'OPENAI_LUNA';
  const environment = loadEnvLocal();
  const manifest = buildV2RPreregistrationManifest();

  const routes = buildDevelopmentModelRoutesV2({ environment, qwenBudgetMode: 'FAIR_STAGE_BUDGET' });
  const route = routes.find((candidate) => candidate.routeId === routeId);
  if (!route) throw new Error(`ROUTE_MISSING:${routeId}`);

  const task = buildDev04Task();

  const episode = await runV2RConnectedEpisodeV2({ manifest, task, route });
  process.stdout.write(`EPISODE_DISPOSITION ${episode.finalDisposition} stages=${episode.rows.map((row) => `${row.stage}:${row.providerRun.disposition}`).join('|')}\n`);

  const lineageDir = resolve('.calibration-temp/open-ended-planner-v2/v2r-full-pipeline-dev04');
  mkdirSync(lineageDir, { recursive: true });
  const lineageStamp = new Date().toISOString().replace(/[:.]/g, '-');
  const lineagePath = resolve(lineageDir, `v2r-dev04-episode-${routeId.toLowerCase()}-${lineageStamp}.json`);
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
    taskId: 'DEV-04',
    editorialIntent: stage2,
    evidenceBoundIntent: stage3,
    evidencePack: task.evidencePack,
    policy: DEV04_LOWERING_POLICY_V2R,
  });

  const routeDecision = (stage2.routeDecision ?? {}) as { scopeClassification?: string };
  const stage3Disposition = String(stage3.stageDisposition ?? '');
  const unresolved = Array.isArray(stage3.unresolvedRequirements) ? (stage3.unresolvedRequirements as Array<{ kind?: string; disposition?: string }>) : [];
  const capabilityGapDeclared = unresolved.some((entry) => entry.kind === 'CAPABILITY' && entry.disposition === 'CAPABILITY_GAP');
  const mutationOperators = lowering.compiledOperatorIds.filter((operatorId) => !['read_project_file', 'get_timeline_view'].includes(operatorId));

  const honestGap = lowering.compiled.compileDisposition === 'CAPABILITY_GAP'
    && lowering.zeroAdd && lowering.zeroDrop
    && mutationOperators.length === 0
    && (routeDecision.scopeClassification === 'CAPABILITY_GAP' || stage3Disposition === 'CAPABILITY_GAP' || capabilityGapDeclared);

  const summary = {
    routeId,
    claimedModelIdentity: route.claimedModelIdentity,
    episodeDisposition: episode.finalDisposition,
    modelGapDeclaration: {
      stage2ScopeClassification: routeDecision.scopeClassification ?? null,
      stage3Disposition,
      capabilityGapInUnresolvedRequirements: capabilityGapDeclared,
    },
    lowering: {
      compileDisposition: lowering.compiled.compileDisposition,
      zeroAdd: lowering.zeroAdd,
      zeroDrop: lowering.zeroDrop,
      compiledOperatorIds: [...lowering.compiledOperatorIds],
      mutationOperatorsCompiled: mutationOperators,
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
