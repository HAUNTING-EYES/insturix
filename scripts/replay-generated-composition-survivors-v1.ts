import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, promises as fs, readFileSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

import { parse as parseEnv } from 'dotenv';

import { hashCanonicalJsonV1 } from '../lib/editron/research/open-ended-planner/contracts-v1';
import { buildGeneratedCompositionBlindReviewPackV1 } from '../lib/editron/research/open-ended-planner/generated-composition-blind-review-v1';
import { evaluateDev02GeneratedCompositionRenderedProofV1 } from '../lib/editron/research/open-ended-planner/generated-composition-dev02-rendered-proof-v1';
import { materializeGeneratedCompositionLocalEvidenceV1 } from '../lib/editron/research/open-ended-planner/generated-composition-local-evidence-v1';
import { applyDev02HostExecutionPolicyCorrectionV1 } from '../lib/editron/research/open-ended-planner/generated-composition-model-candidate-v1';
import type { GeneratedCompositionProgramV1, GeneratedCompositionSourceBundleV1 } from '../lib/editron/research/open-ended-planner/generated-composition-program-v1';
import { verifyGeneratedCompositionProgramV1 } from '../lib/editron/research/open-ended-planner/generated-composition-program-verifier-v1';
import { buildGeneratedCompositionSandboxRequestV1 } from '../lib/editron/research/open-ended-planner/generated-composition-sandbox-contract-v1';
import { executeGeneratedCompositionInSandboxV1, resolveGeneratedCompositionSandboxOverlayV1 } from '../lib/editron/research/open-ended-planner/generated-composition-sandbox-runner-v1';
import { DEV02_GENERATED_COMPOSITION_BLUEPRINT_V1, DEV02_GENERATED_COMPOSITION_EVIDENCE_PACK_V1, DEV02_GENERATED_COMPOSITION_SUPPLEMENTAL_FACTS_V1 } from '../tests/fixtures/editron/open-ended-planner-v2/dev02-generated-composition-program-v1';

const execFileAsync = promisify(execFile);
const repoRoot = process.cwd();
const benchmarkRoot = path.resolve(repoRoot, '.calibration-temp', 'open-ended-planner-v2', 'generated-composition-model-benchmark');
const sourceRunRoot = path.join(benchmarkRoot, 'evidence-5ce9a559f33445da');
const sourceReceiptPath = path.join(benchmarkRoot, 'receipt-2026-08-14.json');
const candidates = [
  { sourceCandidateId: 'OPENAI_TERRA_CANDIDATE_0', relativeRoot: 'openai_terra/candidate-0', candidateOrdinal: 0 as const },
  { sourceCandidateId: 'GOOGLE_FLASH_CANDIDATE_1', relativeRoot: 'google_flash/candidate-1', candidateOrdinal: 1 as const },
] as const;

async function main(): Promise<void> {
  const args = process.argv.slice(2); const operatorId = requiredArgument(args, '--operator-id');
  const expectedSourceReceiptHash = requiredArgument(args, '--source-receipt-hash');
  const sourceReceipt = await verifiedJsonReceipt(sourceReceiptPath);
  if (sourceReceipt.receiptHash !== expectedSourceReceiptHash) throw new Error('SURVIVOR_REPLAY_SOURCE_RECEIPT_HASH_MISMATCH');
  const sandboxEnv = loadSandboxEnvironment();
  const apiPath = path.join(repoRoot, 'lib', 'editron', 'research', 'open-ended-planner', 'generated-composition-api-v1.tsx');
  const [apiImplementationHash, runnerImplementationHash, overlay] = await Promise.all([
    shaFile(apiPath), shaFile(path.join(repoRoot, 'scripts', 'replay-generated-composition-survivors-v1.ts')), resolveGeneratedCompositionSandboxOverlayV1(repoRoot),
  ]);
  const replayRoot = path.join(benchmarkRoot, `playable-replay-${overlay.workerImplementationHash.slice(0, 16)}`);
  await fs.mkdir(replayRoot);
  const startedAt = new Date().toISOString();
  const runtime = await loadRuntime(replayRoot, apiImplementationHash, overlay.workerImplementationHash, sandboxEnv);
  const rows = [];
  for (const candidate of candidates) rows.push(await replayCandidate(candidate, replayRoot, runtime));
  const blindReview = await buildGeneratedCompositionBlindReviewPackV1({
    outputRoot: path.join(replayRoot, 'blind-review'), createdAt: new Date().toISOString(),
    candidates: [rows[0].blindInput, rows[1].blindInput],
  });
  const material = {
    artifactType: 'GeneratedCompositionSurvivorReplayReceiptV1' as const,
    authority: 'RESEARCH_ONLY_NO_PROVIDER_CALL_NO_PROJECT_MUTATION' as const,
    operatorConfirmation: { operatorId, confirmedAt: startedAt },
    sourceRunReceiptHash: sourceReceipt.receiptHash,
    implementation: { apiImplementationHash, runnerImplementationHash, workerImplementationHash: overlay.workerImplementationHash, snapshotId: sandboxEnv.snapshotId, snapshotCommit: sandboxEnv.snapshotCommit },
    providerCalls: [] as const,
    rows: rows.map(({ blindInput: _blindInput, ...row }) => row),
    blindReview: { reviewStatus: blindReview.reviewStatus, reviewerManifestPath: blindReview.reviewerManifestPath, reviewFormTemplatePath: blindReview.reviewFormTemplatePath, operatorKeyPath: blindReview.operatorKeyPath, publicPackHash: blindReview.publicPackHash, operatorKeyHash: blindReview.operatorKeyHash, candidateVideos: blindReview.candidateVideos },
    stateEffects: [] as const,
  };
  const receipt = { ...material, receiptHash: hashCanonicalJsonV1(material) };
  const receiptPath = path.join(replayRoot, 'replay-receipt.json');
  await writeExclusiveJson(receiptPath, receipt);
  process.stdout.write(`${JSON.stringify({ receiptPath, receiptHash: receipt.receiptHash, publicPackHash: blindReview.publicPackHash, reviewStatus: blindReview.reviewStatus, providerCalls: 0, stateEffects: [] })}\n`);
}

async function replayCandidate(candidate: typeof candidates[number], replayRoot: string, runtime: Awaited<ReturnType<typeof loadRuntime>>) {
  const sourceRoot = path.resolve(sourceRunRoot, ...candidate.relativeRoot.split('/'));
  if (!sourceRoot.startsWith(sourceRunRoot + path.sep)) throw new Error('SURVIVOR_REPLAY_SOURCE_PATH_ESCAPE');
  const [sourceProgram, historicalSourceBundle] = await Promise.all([
    readJson<GeneratedCompositionProgramV1>(path.join(sourceRoot, 'program.json')),
    readJson<GeneratedCompositionSourceBundleV1>(path.join(sourceRoot, 'source-bundle.json')),
  ]);
  const corrected = applyDev02HostExecutionPolicyCorrectionV1({
    sourceProgram, sourceBundle: historicalSourceBundle, candidateOrdinal: candidate.candidateOrdinal,
  });
  const { program, sourceBundle, amendment } = corrected;
  const verification = verifyGeneratedCompositionProgramV1({ program, sourceBundle, evidencePack: DEV02_GENERATED_COMPOSITION_EVIDENCE_PACK_V1, referenceBlueprint: DEV02_GENERATED_COMPOSITION_BLUEPRINT_V1, supplementalFacts: DEV02_GENERATED_COMPOSITION_SUPPLEMENTAL_FACTS_V1 });
  if (verification.disposition !== 'CONTRACT_PASS' || !verification.programHash) throw new Error(`SURVIVOR_REPLAY_CONTRACT_FAILED:${candidate.sourceCandidateId}:${verification.diagnostics.join(',')}`);
  const candidateRoot = path.join(replayRoot, candidate.sourceCandidateId.toLowerCase()); await fs.mkdir(candidateRoot);
  await Promise.all([
    fs.copyFile(path.join(sourceRoot, 'GeneratedComposition.tsx'), path.join(candidateRoot, 'GeneratedComposition.tsx')),
    writeExclusiveJson(path.join(candidateRoot, 'source-program.json'), sourceProgram),
    writeExclusiveJson(path.join(candidateRoot, 'program.json'), program),
    writeExclusiveJson(path.join(candidateRoot, 'source-bundle.json'), sourceBundle),
    writeExclusiveJson(path.join(candidateRoot, 'host-policy-amendment.json'), amendment),
    writeExclusiveJson(path.join(candidateRoot, 'contract-verification.json'), verification),
  ]);
  const request = buildGeneratedCompositionSandboxRequestV1({
    executionId: `survivor-replay-${candidate.sourceCandidateId.toLowerCase()}-${runtime.workerImplementationHash.slice(0, 12)}`,
    createdAt: new Date().toISOString(), appCommit: runtime.snapshotCommit, apiImplementationHash: runtime.apiImplementationHash,
    workerImplementationHash: runtime.workerImplementationHash, program, sourceBundle,
    evidencePack: DEV02_GENERATED_COMPOSITION_EVIDENCE_PACK_V1, referenceBlueprint: DEV02_GENERATED_COMPOSITION_BLUEPRINT_V1,
    supplementalFacts: DEV02_GENERATED_COMPOSITION_SUPPLEMENTAL_FACTS_V1, proofFrames: [0, 24, 108, 144, 145, 179], inputs: runtime.inputs,
    resources: { wallTimeMs: program.resourceBudget.maxWallTimeMs, maxCpuMs: program.resourceBudget.maxCpuMs, vcpus: 1, memoryMiB: 2_048, maxOutputBytes: 64 * 1_024 * 1_024 },
  });
  await writeExclusiveJson(path.join(candidateRoot, 'sandbox-request-summary.json'), { ...request, inputs: request.inputs.map(({ data: _data, ...item }) => ({ ...item, dataDisposition: 'OMITTED_HASH_BOUND' })) });
  const executed = await executeGeneratedCompositionInSandboxV1({
    request,
    repoRoot,
    env: { MG_RENDER_SANDBOX_SNAPSHOT_ID: runtime.snapshotId, MG_RENDER_SANDBOX_APP_COMMIT: runtime.snapshotCommit },
  });
  const localEvidence = await materializeGeneratedCompositionLocalEvidenceV1({ candidateRoot, workerResult: executed.workerResult, hostReceipt: executed.receipt, outputBytes: executed.outputBytes });
  const proof = await evaluateDev02GeneratedCompositionRenderedProofV1({ program, proxyReceipt: localEvidence.localEvaluationReceipt, authoritativeProxyReceiptHash: localEvidence.originalProxyReceiptHash, boundaryReferencePath: runtime.boundaryReferencePath });
  await Promise.all([
    writeExclusiveJson(path.join(candidateRoot, 'sandbox-worker-result.json'), executed.workerResult),
    writeExclusiveJson(path.join(candidateRoot, 'sandbox-host-receipt.json'), executed.receipt),
    writeExclusiveJson(path.join(candidateRoot, 'rendered-proof.json'), proof),
  ]);
  const video = localEvidence.bindings.find(({ kind }) => kind === 'PLAYABLE_PROXY');
  if (!video) throw new Error(`SURVIVOR_REPLAY_PLAYABLE_PROXY_MISSING:${candidate.sourceCandidateId}`);
  return {
    sourceCandidateId: candidate.sourceCandidateId, modelIdentity: program.generator.modelId,
    sourceProgramHash: amendment.sourceProgramHash, programHash: verification.programHash, hostPolicyAmendment: amendment,
    requestId: request.requestId, hostReceiptHash: executed.receipt.receiptHash, originalProxyReceiptHash: localEvidence.originalProxyReceiptHash,
    localEvidenceHash: localEvidence.evidenceHash, proofHash: proof.proofHash, hardGateDisposition: proof.hardGateDisposition,
    technicalDisposition: proof.technicalDisposition, creativeDisposition: proof.creativeDisposition, videoSha256: video.contentSha256,
    blindInput: { sourceCandidateId: candidate.sourceCandidateId, modelIdentity: program.generator.modelId, programHash: verification.programHash, hostReceiptHash: executed.receipt.receiptHash, proofHash: proof.proofHash, videoPath: video.localPath, videoSha256: video.contentSha256 },
  };
}

async function loadRuntime(replayRoot: string, apiImplementationHash: string, workerImplementationHash: string, sandboxEnv: { snapshotId: string; snapshotCommit: string }) {
  const mediaRoot = path.join(repoRoot, '.calibration-temp', 'open-ended-planner-v2', 'development-media');
  const widePath = path.join(mediaRoot, 'dev02-wide.mp4'); const closePath = path.join(mediaRoot, 'dev02-close.mp4');
  const fontPath = path.join(repoRoot, 'node_modules', 'next', 'dist', 'compiled', '@vercel', 'og', 'noto-sans-v27-latin-regular.ttf');
  const boundaryReferencePath = path.join(replayRoot, 'boundary-reference-source-frame-0180.png');
  await execFileAsync('ffmpeg', ['-y', '-v', 'error', '-i', closePath, '-vf', 'select=eq(n\\,180),scale=1080:1920:flags=lanczos', '-frames:v', '1', boundaryReferencePath], { windowsHide: true });
  const [wide, close, font] = await Promise.all([fs.readFile(widePath), fs.readFile(closePath), fs.readFile(fontPath)]);
  return { apiImplementationHash, workerImplementationHash, ...sandboxEnv, boundaryReferencePath, inputs: [
    { kind: 'SOURCE_MEDIA' as const, bindingId: 'dev02-wide', fileName: 'dev02-wide.mp4', bytes: wide },
    { kind: 'SOURCE_MEDIA' as const, bindingId: 'dev02-close', fileName: 'dev02-close.mp4', bytes: close },
    { kind: 'FONT' as const, bindingId: 'font-noto-sans-v27-regular', fileName: 'noto-sans.ttf', bytes: font },
  ] };
}

function loadSandboxEnvironment(): { snapshotId: string; snapshotCommit: string } {
  const vercelEnv = parsedEnv(path.join(repoRoot, '.env.local.vercel')); const freshEnv = parsedEnv(path.join(repoRoot, '.calibration-temp', 'vercel-sandbox-env.local'));
  const oidc = freshEnv.VERCEL_OIDC_TOKEN || vercelEnv.VERCEL_OIDC_TOKEN;
  if (!oidc) throw new Error('SURVIVOR_REPLAY_VERCEL_OIDC_TOKEN_MISSING'); process.env.VERCEL_OIDC_TOKEN = oidc;
  const snapshotId = vercelEnv.MG_RENDER_SANDBOX_SNAPSHOT_ID; const snapshotCommit = vercelEnv.MG_RENDER_SANDBOX_APP_COMMIT;
  if (!snapshotId || !snapshotCommit) throw new Error('SURVIVOR_REPLAY_SANDBOX_IDENTITY_MISSING');
  return { snapshotId, snapshotCommit };
}
function parsedEnv(filePath: string): Record<string, string> { return existsSync(filePath) ? parseEnv(readFileSync(filePath)) : {}; }
function requiredArgument(args: string[], name: string): string { const index = args.indexOf(name); const value = index < 0 ? '' : args[index + 1] ?? ''; if (!value || value.startsWith('--')) throw new Error(`${name} is required`); return value; }
async function verifiedJsonReceipt(filePath: string): Promise<Record<string, any>> { const receipt = await readJson<Record<string, any>>(filePath); const { receiptHash, ...unsigned } = receipt; if (!/^[a-f0-9]{64}$/.test(receiptHash) || receiptHash !== hashCanonicalJsonV1(unsigned)) throw new Error('SURVIVOR_REPLAY_SOURCE_RECEIPT_INVALID'); return receipt; }
async function readJson<T>(filePath: string): Promise<T> { return JSON.parse(await fs.readFile(filePath, 'utf8')) as T; }
async function writeExclusiveJson(filePath: string, value: unknown): Promise<void> { await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' }); }
async function shaFile(filePath: string): Promise<string> { return createHash('sha256').update(await fs.readFile(filePath)).digest('hex'); }

main().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`); process.exitCode = 1; });
