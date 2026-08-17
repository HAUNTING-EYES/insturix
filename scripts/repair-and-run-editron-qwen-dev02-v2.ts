import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { config } from 'dotenv';

import { hashCanonicalJsonV1 } from '../lib/editron/research/open-ended-planner/contracts-v1';
import { executeConnectedDev02HybridMechanicsV2 } from '../lib/editron/research/open-ended-planner/dev02-connected-hybrid-mechanics-v2';
import { resolveDev02RenderedProofClaimBindingsV1 } from '../lib/editron/research/open-ended-planner/dev02-rendered-proof-claim-policy-v1';
import { buildCanonicalDev03MeasuredEvidenceV2 } from '../lib/editron/research/open-ended-planner/dev03-measured-evidence-v2';
import { buildDevelopmentCohortCasesV2 } from '../lib/editron/research/open-ended-planner/development-cohort-cases-v2';
import { buildDevelopmentMechanicsMapV2 } from '../lib/editron/research/open-ended-planner/development-cohort-mechanics-v2';
import { buildQwenDevelopmentModelRouteV2 } from '../lib/editron/research/open-ended-planner/development-cohort-routes-v2';
import { buildConnectedStage1SemanticRepairHandoffV2 } from '../lib/editron/research/open-ended-planner/development-connected-stage1-requalification-v2';
import { runConnectedDevelopmentStage123V2, type ConnectedDevelopmentStage123ReceiptV2 } from '../lib/editron/research/open-ended-planner/development-connected-stage123-runner-v2';
import { continueConnectedDevelopmentStage14V2 } from '../lib/editron/research/open-ended-planner/development-connected-stage14-runner-v2';
import { buildConnectedDevelopmentStage4OwnerForTaskV2 } from '../lib/editron/research/open-ended-planner/development-connected-stage4-owners-v2';
import { decideConnectedDevelopmentStage5V2 } from '../lib/editron/research/open-ended-planner/development-connected-stage5-gate-v2';
import type { ProviderStageRunV2 } from '../lib/editron/research/open-ended-planner/provider-transport-v2';

const DEFAULT_SOURCE = '.calibration-temp/open-ended-planner-v2/cohort-runs/'
  + 'qwen-dev02-stage3-20260816201735/qwen-dev02-stage3-continuation-result.json';
const DEFAULT_SANDBOX_ENV = '.calibration-temp/open-ended-planner-v2/vercel-sandbox.env';
const DIAGNOSTIC_TIMEOUT_MS = 900_000;
const REPAIR_DIAGNOSTICS = [
  'MISSING_EXPLICIT_TARGET_CLAIM:TITLE_YELLOW — the observed yellow title treatment must be represented as a proof-addressable target claim.',
  'MISSING_EXPLICIT_TARGET_CLAIM:OPPOSED_PANEL_MOTION — re-inspect the ordered frames for the centre-rises/side-descends relation and represent it only if visibly supported.',
] as const;

async function main(): Promise<void> {
  config({ path: '.env.local', quiet: true });
  config({ path: process.env.EDITRON_SANDBOX_ENV_PATH ?? DEFAULT_SANDBOX_ENV, quiet: true, override: true });
  const sourcePath = process.argv[2] ?? DEFAULT_SOURCE;
  const savedStageOneProviderPath = process.argv[3] ?? null;
  const savedStageTwoProviderPath = process.argv[4] ?? null;
  const savedAdditionalProviderPaths = process.argv.slice(5);
  const createdAt = new Date().toISOString();
  const runId = `qwen-dev02-stage1-repair-${createdAt.replace(/[^0-9]/g, '').slice(0, 14)}`;
  const evidenceRoot = path.resolve('.calibration-temp/open-ended-planner-v2/cohort-runs');
  const runRoot = path.join(evidenceRoot, runId);
  const [sourceBytes, audioBytes, analyzerSourceBytes] = await Promise.all([
    readFile(sourcePath, 'utf8'),
    readFile('.calibration-temp/open-ended-planner-v2/development-media/dev03-beats.wav'),
    readFile('lib/editron/services/media/beat-detection-service.ts'),
  ]);
  const source = JSON.parse(sourceBytes) as {
    continuation?: { stage123Receipt?: ConnectedDevelopmentStage123ReceiptV2 };
  };
  const sourceReceipt = source.continuation?.stage123Receipt;
  if (!sourceReceipt) throw new Error('QWEN_DEV02_STAGE1_REPAIR_SOURCE_MISSING');
  const savedStageOne = savedStageOneProviderPath
    ? JSON.parse(await readFile(savedStageOneProviderPath, 'utf8')) as {
      packetHash: string; transportHash: string; providerRun: Readonly<ProviderStageRunV2>;
    }
    : null;
  const savedStageTwo = savedStageTwoProviderPath
    ? JSON.parse(await readFile(savedStageTwoProviderPath, 'utf8')) as {
      packetHash: string; transportHash: string; providerRun: Readonly<ProviderStageRunV2>;
    }
    : null;
  const savedAdditionalProviders = await Promise.all(savedAdditionalProviderPaths.map(async (sourcePath) => ({
    sourcePath,
    container: JSON.parse(await readFile(sourcePath, 'utf8')) as {
      packetHash: string; transportHash: string; providerRun: Readonly<ProviderStageRunV2>;
    },
  })));
  const measured = await buildCanonicalDev03MeasuredEvidenceV2({ audioBytes, analyzerSourceBytes });
  const mechanics = buildDevelopmentMechanicsMapV2({ measuredDev03: measured, evidenceRoot, runId, createdAt });
  const task = buildDevelopmentCohortCasesV2({ measuredDev03: measured, mechanics })
    .find((candidate) => candidate.taskId === 'DEV-02');
  if (!task) throw new Error('QWEN_DEV02_TASK_MISSING');
  const baseRoute = buildQwenDevelopmentModelRouteV2({
    environment: process.env,
    qwenBudgetMode: 'ASYNC_QUALITY_DIAGNOSTIC',
    diagnosticTimeoutOverrideMs: DIAGNOSTIC_TIMEOUT_MS,
  });
  await mkdir(runRoot, { recursive: false });
  let liveProviderCallCount = 0;
  let reusedProviderCallCount = 0;
  let stageTwoInitialReused = false;
  const usedAdditionalProviderIndexes = new Set<number>();
  let semanticBindings: ReturnType<typeof resolveDev02RenderedProofClaimBindingsV1> | null = null;
  const route = {
    ...baseRoute,
    runStage: async (packet: Parameters<typeof baseRoute.runStage>[0]) => {
      let providerRun: Readonly<ProviderStageRunV2>;
      if (packet.packet.stage === 1 && savedStageOne) {
        if (reusedProviderCallCount || savedStageOne.packetHash !== packet.packetHash
          || savedStageOne.transportHash !== packet.transportHash
          || savedStageOne.providerRun.packetHash !== packet.packetHash) {
          throw new Error('QWEN_DEV02_SAVED_STAGE1_PROVIDER_BINDING_DRIFT');
        }
        reusedProviderCallCount = 1;
        providerRun = savedStageOne.providerRun;
        await writeJson(path.join(runRoot, 'provider-stage-1-reuse-receipt.json'), {
          sourcePath: savedStageOneProviderPath,
          sourceHash: hashCanonicalJsonV1(savedStageOne),
          packetHash: packet.packetHash,
          transportHash: packet.transportHash,
        });
        process.stdout.write('REUSE QWEN DEV-02 STAGE-1 HASH-IDENTICAL PROVIDER RESULT\n');
      } else if (packet.packet.stage === 2 && savedStageTwo
        && !packet.packet.modelInput.semanticRepairFeedback) {
        if (stageTwoInitialReused || savedStageTwo.packetHash !== packet.packetHash
          || savedStageTwo.transportHash !== packet.transportHash
          || savedStageTwo.providerRun.packetHash !== packet.packetHash) {
          throw new Error('QWEN_DEV02_SAVED_STAGE2_PROVIDER_BINDING_DRIFT');
        }
        stageTwoInitialReused = true;
        reusedProviderCallCount += 1;
        providerRun = savedStageTwo.providerRun;
        await writeJson(path.join(runRoot, 'provider-stage-2-reuse-receipt.json'), {
          sourcePath: savedStageTwoProviderPath,
          sourceHash: hashCanonicalJsonV1(savedStageTwo),
          packetHash: packet.packetHash,
          transportHash: packet.transportHash,
        });
        process.stdout.write('REUSE QWEN DEV-02 STAGE-2 HASH-IDENTICAL INITIAL PROVIDER RESULT\n');
      } else {
        const savedIndex = savedAdditionalProviders.findIndex(({ container }, index) =>
          !usedAdditionalProviderIndexes.has(index)
          && container.packetHash === packet.packetHash
          && container.transportHash === packet.transportHash
          && container.providerRun.packetHash === packet.packetHash);
        if (savedIndex >= 0) {
          const saved = savedAdditionalProviders[savedIndex];
          usedAdditionalProviderIndexes.add(savedIndex);
          reusedProviderCallCount += 1;
          providerRun = saved.container.providerRun;
          await writeJson(path.join(runRoot, `provider-stage-${packet.packet.stage}-additional-reuse-${savedIndex + 1}.json`), {
            sourcePath: saved.sourcePath,
            sourceHash: hashCanonicalJsonV1(saved.container),
            packetHash: packet.packetHash,
            transportHash: packet.transportHash,
          });
          process.stdout.write(`REUSE QWEN DEV-02 STAGE-${packet.packet.stage} HASH-IDENTICAL PROVIDER RESULT\n`);
        } else {
          liveProviderCallCount += 1;
          process.stdout.write(`START QWEN DEV-02 STAGE-${packet.packet.stage} LIVE-CALL-${liveProviderCallCount}\n`);
          providerRun = await baseRoute.runStage(packet);
          await writeJson(path.join(runRoot, `provider-stage-${packet.packet.stage}-live-call-${liveProviderCallCount}.json`), {
            packetHash: packet.packetHash, transportHash: packet.transportHash, providerRun,
          });
        }
      }
      if (packet.packet.stage === 1 && providerRun.disposition === 'ARTIFACT_ACCEPTED' && providerRun.artifact) {
        const targetClaimIds = records(providerRun.artifact.targetClaims).map((claim) => text(claim.claimId));
        semanticBindings = resolveDev02RenderedProofClaimBindingsV1({
          expectedMeasurementRefs: targetClaimIds,
          referenceBlueprint: providerRun.artifact,
        });
      }
      process.stdout.write(`END QWEN DEV-02 STAGE-${packet.packet.stage} ${providerRun.disposition}\n`);
      return providerRun;
    },
  };
  const repair = buildConnectedStage1SemanticRepairHandoffV2({
    task, route, sourceReceipt, repairDiagnostics: REPAIR_DIAGNOSTICS,
  });
  await writeJson(path.join(runRoot, 'stage1-semantic-repair-handoff.json'), repair.handoff);
  const stage123Receipt = await runConnectedDevelopmentStage123V2({ task: repair.repairedTask, route });
  if (usedAdditionalProviderIndexes.size !== savedAdditionalProviders.length) {
    throw new Error('QWEN_DEV02_SAVED_ADDITIONAL_PROVIDER_UNUSED');
  }
  if (!semanticBindings) throw new Error('QWEN_DEV02_STAGE1_SEMANTIC_BINDINGS_MISSING');
  const stage14Receipt = await continueConnectedDevelopmentStage14V2({
    task: repair.repairedTask,
    route,
    owner: buildConnectedDevelopmentStage4OwnerForTaskV2({ taskId: 'DEV-02', measuredDev03: measured }),
    stage123Receipt,
  });
  const stage5Decision = decideConnectedDevelopmentStage5V2(stage14Receipt);
  const compiledGraph = stage14Receipt.stage4Receipt?.compiledArtifact;
  if (stage14Receipt.stage4Receipt?.evaluation.disposition !== 'PASS'
    || stage5Decision.disposition !== 'PROCEED' || !compiledGraph) {
    throw new Error('QWEN_DEV02_REPAIRED_STAGE5_NOT_AUTHORIZED');
  }
  const stage6Mechanics = await executeConnectedDev02HybridMechanicsV2({
    outputRoot: path.join(runRoot, 'stage6'), runId, createdAt, hybridGraph: compiledGraph,
  });
  const material = {
    receiptVersion: 'EDITRON_OE_QWEN_DEV02_STAGE1_REPAIR_RESULT_V2' as const,
    authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION' as const,
    scoreStatus: 'SUPPLEMENTAL_ONE_BOUNDED_STAGE1_SEMANTIC_REPAIR' as const,
    createdAt,
    sourceReceiptPath: sourcePath,
    sourceReceiptHash: sourceReceipt.receiptHash,
    repairHandoff: repair.handoff,
    semanticBindings,
    stage123Receipt,
    stage14Receipt,
    stage5Decision,
    stage6Mechanics,
    providerCallCount: liveProviderCallCount + reusedProviderCallCount,
    liveProviderCallCount,
    reusedProviderCallCount,
    providerCostCoverage: 'TOKEN_PLAN_CREDITS_UNPRICED' as const,
    stateEffects: [] as const,
  };
  const result = { ...material, receiptHash: hashCanonicalJsonV1(material) };
  const resultPath = path.join(runRoot, 'qwen-dev02-stage1-repair-result.json');
  await writeJson(resultPath, result);
  process.stdout.write(`${JSON.stringify({
    runId, resultPath, receiptHash: result.receiptHash,
    stage123: stage123Receipt.finalDisposition,
    stage4: stage14Receipt.stage4Receipt?.evaluation.disposition ?? null,
    stage5: stage5Decision.disposition,
    stage6ReceiptHash: stage6Mechanics.hybridStage6ReceiptHash,
    hybridVideoPath: stage6Mechanics.hybridVideoPath,
    providerCallCount: liveProviderCallCount + reusedProviderCallCount,
    liveProviderCallCount,
    reusedProviderCallCount,
  })}\n`);
}

function records(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> => Boolean(entry)
      && typeof entry === 'object' && !Array.isArray(entry))
    : [];
}
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`QWEN_DEV02_STAGE1_REPAIR_FAILED:${message.replace(/[\r\n]+/g, ' ').slice(0, 1200)}\n`);
  process.exitCode = 1;
});
