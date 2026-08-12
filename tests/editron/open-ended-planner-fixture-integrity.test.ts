import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  canonicalizeJsonV1,
  hashCanonicalJsonV1,
  type BenchmarkContractV1,
  type KnowledgeEntryV1,
  type OperatorCatalogV1,
  type PlannerProviderAdapterV1,
  type PlannerTaskFixtureV1,
} from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { materializePlannerPacketV1 } from '@/lib/editron/research/open-ended-planner/materialize-packet-v1';
import { createPlannerProviderAdapterV1 } from '@/lib/editron/research/open-ended-planner/provider-development-runner-v1';
import { runPlannerTrialV1 } from '@/lib/editron/research/open-ended-planner/trial-harness-v1';
import benchmarkContractJson from '@/tests/fixtures/editron/open-ended-planner-v1/benchmark-contract-v1.json';
import developmentTasksJson from '@/tests/fixtures/editron/open-ended-planner-v1/development-tasks-v1.json';
import holdoutTasksJson from '@/tests/fixtures/editron/open-ended-planner-v1/holdout-tasks-v1.json';
import knowledgeEntriesJson from '@/tests/fixtures/editron/open-ended-planner-v1/knowledge-entries-v1.json';
import operatorSpecsJson from '@/tests/fixtures/editron/open-ended-planner-v1/operator-specs-v1.json';

interface EvidenceFixture {
  evidenceId: string;
  kind: string;
  binding: string;
  value: unknown;
}

interface TaskFixture {
  taskId: string;
  version: string;
  project: {
    projectId: string;
    projectRevision: string;
  };
  plannerEnvelope: {
    projectId: string;
    projectRevision: string;
    boundEvidenceIds: string[];
    networkPolicy: string;
  };
  evidence: EvidenceFixture[];
  conditionEvidence: {
    C4_NOISY_OR_MISSING_EVIDENCE: {
      omitEvidenceIds: string[];
      replaceEvidence: EvidenceFixture[];
    };
  };
  revisionScenario?: {
    type: string;
    currentProjectRevision: string;
    plannerEnvelopeRevision: string;
    requiredDisposition: string;
  };
}

interface KnowledgeEntryFixture {
  entryId: string;
  authority: string;
  reviewStatus: string;
  sourceIds: string[];
  applicableOperatorIds: string[];
  [key: string]: unknown;
}

const benchmarkContract = benchmarkContractJson as typeof benchmarkContractJson & {
  materializedEnvelopeContract: {
    forbiddenTaskFields: string[];
  };
};
const developmentTasks = developmentTasksJson.tasks as unknown as TaskFixture[];
const holdoutTasks = holdoutTasksJson.tasks as unknown as TaskFixture[];
const allTasks = [...developmentTasks, ...holdoutTasks];
const knowledgeEntries = knowledgeEntriesJson.entries as KnowledgeEntryFixture[];

describe('K/OE-0.7 frozen benchmark and OE-1 core integrity', () => {
  it('makes all six conditions constructible from declared frozen inputs', () => {
    expect(benchmarkContract.version).toBe('1.0.7');
    expect(benchmarkContract.plannerPacketContractVersion).toBe('1.0.4');
    expect(benchmarkContract.status).toBe('FROZEN_PHASE_A_ERRATA_7');
    expect(benchmarkContract.knowledgeEntries).toBe(
      'tests/fixtures/editron/open-ended-planner-v1/knowledge-entries-v1.json',
    );
    expect(benchmarkContract.conditions.map((condition) => condition.conditionId)).toEqual([
      'C0_SIGNATURES_ONLY',
      'C1_FULL_OPERATOR_SPECS',
      'C2_REVIEWED_KNOWLEDGE',
      'C3_UNRELATED_FORMAT_EXAMPLE',
      'C4_NOISY_OR_MISSING_EVIDENCE',
      'C5_CAPABILITY_GAP',
    ]);
    for (const condition of benchmarkContract.conditions) {
      expect(condition.modelReceives.some((field) => field.includes('materializedPlannerEnvelope'))).toBe(true);
    }
    expect(knowledgeEntries.length).toBeGreaterThan(0);
    expect(benchmarkContract.unrelatedFormatExample.nonExecutable).toBe(true);
    expect(benchmarkContract.conditionApplicability.C5_CAPABILITY_GAP)
      .toEqual(['DEV-04', 'HOLD-06', 'HOLD-08']);
    expect(benchmarkContract.schemas.candidateGraphV1.jsonSchema).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: benchmarkContract.schemas.candidateGraphV1.required,
    });
    expect(benchmarkContract.schemas.candidateGraphV1.semantics).toMatchObject({
      controlDependency: expect.stringContaining("fromPort='$control'"),
      expectedStateEffects: expect.stringContaining("['DECLARED_OPERATOR_EFFECTS']"),
      failureDisposition: expect.stringContaining("'ABORT_GRAPH'"),
    });
    expect(benchmarkContract.schemas.candidateGraphV1.jsonSchema.properties.nodes.items.properties)
      .toMatchObject({
        expectedStateEffects: { minItems: 1, maxItems: 1 },
        failureDisposition: { const: 'ABORT_GRAPH' },
      });
    expect(benchmarkContract.providerCandidates.map(({ route }) => route)).toEqual([
      'gpt-5.6-luna',
      'gpt-5.6-terra',
      'deepseek-v4-flash',
      'gemini-3.5-flash-lite',
      'gemini-3.6-flash',
    ]);
    const pinnedPacket = materializeDevelopmentArtifact('C0_SIGNATURES_ONLY');
    expect(pinnedPacket.packet.benchmarkContractVersion).toBe('1.0.4');
    expect(pinnedPacket.packetHash).toBe('474b87ae725757468b0fec4a6c9bfcb1e9f3ce62fc585936fb95b2495e89aa4f');
  });

  it('binds every task to one explicit C4 variant without leaking omitted clean evidence', () => {
    expect(developmentTasksJson.version).toBe('1.0.1');
    expect(holdoutTasksJson.version).toBe('1.0.1');
    expect(allTasks).toHaveLength(12);

    let omissionVariants = 0;
    let replacementVariants = 0;
    for (const task of allTasks) {
      expect(task.version).toBe('1.0.1');
      expect(task.plannerEnvelope.networkPolicy).toBe('DENY');
      const cleanById = new Map(task.evidence.map((evidence) => [evidence.evidenceId, evidence]));
      const variant = task.conditionEvidence.C4_NOISY_OR_MISSING_EVIDENCE;
      expect(variant.omitEvidenceIds.length + variant.replaceEvidence.length).toBeGreaterThan(0);
      expect(new Set(variant.omitEvidenceIds).size).toBe(variant.omitEvidenceIds.length);
      expect(new Set(variant.replaceEvidence.map((evidence) => evidence.evidenceId)).size)
        .toBe(variant.replaceEvidence.length);

      for (const evidenceId of variant.omitEvidenceIds) {
        expect(cleanById.has(evidenceId)).toBe(true);
        expect(task.plannerEnvelope.boundEvidenceIds).toContain(evidenceId);
      }
      for (const replacement of variant.replaceEvidence) {
        expect(cleanById.has(replacement.evidenceId)).toBe(true);
        expect(task.plannerEnvelope.boundEvidenceIds).toContain(replacement.evidenceId);
        expect(variant.omitEvidenceIds).not.toContain(replacement.evidenceId);
        expect(replacement).not.toEqual(cleanById.get(replacement.evidenceId));
      }

      const materialized = materializeC4Evidence(task);
      const materializedIds = materialized.map((evidence) => evidence.evidenceId);
      const availableBoundEvidenceIds = task.plannerEnvelope.boundEvidenceIds.filter(
        (evidenceId) => !variant.omitEvidenceIds.includes(evidenceId),
      );
      expect(materializedIds).toEqual(availableBoundEvidenceIds);
      expect(variant.omitEvidenceIds).toEqual(
        task.plannerEnvelope.boundEvidenceIds.filter(
          (evidenceId) => !availableBoundEvidenceIds.includes(evidenceId),
        ),
      );
      for (const evidenceId of variant.omitEvidenceIds) {
        expect(materialized.some((evidence) => evidence.evidenceId === evidenceId)).toBe(false);
      }
      for (const replacement of variant.replaceEvidence) {
        expect(materialized.find((evidence) => evidence.evidenceId === replacement.evidenceId))
          .toEqual(replacement);
      }
      omissionVariants += variant.omitEvidenceIds.length > 0 ? 1 : 0;
      replacementVariants += variant.replaceEvidence.length > 0 ? 1 : 0;
    }

    expect(omissionVariants).toBe(6);
    expect(replacementVariants).toBe(6);
  });

  it('requires an explicit declaration for the sole stale project-envelope mismatch', () => {
    const mismatches = allTasks.filter(
      (task) => task.project.projectRevision !== task.plannerEnvelope.projectRevision,
    );
    expect(mismatches).toHaveLength(1);
    const stale = mismatches[0];
    expect(stale.revisionScenario).toEqual({
      type: 'INTENTIONALLY_STALE',
      currentProjectRevision: stale.project.projectRevision,
      plannerEnvelopeRevision: stale.plannerEnvelope.projectRevision,
      requiredDisposition: 'REPLAN_WITH_ZERO_MUTATION',
    });
    expect(stale.project.projectId).toBe(stale.plannerEnvelope.projectId);
  });

  it('keeps reviewed knowledge generic, source-bound, and limited to represented operators', () => {
    const required = benchmarkContract.schemas.knowledgeEntryV1.required;
    const operatorById = new Map(
      operatorSpecsJson.operators.map((operator) => [operator.operatorId, operator]),
    );
    const ledger = readFileSync(
      join(process.cwd(), 'docs/editron/open-ended-editing/knowledge-source-rights-ledger-v1.md'),
      'utf8',
    );
    const sourceIds = new Set(Array.from(ledger.matchAll(/\| `(KS-\d{3})` /g), (match) => match[1]));
    expect(new Set(knowledgeEntries.map((entry) => entry.entryId)).size).toBe(knowledgeEntries.length);

    for (const entry of knowledgeEntries) {
      for (const field of required) expect(entry).toHaveProperty(field);
      expect(entry.authority).toBe('EVIDENCE_ONLY');
      expect(entry.reviewStatus).toBe('REVIEWED_FOR_SYNTHETIC_BENCHMARK_V1');
      for (const sourceId of entry.sourceIds) expect(sourceIds.has(sourceId)).toBe(true);
      for (const operatorId of entry.applicableOperatorIds) {
        expect(operatorById.has(operatorId)).toBe(true);
        expect(operatorById.get(operatorId)?.plannerEligibility).not.toBe('EXCLUDED_FROM_ENVELOPE');
      }
    }

    for (const task of allTasks) {
      const selected = selectRelevantKnowledge(task, knowledgeEntries);
      expect(selected.length).toBeGreaterThan(0);
      expect(selected.length).toBeLessThanOrEqual(benchmarkContract.knowledgeSelectionContract.maximumEntries);
      expect(selected).toEqual(selectRelevantKnowledge(task, [...knowledgeEntries].reverse()));
    }

    const serialized = JSON.stringify(knowledgeEntries);
    expect(serialized).not.toMatch(/DEV-\d|HOLD-\d|goldOperationGraph|preferredModel/);
  });

  it('marks the C3 graph as non-executable placeholders and freezes visibility exclusions', () => {
    const formatExample = benchmarkContract.unrelatedFormatExample;
    const representedOperators = new Set(operatorSpecsJson.operators.map((operator) => operator.operatorId));
    expect(formatExample.nonExecutable).toBe(true);
    for (const node of formatExample.nodes) {
      expect(node.operatorId).toMatch(/^FORMAT_ONLY_/);
      expect(representedOperators.has(node.operatorId)).toBe(false);
    }
    expect(benchmarkContract.materializedEnvelopeContract.forbiddenTaskFields).toEqual(
      expect.arrayContaining([
        'userRequest',
        'title',
        'techniqueNameInRequest',
        'nearDuplicateKnowledgeAllowed',
        'eligibleDistractorIds',
        'evaluatorOnly',
      ]),
    );
    expect(benchmarkContract.materializedEnvelopeContract.eligibleDistractorProjection).toMatchObject({
      source: 'task.eligibleDistractorIds',
      knowledgeDisposition: expect.stringContaining('before distractor projection'),
    });
  });

  it('canonicalizes packets deterministically and rejects ambiguous JSON', () => {
    expect(canonicalizeJsonV1({ z: 'e\u0301', a: [1, true, null] })).toBe('{"a":[1,true,null],"z":"é"}');
    expect(hashCanonicalJsonV1({ b: 2, a: 1 })).toBe(hashCanonicalJsonV1({ a: 1, b: 2 }));
    expect(() => canonicalizeJsonV1(-0)).toThrow(/negative zero/);
    expect(() => canonicalizeJsonV1(Number.POSITIVE_INFINITY)).toThrow(/finite numbers/);
    expect(() => canonicalizeJsonV1({ '\u00e9': 1, 'e\u0301': 2 })).toThrow(/collide/);
    expect(() => canonicalizeJsonV1({ missing: undefined })).toThrow(/cannot serialize undefined/);
    expect(() => canonicalizeJsonV1(new Array(1))).toThrow(/sparse arrays/);
  });

  it('materializes all six model-safe conditions with validated visible distractors', () => {
    const task = developmentTasksJson.tasks[0] as unknown as PlannerTaskFixtureV1;
    const expectedOperators = [...task.plannerEnvelope.allowedOperatorIds, ...task.eligibleDistractorIds];
    const artifacts = benchmarkContract.conditions.map(({ conditionId }) => materializePlannerPacketV1({
      benchmarkContract: benchmarkContractJson as unknown as BenchmarkContractV1,
      task,
      conditionId: conditionId as Parameters<typeof materializePlannerPacketV1>[0]['conditionId'],
      operatorCatalog: operatorSpecsJson as unknown as OperatorCatalogV1,
      knowledgeEntries: knowledgeEntriesJson.entries as unknown as KnowledgeEntryV1[],
    }));
    for (const artifact of artifacts) {
      expect(artifact.packet.materializedPlannerEnvelope.allowedOperatorIds).toEqual(expectedOperators);
      expect(artifact.packet.materializedPlannerEnvelope.networkPolicy).toBe('DENY');
      expect(artifact.packet.operatorCatalogVersion).toBe(operatorSpecsJson.version);
      expect(artifact.packet.candidateGraphSchemaHash)
        .toBe(hashCanonicalJsonV1(artifact.packet.candidateGraphOutputContract));
      expect(JSON.stringify(artifact.packet)).not.toMatch(/userRequest|eligibleDistractorIds|evaluatorOnly/);
      expect(artifact.packetHash).toBe(hashCanonicalJsonV1(artifact.packet));
      expect(Object.isFrozen(artifact.packet)).toBe(true);
    }
    expect(artifacts[0].packet.operatorNamesAndPorts).toHaveLength(expectedOperators.length);
    expect(artifacts[0].packet.fullAllowedOperatorSpecs).toBeUndefined();
    expect(artifacts[2].packet.relevantReviewedKnowledgeEntries?.length).toBeGreaterThan(0);
    expect(artifacts[2].packet.knowledgeEntryVersions).toEqual(
      artifacts[2].packet.relevantReviewedKnowledgeEntries?.map(({ entryId, version }) => ({ entryId, version })),
    );
    expect(artifacts.filter((_, index) => index !== 2).every(({ packet }) => packet.knowledgeEntryVersions.length === 0)).toBe(true);
    expect(artifacts[3].packet.oneUnrelatedGraphForOutputFormatting?.nonExecutable).toBe(true);
    expect(artifacts[4].packet.materializedPlannerEnvelope.missingEvidenceIds).toEqual(['EV-DEV01-V1']);
    expect(artifacts[4].packet.materializedPlannerEnvelope.evidenceBindings)
      .not.toContainEqual(expect.objectContaining({ evidenceId: 'EV-DEV01-V1' }));
    expect(artifacts[5].packet.fullAllowedOperatorSpecs).toHaveLength(expectedOperators.length);
  });

  it('records one immutable provider call with cost and envelope-only structural validation', async () => {
    const artifact = materializeDevelopmentArtifact('C1_FULL_OPERATOR_SPECS');
    const operator = artifact.packet.fullAllowedOperatorSpecs?.[0];
    expect(operator).toBeDefined();
    const candidate = {
      graphId: 'graph-1', taskId: artifact.packet.taskId, envelopeHash: artifact.packet.envelopeHash,
      projectRevision: artifact.packet.materializedPlannerEnvelope.projectRevision,
      nodes: [{
        nodeId: 'node-1', operatorId: operator?.operatorId, operatorVersion: operator?.version,
        inputs: {}, evidenceIds: [artifact.packet.materializedPlannerEnvelope.boundEvidenceIds[0]],
        expectedOutputs: {}, expectedStateEffects: ['NONE'], failureDisposition: 'ABORT_GRAPH',
      }],
      edges: [], expectedOutcome: 'Research candidate only', preservationClaims: [], clarifications: [], declines: [],
    };
    let calls = 0;
    let dispatchedPrompt = '';
    const adapter: PlannerProviderAdapterV1 = {
      provider: 'test-provider', modelSnapshot: 'test-model-v1', reasoningMode: 'test',
      invoke: async ({ prompt }) => {
        calls += 1;
        dispatchedPrompt = prompt;
        return { disposition: 'SUCCESS', text: JSON.stringify(candidate), usage: { inputTokens: 1_000, outputTokens: 500 } };
      },
    };
    const times = [new Date('2026-08-12T01:00:00.000Z'), new Date('2026-08-12T01:00:01.250Z')];
    const record = await runPlannerTrialV1({
      trialId: 'trial-1', artifact, adapter,
      pricing: { inputUsdPerMillion: 1, outputUsdPerMillion: 2 },
      now: () => times.shift() ?? new Date('2026-08-12T01:00:01.250Z'),
    });
    expect(calls).toBe(1);
    expect(dispatchedPrompt).not.toMatch(/userRequest|eligibleDistractorIds|evaluatorOnly/);
    expect(record).toMatchObject({
      parseDisposition: 'PARSED_ENVELOPE_BOUND', latencyMs: 1_250,
      estimatedModelCostUsd: 0.002, verifierDisposition: 'NOT_RUN_OE1', accepted: false,
    });
    expect(record.rawResponse).toBe(JSON.stringify(candidate));
    expect(Object.isFrozen(record)).toBe(true);
    expect(Object.isFrozen(record.candidateGraph)).toBe(true);

    const invalidCandidate = structuredClone(candidate);
    invalidCandidate.nodes[0].operatorId = 'invented_operator';
    const rejected = await runPlannerTrialV1({
      trialId: 'trial-invented-operator', artifact,
      adapter: testAdapter(async () => ({
        disposition: 'SUCCESS', text: JSON.stringify(invalidCandidate),
        usage: { inputTokens: 10, outputTokens: 10 },
      })),
      pricing: { inputUsdPerMillion: 1, outputUsdPerMillion: 1 },
    });
    expect(rejected.parseDisposition).toBe('ENVELOPE_REJECTED');
    expect(rejected.failureDetail).toContain('unknown operator');
  });

  it('fails empty, malformed, provider-error, and cancelled trials without hidden retry', async () => {
    const artifact = materializeDevelopmentArtifact('C1_FULL_OPERATOR_SPECS');
    for (const [text, disposition] of [['', 'EMPTY_RESPONSE'], ['not-json', 'MALFORMED_JSON']] as const) {
      let calls = 0;
      const record = await runPlannerTrialV1({
        trialId: `trial-${disposition}`, artifact,
        adapter: testAdapter(async () => { calls += 1; return { disposition: 'SUCCESS', text, usage: { inputTokens: 2, outputTokens: 1 } }; }),
        pricing: { inputUsdPerMillion: 1, outputUsdPerMillion: 1 },
      });
      expect(calls).toBe(1);
      expect(record.parseDisposition).toBe(disposition);
    }
    for (const disposition of ['PROVIDER_TIMEOUT', 'PROVIDER_RATE_LIMIT', 'PROVIDER_REFUSAL'] as const) {
      let calls = 0;
      const record = await runPlannerTrialV1({
        trialId: `trial-${disposition}`, artifact,
        adapter: testAdapter(async () => { calls += 1; return { disposition }; }),
        pricing: { inputUsdPerMillion: 1, outputUsdPerMillion: 1 },
      });
      expect(calls).toBe(1);
      expect(record.providerDisposition).toBe(disposition);
      expect(record.parseDisposition).toBe('NOT_ATTEMPTED');
    }
    const controller = new AbortController();
    controller.abort();
    let cancelledCalls = 0;
    const cancelled = await runPlannerTrialV1({
      trialId: 'trial-cancelled', artifact,
      adapter: testAdapter(async () => { cancelledCalls += 1; return { disposition: 'PROVIDER_ERROR' }; }),
      pricing: { inputUsdPerMillion: 1, outputUsdPerMillion: 1 }, signal: controller.signal,
    });
    expect(cancelledCalls).toBe(0);
    expect(cancelled.providerDisposition).toBe('PROVIDER_CANCELLED');

    const lateController = new AbortController();
    const lateCancelled = await runPlannerTrialV1({
      trialId: 'trial-late-cancelled', artifact,
      adapter: testAdapter(async () => {
        lateController.abort();
        return { disposition: 'SUCCESS', text: '{}', usage: { inputTokens: 5, outputTokens: 1 } };
      }),
      pricing: { inputUsdPerMillion: 1, outputUsdPerMillion: 1 }, signal: lateController.signal,
    });
    expect(lateCancelled.providerDisposition).toBe('PROVIDER_CANCELLED');
    expect(lateCancelled.inputTokens).toBe(5);

    const invalidUsage = await runPlannerTrialV1({
      trialId: 'trial-invalid-usage', artifact,
      adapter: testAdapter(async () => ({
        disposition: 'SUCCESS', text: '{}', usage: { inputTokens: -1, outputTokens: 1 },
      })),
      pricing: { inputUsdPerMillion: 1, outputUsdPerMillion: 1 },
    });
    expect(invalidUsage.providerDisposition).toBe('PROVIDER_ERROR');
    expect(invalidUsage.failureDetail).toMatch(/token count/);
  });

  it('keeps provider transport translation exact and single-attempt', async () => {
    const cases = [
      {
        kind: 'openai' as const, model: 'gpt-5.6-luna',
        response: { output_text: '{}', usage: { input_tokens: 4, output_tokens: 2 } },
        endpoint: 'https://api.openai.com/v1/responses',
      },
      {
        kind: 'ollama' as const, model: 'deepseek-v4-flash-0731',
        response: { response: '{}', prompt_eval_count: 4, eval_count: 2 },
        endpoint: 'https://ollama.com/api/generate',
      },
      {
        kind: 'deepseek' as const, model: 'deepseek-v4-flash',
        response: {
          choices: [{ message: { content: '{}' } }],
          usage: { prompt_tokens: 4, completion_tokens: 2, prompt_cache_hit_tokens: 1 },
        },
        endpoint: 'https://api.deepseek.com/v1/chat/completions',
      },
      {
        kind: 'google' as const, model: 'gemini-3.6-flash',
        response: {
          candidates: [{ content: { parts: [{ text: '{}' }] } }],
          usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 2 },
        },
        endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent',
      },
    ];
    for (const testCase of cases) {
      const requests: Array<{ url: string; body: string }> = [];
      const adapter = createPlannerProviderAdapterV1({
        kind: testCase.kind, apiKey: 'test-key', model: testCase.model,
        fetchImpl: async (url, init) => {
          requests.push({ url: String(url), body: String(init?.body) });
          return new Response(JSON.stringify(testCase.response), { status: 200 });
        },
      });
      const result = await adapter.invoke({ prompt: '{"packet":true}', promptHash: 'p', envelopeHash: 'e' });
      expect(result).toMatchObject({ disposition: 'SUCCESS', text: '{}', usage: { inputTokens: 4, outputTokens: 2 } });
      expect(requests).toHaveLength(1);
      expect(requests[0].url).toBe(testCase.endpoint);
      if (testCase.kind === 'google') expect(requests[0].url).toContain(testCase.model);
      else expect(JSON.parse(requests[0].body).model).toBe(testCase.model);
      const body = JSON.parse(requests[0].body);
      if (testCase.kind === 'openai') expect(body.text.format.type).toBe('json_schema');
      if (testCase.kind === 'ollama') expect(body.format.type).toBe('object');
      if (testCase.kind === 'deepseek') {
        expect(body.response_format.type).toBe('json_object');
        expect(body.thinking.type).toBe('enabled');
        expect(body.reasoning_effort).toBe('high');
        expect(body.max_tokens).toBe(16_384);
      }
      if (testCase.kind === 'google') expect(body.generationConfig.responseJsonSchema.type).toBe('object');
    }
  });
});

function materializeC4Evidence(task: TaskFixture): EvidenceFixture[] {
  const variant = task.conditionEvidence.C4_NOISY_OR_MISSING_EVIDENCE;
  const omitted = new Set(variant.omitEvidenceIds);
  const replacements = new Map(
    variant.replaceEvidence.map((evidence) => [evidence.evidenceId, evidence]),
  );
  return task.evidence
    .filter((evidence) => !omitted.has(evidence.evidenceId))
    .map((evidence) => replacements.get(evidence.evidenceId) ?? evidence);
}

function selectRelevantKnowledge(
  task: TaskFixture,
  entries: KnowledgeEntryFixture[],
): KnowledgeEntryFixture[] {
  const allowed = new Set(
    (task.plannerEnvelope as TaskFixture['plannerEnvelope'] & { allowedOperatorIds: string[] })
      .allowedOperatorIds,
  );
  return entries
    .map((entry) => ({
      entry,
      overlap: entry.applicableOperatorIds.filter((operatorId) => allowed.has(operatorId)).length,
    }))
    .filter(({ entry, overlap }) =>
      overlap > 0
      && entry.authority === 'EVIDENCE_ONLY'
      && entry.reviewStatus === 'REVIEWED_FOR_SYNTHETIC_BENCHMARK_V1')
    .sort((left, right) =>
      right.overlap - left.overlap
      || (left.entry.entryId < right.entry.entryId ? -1 : left.entry.entryId > right.entry.entryId ? 1 : 0))
    .slice(0, benchmarkContract.knowledgeSelectionContract.maximumEntries)
    .map(({ entry }) => entry);
}

function materializeDevelopmentArtifact(
  conditionId: Parameters<typeof materializePlannerPacketV1>[0]['conditionId'],
) {
  return materializePlannerPacketV1({
    benchmarkContract: benchmarkContractJson as unknown as BenchmarkContractV1,
    task: developmentTasksJson.tasks[0] as unknown as PlannerTaskFixtureV1,
    conditionId,
    operatorCatalog: operatorSpecsJson as unknown as OperatorCatalogV1,
    knowledgeEntries: knowledgeEntriesJson.entries as unknown as KnowledgeEntryV1[],
  });
}

function testAdapter(
  invoke: PlannerProviderAdapterV1['invoke'],
): PlannerProviderAdapterV1 {
  return { provider: 'test-provider', modelSnapshot: 'test-model-v1', reasoningMode: 'test', invoke };
}
