import { describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  STAGE25_RESUME_READINESS_FREEZE_V1,
  STAGE25_RESUME_READINESS_SENTINEL_IDS_V1,
} from '@/lib/editron/research/open-ended-planner/stage25-resume-readiness-freeze-v1';
import {
  validateStage25ResumeSpecificationExamplesV1,
  type Stage25ResumeSpecificationExampleV1,
} from '@/lib/editron/research/open-ended-planner/stage25-resume-readiness-sentinel-runner-v1';

type JsonRecord = Record<string, unknown>;

describe('Stage 2.5 R1 zero-spend resume specification', () => {
  it('binds all eight public examples while readiness, dispatch and effects stay off', () => {
    const receipt = validateStage25ResumeSpecificationExamplesV1({
      freeze: STAGE25_RESUME_READINESS_FREEZE_V1,
      examples: inventedExamples(),
    });

    expect(receipt).toMatchObject({
      assessment: 'SPECIFICATION_FIXTURE_ONLY',
      resumeReadinessDisposition: 'NOT_ESTABLISHED',
      executableOwnerEvidenceBound: false,
      callerSuppliedExamplesMayEstablishReadiness: false,
      paidResumeDisposition: 'NOT_AUTHORIZED',
      proofCeiling: 'LOCAL_ZERO_SPEND_SPECIFICATION_FIXTURE_ONLY',
      dispatchAuthorized: false,
      providerInferenceCallCount: 0,
      canonicalProjectMutationCount: 0,
      stateEffects: [],
    });
    expect((receipt.exampleReceipts as JsonRecord[]).map(({ sentinelId }) => sentinelId))
      .toEqual(STAGE25_RESUME_READINESS_SENTINEL_IDS_V1);
    expect(receipt.whatHasNotBeenChecked).toEqual([
      'EXECUTABLE_OWNER_OUTCOME_BINDING',
      'TEST_RUN_RECEIPT_BINDING',
      'PAID_PROVIDER_RESUME',
      'LIVE_ATLAS_RECOVERY',
      'LIVE_QSTASH_REDELIVERY',
      'AUTHENTICATED_HOSTED_WORKER_INGRESS',
      'CANONICAL_PROJECTSERVICE_APPLY_RELOAD',
      'RENDERED_AUDIOVISUAL_ACCEPTANCE',
    ]);
    expect(Object.isFrozen(receipt)).toBe(true);
  });

  it('cannot turn perfectly matching invented examples into resume readiness', () => {
    const untrustedInput = {
      freeze: STAGE25_RESUME_READINESS_FREEZE_V1,
      examples: inventedExamples(),
      assessment: 'PASS_ZERO_SPEND_RESUME_READINESS',
      executableOwnerEvidenceBound: true,
    };
    const receipt = validateStage25ResumeSpecificationExamplesV1(untrustedInput);

    expect(receipt.resumeReadinessDisposition).toBe('NOT_ESTABLISHED');
    expect(receipt.executableOwnerEvidenceBound).toBe(false);
    expect(receipt.callerSuppliedExamplesMayEstablishReadiness).toBe(false);
    expect(JSON.stringify(receipt)).not.toContain('PASS_ZERO_SPEND_RESUME_READINESS');
  });

  it('binds the existing Plan, checkpoint and resume owners rather than a new lifecycle', () => {
    expect(STAGE25_RESUME_READINESS_FREEZE_V1.existingOwnerBindings).toMatchObject({
      planExecutionOwnerId: 'ProviderNativeToolEpisodeV2R',
      planExecutionOwnerVersion: 'EDITRON_PROVIDER_NATIVE_EPISODE_V2R_8',
      planEnvelopeVersion: 'EDITRON_PROVIDER_NATIVE_PLAN_EXECUTION_ENVELOPE_V2R_2',
      durableJobVersion: 'EDITRON_DURABLE_WORKFLOW_JOB_V1_1',
      checkpointStateVersions: [
        'EDITRON_PROVIDER_NATIVE_DURABLE_CHECKPOINT_STATE_V2R_1',
        'EDITRON_PROVIDER_NATIVE_DURABLE_CHECKPOINT_STATE_V2R_2',
      ],
      resumeCheckpointVersion: 'EDITRON_PROVIDER_NATIVE_EPISODE_RESUME_V2R_7',
      runtimeGuardResumeVersion: 'EDITRON_PROVIDER_NATIVE_RUNTIME_GUARD_RESUME_STATE_V2R_3',
    });
  });

  it.each([
    ['prefix provider reinvocation', (items: Stage25ResumeSpecificationExampleV1[]) => {
      items[2].prefixProviderReinvokeCount = 1;
    }, 'FORBIDDEN_EFFECT_OBSERVED:R1-NO-PREFIX-PROVIDER-REINVOCATION'],
    ['same-runtime suffix substitution', (items: Stage25ResumeSpecificationExampleV1[]) => {
      items[1].resumeRuntimeIdentity = items[1].prepareRuntimeIdentity;
    }, 'PROCESS_BOUNDARY_INVALID:R1-SEPARATE-PROCESS-SUFFIX-REPRESENTATION'],
    ['missing pure writer replay', (items: Stage25ResumeSpecificationExampleV1[]) => {
      items[1].prefixWriterPureReplayCount = 0;
    }, 'PREFIX_WRITER_REPLAY_INVALID:R1-SEPARATE-PROCESS-SUFFIX-REPRESENTATION'],
    ['automatic retry', (items: Stage25ResumeSpecificationExampleV1[]) => {
      items[6].automaticRetryCount = 1;
    }, 'FORBIDDEN_EFFECT_OBSERVED:R1-UNRESOLVED-DISPATCH-CONSERVATIVE-STOP'],
    ['canonical project mutation', (items: Stage25ResumeSpecificationExampleV1[]) => {
      items[1].canonicalProjectMutationCount = 1;
    }, 'FORBIDDEN_EFFECT_OBSERVED:R1-SEPARATE-PROCESS-SUFFIX-REPRESENTATION'],
    ['missing conservative reservation', (items: Stage25ResumeSpecificationExampleV1[]) => {
      items[6].conservativeUnknownOutcomeReservationApplied = false;
    }, 'CONSERVATIVE_ACCOUNTING_INVALID:R1-UNRESOLVED-DISPATCH-CONSERVATIVE-STOP'],
    ['dispatch sentinel carrying a fake checkpoint', (items: Stage25ResumeSpecificationExampleV1[]) => {
      items[7].checkpointExampleSha256 = hash('fake-dispatch-checkpoint');
    }, 'CHECKPOINT_INVALID:R1-DISPATCH-DISABLED'],
  ])('rejects %s', (_label, mutate, code) => {
    const examples = inventedExamples();
    mutate(examples);
    expect(() => validateStage25ResumeSpecificationExamplesV1({
      freeze: STAGE25_RESUME_READINESS_FREEZE_V1,
      examples,
    })).toThrow(`STAGE25_RESUME_READINESS_${code}`);
  });

  it('rejects missing or reordered examples before interpreting an outcome', () => {
    const missing = inventedExamples().slice(0, -1);
    expect(() => validateStage25ResumeSpecificationExamplesV1({
      freeze: STAGE25_RESUME_READINESS_FREEZE_V1,
      examples: missing,
    })).toThrow('STAGE25_RESUME_READINESS_EXAMPLE_SET_INVALID');

    const reordered = inventedExamples();
    [reordered[0], reordered[1]] = [reordered[1], reordered[0]];
    expect(() => validateStage25ResumeSpecificationExamplesV1({
      freeze: STAGE25_RESUME_READINESS_FREEZE_V1,
      examples: reordered,
    })).toThrow('STAGE25_RESUME_READINESS_EXAMPLE_SET_INVALID');
  });

  it('rejects self-rehashed policy/ceiling rewrites and a forged outer hash', () => {
    const rewritten = structuredClone(
      STAGE25_RESUME_READINESS_FREEZE_V1,
    ) as unknown as JsonRecord;
    const expectations = rewritten.expectations as JsonRecord[];
    expectations[2].prefixProviderReinvokeCount = 1;
    rehashFreeze(rewritten);
    expect(() => validateStage25ResumeSpecificationExamplesV1({
      freeze: rewritten,
      examples: inventedExamples(),
    })).toThrow('STAGE25_RESUME_READINESS_COMPILED_POLICY_DRIFT');

    const ceilingRewrite = structuredClone(
      STAGE25_RESUME_READINESS_FREEZE_V1,
    ) as unknown as JsonRecord;
    ceilingRewrite.whatHasNotBeenChecked = ['PAID_PROVIDER_RESUME'];
    rehashFreeze(ceilingRewrite);
    expect(() => validateStage25ResumeSpecificationExamplesV1({
      freeze: ceilingRewrite,
      examples: inventedExamples(),
    })).toThrow('STAGE25_RESUME_READINESS_COMPILED_FREEZE_DRIFT');

    const forged = structuredClone(
      STAGE25_RESUME_READINESS_FREEZE_V1,
    ) as unknown as JsonRecord;
    forged.freezeSha256 = '0'.repeat(64);
    expect(() => validateStage25ResumeSpecificationExamplesV1({
      freeze: forged,
      examples: inventedExamples(),
    })).toThrow('STAGE25_RESUME_READINESS_FREEZE_HASH_INVALID');
  });
});

function inventedExamples(): Stage25ResumeSpecificationExampleV1[] {
  return [
    example('R1-COMMITTED-WRITER-INTERRUPTION',
      'COMMITTED_WRITER_CHECKPOINT_ACCEPTED'),
    example('R1-SEPARATE-PROCESS-SUFFIX-REPRESENTATION',
      'SEPARATE_RUNTIME_SUFFIX_REPRESENTED', {
        prepareRuntimeIdentity: 'prepare-process-141',
        resumeRuntimeIdentity: 'resume-process-289',
        prefixWriterPureReplayCount: 1,
        suffixProviderInvokeCount: 2,
      }),
    example('R1-NO-PREFIX-PROVIDER-REINVOCATION',
      'PREFIX_PROVIDER_CALLS_NOT_REINVOKED', {
        prepareRuntimeIdentity: 'prepare-process-141',
        resumeRuntimeIdentity: 'resume-process-289',
        prefixWriterPureReplayCount: 1,
        suffixProviderInvokeCount: 2,
      }),
    example('R1-STALE-CHECKPOINT-REJECTION',
      'REJECTED_STALE_BEFORE_PROVIDER'),
    example('R1-TAMPERED-CHECKPOINT-REJECTION',
      'REJECTED_TAMPER_BEFORE_PROVIDER'),
    example('R1-RUNTIME-BUDGET-DRIFT-REJECTION',
      'REJECTED_BUDGET_DRIFT_BEFORE_PROVIDER'),
    example('R1-UNRESOLVED-DISPATCH-CONSERVATIVE-STOP',
      'UNRESOLVED_DISPATCH_CONSERVATIVELY_TERMINALIZED', {
        conservativeUnknownOutcomeReservationApplied: true,
      }),
    example('R1-DISPATCH-DISABLED', 'DISPATCH_REMAINS_DISABLED', {
      checkpointExampleSha256: null,
    }),
  ];
}

function example(
  sentinelId: Stage25ResumeSpecificationExampleV1['sentinelId'],
  outcome: Stage25ResumeSpecificationExampleV1['outcome'],
  overrides: Partial<Stage25ResumeSpecificationExampleV1> = {},
): Stage25ResumeSpecificationExampleV1 {
  return {
    sentinelId,
    outcome,
    exampleSha256: hash({ sentinelId, outcome, source: 'invented-test-example' }),
    checkpointExampleSha256: hash({ sentinelId, checkpoint: 'invented-test-example' }),
    prepareRuntimeIdentity: null,
    resumeRuntimeIdentity: null,
    prefixProviderReinvokeCount: 0,
    prefixWriterPureReplayCount: 0,
    suffixProviderInvokeCount: 0,
    automaticRetryCount: 0,
    canonicalProjectMutationCount: 0,
    conservativeUnknownOutcomeReservationApplied: false,
    ...overrides,
  };
}

function hash(value: unknown): string {
  return hashCanonicalJsonV1(value);
}

function rehashFreeze(freeze: JsonRecord): void {
  const material = structuredClone(freeze);
  delete material.freezeSha256;
  freeze.freezeSha256 = hashCanonicalJsonV1(material);
}
