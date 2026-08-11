import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

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

describe('K/OE-0.1 frozen benchmark integrity', () => {
  it('makes all six conditions constructible from declared frozen inputs', () => {
    expect(benchmarkContract.version).toBe('1.0.1');
    expect(benchmarkContract.status).toBe('FROZEN_PHASE_A_ERRATA_1');
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
