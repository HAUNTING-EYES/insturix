import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  buildRhc03GeneratedCompositionFixtureV1,
  type Rhc03PreviewFixtureIdentityV1,
} from '@/tests/fixtures/editron/open-ended-planner-v2/rhc03-generated-composition-fixture-v1';

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
  assertStage25Rhc03PreviewMediaFixtureReceiptV1,
  STAGE25_RHC03_ASSET_IDS_V1,
  type Stage25Rhc03PreviewMediaFixtureReceiptV1,
} from './stage25-rhc03-preview-media-fixture-v1';
import type { ProviderNativeToolExecutionV2R }
  from './provider-native-tool-episode-v2r';
import type { Project, ProjectRevisionV1 }
  from '../../services/project-service';

type JsonRecord = Record<string, unknown>;

export const STAGE25_RHC03_PREVIEW_CANDIDATES_VERSION_V1 =
  'EDITRON_OE_STAGE25_RHC03_PREVIEW_CANDIDATES_V1' as const;

export async function buildStage25Rhc03PreviewCandidatesV1(
  media: Readonly<Stage25Rhc03PreviewMediaFixtureReceiptV1>,
  input: Readonly<{ repoRoot?: string }> = {},
) {
  assertStage25Rhc03PreviewMediaFixtureReceiptV1(media);
  const task = STAGE25_HELDOUT_ROUTE_FREEZE_V1.tasks
    .find(({ taskId }) => taskId === 'RHC-03') ?? fail('TASK_MISSING');
  const identity = identityFromMedia(media);
  const fixture = buildRhc03GeneratedCompositionFixtureV1(identity);
  const verification = verifyGeneratedCompositionProgramV1(fixture);
  if (verification.disposition !== 'CONTRACT_PASS'
    || !verification.programHash || !verification.sourceBundleHash) {
    fail(`PROGRAM_VERIFICATION_FAILED:${verification.diagnostics.join('|')}`);
  }
  const repoRoot = path.resolve(input.repoRoot ?? process.cwd());
  const apiPath = path.resolve(
    repoRoot,
    'lib/editron/research/open-ended-planner/generated-composition-api-v1.tsx',
  );
  const runtimeDigestSha256 = (await regularArtifact(apiPath)).sha256;
  const adaptation = adaptGeneratedCompositionProgramToProjectDraftV1({
    verificationInput: fixture,
    sourceRightsReceipts: media.provenance,
    compositionId: 'rhc03-synchronized-dual-view',
    runtimeDigestSha256,
    generatorBinding: { kind: 'HUMAN_AUTHORED', authorId: 'rhc03-proposal-user' },
  });
  const nativeOwnerObservation = await observeNativeOwner(identity);
  const common = {
    version: STAGE25_RHC03_PREVIEW_CANDIDATES_VERSION_V1,
    taskId: 'RHC-03' as const,
    taskSha256: String(task.taskSha256),
    fixtureSha256: fixture.fixtureSha256,
    mediaReceiptSha256: media.receiptSha256,
    targetPredicateIds: predicateIds(task.targetPredicates, 'TARGET'),
    preservationPredicateIds: predicateIds(
      task.preservationPredicates,
      'PRESERVATION',
    ),
    targetRange: fixture.handoffs.target,
    handoffs: fixture.handoffs,
    audioBaselineHash: hashCanonicalJsonV1(fixture.audioBaseline),
    renderDisposition: 'NOT_RENDERED' as const,
    qualityDisposition: 'UNJUDGED' as const,
    productExecutionDisposition: 'NOT_AUTHORIZED' as const,
    providerInferenceCalls: 0 as const,
    canonicalProjectMutationWrites: 0 as const,
    stateEffects: [] as const,
  };
  const routes = [
    {
      ...common,
      route: 'NATIVE' as const,
      candidateId: 'RHC-03:NATIVE:V1' as const,
      disposition: 'CAPABILITY_GAP' as const,
      capabilityAvailable: false as const,
      form: {
        kind: 'EDITRON_ADD_OVERLAY_INPUTS' as const,
        formOwnerRef: 'lib/editron/agent/chat-add-overlay-form.ts#buildChatAddOverlayForm',
        proposalOwnerRef:
          'provider-native-project-service-overlay-owner-v2r.ts#createProviderNativeProjectServiceOverlayOwnerV2R',
        canonicalMutationOwnerRef:
          'lib/editron/services/project-service.ts#ProjectService.addOverlay',
        requestedVisualOperators: ['add_overlay:video', 'add_overlay:video'] as const,
        requestedLabelOperator: 'add_overlay:text' as const,
        requestedAudioMutations: [] as const,
      },
      qualifications: {
        isolatedRevisionIssuedVideoOverlayWriter: true as const,
        bothMutedVideoFormsAccepted: true as const,
        nativeAudioBaselineBound: true as const,
        timebaseHandoff: true as const,
        boundaryHandoff: true as const,
        exactNativeFontFileBinding: false as const,
      },
      capabilityGapCodes: ['NATIVE_EXACT_FONT_FILE_BINDING_UNAVAILABLE'] as const,
      ownerObservation: nativeOwnerObservation,
    },
    {
      ...common,
      route: 'GENERATED_COMPOSITION' as const,
      candidateId: 'RHC-03:GENERATED_COMPOSITION:V1' as const,
      disposition: 'CAPABILITY_GAP' as const,
      capabilityAvailable: false as const,
      form: {
        kind: 'VERIFIED_GENERATED_COMPOSITION_PROGRAM' as const,
        programId: fixture.program.programId,
        programSha256: verification.programHash,
        sourceBundleSha256: verification.sourceBundleHash,
        sourceBindings: fixture.program.sourceSlots.map(({ slotId, assetId }) => ({
          slotId,
          assetId,
        })),
        exactLabel: 'SYNC' as const,
      },
      qualifications: {
        programContractVerified: true as const,
        editableViewBindings: true as const,
        editableLabelAndLayoutControls: true as const,
        synchronizedSourceMapping: true as const,
        playableProductionAudioOwner: false as const,
      },
      capabilityGapCodes: ['GENERATED_PROXY_PLAYABLE_AUDIO_ABSENT'] as const,
    },
    {
      ...common,
      route: 'HYBRID' as const,
      candidateId: 'RHC-03:HYBRID:V1' as const,
      disposition: 'READY_FOR_RENDER' as const,
      capabilityAvailable: true as const,
      form: {
        kind: 'GENERATED_VISUAL_ISLAND_WITH_NATIVE_AUDIO' as const,
        programId: fixture.program.programId,
        programSha256: verification.programHash,
        sourceBundleSha256: verification.sourceBundleHash,
        projectServiceDraftSha256: adaptation.binding.draftSha256,
        projectServiceAdapterReceiptSha256: adaptation.receipt.receiptSha256,
        projectServiceProposalOwnerRef:
          'provider-native-project-service-generated-composition-owner-v2r.ts#createProviderNativeProjectServiceGeneratedCompositionOwnerV2R',
        canonicalPrepareOwnerRef:
          'lib/editron/services/project-service.ts#ProjectService.prepareProjectGeneratedCompositionV1',
        canonicalFinalizeOwnerRef:
          'lib/editron/services/project-service.ts#ProjectService.finalizeProjectGeneratedCompositionV1',
        nativeAudioOwner: fixture.audioBaseline.owner,
        nativeAudioMutationAllowed: false as const,
      },
      qualifications: {
        programContractVerified: true as const,
        sourceRightsReceiptsVerified: true as const,
        exactFontFileBound: true as const,
        timebaseHandoff: true as const,
        audioHandoff: true as const,
        boundaryHandoff: true as const,
        isolatedProjectServiceDraftProjection: true as const,
        sandboxExecutionPending: true as const,
        renderedAvProofPending: true as const,
      },
      capabilityGapCodes: [] as const,
    },
  ];
  const material = {
    version: STAGE25_RHC03_PREVIEW_CANDIDATES_VERSION_V1,
    artifactType: 'Stage25Rhc03PreviewCandidatesV1' as const,
    authority: 'CURRENT_RESEARCH_ROUTE_CONTRACT_NO_PROJECT_MUTATION' as const,
    taskSha256: String(task.taskSha256),
    mediaReceiptSha256: media.receiptSha256,
    fixtureSha256: fixture.fixtureSha256,
    runtimeDigestSha256,
    programVerification: verification,
    projectServiceProjection: {
      compositionId: adaptation.draft.compositionId,
      draftSha256: adaptation.binding.draftSha256,
      adapterReceiptSha256: adaptation.receipt.receiptSha256,
      requiredEvidenceIds: adaptation.requiredEvidenceIds,
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
    proofCeiling: 'MATERIALIZED_FORM_AND_ISOLATED_OWNER_PROOF_NOT_RENDERED' as const,
    stateEffects: [] as const,
  };
  return deepFreezeV1({
    ...material,
    routeSetSha256: hashCanonicalJsonV1(routes),
    receiptSha256: hashCanonicalJsonV1(material),
  });
}

export function identityFromMedia(
  media: Readonly<Stage25Rhc03PreviewMediaFixtureReceiptV1>,
): Readonly<Rhc03PreviewFixtureIdentityV1> {
  assertStage25Rhc03PreviewMediaFixtureReceiptV1(media);
  const assets = new Map(media.assets.map((asset) => [asset.assetId, asset]));
  const rights = new Map(media.provenance.map((receipt) => [receipt.assetId, receipt]));
  if (assets.size !== STAGE25_RHC03_ASSET_IDS_V1.length
    || rights.size !== STAGE25_RHC03_ASSET_IDS_V1.length
    || STAGE25_RHC03_ASSET_IDS_V1.some((assetId) => (
      !assets.has(assetId) || !rights.has(assetId)
    ))) {
    fail('MEDIA_ASSET_SET_INVALID');
  }
  return deepFreezeV1({
    assetVersions: Object.fromEntries(STAGE25_RHC03_ASSET_IDS_V1.map((assetId) => [
      assetId,
      `sha256:${required(assets.get(assetId)?.sha256, `ASSET_${assetId}`)}`,
    ])) as Rhc03PreviewFixtureIdentityV1['assetVersions'],
    rightsEvidenceVersions: Object.fromEntries(
      STAGE25_RHC03_ASSET_IDS_V1.map((assetId) => [
        assetId,
        `sha256:${required(rights.get(assetId)?.receiptSha256, `RIGHTS_${assetId}`)}`,
      ]),
    ) as Rhc03PreviewFixtureIdentityV1['rightsEvidenceVersions'],
    fontVersion: `sha256:${media.font.sha256}`,
    fontFileSha256: media.font.sha256,
    nativeAudioPcmSha256: media.productionAudio.decodedPcmSha256,
  });
}

async function observeNativeOwner(
  identity: Readonly<Rhc03PreviewFixtureIdentityV1>,
) {
  const visualProbe = await createProbe('video-views');
  const evidenceIds = [
    'rhc03-source-rhc03-action-left',
    'rhc03-source-rhc03-action-right',
  ] as const;
  const requests = [
    {
      type: 'video', assetId: 'rhc03-action-left', start: 450, duration: 150,
      row: 3, x: 77, y: 43, width: 787, height: 994, videoStartTime: 0,
      styles: { objectFit: 'cover', opacity: 1, volume: 0 },
      evidenceIds: [evidenceIds[0]],
    },
    {
      type: 'video', assetId: 'rhc03-action-right', start: 450, duration: 150,
      row: 2, x: 1056, y: 43, width: 787, height: 994, videoStartTime: 0,
      styles: { objectFit: 'cover', opacity: 1, volume: 0 },
      evidenceIds: [evidenceIds[1]],
    },
  ] as const;
  const executions: ProviderNativeToolExecutionV2R[] = [];
  let revision = visualProbe.resolved.currentRevision.projectRevision;
  for (const [index, request] of requests.entries()) {
    const execution = await visualProbe.resolved.isolatedClone.executeIsolated({
      operatorId: 'add_overlay',
      turn: index + 1,
      arguments: {
        projectId: visualProbe.canonical.projectId,
        expectedProjectRevision: revision,
        ...request,
      },
    });
    if (execution.disposition !== 'OK') fail('NATIVE_VIDEO_EXECUTION_NOT_OK');
    revision = receiptRevision(execution);
    executions.push(execution as ProviderNativeToolExecutionV2R);
  }
  const finalizeVisual = visualProbe.resolved.isolatedClone.finalizeProposalReceipt
    ?? fail('NATIVE_VISUAL_FINALIZER_MISSING');
  const visualProposal = await finalizeVisual();
  if (!visualProposal.canonicalUnchanged
    || visualProposal.changedPaths.join('|') !== '$.overlays[2]|$.overlays[3]'
    || visualProbe.canonicalBeforeSha256
      !== hashCanonicalJsonV1(projectProposalStateV2R(visualProbe.canonical))) {
    fail('NATIVE_VIDEO_PROPOSAL_DRIFT');
  }

  const fontProbe = await createProbe('exact-font');
  const exactFont = await fontProbe.resolved.isolatedClone.executeIsolated({
    operatorId: 'add_overlay',
    turn: 1,
    arguments: {
      projectId: fontProbe.canonical.projectId,
      expectedProjectRevision: fontProbe.resolved.currentRevision.projectRevision,
      type: 'text', text: 'SYNC', start: 450, duration: 150,
      row: 4, x: 864, y: 486, width: 192, height: 108,
      styles: {
        fontFamily: 'Noto Sans', fontSize: 40, fontWeight: 400,
        textAlign: 'center', color: '#FFFFFF', backgroundColor: '#05070A',
        opacity: 1,
      },
      evidenceIds: ['rhc03-font'],
    },
  });
  const finalizeFont = fontProbe.resolved.isolatedClone.finalizeProposalReceipt
    ?? fail('NATIVE_FONT_FINALIZER_MISSING');
  const fontProposal = await finalizeFont();
  const fontCode = text(exactFont.output.code);
  if (exactFont.disposition !== 'UNVERIFIABLE'
    || fontCode !== 'PROJECTSERVICE_ISOLATED_OVERLAY_FORM_INPUT_INVALID'
    || fontProposal.changedPaths.length || !fontProposal.canonicalUnchanged
    || fontProbe.canonicalBeforeSha256
      !== hashCanonicalJsonV1(projectProposalStateV2R(fontProbe.canonical))) {
    fail('NATIVE_EXACT_FONT_SAFE_STOP_DRIFT');
  }
  return deepFreezeV1({
    authority: 'CURRENT_RHC03_ISOLATED_OWNER_OBSERVATION_NO_CANONICAL_MUTATION' as const,
    ownerRef:
      'provider-native-project-service-overlay-owner-v2r.ts#createProviderNativeProjectServiceOverlayOwnerV2R' as const,
    identitySha256: hashCanonicalJsonV1(identity),
    mutedVideoViews: executions.map((execution, index) => ({
      assetId: requests[index]!.assetId,
      executionSha256: hashCanonicalJsonV1(execution),
      writerProjectRevision: receiptRevision(execution),
      proof: executionProof(execution),
    })),
    visualProposalReceiptSha256: visualProposal.receiptSha256,
    visualProposalChangedPaths: visualProposal.changedPaths,
    exactFont: {
      disposition: exactFont.disposition,
      code: fontCode,
      executionSha256: hashCanonicalJsonV1(exactFont),
      proposalReceiptSha256: fontProposal.receiptSha256,
    },
    canonicalUnchanged: true as const,
    isolatedSnapshotReads: {
      visual: visualProbe.snapshotReads(),
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
    tenantId: 'stage25-rhc03-owner-observation',
    userId: canonical.userId,
    projectId: canonical.projectId,
    episodeId: `stage25-rhc03-${label}`,
  });
  return { canonical, canonicalBeforeSha256, resolved, snapshotReads: () => reads };
}

function probeProject(): Project {
  const timestamp = new Date('2026-08-27T08:00:00.000Z');
  const base = {
    from: 0, durationInFrames: 900, left: 0, top: 0,
    width: 1920, height: 1080, rotation: 0, isDragging: false,
  };
  return {
    projectId: 'stage25-rhc03-preview',
    userId: 'stage25-rhc03-owner-observation',
    name: 'RHC-03 native owner observation',
    overlays: [
      {
        ...base, id: 1, row: 0, type: 'video', assetId: 'rhc03-authored-wide',
        videoStartTime: 0, styles: { opacity: 1, volume: 0 },
        content: 'rhc03-authored-wide',
      },
      {
        ...base, id: 2, row: 1, type: 'sound', assetId: 'rhc03-production-audio',
        startFromSound: 0, styles: { volume: 1 }, content: 'rhc03-production-audio',
      },
    ] as unknown as Project['overlays'],
    aspectRatio: '16:9', playerDimensions: { width: 1920, height: 1080 },
    fps: 30, durationInFrames: 900, createdAt: timestamp, updatedAt: timestamp,
    projectRevision: 1, visibility: 'private',
  };
}

function executionProof(execution: Readonly<ProviderNativeToolExecutionV2R>): JsonRecord {
  const receipt = record(execution.output.receipt);
  const proof = record(receipt.proof);
  if (!Object.keys(proof).length) fail('EXECUTION_PROOF_INVALID');
  return proof;
}

function receiptRevision(execution: Readonly<ProviderNativeToolExecutionV2R>): string {
  const revision = record(execution.output.receipt).projectRevision;
  return typeof revision === 'string' && revision.trim()
    ? revision
    : fail('WRITER_REVISION_INVALID');
}

async function regularArtifact(filePath: string) {
  const stat = await lstat(filePath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0) fail('FILE_INVALID');
  return {
    bytes: stat.size,
    sha256: createHash('sha256').update(await readFile(filePath)).digest('hex'),
  };
}

function required(value: string | undefined, code: string): string {
  return value ?? fail(`${code}_MISSING`);
}
function predicateIds(value: unknown, code: string): string[] {
  if (!Array.isArray(value) || !value.length) fail(`${code}_PREDICATES_INVALID`);
  const ids = value.map((entry) => text(record(entry).predicateId));
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) {
    fail(`${code}_PREDICATES_INVALID`);
  }
  return ids;
}
function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function fail(code: string): never {
  throw new Error(`STAGE25_RHC03_PREVIEW_CANDIDATES_${code}`);
}
