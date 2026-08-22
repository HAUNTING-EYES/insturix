import { createHash, randomBytes } from 'node:crypto';
import { constants as fsConstants, createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';

import { hashCanonicalJsonV1 } from './contracts-v1';
import {
  DEV02_FORCED_NATIVE_BASELINE_HASH_V1, DEV02_FORCED_NATIVE_BASELINE_V1,
  DEV02_FORCED_NATIVE_BASELINE_VERSION_V1,
} from './dev02-forced-native-baseline-v1';
import type { Dev02ForcedNativeExecutionReceiptV1 } from './dev02-forced-native-renderer-v1';
import {
  DEV02_HYBRID_STAGE6_VERSION_V2, hasValidDev02HybridStage6ReceiptHashV2,
  type Dev02HybridStage6ReceiptV2,
} from './dev02-hybrid-stage6-contract-v2';
import { DEV02_RENDERED_PROOF_POLICY_V1 } from './generated-composition-dev02-rendered-proof-v1';
import { DEV02_GENERATED_COMPOSITION_PROGRAM_V1 } from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-generated-composition-program-v1';

export const DEV02_ROUTE_COMPARISON_VERSION_V1 = 'EDITRON_OE_DEV02_ROUTE_COMPARISON_BLIND_V1' as const;
type CandidateAlias = 'candidate-a' | 'candidate-b';
type RouteId = 'FORCED_NATIVE' | 'GENERATED_HYBRID';

interface ValidatedCandidate {
  routeId: RouteId; receiptHash: string; videoPath: string; videoSha256: string; videoByteLength: number;
  technicalFacts: Readonly<Record<string, number | boolean | string>>;
}

export interface Dev02RouteComparisonBlindPackV1 {
  schemaVersion: typeof DEV02_ROUTE_COMPARISON_VERSION_V1;
  taskId: 'DEV-02'; createdAt: string; reviewStatus: 'AWAITING_SOLE_REVIEWER_EXPLORATORY_REVIEW';
  reviewerManifestPath: string; reviewFormTemplatePath: string; operatorKeyPath: string;
  technicalComparisonPath: string; publicPackHash: string; operatorKeyHash: string; technicalComparisonHash: string;
  candidateVideos: readonly { candidateId: CandidateAlias; path: string; sha256: string }[];
  stateEffects: readonly [];
}

export async function buildDev02RouteComparisonBlindPackV1(input: {
  outputRoot: string; createdAt: string; nativeReceiptPath: string; hybridReceiptPath: string;
  randomSource?: (size: number) => Uint8Array;
}): Promise<Readonly<Dev02RouteComparisonBlindPackV1>> {
  if (new Date(input.createdAt).toISOString() !== input.createdAt) throw new Error('DEV02_ROUTE_COMPARISON_TIMESTAMP_INVALID');
  const [native, hybrid] = await Promise.all([
    validateNative(input.nativeReceiptPath), validateHybrid(input.hybridReceiptPath),
  ]);
  const outputRoot = path.resolve(input.outputRoot); await fs.mkdir(path.dirname(outputRoot), { recursive: true }); await fs.mkdir(outputRoot);
  const reviewerRoot = path.join(outputRoot, 'reviewer'); const operatorRoot = path.join(outputRoot, 'operator-only');
  await Promise.all([fs.mkdir(reviewerRoot), fs.mkdir(operatorRoot)]);
  const entropy = Buffer.from((input.randomSource ?? randomBytes)(32));
  if (entropy.byteLength !== 32) throw new Error('DEV02_ROUTE_COMPARISON_RANDOM_SOURCE_INVALID');
  const ordered = deterministicShuffle([native, hybrid], entropy); const aliases: readonly CandidateAlias[] = ['candidate-a', 'candidate-b'];
  const publicCandidates = []; const mappings = [];
  for (let index = 0; index < aliases.length; index += 1) {
    const alias = aliases[index]; const candidate = ordered[index]; const destination = path.join(reviewerRoot, `${alias}.mp4`);
    await fs.copyFile(candidate.videoPath, destination, fsConstants.COPYFILE_EXCL);
    const commitment = sha256(Buffer.concat([entropy, Buffer.from(alias), Buffer.from(candidate.videoSha256, 'hex'), Buffer.from(candidate.receiptHash, 'hex')]));
    await fs.appendFile(destination, identityFreeBox(commitment));
    const reviewSha = await sha256File(destination); const reviewStat = await fs.lstat(destination);
    if (reviewStat.size !== candidate.videoByteLength + 40 || await sha256FilePrefix(destination, candidate.videoByteLength) !== candidate.videoSha256) throw new Error(`DEV02_ROUTE_COMPARISON_COPY_DRIFT:${alias}`);
    publicCandidates.push({ candidateId: alias, fileName: `${alias}.mp4`, sha256: reviewSha, byteLength: reviewStat.size });
    mappings.push({ candidateId: alias, routeId: candidate.routeId, receiptHash: candidate.receiptHash, sourceVideoSha256: candidate.videoSha256, reviewVideoSha256: reviewSha, blindingCommitment: commitment });
  }
  const publicUnsigned = {
    schemaVersion: DEV02_ROUTE_COMPARISON_VERSION_V1, artifactType: 'Dev02RouteComparisonReviewerManifestV1' as const,
    taskId: 'DEV-02' as const, createdAt: input.createdAt, targetProofPolicyId: DEV02_RENDERED_PROOF_POLICY_V1.policyId,
    identityDisposition: 'ROUTE_AND_SOURCE_IDENTITIES_WITHHELD_RANDOMIZED_REVIEW_COPIES' as const,
    reviewStatus: 'AWAITING_SOLE_REVIEWER_EXPLORATORY_REVIEW' as const,
    evidenceLimitation: 'ONE_REVIEWER_EXPLORATORY_ONLY_NOT_PRODUCTION_TASTE_CERTIFICATION' as const,
    playbackRequirement: 'WATCH_BOTH_COMPLETE_11_5_SECOND_VIDEOS_AT_NORMAL_SPEED_BEFORE_RATING' as const,
    candidates: publicCandidates,
    rubric: {
      scale: { minimum: 1, maximum: 5, anchors: { 1: 'unusable', 3: 'usable_with_visible_corrections', 5: 'client_ready_for_this_bounded_fixture' } },
      dimensions: ['entry-motion-smoothness', 'panel-and-gutter-integrity', 'title-legibility-and-timing', 'hold-stability', 'centre-takeover-quality', 'transition-into-following-shot', 'following-shot-quality', 'full-sequence-timing', 'overall-editorial-quality'],
      requiredPerCandidateFields: ['scores', 'blockingDefects', 'correctionMinutesEstimate', 'notes'],
      requiredComparisonFields: ['rankedCandidates', 'preferredCandidate', 'preferenceReason', 'confidence'],
    }, stateEffects: [] as const,
  };
  const publicManifest = { ...publicUnsigned, publicPackHash: hashCanonicalJsonV1(publicUnsigned) };
  const formUnsigned = {
    schemaVersion: DEV02_ROUTE_COMPARISON_VERSION_V1, artifactType: 'Dev02RouteComparisonReviewFormV1' as const,
    taskId: 'DEV-02' as const, publicPackHash: publicManifest.publicPackHash, reviewerId: null, completedAt: null,
    playbackConfirmed: Object.fromEntries(aliases.map((alias) => [alias, false])),
    candidates: Object.fromEntries(aliases.map((alias) => [alias, { scores: {}, blockingDefects: [], correctionMinutesEstimate: null, notes: '' }])),
    comparison: { rankedCandidates: [], preferredCandidate: null, preferenceReason: '', confidence: null }, stateEffects: [] as const,
  };
  const reviewForm = { ...formUnsigned, templateHash: hashCanonicalJsonV1(formUnsigned) };
  const technicalUnsigned = {
    schemaVersion: DEV02_ROUTE_COMPARISON_VERSION_V1, artifactType: 'Dev02RouteTechnicalComparisonV1' as const,
    taskId: 'DEV-02' as const, targetProofPolicyId: DEV02_RENDERED_PROOF_POLICY_V1.policyId,
    sharedScope: { width: 1080, height: 1920, frameRate: '30/1', decodedFrameCount: 345, durationSeconds: 11.5, audioStreamCount: 0, targetHardGates: 'PASS' },
    forcedNative: { receiptHash: native.receiptHash, ...native.technicalFacts, editabilityDisposition: 'DIRECT_PROPERTIES_BUT_RELATIONSHIPS_NOT_REPRESENTED' },
    generatedHybrid: { receiptHash: hybrid.receiptHash, ...hybrid.technicalFacts, editabilityDisposition: 'EDITABLE_PROGRAM_CONTRACT_RESEARCH_ONLY_NOT_PRODUCT_NESTED_STATE' },
    routeDecision: 'AWAIT_RENDERED_HUMAN_QUALITY_AND_CORRECTION_TIME_REVIEW', stateEffects: [] as const,
  };
  const technical = { ...technicalUnsigned, technicalComparisonHash: hashCanonicalJsonV1(technicalUnsigned) };
  const operatorUnsigned = { schemaVersion: DEV02_ROUTE_COMPARISON_VERSION_V1, artifactType: 'Dev02RouteComparisonOperatorKeyV1' as const, taskId: 'DEV-02' as const, publicPackHash: publicManifest.publicPackHash, randomizationCommitment: sha256(entropy), mappings, disclosurePolicy: 'DO_NOT_OPEN_UNTIL_REVIEW_FORM_IS_FINAL' as const, stateEffects: [] as const };
  const operatorKey = { ...operatorUnsigned, operatorKeyHash: hashCanonicalJsonV1(operatorUnsigned) };
  const reviewerManifestPath = path.join(reviewerRoot, 'manifest.json'); const reviewFormTemplatePath = path.join(reviewerRoot, 'review-form-template.json');
  const operatorKeyPath = path.join(operatorRoot, 'candidate-key.json'); const technicalComparisonPath = path.join(operatorRoot, 'technical-comparison.json');
  await Promise.all([writeJson(reviewerManifestPath, publicManifest), writeJson(reviewFormTemplatePath, reviewForm), writeJson(operatorKeyPath, operatorKey), writeJson(technicalComparisonPath, technical)]);
  return Object.freeze({ schemaVersion: DEV02_ROUTE_COMPARISON_VERSION_V1, taskId: 'DEV-02', createdAt: input.createdAt, reviewStatus: 'AWAITING_SOLE_REVIEWER_EXPLORATORY_REVIEW', reviewerManifestPath, reviewFormTemplatePath, operatorKeyPath, technicalComparisonPath, publicPackHash: publicManifest.publicPackHash, operatorKeyHash: operatorKey.operatorKeyHash, technicalComparisonHash: technical.technicalComparisonHash, candidateVideos: publicCandidates.map(({ candidateId, fileName, sha256: digest }) => ({ candidateId, path: path.join(reviewerRoot, fileName), sha256: digest })), stateEffects: [] as const });
}

async function validateNative(receiptPath: string): Promise<ValidatedCandidate> {
  const receipt = JSON.parse(await fs.readFile(receiptPath, 'utf8')) as Dev02ForcedNativeExecutionReceiptV1; const { receiptHash, ...unsigned } = receipt;
  const { proofHash, ...proofUnsigned } = receipt.targetProof;
  const expectedChecks = new Map([
    ['FRAME_INTEGRITY', 'PASS'], ['SETTLED_PANEL_GEOMETRY', 'PASS'], ['TITLE_FORM', 'PASS'],
    ['OPPOSED_PANEL_MOTION', 'PASS'], ['PHASE_STRUCTURE', 'PASS'], ['FULL_CANVAS_RELEASE', 'PASS'],
    ['BOUNDARY_CONTINUITY', 'PASS'], ['FLASH_SAFETY', 'UNVERIFIABLE'],
  ]);
  const checksAreBound = receipt.targetProof.checks.length === expectedChecks.size
    && receipt.targetProof.checks.every(({ checkId, status }) => expectedChecks.get(checkId) === status);
  const editability = DEV02_FORCED_NATIVE_BASELINE_V1.editability;
  if (receipt.schemaVersion !== DEV02_FORCED_NATIVE_BASELINE_VERSION_V1 || receipt.authority !== 'RESEARCH_PROXY_ONLY_NO_PROJECT_MUTATION' || receipt.baselineHash !== DEV02_FORCED_NATIVE_BASELINE_HASH_V1 || receiptHash !== hashCanonicalJsonV1(unsigned) || proofHash !== hashCanonicalJsonV1(proofUnsigned) || receipt.targetProof.artifactType !== 'Dev02RenderedTargetCandidateProofV1' || receipt.targetProof.policyId !== DEV02_RENDERED_PROOF_POLICY_V1.policyId || receipt.targetProof.taskId !== 'DEV-02' || receipt.targetProof.candidateId !== 'dev02-forced-native-v1' || receipt.targetProof.candidateKind !== 'NATIVE' || receipt.targetProof.candidateHash !== DEV02_FORCED_NATIVE_BASELINE_HASH_V1 || receipt.targetProof.hardGateDisposition !== 'PASS' || receipt.targetProof.technicalDisposition !== 'UNVERIFIABLE' || receipt.targetProof.creativeDisposition !== 'UNVERIFIABLE' || !checksAreBound || receipt.overlayPlan.overlayPlanHash !== DEV02_FORCED_NATIVE_BASELINE_V1.overlayPlanHash || receipt.overlayPlan.overlayCount !== editability.overlayCount || receipt.overlayPlan.keyframeTrackCount !== editability.keyframeTrackCount || receipt.overlayPlan.keyframeCount !== editability.keyframeCount || receipt.overlayPlan.crossElementRelationshipCount !== editability.crossElementRelationshipCount || receipt.overlayPlan.limitation !== editability.limitation || receipt.stateEffects.length) throw new Error('DEV02_ROUTE_COMPARISON_NATIVE_RECEIPT_INVALID');
  assertCommonOutput(receipt.output);
  return validateVideo('FORCED_NATIVE', receiptHash, receipt.output.path, receipt.output.sha256, {
    overlayCount: receipt.overlayPlan.overlayCount, keyframeTrackCount: receipt.overlayPlan.keyframeTrackCount,
    keyframeCount: receipt.overlayPlan.keyframeCount, crossElementRelationshipCount: receipt.overlayPlan.crossElementRelationshipCount,
  });
}
async function validateHybrid(receiptPath: string): Promise<ValidatedCandidate> {
  const receipt = JSON.parse(await fs.readFile(receiptPath, 'utf8')) as Dev02HybridStage6ReceiptV2; const artifact = receipt.artifacts.find(({ artifactId }) => artifactId === 'FULL_HYBRID_PROXY');
  if (!hasValidDev02HybridStage6ReceiptHashV2(receipt) || receipt.schemaVersion !== DEV02_HYBRID_STAGE6_VERSION_V2 || receipt.authority !== 'RESEARCH_PROXY_ONLY_NO_PROJECT_MUTATION' || receipt.inputs.island.programHash !== hashCanonicalJsonV1(DEV02_GENERATED_COMPOSITION_PROGRAM_V1) || receipt.proof.generatedIslandHardGates !== 'PASS' || receipt.proof.hybridTiming !== 'PASS' || receipt.proof.boundaryContinuity !== 'PASS' || receipt.proof.nativeContinuation !== 'PASS' || receipt.proof.projectMutation !== 'NONE' || receipt.stateEffects.length || !artifact) throw new Error('DEV02_ROUTE_COMPARISON_HYBRID_RECEIPT_INVALID');
  assertCommonOutput({ ...receipt.renderProof.outputVideo, frameRate: receipt.renderProof.outputVideo.averageFrameRate });
  return validateVideo('GENERATED_HYBRID', receipt.receiptHash, artifact.path, artifact.sha256, {
    generatedDeclaredLayerCount: DEV02_GENERATED_COMPOSITION_PROGRAM_V1.declaredLayers.length,
    exposedParameterCount: DEV02_GENERATED_COMPOSITION_PROGRAM_V1.exposedParameters.length, nativeContinuation: true,
  });
}
function assertCommonOutput(output: { codec: string; width: number; height: number; frameRate: string; decodedFrameCount: number; durationSeconds: number; audioStreamCount: number }): void { if (output.codec !== 'h264' || output.width !== 1080 || output.height !== 1920 || output.frameRate !== '30/1' || output.decodedFrameCount !== 345 || Math.abs(output.durationSeconds - 11.5) > 0.001 || output.audioStreamCount !== 0) throw new Error('DEV02_ROUTE_COMPARISON_OUTPUT_SCOPE_INVALID'); }
async function validateVideo(routeId: RouteId, receiptHash: string, videoPath: string, videoSha256: string, technicalFacts: ValidatedCandidate['technicalFacts']): Promise<ValidatedCandidate> { const stat = await fs.lstat(videoPath); if (!/^[a-f0-9]{64}$/.test(receiptHash) || !/^[a-f0-9]{64}$/.test(videoSha256) || !stat.isFile() || stat.isSymbolicLink() || path.extname(videoPath).toLowerCase() !== '.mp4' || await sha256File(videoPath) !== videoSha256) throw new Error(`DEV02_ROUTE_COMPARISON_${routeId}_VIDEO_INVALID`); return { routeId, receiptHash, videoPath, videoSha256, videoByteLength: stat.size, technicalFacts }; }
function deterministicShuffle<T>(values: readonly T[], entropy: Buffer): T[] { const result = [...values]; const swap = entropy[0] % 2; [result[0], result[swap]] = [result[swap], result[0]]; return result; }
// An identity-free MP4 `free` box commits the random mapping without changing decoded media.
function identityFreeBox(commitment: string): Buffer { const box = Buffer.alloc(40); box.writeUInt32BE(40, 0); box.write('free', 4, 'ascii'); Buffer.from(commitment, 'hex').copy(box, 8); return box; }
function sha256(value: Uint8Array): string { return createHash('sha256').update(value).digest('hex'); }
async function sha256File(filePath: string): Promise<string> { const hash = createHash('sha256'); await new Promise<void>((resolve, reject) => { const stream = createReadStream(filePath); stream.on('data', (chunk) => hash.update(chunk)); stream.on('error', reject); stream.on('end', resolve); }); return hash.digest('hex'); }
async function sha256FilePrefix(filePath: string, byteLength: number): Promise<string> { const hash = createHash('sha256'); let observed = 0; await new Promise<void>((resolve, reject) => { const stream = createReadStream(filePath, { start: 0, end: byteLength - 1 }); stream.on('data', (chunk) => { observed += chunk.length; hash.update(chunk); }); stream.on('error', reject); stream.on('end', resolve); }); if (observed !== byteLength) throw new Error('DEV02_ROUTE_COMPARISON_PREFIX_COVERAGE_DRIFT'); return hash.digest('hex'); }
async function writeJson(filePath: string, value: unknown): Promise<void> { await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' }); }
