import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  adaptGeneratedCompositionProgramToProjectDraftV1,
  type GeneratedCompositionProjectDraftAdapterInputV1,
} from '@/lib/editron/research/open-ended-planner/generated-composition-project-draft-adapter-v1';
import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { projectProposalStateV2R }
  from '@/lib/editron/research/open-ended-planner/project-service-proposal-state-v2r';
import { createProviderNativeProjectServiceCloneOwnerV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-project-service-clone-owner-v2r';
import { createProviderNativeProjectServiceGeneratedCompositionOwnerV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-project-service-generated-composition-owner-v2r';
import type { ProviderNativeToolExecutionV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-tool-episode-v2r';
import { materializeStage25Rhc02PreviewMediaFixtureV2 }
  from '@/lib/editron/research/open-ended-planner/stage25-rhc02-preview-media-fixture-v2';
import type { Project, ProjectRevisionV1 }
  from '@/lib/editron/services/project-service';
import { buildRhc02GeneratedCompositionFixtureV2 }
  from '@/tests/fixtures/editron/open-ended-planner-v2/rhc02-generated-composition-fixture-v2';

const USER_ID = 'rhc02-proposal-user';
const PROJECT_ID = 'stage25-rhc02-preview';
const COMPOSITION_ID = 'rhc02-chapter-card';
const RUNTIME_SHA256 =
  'ee2468e25c67987e466abaee1e1ef18b0e7caa08c48875b8c52b66ee0382e4bc';
const REVISION: ProjectRevisionV1 = {
  schemaVersion: 1,
  value: 21,
  compatibilityUpdatedAt: '2026-08-27T10:00:00.000Z',
};
const PROJECT_REVISION = `project-revision-v1:${hashCanonicalJsonV1(REVISION)}`;

type Media = Awaited<ReturnType<typeof materializeStage25Rhc02PreviewMediaFixtureV2>>;
let scratch = '';
let media: Media;

beforeAll(async () => {
  scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'editron-rhc02-gcp-owner-'));
  media = await materializeStage25Rhc02PreviewMediaFixtureV2({
    outputDir: path.join(scratch, 'media'),
    createdAt: '2026-08-27T05:30:00.000Z',
  });
}, 60_000);

afterAll(async () => {
  if (scratch) await removeVerifiedScratch(scratch);
});

describe('ProjectService isolated generated-composition owner V2R', () => {
  it('maps the verified RHC02 program without selecting new creative form', () => {
    const adaptation = adaptGeneratedCompositionProgramToProjectDraftV1(adapterInput());
    expect(adaptation.draft).toMatchObject({
      compositionId: COMPOSITION_ID,
      placement: {
        projectRange: { startTick: '300', endExclusiveTick: '390' },
        compositionRange: { startTick: '0', endExclusiveTick: '90' },
      },
      sourceBindings: [
        { slotId: 'source-still-a', mediaKind: 'IMAGE', coordinateDomain: 'STATIC' },
        { slotId: 'source-still-b', mediaKind: 'IMAGE', coordinateDomain: 'STATIC' },
      ],
      fontBindings: [{ family: 'Noto Sans', face: 'Regular', weight: 400 }],
      output: { audioDisposition: 'CUE_HANDOFF_ONLY' },
    });
    expect(adaptation.draft.exposedControls.find(
      ({ parameterId }) => parameterId === 'param-title',
    )).toMatchObject({ value: 'How we shipped it', maximumLength: 17 });
    expect(adaptation.receipt).toMatchObject({
      authority: 'VERIFIED_PROGRAM_TO_PROJECTSERVICE_DRAFT_PROJECTION_ONLY',
      canonicalMutationOwnerCalled: false,
      stringControlPolicy: 'EXACT_AUTHORED_VALUE_LENGTH_NO_CREATIVE_EXPANSION',
      sourceRightsResolution: 'RECEIPT_CONTENT_HASH_VERIFIED',
    });
  });

  it('creates a deterministic pending entry and replays it exactly', async () => {
    const input = adapterInput();
    const adaptation = adaptGeneratedCompositionProgramToProjectDraftV1(input);
    const owner = createProviderNativeProjectServiceGeneratedCompositionOwnerV2R({
      adapterInput: input,
    });
    const project = fixtureProject();
    const call = proposalCall(
      adaptation,
      PROJECT_REVISION,
      hashCanonicalJsonV1(projectProposalStateV2R(project)),
    );
    const execution = await owner.execute(executeInput(project, call));

    expect(execution).toMatchObject({
      authority: 'RESEARCH_ISOLATED_NO_PROJECT_MUTATION',
      disposition: 'OK',
      output: {
        receipt: {
          status: 'PASS',
          projectRevision: expect.stringMatching(/^project-proposal-v2r:[a-f0-9]{64}$/),
          proof: {
            authority: 'PROJECTSERVICE_ISOLATED_GENERATED_COMPOSITION_PROPOSAL_WRITER_V2R_1',
            canonicalMutationOwnerCalled: false,
            lifecycleStage: 'PENDING_PROPOSAL_ONLY',
            changedPaths: ['$.generatedCompositions[0]'],
            revisionHandoff: {
              programExpectedProjectRevision: 'R1',
              projectServiceProposalRevision: PROJECT_REVISION,
            },
            placement: {
              projectRange: { startTick: '300', endExclusiveTick: '390' },
            },
            audioDisposition: 'CUE_HANDOFF_ONLY',
          },
        },
        entry: {
          compositionId: COMPOSITION_ID,
          activeState: null,
          candidateState: {
            verificationDisposition: 'PENDING',
            sourceBindings: [
              { mediaKind: 'IMAGE', coordinateDomain: 'STATIC' },
              { mediaKind: 'IMAGE', coordinateDomain: 'STATIC' },
            ],
            fontBindings: [{ weight: 400 }],
          },
        },
      },
    });
    expect(project.generatedCompositions).toHaveLength(1);

    const replayProject = fixtureProject();
    const replayed = await owner.replayCommitted?.({
      ...executeInput(replayProject, call),
      checkpoint: {} as never,
      recordedExecution: execution,
    });
    expect(hashCanonicalJsonV1(replayed)).toBe(hashCanonicalJsonV1(execution));
    expect(replayProject.generatedCompositions).toEqual(project.generatedCompositions);
  });

  it('finalizes a clone proposal while the canonical ProjectService snapshot stays unchanged', async () => {
    const canonical = fixtureProject();
    const input = adapterInput();
    const adaptation = adaptGeneratedCompositionProgramToProjectDraftV1(input);
    let reads = 0;
    const resolved = await createProviderNativeProjectServiceCloneOwnerV2R({
      projectService: {
        loadProjectForMutation: async () => {
          reads += 1;
          return { project: structuredClone(canonical), revision: structuredClone(REVISION) };
        },
      },
      isolatedOperatorOwner:
        createProviderNativeProjectServiceGeneratedCompositionOwnerV2R({ adapterInput: input }),
    }).resolveFresh!({
      tenantId: 'tenant-rhc02',
      userId: USER_ID,
      projectId: PROJECT_ID,
      episodeId: 'rhc02-generated-composition-proposal',
    });
    const execution = await resolved.isolatedClone.executeIsolated(proposalCall(
      adaptation,
      resolved.currentRevision.projectRevision,
      resolved.isolatedClone.stateSha256,
    ));
    const receipt = await resolved.isolatedClone.finalizeProposalReceipt?.();

    expect(execution.disposition).toBe('OK');
    expect(receipt).toMatchObject({
      canonicalUnchanged: true,
      changedPaths: ['$.generatedCompositions[0]'],
      operationReceipts: [{ operatorId: 'generated_composition_program', turn: 1 }],
    });
    expect(canonical.generatedCompositions).toEqual([]);
    expect(reads).toBeGreaterThanOrEqual(2);
  });

  it.each([
    ['stale revision', { expectedProjectRevision: 'forged' }, 'CONFLICT',
      'PROJECTSERVICE_ISOLATED_GENERATED_COMPOSITION_REVISION_CONFLICT'],
    ['stale state', { expectedProjectStateSha256: '0'.repeat(64) }, 'CONFLICT',
      'PROJECTSERVICE_ISOLATED_GENERATED_COMPOSITION_STATE_CONFLICT'],
    ['forged program', { programSha256: '0'.repeat(64) }, 'UNVERIFIABLE',
      'PROJECTSERVICE_ISOLATED_GENERATED_COMPOSITION_ARTIFACT_BINDING_INVALID'],
    ['missing evidence', { evidenceIds: [] }, 'UNVERIFIABLE',
      'PROJECTSERVICE_ISOLATED_GENERATED_COMPOSITION_ARTIFACT_BINDING_INVALID'],
    ['unresolved argument', { intent: 'chapter card' }, 'UNVERIFIABLE',
      'PROJECTSERVICE_ISOLATED_GENERATED_COMPOSITION_ARGUMENT_UNSUPPORTED'],
  ])('fails %s closed', async (_name, patch, disposition, code) => {
    const input = adapterInput();
    const adaptation = adaptGeneratedCompositionProgramToProjectDraftV1(input);
    const project = fixtureProject();
    const call = proposalCall(
      adaptation,
      PROJECT_REVISION,
      hashCanonicalJsonV1(projectProposalStateV2R(project)),
      patch as Record<string, unknown>,
    );
    const execution = await createProviderNativeProjectServiceGeneratedCompositionOwnerV2R({
      adapterInput: input,
    }).execute(executeInput(project, call));
    expect(execution).toMatchObject({ disposition, output: { code } });
    expect(project.generatedCompositions).toEqual([]);
  });

  it('rejects a project too short for the bound placement', async () => {
    const input = adapterInput();
    const adaptation = adaptGeneratedCompositionProgramToProjectDraftV1(input);
    const project = fixtureProject();
    project.durationInFrames = 389;
    const execution = await createProviderNativeProjectServiceGeneratedCompositionOwnerV2R({
      adapterInput: input,
    }).execute(executeInput(project, proposalCall(
      adaptation,
      PROJECT_REVISION,
      hashCanonicalJsonV1(projectProposalStateV2R(project)),
    )));
    expect(execution).toMatchObject({
      disposition: 'CONFLICT',
      output: { code: 'PROJECTSERVICE_ISOLATED_GENERATED_COMPOSITION_PROJECT_CONTRACT_CONFLICT' },
    });
    expect(project.generatedCompositions).toEqual([]);
  });

  it('rejects a duplicate insert and a different composition overlapping the range', async () => {
    const project = fixtureProject();
    const input = adapterInput();
    const adaptation = adaptGeneratedCompositionProgramToProjectDraftV1(input);
    const owner = createProviderNativeProjectServiceGeneratedCompositionOwnerV2R({
      adapterInput: input,
    });
    const first = await owner.execute(executeInput(project, proposalCall(
      adaptation,
      PROJECT_REVISION,
      hashCanonicalJsonV1(projectProposalStateV2R(project)),
    )));
    const firstRevision = receiptRevision(first);
    const duplicate = await owner.execute(executeInput(project, proposalCall(
      adaptation,
      firstRevision,
      hashCanonicalJsonV1(projectProposalStateV2R(project)),
      {},
      2,
    ), firstRevision));
    expect(duplicate).toMatchObject({
      disposition: 'CONFLICT',
      output: { code: 'PROJECTSERVICE_ISOLATED_GENERATED_COMPOSITION_ALREADY_EXISTS' },
    });
    expect(project.generatedCompositions).toHaveLength(1);

    const overlapProject = fixtureProject();
    const existingInput = { ...adapterInput(), compositionId: 'rhc02-existing-card' };
    const existingAdaptation = adaptGeneratedCompositionProgramToProjectDraftV1(existingInput);
    const existing = await createProviderNativeProjectServiceGeneratedCompositionOwnerV2R({
      adapterInput: existingInput,
    }).execute(executeInput(overlapProject, proposalCall(
      existingAdaptation,
      PROJECT_REVISION,
      hashCanonicalJsonV1(projectProposalStateV2R(overlapProject)),
    )));
    const existingRevision = receiptRevision(existing);
    const overlap = await owner.execute(executeInput(overlapProject, proposalCall(
      adaptation,
      existingRevision,
      hashCanonicalJsonV1(projectProposalStateV2R(overlapProject)),
      {},
      2,
    ), existingRevision));
    expect(overlap).toMatchObject({
      disposition: 'CONFLICT',
      output: { code: 'PROJECTSERVICE_ISOLATED_GENERATED_COMPOSITION_TARGET_OVERLAP' },
    });
    expect(overlapProject.generatedCompositions).toHaveLength(1);
  });

  it('rejects source evidence without an immutable rights receipt', () => {
    const fixture = structuredClone(buildRhc02GeneratedCompositionFixtureV2(media));
    const evidence = fixture.evidencePack as { facts: Array<Record<string, unknown>> };
    const source = evidence.facts.find(
      ({ kind }) => kind === 'SOURCE_MEDIA_IDENTITY',
    );
    if (!source) throw new Error('RHC02 source fact missing');
    delete source.rightsEvidenceVersion;
    fixture.program.projectBinding.evidencePackHash = hashCanonicalJsonV1(evidence);
    expect(() => adaptGeneratedCompositionProgramToProjectDraftV1({
      ...adapterInput(),
      verificationInput: fixture,
    })).toThrow('GENERATED_COMPOSITION_PROJECT_DRAFT_ADAPTER_SOURCE_RIGHTS_EVIDENCE');
  });

  it('rejects forged source-rights receipt content', () => {
    const input = adapterInput();
    const sourceRightsReceipts = structuredClone(input.sourceRightsReceipts) as
      Record<string, unknown>[];
    const boundReceipt = sourceRightsReceipts.find(
      ({ assetId }) => assetId === 'rhc02-still-a',
    );
    if (!boundReceipt) throw new Error('RHC02 bound rights receipt missing');
    boundReceipt.transform = 'FORGED_TRANSFORM';
    expect(() => adaptGeneratedCompositionProgramToProjectDraftV1({
      ...input,
      sourceRightsReceipts,
    })).toThrow('GENERATED_COMPOSITION_PROJECT_DRAFT_ADAPTER_SOURCE_RIGHTS_RECEIPT_HASH_DRIFT');
  });

  it('detects a forged recorded execution on replay', async () => {
    const input = adapterInput();
    const adaptation = adaptGeneratedCompositionProgramToProjectDraftV1(input);
    const owner = createProviderNativeProjectServiceGeneratedCompositionOwnerV2R({
      adapterInput: input,
    });
    const project = fixtureProject();
    const call = proposalCall(
      adaptation,
      PROJECT_REVISION,
      hashCanonicalJsonV1(projectProposalStateV2R(project)),
    );
    const execution = await owner.execute(executeInput(project, call));
    const forged = structuredClone(execution) as ProviderNativeToolExecutionV2R;
    (forged.output.receipt as Record<string, unknown>).projectRevision = 'forged';
    await expect(owner.replayCommitted?.({
      ...executeInput(fixtureProject(), call),
      checkpoint: {} as never,
      recordedExecution: forged,
    })).rejects.toThrow('PROJECTSERVICE_ISOLATED_GENERATED_COMPOSITION_REPLAY_MISMATCH');
  });
});

function adapterInput(): GeneratedCompositionProjectDraftAdapterInputV1 {
  return {
    verificationInput: buildRhc02GeneratedCompositionFixtureV2(media),
    sourceRightsReceipts: media.provenance,
    compositionId: COMPOSITION_ID,
    runtimeDigestSha256: RUNTIME_SHA256,
    generatorBinding: { kind: 'HUMAN_AUTHORED', authorId: USER_ID },
  };
}

function proposalCall(
  adaptation: ReturnType<typeof adaptGeneratedCompositionProgramToProjectDraftV1>,
  expectedProjectRevision: string,
  expectedProjectStateSha256: string,
  patch: Readonly<Record<string, unknown>> = {},
  turn = 1,
) {
  return {
    operatorId: 'generated_composition_program',
    turn,
    arguments: {
      projectId: PROJECT_ID,
      expectedProjectRevision,
      expectedProjectStateSha256,
      programExpectedProjectRevision: adaptation.binding.programExpectedProjectRevision,
      operationKind: 'INSERT',
      compositionId: adaptation.draft.compositionId,
      programSha256: adaptation.binding.programSha256,
      sourceBundleSha256: adaptation.binding.sourceBundleSha256,
      evidencePackSha256: adaptation.binding.evidencePackSha256,
      sourceRightsReceiptsSha256: adaptation.binding.sourceRightsReceiptsSha256,
      referenceBlueprintSha256: adaptation.binding.referenceBlueprintSha256,
      runtimeDigestSha256: adaptation.binding.runtimeDigestSha256,
      draftSha256: adaptation.binding.draftSha256,
      adapterReceiptSha256: adaptation.binding.adapterReceiptSha256,
      evidenceIds: [...adaptation.requiredEvidenceIds],
      ...patch,
    },
  } as const;
}

function executeInput(
  project: Project,
  call: ReturnType<typeof proposalCall>,
  currentProjectRevision = PROJECT_REVISION,
) {
  return {
    tenantId: 'tenant-rhc02',
    userId: USER_ID,
    projectId: PROJECT_ID,
    project,
    baseRevision: REVISION,
    currentProjectRevision,
    call,
  };
}

function receiptRevision(execution: Readonly<ProviderNativeToolExecutionV2R>): string {
  const receipt = execution.output.receipt;
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
    throw new Error('Generated-composition receipt missing');
  }
  const revision = (receipt as Record<string, unknown>).projectRevision;
  if (typeof revision !== 'string') throw new Error('Generated-composition revision missing');
  return revision;
}

function fixtureProject(): Project {
  return {
    projectId: PROJECT_ID,
    userId: USER_ID,
    name: 'RHC02 generated-composition proposal',
    overlays: [],
    aspectRatio: '9:16',
    playerDimensions: { width: 1080, height: 1920 },
    fps: 30,
    durationInFrames: 450,
    createdAt: new Date('2026-08-27T09:00:00.000Z'),
    updatedAt: new Date(REVISION.compatibilityUpdatedAt),
    projectRevision: REVISION.value,
    generatedCompositions: [],
    visibility: 'private',
  };
}

async function removeVerifiedScratch(value: string): Promise<void> {
  const resolved = path.resolve(value);
  if (path.dirname(resolved) !== path.resolve(os.tmpdir())
    || !path.basename(resolved).startsWith('editron-rhc02-gcp-owner-')) {
    throw new Error(`Unsafe RHC02 generated-composition test scratch: ${resolved}`);
  }
  await fs.rm(resolved, { recursive: true, force: true });
}
