import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, promises as fs, readFileSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

import { config as loadEnv, parse as parseEnv } from 'dotenv';

import { hashCanonicalJsonV1 } from '../lib/editron/research/open-ended-planner/contracts-v1';
import { evaluateDev02GeneratedCompositionRenderedProofV1 } from '../lib/editron/research/open-ended-planner/generated-composition-dev02-rendered-proof-v1';
import {
  type GeneratedCompositionModelRepairV1,
  buildDev02GeneratedCompositionModelPacketV1,
  materializeDev02GeneratedCompositionModelCandidateV1,
} from '../lib/editron/research/open-ended-planner/generated-composition-model-candidate-v1';
import {
  type GeneratedCompositionDirectBenchmarkRouteV1,
  type GeneratedCompositionAssessmentFailureClassV1,
  assertGeneratedCompositionDirectExecutionV1,
  buildGeneratedCompositionAssessmentFailureV1,
  buildGeneratedCompositionBenchmarkExecutionV1,
  buildGeneratedCompositionBenchmarkSandboxResourcesV1,
  buildGeneratedCompositionModelBenchmarkPlanV1,
  classifyGeneratedCompositionBenchmarkExecutionErrorV1,
  runGeneratedCompositionSourceProviderCallV1,
} from '../lib/editron/research/open-ended-planner/generated-composition-model-benchmark-v1';
import { materializeGeneratedCompositionLocalEvidenceV1 } from '../lib/editron/research/open-ended-planner/generated-composition-local-evidence-v1';
import { verifyGeneratedCompositionProgramV1 } from '../lib/editron/research/open-ended-planner/generated-composition-program-verifier-v1';
import { buildGeneratedCompositionSandboxRequestV1 } from '../lib/editron/research/open-ended-planner/generated-composition-sandbox-contract-v1';
import {
  executeGeneratedCompositionInSandboxV1,
  resolveGeneratedCompositionSandboxOverlayV1,
} from '../lib/editron/research/open-ended-planner/generated-composition-sandbox-runner-v1';
import {
  DEV02_GENERATED_COMPOSITION_BLUEPRINT_V1,
  DEV02_GENERATED_COMPOSITION_EVIDENCE_PACK_V1,
  DEV02_GENERATED_COMPOSITION_SUPPLEMENTAL_FACTS_V1,
} from '../tests/fixtures/editron/open-ended-planner-v2/dev02-generated-composition-program-v1';

const execFileAsync = promisify(execFile);
const repoRoot = process.cwd();
const evidenceRoot = path.resolve(repoRoot, '.calibration-temp', 'open-ended-planner-v2', 'generated-composition-model-benchmark');

async function main(): Promise<void> {
  loadEnvironment();
  const apiPath = path.join(repoRoot, 'lib', 'editron', 'research', 'open-ended-planner', 'generated-composition-api-v1.tsx');
  const apiImplementationHash = await shaFile(apiPath);
  const plan = await buildGeneratedCompositionModelBenchmarkPlanV1(apiImplementationHash);
  const args = process.argv.slice(2);
  if (args.includes('--print-plan')) return void process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
  const output = boundedOutput(value(args, '--output'));
  const execution = buildGeneratedCompositionBenchmarkExecutionV1(plan, {
    trialId: value(args, '--trial-id'),
    routeIds: value(args, '--route-ids').split(',').map((routeId) => routeId.trim()),
  });
  assertGeneratedCompositionDirectExecutionV1(plan, execution);
  const maxSpend = Number(value(args, '--max-spend-usd'));
  if (value(args, '--plan-hash') !== plan.planHash) throw new Error('MODEL_BENCHMARK_PLAN_HASH_MISMATCH');
  if (!Number.isFinite(maxSpend) || maxSpend < execution.maximumAuthorizedSpendUsd) throw new Error('MODEL_BENCHMARK_SPEND_NOT_AUTHORIZED');
  const operatorId = value(args, '--operator-id').trim();
  if (!operatorId) throw new Error('MODEL_BENCHMARK_OPERATOR_ID_INVALID');
  if (existsSync(output)) throw new Error('MODEL_BENCHMARK_OUTPUT_ALREADY_EXISTS');
  const runRoot = path.join(path.dirname(output), execution.evidenceDirectoryName);
  await fs.mkdir(path.dirname(runRoot), { recursive: true });
  try {
    await fs.mkdir(runRoot, { recursive: false });
  } catch (error) {
    if (isAlreadyExistsError(error)) throw new Error('MODEL_BENCHMARK_EVIDENCE_ALREADY_EXISTS');
    throw error;
  }
  await writeJson(path.join(runRoot, 'plan.json'), plan);
  await writeJson(path.join(runRoot, 'execution.json'), execution);

  const runnerImplementationHash = await shaFile(path.join(repoRoot, 'scripts', 'run-generated-composition-model-benchmark-v1.ts'));
  const runtime = await loadRuntimeInputs(apiImplementationHash, runnerImplementationHash, runRoot);
  const rows = [];
  let actualProviderCostUsd = 0;
  const selectedRouteIds = new Set(execution.routeIds);
  for (const route of plan.routes.filter(({ routeId }) => selectedRouteIds.has(routeId))) {
    if (route.executionAdapter !== 'DIRECT_PROVIDER') {
      throw new Error('MODEL_BENCHMARK_AGENT_SHELL_ROUTE_REQUIRES_SEPARATE_RUNNER');
    }
    const row = await runRoute(route, runtime, runRoot, (cost) => {
      actualProviderCostUsd = Number((actualProviderCostUsd + cost).toFixed(12));
      if (actualProviderCostUsd > maxSpend) throw new Error('MODEL_BENCHMARK_AGGREGATE_SPEND_EXCEEDED');
    });
    rows.push(row);
    process.stdout.write(`${JSON.stringify({ routeId: route.routeId, outcome: row.outcome, repairsUsed: row.repairsUsed })}\n`);
  }
  const material = {
    receiptVersion: 'EDITRON_GENERATED_COMPOSITION_MODEL_BENCHMARK_RECEIPT_V2',
    authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION', planHash: plan.planHash, execution,
    operatorConfirmation: { operatorId, confirmedAt: new Date().toISOString(), maxSpend },
    runtime: runtime.identity, rows, exclusions: plan.exclusions, actualProviderCostUsd, stateEffects: [],
  };
  const receipt = { ...material, receiptHash: hashCanonicalJsonV1(material) };
  await writeJson(output, receipt);
  process.stdout.write(`${JSON.stringify({ output, planHash: plan.planHash, receiptHash: receipt.receiptHash, actualProviderCostUsd })}\n`);
}

async function runRoute(
  route: GeneratedCompositionDirectBenchmarkRouteV1,
  runtime: Awaited<ReturnType<typeof loadRuntimeInputs>>,
  runRoot: string,
  addCost: (cost: number) => void,
) {
  const routeRoot = path.join(runRoot, route.routeId.toLowerCase());
  await fs.mkdir(routeRoot, { recursive: true });
  const calls = [];
  let repair: GeneratedCompositionModelRepairV1 | undefined;
  for (const candidateOrdinal of [0, 1] as const) {
    const artifact = buildDev02GeneratedCompositionModelPacketV1({ apiImplementationHash: runtime.identity.apiImplementationHash, ...(repair ? { repair } : {}) });
    const packetPath = path.join(routeRoot, `provider-packet-${candidateOrdinal}.json`);
    await writeJson(packetPath, artifact);
    const call = await runGeneratedCompositionSourceProviderCallV1({
      artifact, route, apiKey: providerKey(route),
    });
    const callCost = call.run.attempts.reduce((sum, attempt) => sum + (attempt.providerCostUsd ?? 0), 0);
    addCost(callCost);
    const callPath = path.join(routeRoot, `provider-call-${candidateOrdinal}.json`);
    await writeJson(callPath, call);
    calls.push({
      packet: { path: relative(runRoot, packetPath), hash: hashCanonicalJsonV1(artifact) },
      path: relative(runRoot, callPath), hash: hashCanonicalJsonV1(call), disposition: call.run.disposition, costUsd: callCost,
    });
    if (call.run.disposition !== 'ARTIFACT_ACCEPTED' || typeof call.run.artifact?.source !== 'string') {
      return { routeId: route.routeId, requestedModel: route.requestModel, outcome: `PROVIDER_${call.run.disposition}`, repairsUsed: candidateOrdinal, calls, stateEffects: [] };
    }
    const acceptedAttempt = [...call.run.attempts].reverse().find(({ disposition }) => disposition === 'ARTIFACT_ACCEPTED');
    if (!acceptedAttempt?.promptHash) throw new Error(`MODEL_BENCHMARK_ACCEPTED_PROMPT_HASH_MISSING:${route.routeId}`);
    const modelId = acceptedAttempt.providerModel ?? route.claimedBenchmarkIdentity;
    const candidate = materializeDev02GeneratedCompositionModelCandidateV1({
      source: call.run.artifact.source, modelId, promptHash: acceptedAttempt.promptHash, candidateOrdinal,
    });
    const candidateRoot = path.join(routeRoot, `candidate-${candidateOrdinal}`);
    await fs.mkdir(candidateRoot, { recursive: true });
    await Promise.all([
      fs.writeFile(path.join(candidateRoot, 'GeneratedComposition.tsx'), call.run.artifact.source, 'utf8'),
      writeJson(path.join(candidateRoot, 'program.json'), candidate.program),
      writeJson(path.join(candidateRoot, 'source-bundle.json'), candidate.sourceBundle),
    ]);
    const verification = verifyGeneratedCompositionProgramV1({
      ...candidate, evidencePack: DEV02_GENERATED_COMPOSITION_EVIDENCE_PACK_V1,
      referenceBlueprint: DEV02_GENERATED_COMPOSITION_BLUEPRINT_V1,
      supplementalFacts: DEV02_GENERATED_COMPOSITION_SUPPLEMENTAL_FACTS_V1,
    });
    await writeJson(path.join(candidateRoot, 'contract-verification.json'), verification);
    if (verification.disposition !== 'CONTRACT_PASS') {
      await persistAssessmentFailure(candidateRoot, route, candidateOrdinal, candidate, 'CONTRACT_VERIFIER', 'INVALID_PLAN', verification.diagnostics);
      if (candidateOrdinal === 1) return terminal(route, 'INVALID_PLAN', calls, 1, verification.diagnostics);
      repair = repairInput('CONTRACT_VERIFIER', verification.diagnostics, call.run.artifact.source);
      continue;
    }
    try {
      const assessed = await assessCandidate(candidate, runtime, candidateRoot, route.routeId, candidateOrdinal);
      if (assessed.proof.hardGateDisposition === 'PASS') {
        return { routeId: route.routeId, requestedModel: route.requestModel, providerModel: modelId, outcome: 'HARD_GATES_PASS', repairsUsed: candidateOrdinal, calls, assessment: assessed.summary, stateEffects: [] };
      }
      const diagnostics = assessed.proof.checks.filter(({ status }) => status === 'FAIL').map(({ checkId, reason, metrics }) => `${checkId}:${reason}:${JSON.stringify(metrics)}`);
      await persistAssessmentFailure(candidateRoot, route, candidateOrdinal, candidate, 'RENDERED_HARD_GATE', 'QUALITY_FAIL', diagnostics);
      if (candidateOrdinal === 1) return terminal(route, 'QUALITY_FAIL', calls, 1, diagnostics);
      repair = repairInput('RENDERED_HARD_GATE', diagnostics, call.run.artifact.source);
    } catch (error) {
      const failureClass = classifyGeneratedCompositionBenchmarkExecutionErrorV1(error);
      const diagnostics = [`${failureClass}:${boundedError(error)}`];
      await persistAssessmentFailure(candidateRoot, route, candidateOrdinal, candidate, 'SANDBOX_RENDER', failureClass, diagnostics);
      if (failureClass === 'SANDBOX_INFRASTRUCTURE_FAIL' || candidateOrdinal === 1) {
        return terminal(route, failureClass, calls, candidateOrdinal, diagnostics);
      }
      repair = repairInput('SANDBOX_RENDER', diagnostics, call.run.artifact.source);
    }
  }
  throw new Error(`MODEL_BENCHMARK_ROUTE_LOOP_EXHAUSTED:${route.routeId}`);
}

async function assessCandidate(
  candidate: ReturnType<typeof materializeDev02GeneratedCompositionModelCandidateV1>,
  runtime: Awaited<ReturnType<typeof loadRuntimeInputs>>,
  root: string,
  routeId: string,
  ordinal: 0 | 1,
) {
  const request = buildGeneratedCompositionSandboxRequestV1({
    executionId: `${routeId.toLowerCase()}-${ordinal}-${Date.now()}`, createdAt: new Date().toISOString(),
    appCommit: runtime.identity.snapshotCommit, apiImplementationHash: runtime.identity.apiImplementationHash,
    workerImplementationHash: runtime.identity.workerImplementationHash,
    ...candidate, evidencePack: DEV02_GENERATED_COMPOSITION_EVIDENCE_PACK_V1,
    referenceBlueprint: DEV02_GENERATED_COMPOSITION_BLUEPRINT_V1,
    supplementalFacts: DEV02_GENERATED_COMPOSITION_SUPPLEMENTAL_FACTS_V1,
    proofFrames: [0, 24, 108, 144, 145, 179], inputs: runtime.inputs,
    resources: buildGeneratedCompositionBenchmarkSandboxResourcesV1(candidate.program),
  });
  await writeJson(path.join(root, 'sandbox-request-summary.json'), {
    ...request,
    inputs: request.inputs.map(({ data: _data, ...item }) => ({ ...item, dataDisposition: 'OMITTED_HASH_BOUND' })),
  });
  const executed = await executeGeneratedCompositionInSandboxV1({ request, repoRoot });
  const materialized = await materializeGeneratedCompositionLocalEvidenceV1({
    candidateRoot: root,
    workerResult: executed.workerResult,
    hostReceipt: executed.receipt,
    outputBytes: executed.outputBytes,
  });
  const proof = await evaluateDev02GeneratedCompositionRenderedProofV1({
    program: candidate.program,
    proxyReceipt: materialized.localEvaluationReceipt,
    authoritativeProxyReceiptHash: materialized.originalProxyReceiptHash,
    boundaryReferencePath: runtime.identity.boundaryReferencePath,
  });
  await Promise.all([
    writeJson(path.join(root, 'sandbox-worker-result.json'), executed.workerResult),
    writeJson(path.join(root, 'sandbox-host-receipt.json'), executed.receipt),
    writeJson(path.join(root, 'rendered-proof.json'), proof),
  ]);
  return {
    proof,
    summary: { requestId: request.requestId, hostReceiptHash: executed.receipt.receiptHash, proofHash: proof.proofHash, hardGateDisposition: proof.hardGateDisposition, technicalDisposition: proof.technicalDisposition, creativeDisposition: proof.creativeDisposition },
  };
}

async function loadRuntimeInputs(apiImplementationHash: string, runnerImplementationHash: string, runRoot: string) {
  const mediaRoot = path.join(repoRoot, '.calibration-temp', 'open-ended-planner-v2', 'development-media');
  const widePath = path.join(mediaRoot, 'dev02-wide.mp4'); const closePath = path.join(mediaRoot, 'dev02-close.mp4');
  const fontPath = path.join(repoRoot, 'node_modules', 'next', 'dist', 'compiled', '@vercel', 'og', 'noto-sans-v27-latin-regular.ttf');
  const boundaryReferencePath = path.join(runRoot, 'boundary-reference-source-frame-0180.png');
  await execFileAsync('ffmpeg', ['-y', '-v', 'error', '-i', closePath, '-vf', 'select=eq(n\\,180),scale=1080:1920:flags=lanczos', '-frames:v', '1', boundaryReferencePath]);
  const [wide, close, font, overlay, boundaryHash] = await Promise.all([
    fs.readFile(widePath), fs.readFile(closePath), fs.readFile(fontPath), resolveGeneratedCompositionSandboxOverlayV1(repoRoot), shaFile(boundaryReferencePath),
  ]);
  const snapshotCommit = requiredEnv('MG_RENDER_SANDBOX_APP_COMMIT');
  return {
    identity: { apiImplementationHash, runnerImplementationHash, workerImplementationHash: overlay.workerImplementationHash, snapshotCommit, snapshotId: requiredEnv('MG_RENDER_SANDBOX_SNAPSHOT_ID'), boundaryReferencePath, boundaryReferenceSha256: boundaryHash },
    inputs: [
      { kind: 'SOURCE_MEDIA' as const, bindingId: 'dev02-wide', fileName: 'dev02-wide.mp4', bytes: wide },
      { kind: 'SOURCE_MEDIA' as const, bindingId: 'dev02-close', fileName: 'dev02-close.mp4', bytes: close },
      { kind: 'FONT' as const, bindingId: 'font-noto-sans-v27-regular', fileName: 'noto-sans.ttf', bytes: font },
    ],
  };
}

function repairInput(failureStage: GeneratedCompositionModelRepairV1['failureStage'], diagnostics: readonly string[], priorSource: string): GeneratedCompositionModelRepairV1 {
  return { repairOrdinal: 1, failureStage, diagnostics: diagnostics.map((value) => value.slice(0, 500)).slice(0, 64), priorSource };
}
async function persistAssessmentFailure(
  root: string,
  route: GeneratedCompositionDirectBenchmarkRouteV1,
  candidateOrdinal: 0 | 1,
  candidate: ReturnType<typeof materializeDev02GeneratedCompositionModelCandidateV1>,
  failureStage: GeneratedCompositionModelRepairV1['failureStage'],
  failureClass: GeneratedCompositionAssessmentFailureClassV1,
  diagnostics: readonly string[],
): Promise<void> {
  await writeJson(path.join(root, 'assessment-failure.json'), buildGeneratedCompositionAssessmentFailureV1({
    routeId: route.routeId,
    candidateOrdinal,
    failureStage,
    failureClass,
    observedAt: new Date().toISOString(),
    programHash: hashCanonicalJsonV1(candidate.program),
    sourceBundleHash: candidate.program.sourceBundleHash,
    diagnostics,
  }));
}
function terminal(route: GeneratedCompositionDirectBenchmarkRouteV1, outcome: string, calls: unknown[], repairsUsed: number, diagnostics: readonly string[]) { return { routeId: route.routeId, requestedModel: route.requestModel, outcome, repairsUsed, calls, diagnostics, stateEffects: [] }; }
function providerKey(route: GeneratedCompositionDirectBenchmarkRouteV1): string {
  if (route.provider === 'openai') return requiredEnv('OPENAI_API_KEY');
  if (route.provider === 'google') return requiredEnv('GEMINI_API_KEY');
  if (route.provider === 'openrouter') return requiredEnv('OPENROUTER_API_KEY');
  throw new Error(`MODEL_BENCHMARK_PROVIDER_UNSUPPORTED:${route.provider}`);
}
function loadEnvironment(): void { loadEnv({ path: path.join(repoRoot, '.env.local'), override: false, quiet: true }); loadEnv({ path: path.join(repoRoot, '.env.local.vercel'), override: false, quiet: true }); const fresh = path.join(repoRoot, '.calibration-temp', 'vercel-sandbox-env.local'); if (existsSync(fresh)) { const value = parseEnv(readFileSync(fresh)).VERCEL_OIDC_TOKEN; if (value) process.env.VERCEL_OIDC_TOKEN = value; } }
function value(args: string[], name: string): string { const index = args.indexOf(name); const result = index < 0 ? '' : args[index + 1] ?? ''; if (!result || result.startsWith('--')) throw new Error(`${name} is required`); return result; }
function boundedOutput(raw: string): string { const output = path.resolve(raw); if (!output.endsWith('.json') || !(output === evidenceRoot || output.startsWith(evidenceRoot + path.sep))) throw new Error('MODEL_BENCHMARK_OUTPUT_OUTSIDE_EVIDENCE_ROOT'); return output; }
function requiredEnv(name: string): string { const value = process.env[name]?.trim(); if (!value) throw new Error(`MODEL_BENCHMARK_ENV_MISSING:${name}`); return value; }
function boundedError(error: unknown): string { const message = (error instanceof Error ? error.message : String(error)).trim(); return (message || 'UNKNOWN_ERROR_WITHOUT_MESSAGE').slice(0, 500); }
function isAlreadyExistsError(error: unknown): boolean { return error instanceof Error && 'code' in error && error.code === 'EEXIST'; }
function relative(root: string, target: string): string { return path.relative(root, target).replaceAll('\\', '/'); }
async function writeJson(file: string, value: unknown): Promise<void> { const partial = `${file}.partial`; await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(partial, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); await fs.rm(file, { force: true }); await fs.rename(partial, file); }
async function shaFile(file: string): Promise<string> { return createHash('sha256').update(await fs.readFile(file)).digest('hex'); }

main().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`); process.exitCode = 1; });
