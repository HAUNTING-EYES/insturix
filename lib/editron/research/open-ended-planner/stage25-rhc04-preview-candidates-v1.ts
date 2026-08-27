import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  buildRhc04GeneratedCompositionFixtureV1,
  type Rhc04PreviewFixtureIdentityV1,
} from '@/tests/fixtures/editron/open-ended-planner-v2/rhc04-generated-composition-fixture-v1';

import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import { adaptGeneratedCompositionProgramToProjectDraftV1 }
  from './generated-composition-project-draft-adapter-v1';
import { verifyGeneratedCompositionProgramV1 }
  from './generated-composition-program-verifier-v1';
import { projectProposalStateV2R } from './project-service-proposal-state-v2r';
import { createProviderNativeProjectServiceCloneOwnerV2R }
  from './provider-native-project-service-clone-owner-v2r';
import { createProviderNativeProjectServiceOverlayOwnerV2R }
  from './provider-native-project-service-overlay-owner-v2r';
import { STAGE25_HELDOUT_ROUTE_FREEZE_V1 }
  from './stage25-heldout-route-freeze-v1';
import {
  assertStage25Rhc04PreviewMediaFixtureReceiptV1,
  STAGE25_RHC04_ASSET_IDS_V1,
  type Stage25Rhc04PreviewMediaFixtureReceiptV1,
} from './stage25-rhc04-preview-media-fixture-v1';
import type { ProviderNativeToolExecutionV2R }
  from './provider-native-tool-episode-v2r';
import type { Project, ProjectRevisionV1 }
  from '../../services/project-service';

type JsonRecord = Record<string, unknown>;

export const STAGE25_RHC04_PREVIEW_CANDIDATES_VERSION_V1 =
  'EDITRON_OE_STAGE25_RHC04_PREVIEW_CANDIDATES_V1' as const;

export async function buildStage25Rhc04PreviewCandidatesV1(
  media: Readonly<Stage25Rhc04PreviewMediaFixtureReceiptV1>,
  input: Readonly<{ repoRoot?: string }> = {},
) {
  assertStage25Rhc04PreviewMediaFixtureReceiptV1(media);
  const task = STAGE25_HELDOUT_ROUTE_FREEZE_V1.tasks
    .find(({ taskId }) => taskId === 'RHC-04') ?? fail('TASK_MISSING');
  const identity = identityFromMedia(media);
  const initial = buildRhc04GeneratedCompositionFixtureV1(identity, {
    variant: 'INITIAL', expectedProjectRevision: 'R1',
  });
  const corrected = buildRhc04GeneratedCompositionFixtureV1(identity, {
    variant: 'CORRECTED', expectedProjectRevision: 'R2',
  });
  const initialVerification = verifyGeneratedCompositionProgramV1(initial);
  const correctedVerification = verifyGeneratedCompositionProgramV1(corrected);
  assertVerification(initialVerification, 'INITIAL');
  assertVerification(correctedVerification, 'CORRECTED');
  if (initialVerification.sourceBundleHash !== correctedVerification.sourceBundleHash) {
    fail('CORRECTION_SOURCE_BUNDLE_REGENERATED');
  }

  const repoRoot = path.resolve(input.repoRoot ?? process.cwd());
  const apiPath = path.resolve(
    repoRoot,
    'lib/editron/research/open-ended-planner/generated-composition-api-v1.tsx',
  );
  const runtimeDigestSha256 = (await regularArtifact(apiPath)).sha256;
  const initialAdaptation = adaptGeneratedCompositionProgramToProjectDraftV1({
    verificationInput: initial,
    sourceRightsReceipts: media.provenance,
    compositionId: 'rhc04-results-card',
    runtimeDigestSha256,
    generatorBinding: { kind: 'HUMAN_AUTHORED', authorId: 'rhc04-proposal-user' },
  });
  const correctedAdaptation = adaptGeneratedCompositionProgramToProjectDraftV1({
    verificationInput: corrected,
    sourceRightsReceipts: media.provenance,
    compositionId: 'rhc04-results-card',
    runtimeDigestSha256,
    generatorBinding: { kind: 'HUMAN_AUTHORED', authorId: 'rhc04-proposal-user' },
  });
  const correctionScope = assertCorrectionScope(
    initialAdaptation.draft,
    correctedAdaptation.draft,
  );
  const nativeOwnerObservation = await observeNativeOwner();
  const common = {
    version: STAGE25_RHC04_PREVIEW_CANDIDATES_VERSION_V1,
    taskId: 'RHC-04' as const,
    taskSha256: String(task.taskSha256),
    mediaReceiptSha256: media.receiptSha256,
    targetPredicateIds: predicateIds(task.targetPredicates, 'TARGET'),
    preservationPredicateIds: predicateIds(
      task.preservationPredicates,
      'PRESERVATION',
    ),
    targetRange: { startFrame: 0, endExclusiveFrame: 180 } as const,
    renderDisposition: 'NOT_RENDERED' as const,
    qualityDisposition: 'UNJUDGED' as const,
    humanCorrectionMeasurementDisposition:
      'MEASURED_HANDS_ON_REQUIRED_NOT_YET_PERFORMED' as const,
    productExecutionDisposition: 'NOT_AUTHORIZED' as const,
    providerInferenceCalls: 0 as const,
    canonicalProjectMutationWrites: 0 as const,
    stateEffects: [] as const,
  };
  const routes = [
    {
      ...common,
      route: 'NATIVE' as const,
      candidateId: 'RHC-04:NATIVE:V1' as const,
      disposition: 'CAPABILITY_GAP' as const,
      capabilityAvailable: false as const,
      form: {
        kind: 'EDITRON_ADD_OVERLAY_INPUTS' as const,
        formOwnerRef: 'lib/editron/agent/chat-add-overlay-form.ts#buildChatAddOverlayForm',
        proposalOwnerRef:
          'provider-native-project-service-overlay-owner-v2r.ts#createProviderNativeProjectServiceOverlayOwnerV2R',
        canonicalMutationOwnerRef:
          'lib/editron/services/project-service.ts#ProjectService.addOverlay',
        requestedImageOperators: [
          'add_overlay:rhc04-closeup-60',
          'add_overlay:rhc04-closeup-30',
          'add_overlay:rhc04-closeup-10',
        ] as const,
        requestedTextOperators: [
          'add_overlay:60%', 'add_overlay:30%', 'add_overlay:10%',
        ] as const,
      },
      qualifications: {
        isolatedRevisionIssuedImageWriter: true as const,
        allThreeStillImageFormsAccepted: true as const,
        exactNativeFontFileBinding: false as const,
        correctionWouldRequireIndependentOverlayRewrites: true as const,
      },
      capabilityGapCodes: ['NATIVE_EXACT_FONT_FILE_BINDING_UNAVAILABLE'] as const,
      ownerObservation: nativeOwnerObservation,
    },
    {
      ...common,
      route: 'GENERATED_COMPOSITION' as const,
      candidateId: 'RHC-04:GENERATED_COMPOSITION:V1' as const,
      disposition: 'READY_FOR_RENDER' as const,
      capabilityAvailable: true as const,
      form: {
        kind: 'VERIFIED_EDITABLE_RESULTS_CARD_PROGRAM' as const,
        programId: initial.program.programId,
        initial: {
          fixtureSha256: initial.fixtureSha256,
          programSha256: required(initialVerification.programHash, 'INITIAL_PROGRAM_HASH'),
          projectServiceDraftSha256: initialAdaptation.binding.draftSha256,
          adapterReceiptSha256: initialAdaptation.receipt.receiptSha256,
        },
        corrected: {
          fixtureSha256: corrected.fixtureSha256,
          programSha256: required(correctedVerification.programHash, 'CORRECTED_PROGRAM_HASH'),
          projectServiceDraftSha256: correctedAdaptation.binding.draftSha256,
          adapterReceiptSha256: correctedAdaptation.receipt.receiptSha256,
        },
        sourceBundleSha256: required(
          initialVerification.sourceBundleHash,
          'SOURCE_BUNDLE_HASH',
        ),
        projectServiceProposalOwnerRef:
          'provider-native-project-service-generated-composition-owner-v2r.ts#createProviderNativeProjectServiceGeneratedCompositionOwnerV2R',
        canonicalPrepareOwnerRef:
          'lib/editron/services/project-service.ts#ProjectService.prepareProjectGeneratedCompositionV1',
        canonicalFinalizeOwnerRef:
          'lib/editron/services/project-service.ts#ProjectService.finalizeProjectGeneratedCompositionV1',
      },
      qualifications: {
        initialProgramContractVerified: true as const,
        correctedProgramContractVerified: true as const,
        stillImageSourceOwner: true as const,
        exactFontFileBound: true as const,
        numberControlsIndependent: true as const,
        sourceBindingsIndependent: true as const,
        finalHoldControlIndependent: true as const,
        sourceBundleRegenerationRequiredForCorrection: false as const,
        mediaRegenerationRequiredForCorrection: false as const,
        isolatedProjectServiceInsertAndRevisePending: true as const,
        sandboxExecutionPending: true as const,
        renderedCorrectionProofPending: true as const,
        humanHandsOnMeasurementPending: true as const,
      },
      correctionScope,
      capabilityGapCodes: [] as const,
    },
    {
      ...common,
      route: 'HYBRID' as const,
      candidateId: 'RHC-04:HYBRID:V1' as const,
      disposition: 'NOT_APPLICABLE' as const,
      capabilityAvailable: false as const,
      form: {
        kind: 'NO_DISTINCT_HYBRID_FORM' as const,
        reason:
          'The frozen task has no native audio, continuation, mask, tracking, or timeline contribution; adding an empty native lane would still be generated-only.',
      },
      qualifications: {
        generatedVisualWouldOwnEntireTarget: true as const,
        distinctNativeContributionAvailable: false as const,
      },
      capabilityGapCodes: ['HYBRID_NO_DISTINCT_NATIVE_CONTRIBUTION'] as const,
    },
  ];
  const material = {
    version: STAGE25_RHC04_PREVIEW_CANDIDATES_VERSION_V1,
    artifactType: 'Stage25Rhc04PreviewCandidatesV1' as const,
    authority: 'CURRENT_RESEARCH_ROUTE_CONTRACT_NO_PROJECT_MUTATION' as const,
    taskSha256: String(task.taskSha256),
    mediaReceiptSha256: media.receiptSha256,
    runtimeDigestSha256,
    fixtures: {
      initialSha256: initial.fixtureSha256,
      correctedSha256: corrected.fixtureSha256,
    },
    programVerification: { initial: initialVerification, corrected: correctedVerification },
    projectServiceProjection: {
      compositionId: initialAdaptation.draft.compositionId,
      initialDraftSha256: initialAdaptation.binding.draftSha256,
      correctedDraftSha256: correctedAdaptation.binding.draftSha256,
      initialAdapterReceiptSha256: initialAdaptation.receipt.receiptSha256,
      correctedAdapterReceiptSha256: correctedAdaptation.receipt.receiptSha256,
      correctionScope,
      canonicalMutationOwnerCalled: false as const,
    },
    routes,
    externalCalls: {
      providerInferenceCalls: 0 as const,
      renderCalls: 0 as const,
      networkCalls: 0 as const,
      databaseCalls: 0 as const,
      canonicalProjectMutationWrites: 0 as const,
    },
    proofCeiling: 'MATERIALIZED_FORM_AND_ISOLATED_NATIVE_OWNER_PROOF_NOT_RENDERED' as const,
    stateEffects: [] as const,
  };
  return deepFreezeV1({
    ...material,
    routeSetSha256: hashCanonicalJsonV1(routes),
    receiptSha256: hashCanonicalJsonV1(material),
  });
}

export function identityFromMedia(
  media: Readonly<Stage25Rhc04PreviewMediaFixtureReceiptV1>,
): Readonly<Rhc04PreviewFixtureIdentityV1> {
  assertStage25Rhc04PreviewMediaFixtureReceiptV1(media);
  const assets = new Map(media.assets.map((asset) => [asset.assetId, asset]));
  const rights = new Map(media.provenance.map((receipt) => [receipt.assetId, receipt]));
  if (assets.size !== STAGE25_RHC04_ASSET_IDS_V1.length
    || rights.size !== STAGE25_RHC04_ASSET_IDS_V1.length
    || STAGE25_RHC04_ASSET_IDS_V1.some((assetId) => (
      !assets.has(assetId) || !rights.has(assetId)
    ))) {
    fail('MEDIA_ASSET_SET_INVALID');
  }
  return deepFreezeV1({
    assetVersions: Object.fromEntries(STAGE25_RHC04_ASSET_IDS_V1.map((assetId) => [
      assetId,
      `sha256:${required(assets.get(assetId)?.sha256, `ASSET_${assetId}`)}`,
    ])) as Rhc04PreviewFixtureIdentityV1['assetVersions'],
    rightsEvidenceVersions: Object.fromEntries(
      STAGE25_RHC04_ASSET_IDS_V1.map((assetId) => [
        assetId,
        `sha256:${required(rights.get(assetId)?.receiptSha256, `RIGHTS_${assetId}`)}`,
      ]),
    ) as Rhc04PreviewFixtureIdentityV1['rightsEvidenceVersions'],
    fontVersion: `sha256:${media.font.sha256}`,
    fontFileSha256: media.font.sha256,
  });
}

function assertCorrectionScope(
  initial: ReturnType<typeof adaptGeneratedCompositionProgramToProjectDraftV1>['draft'],
  corrected: ReturnType<typeof adaptGeneratedCompositionProgramToProjectDraftV1>['draft'],
) {
  const initialSources = new Map(initial.sourceBindings.map((entry) => [entry.slotId, entry]));
  const correctedSources = new Map(corrected.sourceBindings.map((entry) => [entry.slotId, entry]));
  const changedSourceSlotIds = [...initialSources].filter(([slotId, value]) => (
    hashCanonicalJsonV1(value) !== hashCanonicalJsonV1(correctedSources.get(slotId))
  )).map(([slotId]) => slotId);
  const initialControls = new Map(initial.exposedControls.map((entry) => [entry.parameterId, entry]));
  const correctedControls = new Map(corrected.exposedControls.map((entry) => [entry.parameterId, entry]));
  const changedControlIds = [...initialControls].filter(([parameterId, value]) => (
    hashCanonicalJsonV1(value) !== hashCanonicalJsonV1(correctedControls.get(parameterId))
  )).map(([parameterId]) => parameterId);
  const unchangedControlIds = [...initialControls.keys()].filter(
    (parameterId) => !changedControlIds.includes(parameterId),
  );
  if (changedSourceSlotIds.join('|') !== 'source-middle'
    || changedControlIds.join('|') !== 'param-number-middle|param-final-hold'
    || unchangedControlIds.join('|') !== 'param-number-60|param-number-10'
    || initial.compositionId !== corrected.compositionId
    || initial.programRef.sourceBundleArtifact.digest.value
      !== corrected.programRef.sourceBundleArtifact.digest.value
    || hashCanonicalJsonV1(initial.canvas) !== hashCanonicalJsonV1(corrected.canvas)
    || hashCanonicalJsonV1(initial.placement.projectRange)
      !== hashCanonicalJsonV1(corrected.placement.projectRange)
    || hashCanonicalJsonV1(initial.fontBindings)
      !== hashCanonicalJsonV1(corrected.fontBindings)) {
    fail('CORRECTION_SCOPE_DRIFT');
  }
  return deepFreezeV1({
    changedSourceSlotIds,
    changedControlIds,
    unchangedControlIds,
    unchangedSourceSlotIds: ['source-60', 'source-10'] as const,
    unchangedArtifactClasses: [
      'SOURCE_BUNDLE', 'CANVAS', 'PROJECT_RANGE', 'FONT_BINDING',
      'SOURCE_60_BINDING', 'SOURCE_10_BINDING',
    ] as const,
  });
}

async function observeNativeOwner() {
  const imageProbe = await createProbe('images');
  const requests = [
    { assetId: 'rhc04-closeup-60', start: 0, duration: 45 },
    { assetId: 'rhc04-closeup-30', start: 45, duration: 45 },
    { assetId: 'rhc04-closeup-10', start: 90, duration: 90 },
  ] as const;
  const executions: ProviderNativeToolExecutionV2R[] = [];
  let revision = imageProbe.resolved.currentRevision.projectRevision;
  for (const [index, request] of requests.entries()) {
    const execution = await imageProbe.resolved.isolatedClone.executeIsolated({
      operatorId: 'add_overlay',
      turn: index + 1,
      arguments: {
        projectId: imageProbe.canonical.projectId,
        expectedProjectRevision: revision,
        type: 'image', row: index, x: 0, y: 0, width: 1080, height: 1920,
        styles: { objectFit: 'cover', opacity: 1 },
        evidenceIds: [`rhc04-source-${request.assetId}`],
        ...request,
      },
    });
    if (execution.disposition !== 'OK') fail('NATIVE_IMAGE_EXECUTION_NOT_OK');
    revision = receiptRevision(execution);
    executions.push(execution as ProviderNativeToolExecutionV2R);
  }
  const imageProposal = await requiredFinalizer(imageProbe.resolved)();
  if (!imageProposal.canonicalUnchanged
    || imageProposal.changedPaths.join('|') !== '$.overlays[0]|$.overlays[1]|$.overlays[2]'
    || imageProbe.canonicalBeforeSha256
      !== hashCanonicalJsonV1(projectProposalStateV2R(imageProbe.canonical))) {
    fail('NATIVE_IMAGE_PROPOSAL_DRIFT');
  }

  const fontProbe = await createProbe('font');
  const fontExecution = await fontProbe.resolved.isolatedClone.executeIsolated({
    operatorId: 'add_overlay',
    turn: 1,
    arguments: {
      projectId: fontProbe.canonical.projectId,
      expectedProjectRevision: fontProbe.resolved.currentRevision.projectRevision,
      type: 'text', text: '60%', start: 0, duration: 45,
      row: 3, x: 108, y: 768, width: 864, height: 384,
      styles: {
        fontFamily: 'Noto Sans', fontSize: 128, fontWeight: 400,
        textAlign: 'center', color: '#FFFFFF', backgroundColor: '#05070A',
        opacity: 1,
      },
      evidenceIds: ['rhc04-font'],
    },
  });
  const fontProposal = await requiredFinalizer(fontProbe.resolved)();
  const fontCode = text(fontExecution.output.code);
  if (fontExecution.disposition !== 'UNVERIFIABLE'
    || fontCode !== 'PROJECTSERVICE_ISOLATED_OVERLAY_FORM_INPUT_INVALID'
    || fontProposal.changedPaths.length || !fontProposal.canonicalUnchanged) {
    fail('NATIVE_FONT_SAFE_STOP_DRIFT');
  }
  return deepFreezeV1({
    authority: 'CURRENT_RHC04_ISOLATED_OWNER_OBSERVATION_NO_CANONICAL_MUTATION' as const,
    ownerRef:
      'provider-native-project-service-overlay-owner-v2r.ts#createProviderNativeProjectServiceOverlayOwnerV2R' as const,
    stillImages: executions.map((execution, index) => ({
      assetId: requests[index]!.assetId,
      executionSha256: hashCanonicalJsonV1(execution),
      writerProjectRevision: receiptRevision(execution),
      proof: executionProof(execution),
    })),
    imageProposalReceiptSha256: imageProposal.receiptSha256,
    imageProposalChangedPaths: imageProposal.changedPaths,
    exactFont: {
      disposition: fontExecution.disposition,
      code: fontCode,
      executionSha256: hashCanonicalJsonV1(fontExecution),
      proposalReceiptSha256: fontProposal.receiptSha256,
    },
    canonicalUnchanged: true as const,
    isolatedSnapshotReads: {
      images: imageProbe.snapshotReads(),
      font: fontProbe.snapshotReads(),
    },
  });
}

async function createProbe(label: string) {
  const canonical = probeProject();
  const revision: ProjectRevisionV1 = {
    schemaVersion: 1,
    value: canonical.projectRevision ?? 0,
    compatibilityUpdatedAt: canonical.updatedAt.toISOString(),
  };
  const canonicalBeforeSha256 = hashCanonicalJsonV1(projectProposalStateV2R(canonical));
  let reads = 0;
  const owner = createProviderNativeProjectServiceCloneOwnerV2R({
    projectService: {
      loadProjectForMutation: async () => {
        reads += 1;
        return { project: structuredClone(canonical), revision: structuredClone(revision) };
      },
    },
    isolatedOperatorOwner: createProviderNativeProjectServiceOverlayOwnerV2R(),
  });
  const resolved = await owner.resolveFresh!({
    tenantId: 'stage25-rhc04-owner-observation',
    userId: canonical.userId,
    projectId: canonical.projectId,
    episodeId: `stage25-rhc04-${label}`,
  });
  return { canonical, canonicalBeforeSha256, resolved, snapshotReads: () => reads };
}

function probeProject(): Project {
  const timestamp = new Date('2026-08-27T17:00:00.000Z');
  return {
    projectId: 'stage25-rhc04-preview',
    userId: 'stage25-rhc04-owner-observation',
    name: 'RHC-04 native owner observation',
    overlays: [],
    aspectRatio: '9:16', playerDimensions: { width: 1080, height: 1920 },
    fps: 30, durationInFrames: 180, createdAt: timestamp, updatedAt: timestamp,
    projectRevision: 1, visibility: 'private',
  };
}

function executionProof(execution: Readonly<ProviderNativeToolExecutionV2R>): JsonRecord {
  const proof = record(record(execution.output.receipt).proof);
  if (!Object.keys(proof).length) fail('EXECUTION_PROOF_INVALID');
  return proof;
}
function receiptRevision(execution: Readonly<ProviderNativeToolExecutionV2R>): string {
  const revision = record(execution.output.receipt).projectRevision;
  return typeof revision === 'string' && revision.trim()
    ? revision
    : fail('WRITER_REVISION_INVALID');
}
function requiredFinalizer(resolved: Awaited<ReturnType<
  NonNullable<ReturnType<typeof createProviderNativeProjectServiceCloneOwnerV2R>['resolveFresh']>
>>) {
  return resolved.isolatedClone.finalizeProposalReceipt
    ?? fail('PROPOSAL_FINALIZER_MISSING');
}

function assertVerification(
  value: ReturnType<typeof verifyGeneratedCompositionProgramV1>,
  label: string,
): void {
  if (value.disposition !== 'CONTRACT_PASS' || !value.programHash
    || !value.sourceBundleHash) {
    fail(`${label}_PROGRAM_VERIFICATION_FAILED:${value.diagnostics.join('|')}`);
  }
}
async function regularArtifact(filePath: string) {
  const stat = await lstat(filePath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0) fail('FILE_INVALID');
  return {
    bytes: stat.size,
    sha256: createHash('sha256').update(await readFile(filePath)).digest('hex'),
  };
}
function predicateIds(value: unknown, code: string): string[] {
  if (!Array.isArray(value) || !value.length) fail(`${code}_PREDICATES_INVALID`);
  const ids = value.map((entry) => text(record(entry).predicateId));
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) {
    fail(`${code}_PREDICATES_INVALID`);
  }
  return ids;
}
function required(value: string | undefined | null, code: string): string {
  return value ?? fail(`${code}_MISSING`);
}
function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function fail(code: string): never {
  throw new Error(`STAGE25_RHC04_PREVIEW_CANDIDATES_${code}`);
}
