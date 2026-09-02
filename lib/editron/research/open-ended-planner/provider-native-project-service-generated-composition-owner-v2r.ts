import {
  createPendingProjectGeneratedCompositionStateV1,
  parseProjectGeneratedCompositionEntryV1,
  type ProjectGeneratedCompositionEntryV1,
} from '@/lib/editron/services/project-generated-composition-entry-v1';
import type { Project } from '@/lib/editron/services/project-service';

import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  adaptGeneratedCompositionProgramToProjectDraftV1,
  type GeneratedCompositionProjectDraftAdapterInputV1,
} from './generated-composition-project-draft-adapter-v1';
import {
  changedProjectProposalPathsV2R,
  projectProposalStateV2R,
} from './project-service-proposal-state-v2r';
import {
  issueProjectServiceIsolatedWriterRevisionV2R,
  type ProjectServiceIsolatedOperatorOwnerV2R,
} from './provider-native-project-service-clone-owner-v2r';
import type { ProviderNativeToolExecutionV2R }
  from './provider-native-tool-episode-v2r';

type JsonRecord = Record<string, unknown>;
type ExecuteInput = Parameters<ProjectServiceIsolatedOperatorOwnerV2R['execute']>[0];

const OWNER_AUTHORITY =
  'PROJECTSERVICE_ISOLATED_GENERATED_COMPOSITION_PROPOSAL_WRITER_V2R_1' as const;
const ALLOWED_ARGUMENT_FIELDS = new Set([
  'projectId',
  'expectedProjectRevision',
  'expectedProjectStateSha256',
  'programExpectedProjectRevision',
  'operationKind',
  'expectedBaseStateToken',
  'compositionId',
  'programSha256',
  'sourceBundleSha256',
  'evidencePackSha256',
  'sourceRightsReceiptsSha256',
  'referenceBlueprintSha256',
  'runtimeDigestSha256',
  'draftSha256',
  'adapterReceiptSha256',
  'evidenceIds',
]);

/**
 * Simulates ProjectService.prepareProjectGeneratedCompositionV1 on a proposal
 * clone. Canonical persistence and final proof promotion remain separate.
 */
export function createProviderNativeProjectServiceGeneratedCompositionOwnerV2R(
  ownerInput: Readonly<{
    adapterInput: Readonly<GeneratedCompositionProjectDraftAdapterInputV1>;
  }>,
): Readonly<ProjectServiceIsolatedOperatorOwnerV2R> {
  const adaptation = adaptGeneratedCompositionProgramToProjectDraftV1(
    ownerInput.adapterInput,
  );
  const execute = async (input: ExecuteInput): Promise<
    Readonly<ProviderNativeToolExecutionV2R>
  > => executeGeneratedComposition(input, adaptation);
  return {
    execute,
    replayCommitted: async (input) => {
      const replayed = await execute(input);
      if (hashCanonicalJsonV1(replayed) !== hashCanonicalJsonV1(input.recordedExecution)) {
        throw new Error('PROJECTSERVICE_ISOLATED_GENERATED_COMPOSITION_REPLAY_MISMATCH');
      }
      return replayed;
    },
  };
}

async function executeGeneratedComposition(
  input: ExecuteInput,
  adaptation: ReturnType<typeof adaptGeneratedCompositionProgramToProjectDraftV1>,
): Promise<Readonly<ProviderNativeToolExecutionV2R>> {
  if (input.call.operatorId !== 'generated_composition_program') {
    return unverifiable('PROJECTSERVICE_ISOLATED_GENERATED_COMPOSITION_OPERATOR_UNSUPPORTED');
  }
  if (input.project.projectId !== input.projectId
    || input.project.userId !== input.userId
    || text(input.call.arguments.projectId) !== input.projectId
    || adaptation.draft.programRef.boundProjectId !== input.projectId) {
    return conflict('PROJECTSERVICE_ISOLATED_GENERATED_COMPOSITION_PROJECT_SCOPE_CONFLICT');
  }
  if (!Number.isSafeInteger(input.call.turn) || input.call.turn < 1) {
    return unverifiable('PROJECTSERVICE_ISOLATED_GENERATED_COMPOSITION_TURN_INVALID');
  }
  if (Object.keys(input.call.arguments).some((field) => !ALLOWED_ARGUMENT_FIELDS.has(field))) {
    return unverifiable('PROJECTSERVICE_ISOLATED_GENERATED_COMPOSITION_ARGUMENT_UNSUPPORTED');
  }
  if (text(input.call.arguments.expectedProjectRevision) !== input.currentProjectRevision) {
    return conflict('PROJECTSERVICE_ISOLATED_GENERATED_COMPOSITION_REVISION_CONFLICT');
  }
  const beforeState = projectProposalStateV2R(input.project);
  const beforeStateSha256 = hashCanonicalJsonV1(beforeState);
  if (text(input.call.arguments.expectedProjectStateSha256) !== beforeStateSha256) {
    return conflict('PROJECTSERVICE_ISOLATED_GENERATED_COMPOSITION_STATE_CONFLICT');
  }
  if (!bindingMatches(input.call.arguments, adaptation.binding)
    || text(input.call.arguments.compositionId) !== adaptation.draft.compositionId
    || !sameStringSet(input.call.arguments.evidenceIds, adaptation.requiredEvidenceIds)) {
    return unverifiable('PROJECTSERVICE_ISOLATED_GENERATED_COMPOSITION_ARTIFACT_BINDING_INVALID');
  }
  if (!projectContractMatches(input.project, adaptation.draft)) {
    return conflict('PROJECTSERVICE_ISOLATED_GENERATED_COMPOSITION_PROJECT_CONTRACT_CONFLICT');
  }
  const entries = parseEntries(input.project);
  if (!entries) {
    return unverifiable('PROJECTSERVICE_ISOLATED_GENERATED_COMPOSITION_ENTRY_STATE_INVALID');
  }
  const entryIndex = entries.findIndex(
    ({ compositionId }) => compositionId === adaptation.draft.compositionId,
  );
  const currentEntry = entryIndex >= 0 ? entries[entryIndex]! : null;
  const operationKind = text(input.call.arguments.operationKind);
  if (operationKind === 'INSERT' && currentEntry) {
    return conflict('PROJECTSERVICE_ISOLATED_GENERATED_COMPOSITION_ALREADY_EXISTS');
  }
  if (operationKind === 'REVISE') {
    const expectedBaseStateToken = text(input.call.arguments.expectedBaseStateToken);
    if (!currentEntry || currentStateToken(currentEntry) !== expectedBaseStateToken) {
      return conflict('PROJECTSERVICE_ISOLATED_GENERATED_COMPOSITION_BASE_STATE_CONFLICT');
    }
  } else if (operationKind !== 'INSERT') {
    return unverifiable('PROJECTSERVICE_ISOLATED_GENERATED_COMPOSITION_OPERATION_KIND_INVALID');
  }
  if (hasOverlappingComposition(entries, adaptation.draft.compositionId, adaptation.draft.placement.projectRange)) {
    return conflict('PROJECTSERVICE_ISOLATED_GENERATED_COMPOSITION_TARGET_OVERLAP');
  }

  let nextEntry: ProjectGeneratedCompositionEntryV1;
  try {
    const stateToken = `gcp-state-v1:${hashCanonicalJsonV1({
      authority: OWNER_AUTHORITY,
      projectId: input.projectId,
      compositionId: adaptation.draft.compositionId,
      previousProjectRevision: input.currentProjectRevision,
      turn: input.call.turn,
      callSha256: hashCanonicalJsonV1(input.call),
      draftSha256: adaptation.binding.draftSha256,
      beforeStateSha256,
    })}`;
    const pendingState = createPendingProjectGeneratedCompositionStateV1(
      input.projectId,
      stateToken,
      adaptation.draft,
    );
    nextEntry = parseProjectGeneratedCompositionEntryV1({
      schemaVersion: 1,
      compositionId: adaptation.draft.compositionId,
      activeState: currentEntry?.activeState ?? null,
      candidateState: pendingState,
    });
  } catch {
    return unverifiable('PROJECTSERVICE_ISOLATED_GENERATED_COMPOSITION_STATE_BUILD_INVALID');
  }
  const nextEntries = [...entries];
  if (entryIndex >= 0) nextEntries[entryIndex] = nextEntry;
  else nextEntries.push(nextEntry);
  const afterState = projectProposalStateV2R({
    ...input.project,
    generatedCompositions: nextEntries,
  });
  const afterStateSha256 = hashCanonicalJsonV1(afterState);
  const changedPaths = changedProjectProposalPathsV2R(beforeState, afterState);
  if (beforeStateSha256 === afterStateSha256
    || !changedPaths.length
    || changedPaths.some((path) => !path.startsWith('$.generatedCompositions'))) {
    return unverifiable('PROJECTSERVICE_ISOLATED_GENERATED_COMPOSITION_STATE_CHANGE_INVALID');
  }
  input.project.generatedCompositions = nextEntries;
  const projectRevision = issueProjectServiceIsolatedWriterRevisionV2R({
    writerAuthority: OWNER_AUTHORITY,
    tenantId: input.tenantId,
    userId: input.userId,
    projectId: input.projectId,
    canonicalBaseRevision: input.baseRevision,
    previousProjectRevision: input.currentProjectRevision,
    operatorId: input.call.operatorId,
    turn: input.call.turn,
    argumentSha256: hashCanonicalJsonV1(input.call.arguments),
    beforeStateSha256,
    afterStateSha256,
  });
  return deepFreezeV1({
    authority: 'RESEARCH_ISOLATED_NO_PROJECT_MUTATION' as const,
    disposition: 'OK' as const,
    output: {
      receipt: {
        status: 'PASS',
        projectRevision,
        proof: {
          authority: OWNER_AUTHORITY,
          proposalAdapterRef:
            'generated-composition-project-draft-adapter-v1.ts#adaptGeneratedCompositionProgramToProjectDraftV1',
          isolatedOwnerRef:
            'provider-native-project-service-generated-composition-owner-v2r.ts#createProviderNativeProjectServiceGeneratedCompositionOwnerV2R',
          canonicalPrepareOwnerRef:
            'lib/editron/services/project-service.ts#ProjectService.prepareProjectGeneratedCompositionV1',
          canonicalFinalizeOwnerRef:
            'lib/editron/services/project-service.ts#ProjectService.finalizeProjectGeneratedCompositionV1',
          canonicalMutationOwnerCalled: false,
          lifecycleStage: 'PENDING_PROPOSAL_ONLY',
          beforeStateSha256,
          afterStateSha256,
          changedPaths,
          stateToken: nextEntry.candidateState!.stateIdentity.token,
          adapterReceiptSha256: adaptation.receipt.receiptSha256,
          draftSha256: adaptation.binding.draftSha256,
          revisionHandoff: {
            programExpectedProjectRevision:
              adaptation.binding.programExpectedProjectRevision,
            projectServiceProposalRevision: input.currentProjectRevision,
            exactProjectStateSha256: beforeStateSha256,
          },
          placement: adaptation.draft.placement,
          audioDisposition: adaptation.draft.output.audioDisposition,
        },
      },
      entry: nextEntry,
    },
    evidenceIds: [...adaptation.requiredEvidenceIds],
  });
}

function bindingMatches(
  args: Readonly<JsonRecord>,
  binding: Readonly<Record<string, string>>,
): boolean {
  return Object.entries(binding).every(([key, value]) => text(args[key]) === value);
}

function projectContractMatches(
  project: Readonly<Project>,
  draft: ReturnType<typeof adaptGeneratedCompositionProgramToProjectDraftV1>['draft'],
): boolean {
  const rate = draft.placement.projectTimebase.rate;
  const end = Number(draft.placement.projectRange.endExclusiveTick);
  return project.playerDimensions.width === draft.canvas.width
    && project.playerDimensions.height === draft.canvas.height
    && Number(rate.numerator) / Number(rate.denominator) === project.fps
    && Number.isSafeInteger(end)
    && end <= project.durationInFrames;
}

function parseEntries(project: Readonly<Project>): ProjectGeneratedCompositionEntryV1[] | null {
  if (project.generatedCompositions === undefined) return [];
  if (!Array.isArray(project.generatedCompositions)) return null;
  try {
    const entries = project.generatedCompositions.map(parseProjectGeneratedCompositionEntryV1);
    if (new Set(entries.map(({ compositionId }) => compositionId)).size !== entries.length
      || entries.some((entry) => [entry.activeState, entry.candidateState]
        .some((state) => state && state.projectId !== project.projectId))) return null;
    return entries;
  } catch {
    return null;
  }
}

function currentStateToken(entry: ProjectGeneratedCompositionEntryV1): string | null {
  return (entry.candidateState ?? entry.activeState)?.stateIdentity.token ?? null;
}

function hasOverlappingComposition(
  entries: readonly ProjectGeneratedCompositionEntryV1[],
  compositionId: string,
  target: Readonly<{ startTick: string; endExclusiveTick: string }>,
): boolean {
  const start = BigInt(target.startTick);
  const end = BigInt(target.endExclusiveTick);
  return entries.some((entry) => entry.compositionId !== compositionId
    && [entry.candidateState, entry.activeState].some((state) => state
      && start < BigInt(state.placement.projectRange.endExclusiveTick)
      && BigInt(state.placement.projectRange.startTick) < end));
}

function sameStringSet(value: unknown, expected: readonly string[]): boolean {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) return false;
  const values = value as string[];
  return values.length === expected.length
    && new Set(values).size === values.length
    && expected.every((entry) => values.includes(entry));
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function conflict(code: string): Readonly<ProviderNativeToolExecutionV2R> {
  return deepFreezeV1({
    authority: 'RESEARCH_ISOLATED_NO_PROJECT_MUTATION' as const,
    disposition: 'CONFLICT' as const,
    output: {
      code,
      message: 'The generated-composition proposal conflicts with the bound ProjectService clone.',
    },
    evidenceIds: [] as const,
  });
}

function unverifiable(code: string): Readonly<ProviderNativeToolExecutionV2R> {
  return deepFreezeV1({
    authority: 'RESEARCH_ISOLATED_NO_PROJECT_MUTATION' as const,
    disposition: 'UNVERIFIABLE' as const,
    output: {
      code,
      message: 'The generated-composition proposal cannot be proved safely.',
    },
    evidenceIds: [] as const,
  });
}
