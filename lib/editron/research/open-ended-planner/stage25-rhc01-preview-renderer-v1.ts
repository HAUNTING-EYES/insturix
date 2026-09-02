import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

import {
  RHC01_PREVIEW_ASSET_IDS_V1,
  buildRhc01GeneratedCompositionFixtureV1,
  type Rhc01PreviewFixtureIdentityV1,
} from '@/tests/fixtures/editron/open-ended-planner-v2/rhc01-preview-fixture-v1';

import { hashCanonicalJsonV1 } from './contracts-v1';
import { hashGeneratedCompositionSourceBundleV1 } from './generated-composition-program-v1';
import { renderTrustedGeneratedCompositionProxyV1 } from './generated-composition-proxy-renderer-v1';
import {
  buildStage25Rhc01BlindReviewPackV1,
  type Stage25Rhc01BlindCandidateV1,
} from './stage25-rhc01-blind-review-pack-v1';
import { STAGE25_HELDOUT_ROUTE_FREEZE_V1 } from './stage25-heldout-route-freeze-v1';
import {
  buildStage25Rhc01NativePreviewOverlaysV1,
  buildStage25Rhc01PreviewCandidatesV1,
} from './stage25-rhc01-preview-candidates-v1';
import {
  materializeStage25PreviewMediaFixtureV1,
  type Stage25PreviewMediaFixtureReceiptV1,
} from './stage25-preview-media-fixture-v1';
import {
  assembleStage25GeneratedContinuationPreviewV1,
  extractStage25PreviewFrameV1,
  normalizedStage25ImageDiffV1,
  renderStage25NativeOverlayPreviewV1,
} from './stage25-preview-video-runtime-v1';

export const STAGE25_RHC01_PREVIEW_EXECUTION_VERSION_V1 =
  'EDITRON_OE_STAGE25_RHC01_PREVIEW_EXECUTION_V1_1' as const;

const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;
const TOTAL_FRAMES = 210;
const PROOF_FRAMES = Object.freeze([0, 23, 24, 47, 48, 71, 72, 120, 149, 150, 179, 180, 209]);

export function buildStage25Rhc01PreviewIdentityV1(
  media: Readonly<Stage25PreviewMediaFixtureReceiptV1>,
): Readonly<Rhc01PreviewFixtureIdentityV1> {
  const records = new Map(media.assets.map((asset) => [asset.assetId, asset]));
  if (records.size !== RHC01_PREVIEW_ASSET_IDS_V1.length
    || RHC01_PREVIEW_ASSET_IDS_V1.some((assetId) => !records.has(assetId))) fail('MEDIA_ASSET_SET_INVALID');
  return Object.freeze({
    assetVersions: Object.fromEntries(RHC01_PREVIEW_ASSET_IDS_V1.map((assetId) => [
      assetId,
      `sha256:${records.get(assetId)?.sha256}`,
    ])) as Rhc01PreviewFixtureIdentityV1['assetVersions'],
    fontVersion: `sha256:${media.font.sha256}`,
    fontFileSha256: media.font.sha256,
  });
}

export async function executeStage25Rhc01PreviewV1(input: {
  outputDir: string;
  executionId: string;
  createdAt: string;
  sourceCommitSha: string;
}) {
  validateExecutionInput(input);
  const root = safeNewDirectory(path.join(input.outputDir, input.executionId));
  await mkdir(path.dirname(root), { recursive: true });
  await mkdir(root);

  const media = await materializeStage25PreviewMediaFixtureV1({
    outputDir: path.join(root, 'media'),
    createdAt: input.createdAt,
  });
  const identity = buildStage25Rhc01PreviewIdentityV1(media);
  const candidateSet = buildStage25Rhc01PreviewCandidatesV1(identity);
  const task = STAGE25_HELDOUT_ROUTE_FREEZE_V1.tasks
    .find(({ taskId }) => taskId === 'RHC-01') ?? fail('TASK_MISSING');

  const nativeCandidate = requiredCandidate(candidateSet, 'NATIVE');
  const native = await renderStage25NativeOverlayPreviewV1({
    overlays: buildStage25Rhc01NativePreviewOverlaysV1(),
    durationInFrames: TOTAL_FRAMES,
    fps: FPS,
    width: WIDTH,
    height: HEIGHT,
    assetPaths: media.hostPaths.assetPaths,
    outputDir: path.join(root, 'native'),
    outputFileName: 'native-full-preview.mp4',
    proofFrames: PROOF_FRAMES,
  });
  const nativeSheet = await createContactSheet(native.stills, path.join(root, 'native', 'contact-sheet.png'));
  const nativeBoundary = await measureNativeBoundary({
    root: path.join(root, 'native', 'boundary'),
    outputStills: native.stills,
    followingPath: media.hostPaths.assetPaths['rhc01-following-shot'],
  });

  const generatedFixture = buildRhc01GeneratedCompositionFixtureV1({
    identity,
    route: 'GENERATED_COMPOSITION',
  });
  const generatedProxy = await renderGeneratedFixture(
    generatedFixture,
    media,
    path.join(root, 'generated-workspaces'),
  );
  const generatedPlayable = generatedProxy.playableProxy ?? fail('GENERATED_PLAYABLE_MISSING');
  const generated = await assembleStage25GeneratedContinuationPreviewV1({
    islandPath: generatedPlayable.path,
    followingPath: media.hostPaths.assetPaths['rhc01-following-shot'],
    islandFrames: 180,
    followingSourceStartFrame: 180,
    totalFrames: TOTAL_FRAMES,
    fps: FPS,
    width: WIDTH,
    height: HEIGHT,
    outputPath: path.join(root, 'generated', 'generated-full-preview.mp4'),
  });
  const generatedVisuals = await captureVisualEvidence(
    generated.outputPath,
    path.join(root, 'generated', 'visual-evidence'),
  );

  const hybridFixture = buildRhc01GeneratedCompositionFixtureV1({ identity, route: 'HYBRID' });
  const hybridProxy = await renderGeneratedFixture(
    hybridFixture,
    media,
    path.join(root, 'generated-workspaces'),
  );
  const hybridPlayable = hybridProxy.playableProxy ?? fail('HYBRID_PLAYABLE_MISSING');
  const hybrid = await assembleStage25GeneratedContinuationPreviewV1({
    islandPath: hybridPlayable.path,
    followingPath: media.hostPaths.assetPaths['rhc01-following-shot'],
    islandFrames: 150,
    followingSourceStartFrame: 150,
    totalFrames: TOTAL_FRAMES,
    fps: FPS,
    width: WIDTH,
    height: HEIGHT,
    outputPath: path.join(root, 'hybrid', 'hybrid-full-preview.mp4'),
  });
  const hybridVisuals = await captureVisualEvidence(
    hybrid.outputPath,
    path.join(root, 'hybrid', 'visual-evidence'),
  );

  const generatedCandidate = requiredCandidate(candidateSet, 'GENERATED_COMPOSITION');
  const hybridCandidate = requiredCandidate(candidateSet, 'HYBRID');
  const executedCandidates = [
    {
      candidateId: nativeCandidate.candidateId,
      route: nativeCandidate.route,
      candidateHash: hashCanonicalJsonV1(nativeCandidate),
      videoPath: native.outputPath,
      videoSha256: native.outputSha256,
      probe: native.probe,
      contactSheet: nativeSheet,
      boundaryEvidence: nativeBoundary,
      structuralEditabilityDisposition: 'PASS_INDEPENDENT_NATIVE_OVERLAYS',
      rendererReceiptHash: null,
      proofLimitations: ['NATIVE_FONT_FILE_BINDING_UNVERIFIABLE'],
    },
    {
      candidateId: generatedCandidate.candidateId,
      route: generatedCandidate.route,
      candidateHash: hashCanonicalJsonV1(generatedCandidate),
      videoPath: generated.outputPath,
      videoSha256: generated.outputSha256,
      probe: generated.probe,
      contactSheet: generatedVisuals.contactSheet,
      boundaryEvidence: generated.boundaryEvidence,
      structuralEditabilityDisposition: 'PASS_EXPOSED_GENERATED_PARAMETERS',
      rendererReceiptHash: generatedProxy.receiptHash,
      proofLimitations: ['LOCAL_PROCESS_NOT_PRODUCTION_SANDBOX'],
    },
    {
      candidateId: hybridCandidate.candidateId,
      route: hybridCandidate.route,
      candidateHash: hashCanonicalJsonV1(hybridCandidate),
      videoPath: hybrid.outputPath,
      videoSha256: hybrid.outputSha256,
      probe: hybrid.probe,
      contactSheet: hybridVisuals.contactSheet,
      boundaryEvidence: hybrid.boundaryEvidence,
      structuralEditabilityDisposition: 'PASS_EXPOSED_ISLAND_PARAMETERS_AND_NATIVE_CONTINUATION',
      rendererReceiptHash: hybridProxy.receiptHash,
      proofLimitations: ['LOCAL_PROCESS_NOT_PRODUCTION_SANDBOX'],
    },
  ] as const;
  const toBlindCandidate = (
    candidate: typeof executedCandidates[number],
  ): Stage25Rhc01BlindCandidateV1 => ({
    sourceCandidateId: candidate.candidateId,
    route: candidate.route,
    videoPath: candidate.videoPath,
    videoSha256: candidate.videoSha256,
    contactSheetPath: candidate.contactSheet.path,
    contactSheetSha256: candidate.contactSheet.sha256,
    boundaryEvidence: candidate.boundaryEvidence,
    structuralEditabilityDisposition: candidate.structuralEditabilityDisposition,
  });
  const blindCandidates = [
    toBlindCandidate(executedCandidates[0]),
    toBlindCandidate(executedCandidates[1]),
    toBlindCandidate(executedCandidates[2]),
  ] as const;
  const blindReview = await buildStage25Rhc01BlindReviewPackV1({
    outputRoot: path.join(root, 'blind-review'),
    createdAt: input.createdAt,
    taskSha256: String(task.taskSha256),
    candidateSetHash: candidateSet.candidateSetHash,
    publicBrief: String(task.publicBrief),
    targetPredicates: task.targetPredicates as readonly unknown[],
    preservationPredicates: task.preservationPredicates as readonly unknown[],
    candidates: blindCandidates,
  });

  const unsigned = {
    version: STAGE25_RHC01_PREVIEW_EXECUTION_VERSION_V1,
    artifactType: 'Stage25Rhc01PreviewExecutionReceiptV1' as const,
    authority: 'LOCAL_RESEARCH_RENDER_AND_REVIEW_PACK_ONLY' as const,
    executionId: input.executionId,
    createdAt: input.createdAt,
    sourceSnapshot: {
      commitSha: input.sourceCommitSha,
      closureDisposition: 'CURATED_BINDINGS_ONLY_TRANSITIVE_CLOSURE_UNVERIFIABLE' as const,
    },
    taskSha256: String(task.taskSha256),
    mediaFixtureReceiptHash: media.receiptHash,
    candidateSetHash: candidateSet.candidateSetHash,
    candidates: executedCandidates,
    blindReview,
    proof: {
      candidateIdentity: 'PASS' as const,
      sourceMediaContract: 'PASS' as const,
      generatedProgramContracts: 'PASS' as const,
      nativeEditorRender: 'PASS' as const,
      generatedPlayableProxy: 'PASS' as const,
      hybridPlayableProxy: 'PASS' as const,
      boundaryEvidence: 'CAPTURED_UNJUDGED' as const,
      targetAndPreservationPredicates: 'CAPTURED_UNJUDGED' as const,
      nativeFontBinding: 'UNVERIFIABLE_EDITOR_FONT_REGISTRY_MISSING' as const,
      generatedFontBinding: 'PASS_EXACT_FILE_HASH' as const,
      routeDecision: 'NOT_ISSUED' as const,
      productExecution: 'NOT_AUTHORIZED' as const,
    },
    externalCalls: {
      providerApiCalls: 0 as const,
      cloudRenderCalls: 0 as const,
      databaseCalls: 0 as const,
      projectServiceCalls: 0 as const,
      canonicalProjectMutationWrites: 0 as const,
      localNativeRenderCalls: 1 as const,
      localGeneratedRenderCalls: 2 as const,
      localBoundaryAssemblyCalls: 2 as const,
    },
    stateEffects: [{ kind: 'LOCAL_RESEARCH_ARTIFACT_TREE_WRITE' as const, root }],
  };
  const receipt = { ...unsigned, receiptHash: hashCanonicalJsonV1(unsigned) };
  const receiptPath = path.join(root, 'execution-receipt.json');
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  return Object.freeze({ ...receipt, receiptPath });
}

type CandidateSet = ReturnType<typeof buildStage25Rhc01PreviewCandidatesV1>;
type Candidate = CandidateSet['candidates'][number];
type Route = Candidate['route'];

function requiredCandidate<T extends Route>(set: CandidateSet, route: T): Extract<Candidate, { route: T }> {
  const candidate = set.candidates.find((value) => value.route === route);
  if (!candidate) fail(`CANDIDATE_MISSING:${route}`);
  return candidate as Extract<Candidate, { route: T }>;
}

async function renderGeneratedFixture(
  fixture: ReturnType<typeof buildRhc01GeneratedCompositionFixtureV1>,
  media: Readonly<Stage25PreviewMediaFixtureReceiptV1>,
  workspaceRoot: string,
) {
  return renderTrustedGeneratedCompositionProxyV1({
    ...fixture,
    expectedProgramHash: hashCanonicalJsonV1(fixture.program),
    expectedSourceBundleHash: hashGeneratedCompositionSourceBundleV1(fixture.sourceBundle),
    materializedInputs: {
      assetPaths: media.hostPaths.assetPaths,
      fontPaths: { 'rhc01-licensed-display': media.hostPaths.fontPath },
    },
  }, {
    workspaceRoot,
    proofFrames: PROOF_FRAMES.filter((frame) => (
      frame < Number(fixture.program.duration.compositionEndExclusiveTick)
    )),
    includePlayableProxy: true,
  });
}

async function captureVisualEvidence(videoPath: string, outputDir: string) {
  await mkdir(outputDir);
  const stills = [];
  for (const frame of PROOF_FRAMES) {
    const output = path.join(outputDir, `frame-${String(frame).padStart(4, '0')}.png`);
    await extractStage25PreviewFrameV1(videoPath, frame, output, WIDTH, HEIGHT);
    stills.push({ frame, path: output, sha256: sha256(await readRegularFile(output)) });
  }
  return Object.freeze({
    stills,
    contactSheet: await createContactSheet(stills, path.join(outputDir, 'contact-sheet.png')),
  });
}

async function measureNativeBoundary(input: {
  root: string;
  outputStills: readonly { frame: number; path: string }[];
  followingPath: string;
}) {
  await mkdir(input.root);
  const outputExit = input.outputStills.find(({ frame }) => frame === 149)?.path
    ?? fail('NATIVE_EXIT_STILL_MISSING');
  const outputEntry = input.outputStills.find(({ frame }) => frame === 150)?.path
    ?? fail('NATIVE_ENTRY_STILL_MISSING');
  const sourceExit = path.join(input.root, 'source-exit.png');
  const sourceEntry = path.join(input.root, 'source-entry.png');
  await Promise.all([
    extractStage25PreviewFrameV1(input.followingPath, 149, sourceExit, WIDTH, HEIGHT),
    extractStage25PreviewFrameV1(input.followingPath, 150, sourceEntry, WIDTH, HEIGHT),
  ]);
  return Object.freeze({
    projectFrame: 150,
    sourceExitFrame: 149,
    sourceEntryFrame: 150,
    sourceIdentityProof: 'PASS_BY_HASH_AND_DECLARED_FRAME_BINDING' as const,
    outputEntryToSourceEntry: await normalizedStage25ImageDiffV1(outputEntry, sourceEntry),
    outputBoundaryDelta: await normalizedStage25ImageDiffV1(outputExit, outputEntry),
    naturalSourceBoundaryDelta: await normalizedStage25ImageDiffV1(sourceExit, sourceEntry),
    visualContinuityDisposition: 'CAPTURED_UNJUDGED' as const,
  });
}

async function createContactSheet(
  stills: readonly { path: string }[],
  output: string,
) {
  const tileWidth = 270;
  const tileHeight = 480;
  const columns = 3;
  const rows = Math.ceil(stills.length / columns);
  const composites = await Promise.all(stills.map(async (still, index) => ({
    input: await sharp(still.path).resize(tileWidth, tileHeight).png().toBuffer(),
    left: (index % columns) * tileWidth,
    top: Math.floor(index / columns) * tileHeight,
  })));
  await sharp({
    create: { width: columns * tileWidth, height: rows * tileHeight, channels: 3, background: '#111111' },
  }).composite(composites).png().toFile(output);
  return Object.freeze({
    path: output,
    sha256: sha256(await readRegularFile(output)),
    width: columns * tileWidth,
    height: rows * tileHeight,
  });
}

function validateExecutionInput(input: {
  executionId: string;
  createdAt: string;
  sourceCommitSha: string;
}): void {
  if (!/^[a-z0-9][a-z0-9-]{7,79}$/.test(input.executionId)) fail('EXECUTION_ID_INVALID');
  if (new Date(input.createdAt).toISOString() !== input.createdAt) fail('CREATED_AT_INVALID');
  if (!/^[a-f0-9]{40}$/.test(input.sourceCommitSha)) fail('SOURCE_COMMIT_INVALID');
}
async function readRegularFile(filePath: string): Promise<Buffer> {
  const stat = await lstat(filePath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0) fail('FILE_INVALID');
  return readFile(filePath);
}
function safeNewDirectory(value: string): string {
  const root = path.resolve(value);
  if (root === path.parse(root).root || root === path.resolve(process.cwd())) fail('OUTPUT_ROOT_UNSAFE');
  return root;
}
function sha256(value: Uint8Array): string { return createHash('sha256').update(value).digest('hex'); }
function fail(code: string): never { throw new Error(`STAGE25_RHC01_PREVIEW_EXECUTION_${code}`); }
