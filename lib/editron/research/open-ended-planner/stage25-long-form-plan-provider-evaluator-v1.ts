import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  PROVIDER_NATIVE_EPISODE_VERSION_V2R,
  type ProviderNativeEpisodeReceiptV2R,
} from './provider-native-tool-episode-v2r';
import {
  compileStage25LongFormPlanProposalV1,
} from './stage25-long-form-plan-compiler-v1';
import {
  buildStage25LongFormPlanHoldoutContextV1,
  createStage25LongFormPlanProposalV1,
  type Stage25LongFormPlanProposalV1,
} from './stage25-long-form-plan-holdout-v1';

type JsonRecord = Record<string, unknown>;

export const STAGE25_LONG_FORM_PROVIDER_EVALUATOR_VERSION_V1 =
  'EDITRON_STAGE25_LONG_FORM_PROVIDER_EVALUATOR_V1_1' as const;

export type Stage25LongFormProviderStructuralDispositionV1 =
  | 'PASS_STRUCTURAL_ONLY'
  | 'FAIL_STRUCTURAL'
  | 'UNVERIFIABLE_NO_PROPOSAL'
  | 'CLARIFICATION_REQUIRED_NO_PROPOSAL'
  | 'UNVERIFIABLE_PROVIDER_TERMINAL'
  | 'FAIL_PROTOCOL_INCONSISTENT_DISPOSITION';

export function evaluateStage25LongFormProviderEpisodeV1(
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
    const proposal = createStage25LongFormPlanProposalV1(
      proposalValue as Omit<Stage25LongFormPlanProposalV1, 'proposalSha256'>,
    );
    const compiled = compileStage25LongFormPlanProposalV1({
      context: buildStage25LongFormPlanHoldoutContextV1(), proposal,
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
    version: STAGE25_LONG_FORM_PROVIDER_EVALUATOR_VERSION_V1,
    authority: 'RESEARCH_STRUCTURAL_EVALUATION_NO_PROJECT_MUTATION' as const,
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
    throw new Error('STAGE25_LONG_FORM_PROVIDER_EPISODE_RECEIPT_INVALID');
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
): Stage25LongFormProviderStructuralDispositionV1 {
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
