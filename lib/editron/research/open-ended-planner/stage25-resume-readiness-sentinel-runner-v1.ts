import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  STAGE25_RESUME_READINESS_FREEZE_V1,
  STAGE25_RESUME_READINESS_FREEZE_VERSION_V1,
  STAGE25_RESUME_READINESS_EXISTING_OWNER_BINDINGS_V1,
  STAGE25_RESUME_READINESS_EXPECTATIONS_V1,
  STAGE25_RESUME_READINESS_SENTINEL_IDS_V1,
  type Stage25ResumeReadinessExpectationV1,
  type Stage25ResumeReadinessOutcomeV1,
  type Stage25ResumeReadinessSentinelIdV1,
} from './stage25-resume-readiness-freeze-v1';

type JsonRecord = Record<string, unknown>;

export const STAGE25_RESUME_SPECIFICATION_RECEIPT_VERSION_V1 =
  'EDITRON_OE_STAGE25_RESUME_SPECIFICATION_RECEIPT_V1_2' as const;

export interface Stage25ResumeSpecificationExampleV1 {
  sentinelId: Stage25ResumeReadinessSentinelIdV1;
  outcome: Stage25ResumeReadinessOutcomeV1;
  exampleSha256: string;
  checkpointExampleSha256: string | null;
  prepareRuntimeIdentity: string | null;
  resumeRuntimeIdentity: string | null;
  prefixProviderReinvokeCount: number;
  prefixWriterPureReplayCount: number;
  suffixProviderInvokeCount: number;
  automaticRetryCount: number;
  canonicalProjectMutationCount: number;
  conservativeUnknownOutcomeReservationApplied: boolean;
}

export function validateStage25ResumeSpecificationExamplesV1(input: Readonly<{
  freeze: unknown;
  examples: readonly Readonly<Stage25ResumeSpecificationExampleV1>[];
}>): Readonly<JsonRecord> {
  const freeze = record(input.freeze, 'FREEZE_INVALID');
  assertSelfHash(freeze, 'freezeSha256', 'FREEZE_HASH_INVALID');
  if (freeze.version !== STAGE25_RESUME_READINESS_FREEZE_VERSION_V1
    || freeze.artifactType !== 'Stage25ResumeSpecificationFreezeV1'
    || freeze.authority
      !== 'ZERO_SPEND_SPECIFICATION_NOT_RESUME_READINESS_OR_PROJECT_OWNER'
    || freeze.proofCeiling
      !== 'LOCAL_ZERO_SPEND_SPECIFICATION_FIXTURE_ONLY') {
    fail('FREEZE_IDENTITY_INVALID');
  }
  if (freeze.executableOwnerEvidenceBound !== false
    || freeze.resumeReadinessEstablished !== false
    || freeze.callerSuppliedExamplesMayEstablishReadiness !== false
    || freeze.dispatchAuthorized !== false
    || freeze.providerInferenceCallCount !== 0
    || array(freeze.stateEffects, 'FREEZE_EFFECTS_INVALID').length) {
    fail('DISPATCH_OR_EFFECTS_ENABLED');
  }
  if (hashCanonicalJsonV1(freeze.existingOwnerBindings)
      !== hashCanonicalJsonV1(STAGE25_RESUME_READINESS_EXISTING_OWNER_BINDINGS_V1)
    || hashCanonicalJsonV1(freeze.expectations)
      !== hashCanonicalJsonV1(STAGE25_RESUME_READINESS_EXPECTATIONS_V1)) {
    fail('COMPILED_POLICY_DRIFT');
  }
  if (hashCanonicalJsonV1(freeze)
      !== hashCanonicalJsonV1(STAGE25_RESUME_READINESS_FREEZE_V1)) {
    fail('COMPILED_FREEZE_DRIFT');
  }

  const expectations = records(freeze.expectations, 'EXPECTATIONS_INVALID');
  const expectationIds = expectations.map((entry) =>
    text(entry.sentinelId, 'EXPECTATION_ID_INVALID'));
  if (!sameOrderedSet(expectationIds, STAGE25_RESUME_READINESS_SENTINEL_IDS_V1)) {
    fail('EXPECTATION_SET_INVALID');
  }
  const examples = input.examples.map((value) => ({ ...value }));
  const exampleIds = examples.map(({ sentinelId }) => sentinelId);
  if (!sameOrderedSet(exampleIds, STAGE25_RESUME_READINESS_SENTINEL_IDS_V1)) {
    fail('EXAMPLE_SET_INVALID');
  }

  const exampleReceipts = expectations.map((expectation, index) => {
    const typed = expectation as unknown as Stage25ResumeReadinessExpectationV1;
    const example = examples[index];
    validateExample(typed, example);
    const material = {
      sentinelId: example.sentinelId,
      outcome: example.outcome,
      exampleSha256: example.exampleSha256,
      checkpointExampleSha256: example.checkpointExampleSha256,
      disposition: 'SPECIFICATION_EXAMPLE_MATCH_ONLY' as const,
    };
    return { ...material, exampleReceiptSha256: hashCanonicalJsonV1(material) };
  });

  const material = {
    version: STAGE25_RESUME_SPECIFICATION_RECEIPT_VERSION_V1,
    artifactType: 'Stage25ResumeSpecificationFixtureReceiptV1' as const,
    authority: 'CALLER_SUPPLIED_SPECIFICATION_VALIDATOR_NOT_EVIDENCE_AGGREGATOR' as const,
    freezeSha256: text(freeze.freezeSha256, 'FREEZE_HASH_INVALID'),
    exampleReceipts,
    assessment: 'SPECIFICATION_FIXTURE_ONLY' as const,
    resumeReadinessDisposition: 'NOT_ESTABLISHED' as const,
    executableOwnerEvidenceBound: false as const,
    callerSuppliedExamplesMayEstablishReadiness: false as const,
    paidResumeDisposition: 'NOT_AUTHORIZED' as const,
    proofCeiling: freeze.proofCeiling,
    whatHasNotBeenChecked: uniqueStrings(
      freeze.whatHasNotBeenChecked,
      'UNCHECKED_INVALID',
    ),
    dispatchAuthorized: false as const,
    providerInferenceCallCount: 0 as const,
    canonicalProjectMutationCount: 0 as const,
    stateEffects: [] as const,
  };
  return deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
}

function validateExample(
  expectation: Readonly<Stage25ResumeReadinessExpectationV1>,
  example: Readonly<Stage25ResumeSpecificationExampleV1>,
): void {
  const id = expectation.sentinelId;
  if (example.sentinelId !== id || example.outcome !== expectation.expectedOutcome) {
    fail(`OUTCOME_INVALID:${id}`);
  }
  sha256(example.exampleSha256, `EXAMPLE_HASH_INVALID:${id}`);
  if (id === 'R1-DISPATCH-DISABLED') {
    if (example.checkpointExampleSha256 !== null) fail(`CHECKPOINT_INVALID:${id}`);
  } else {
    sha256(example.checkpointExampleSha256, `CHECKPOINT_INVALID:${id}`);
  }
  if (!nonNegativeInteger(example.prefixProviderReinvokeCount)
    || !nonNegativeInteger(example.prefixWriterPureReplayCount)
    || !nonNegativeInteger(example.suffixProviderInvokeCount)
    || !nonNegativeInteger(example.automaticRetryCount)
    || !nonNegativeInteger(example.canonicalProjectMutationCount)) {
    fail(`COUNTS_INVALID:${id}`);
  }
  if (example.prefixProviderReinvokeCount
      !== expectation.prefixProviderReinvokeCount
    || example.automaticRetryCount !== expectation.automaticRetryCount
    || example.canonicalProjectMutationCount
      !== expectation.canonicalProjectMutationCount) {
    fail(`FORBIDDEN_EFFECT_OBSERVED:${id}`);
  }
  const writerReplayRequired = expectation.prefixWriterPureReplay
    === 'REQUIRED_AT_LEAST_ONCE';
  if (writerReplayRequired !== (example.prefixWriterPureReplayCount > 0)) {
    fail(`PREFIX_WRITER_REPLAY_INVALID:${id}`);
  }
  const suffixRequired = expectation.suffixProviderInvoke
    === 'REQUIRED_AT_LEAST_ONCE';
  if (suffixRequired !== (example.suffixProviderInvokeCount > 0)) {
    fail(`SUFFIX_INVOKE_INVALID:${id}`);
  }
  const distinctRuntimeRequired = expectation.processBoundary
    === 'DISTINCT_RUNTIME_IDENTITIES_REQUIRED';
  const hasDistinctRuntimes = Boolean(
    example.prepareRuntimeIdentity
    && example.resumeRuntimeIdentity
    && example.prepareRuntimeIdentity !== example.resumeRuntimeIdentity,
  );
  if (distinctRuntimeRequired !== hasDistinctRuntimes) {
    fail(`PROCESS_BOUNDARY_INVALID:${id}`);
  }
  if (!distinctRuntimeRequired
    && (example.prepareRuntimeIdentity !== null
      || example.resumeRuntimeIdentity !== null)) {
    fail(`UNDECLARED_PROCESS_IDENTITY:${id}`);
  }
  const conservativeRequired = expectation.conservativeUnknownOutcomeReservation
    === 'REQUIRED';
  if (example.conservativeUnknownOutcomeReservationApplied
      !== conservativeRequired) {
    fail(`CONSERVATIVE_ACCOUNTING_INVALID:${id}`);
  }
}

function assertSelfHash(value: JsonRecord, field: string, code: string): void {
  const expected = text(value[field], code);
  const unsigned = structuredClone(value);
  delete unsigned[field];
  if (!/^[a-f0-9]{64}$/.test(expected)
    || hashCanonicalJsonV1(unsigned) !== expected) fail(code);
}

function sameOrderedSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function record(value: unknown, code: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  return value as JsonRecord;
}

function records(value: unknown, code: string): JsonRecord[] {
  return array(value, code).map((entry) => record(entry, code));
}

function array(value: unknown, code: string): unknown[] {
  if (!Array.isArray(value)) fail(code);
  return value;
}

function uniqueStrings(value: unknown, code: string): string[] {
  const values = array(value, code);
  if (values.some((entry) => typeof entry !== 'string' || !entry.trim())
    || new Set(values).size !== values.length) fail(code);
  return values as string[];
}

function text(value: unknown, code: string): string {
  if (typeof value !== 'string' || !value.trim()) fail(code);
  return value;
}

function sha256(value: unknown, code: string): void {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail(code);
}

function nonNegativeInteger(value: unknown): boolean {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function fail(code: string): never {
  throw new Error(`STAGE25_RESUME_READINESS_${code}`);
}
