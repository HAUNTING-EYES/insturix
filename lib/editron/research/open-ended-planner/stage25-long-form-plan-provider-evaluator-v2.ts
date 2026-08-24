import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  PROVIDER_NATIVE_EPISODE_VERSION_V2R,
  type ProviderNativeEpisodeReceiptV2R,
} from './provider-native-tool-episode-v2r';
import {
  compileStage25LongFormPlanProposalV2,
} from './stage25-long-form-plan-compiler-v2';
import {
  buildStage25LongFormPlanHoldoutContextV2,
  createStage25LongFormPlanProposalV2,
  type Stage25LongFormPlanProposalV2,
} from './stage25-long-form-plan-holdout-v2';
import {
  buildStage25LongFormProviderContextV2,
  buildStage25LongFormProviderToolSetV2,
  STAGE25_LONG_FORM_PROVIDER_PRESENTATION_COUNT_V2,
} from './stage25-long-form-plan-provider-protocol-v2';

type JsonRecord = Record<string, unknown>;

export const STAGE25_LONG_FORM_PROVIDER_EVALUATOR_VERSION_V2 =
  'EDITRON_STAGE25_LONG_FORM_PROVIDER_EVALUATOR_V2_1' as const;

export type Stage25LongFormProviderStructuralDispositionV2 =
  | 'PASS_STRUCTURAL_ONLY'
  | 'FAIL_STRUCTURAL'
  | 'UNVERIFIABLE_NO_PROPOSAL'
  | 'CLARIFICATION_REQUIRED_NO_PROPOSAL'
  | 'UNVERIFIABLE_PROVIDER_TERMINAL'
  | 'FAIL_PROTOCOL_INCONSISTENT_DISPOSITION';

export function evaluateStage25LongFormProviderEpisodeV2(
  receiptValue: Readonly<ProviderNativeEpisodeReceiptV2R>,
): Readonly<JsonRecord> {
  const receipt = assertEpisode(receiptValue);
  const argumentsValue = terminalArguments(receipt);
  const proposalValue = argumentsValue?.proposal;
  if (receipt.terminal.disposition !== 'READY_FOR_PROOF') {
    const disposition = nonReadyDisposition(receipt, proposalValue);
    return finish(receipt, {
      structuralDisposition: disposition,
      proposalSha256: null,
      planRevisionSha256: null,
      compiledPlan: null,
      compilerReceipt: null,
      diagnostics: disposition === 'FAIL_PROTOCOL_INCONSISTENT_DISPOSITION'
        ? ['NON_READY_DISPOSITION_MUST_NOT_CARRY_PROPOSAL']
        : [`PROVIDER_TERMINAL:${receipt.terminal.disposition}`],
    });
  }
  if (!argumentsValue || !proposalValue || typeof proposalValue !== 'object'
    || Array.isArray(proposalValue)) {
    return finish(receipt, {
      structuralDisposition: 'FAIL_STRUCTURAL',
      proposalSha256: null,
      planRevisionSha256: null,
      compiledPlan: null,
      compilerReceipt: null,
      diagnostics: ['READY_FOR_PROOF_PROPOSAL_MISSING'],
    });
  }
  try {
    const proposal = createStage25LongFormPlanProposalV2(
      proposalValue as Omit<Stage25LongFormPlanProposalV2, 'proposalSha256'>,
    );
    const compiled = compileStage25LongFormPlanProposalV2({
      context: buildStage25LongFormPlanHoldoutContextV2(), proposal,
    });
    return finish(receipt, {
      structuralDisposition: 'PASS_STRUCTURAL_ONLY',
      proposalSha256: proposal.proposalSha256,
      planRevisionSha256: compiled.plan.revisionSha256,
      compiledPlan: compiled.plan,
      compilerReceipt: compiled.receipt,
      diagnostics: [],
    });
  } catch (error) {
    return finish(receipt, {
      structuralDisposition: 'FAIL_STRUCTURAL',
      proposalSha256: null,
      planRevisionSha256: null,
      compiledPlan: null,
      compilerReceipt: null,
      diagnostics: [boundedError(error)],
    });
  }
}

function finish(
  receipt: Readonly<ProviderNativeEpisodeReceiptV2R>,
  result: Readonly<JsonRecord>,
): Readonly<JsonRecord> {
  const material = {
    version: STAGE25_LONG_FORM_PROVIDER_EVALUATOR_VERSION_V2,
    authority: 'RESEARCH_STRUCTURAL_EVALUATION_NO_PROJECT_MUTATION' as const,
    assessmentScope: 'STRUCTURE_AND_PROVENANCE_ONLY' as const,
    episodeReceiptSha256: receipt.receiptSha256,
    routeId: receipt.route.routeId,
    model: receipt.route.model,
    providerDisposition: receipt.terminal.disposition,
    ...result,
    qualityJudgments: {
      editorialTaste: 'UNVERIFIABLE',
      rangeSemanticAccuracy: 'UNVERIFIABLE',
      renderedAudiovisualQuality: 'UNVERIFIABLE',
      blindEditorReviewRequired: true,
    },
    stateEffects: [] as const,
  };
  return deepFreezeV1({
    ...material, evaluationSha256: hashCanonicalJsonV1(material),
  });
}

function assertEpisode(
  value: Readonly<ProviderNativeEpisodeReceiptV2R>,
): Readonly<ProviderNativeEpisodeReceiptV2R> {
  const { receiptSha256, ...material } = value;
  if (value.receiptVersion !== PROVIDER_NATIVE_EPISODE_VERSION_V2R
    || value.authority !== 'RESEARCH_ONLY_NO_PROJECT_MUTATION'
    || value.selectedOperatorIds.length !== 0
    || value.stateEffects.length !== 0
    || receiptSha256 !== hashCanonicalJsonV1(material)) {
    throw new Error('STAGE25_LONG_FORM_PROVIDER_V2_EPISODE_RECEIPT_INVALID');
  }
  const match = /^STAGE25-LONGFORM-PLAN-V2:P([1-9][0-9]*)$/.exec(value.episodeId);
  const presentationOrdinal = match ? Number(match[1]) : Number.NaN;
  if (!Number.isSafeInteger(presentationOrdinal)
    || presentationOrdinal < 1
    || presentationOrdinal > STAGE25_LONG_FORM_PROVIDER_PRESENTATION_COUNT_V2) {
    throw new Error('STAGE25_LONG_FORM_PROVIDER_V2_EPISODE_ID_INVALID');
  }
  const expectedContext = buildStage25LongFormProviderContextV2(presentationOrdinal);
  if (value.episodeId !== expectedContext.episodeId
    || value.contextSha256 !== hashCanonicalJsonV1(expectedContext)) {
    throw new Error('STAGE25_LONG_FORM_PROVIDER_V2_CONTEXT_BINDING_INVALID');
  }
  if (value.toolSetSha256 !== buildStage25LongFormProviderToolSetV2().toolSetSha256) {
    throw new Error('STAGE25_LONG_FORM_PROVIDER_V2_TOOL_SET_BINDING_INVALID');
  }
  return value;
}

function terminalArguments(
  receipt: Readonly<ProviderNativeEpisodeReceiptV2R>,
): JsonRecord | null {
  for (const turn of [...receipt.turns].reverse()) {
    const call = record(turn.modelCall);
    if (call.name === 'finish_editron_research_episode') return record(call.arguments);
  }
  return null;
}

function nonReadyDisposition(
  receipt: Readonly<ProviderNativeEpisodeReceiptV2R>, proposal: unknown,
): Stage25LongFormProviderStructuralDispositionV2 {
  if (proposal !== null && proposal !== undefined) {
    return 'FAIL_PROTOCOL_INCONSISTENT_DISPOSITION';
  }
  if (receipt.terminal.disposition === 'UNVERIFIABLE') {
    return 'UNVERIFIABLE_NO_PROPOSAL';
  }
  if (receipt.terminal.disposition === 'CLARIFICATION_REQUIRED') {
    return 'CLARIFICATION_REQUIRED_NO_PROPOSAL';
  }
  return 'UNVERIFIABLE_PROVIDER_TERMINAL';
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord : {};
}
function boundedError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 2_000);
}
