import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  assertNoEvaluatorLeakV2,
  buildDevelopmentReferenceImageSequenceStageOnePacketV2,
  buildNextProviderStagePacketV2,
} from '@/lib/editron/research/open-ended-planner/staged-packet-v2';

type JsonRecord = Record<string, unknown>;

const evaluatorPath = 'tests/fixtures/editron/open-ended-planner-v2/dev02-reference-evaluator-v2.json';
const blueprintPath = 'tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-reference-blueprint-v2.json';
const evaluator = JSON.parse(readFileSync(resolve(evaluatorPath), 'utf8')) as JsonRecord;
const blueprint = JSON.parse(readFileSync(resolve(blueprintPath), 'utf8')) as JsonRecord;

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.map(record) : [];
}

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(resolve(path))).digest('hex');
}

describe('DEV-02 evaluator-only reference truth', () => {
  it('freezes evaluator and canonical blueprint hashes', () => {
    expect(hashCanonicalJsonV1(evaluator)).toBe('2de840f076c7237cae5e0b2bb5a1bae19c1a2f2fc994c18f0ce63fafff06fa27');
    expect(hashCanonicalJsonV1(blueprint)).toBe('3a3f6c84164ef78fad89e67d443e7bcef728d1da4963ef3b6d3f57dc54d01c6f');
  });

  it('binds evaluator truth to the exact generator and temporal media bundle', () => {
    for (const binding of records(evaluator.sourceBindings)) {
      expect(sha256File(String(binding.path))).toBe(binding.sha256);
    }
    const manifest = JSON.parse(readFileSync(resolve(String(records(evaluator.sourceBindings)[0].path)), 'utf8')) as JsonRecord;
    const reference = records(manifest.artifacts).find(({ assetId }) => assetId === 'dev02-reference');
    const temporal = record(reference?.temporalReferenceEvidence);
    const mediaBinding = record(evaluator.mediaBinding);
    expect(mediaBinding.referenceBundleSha256).toBe(temporal.bundleSha256);
    expect(mediaBinding.nativeVideoArtifactSha256).toBe(record(temporal.nativeVideo).artifactSha256);
    expect(mediaBinding.orderedSamples).toEqual(records(temporal.samples).map(({ sampleId, referenceTick, artifactSha256 }) => ({ sampleId, referenceTick, artifactSha256 })));
  });

  it('maps every disclosed and held-out fact to a canonical blueprint claim, phase, or uncertainty', () => {
    const canonicalIds = new Set([
      ...records(blueprint.targetClaims).map(({ claimId }) => claimId),
      ...records(blueprint.temporalStructure).map(({ phaseId }) => phaseId),
      ...records(blueprint.uncertainties).map(({ uncertaintyId }) => uncertaintyId),
    ]);
    const evaluatorOnly = record(evaluator.evaluatorOnly);
    const facts = [...records(evaluator.promptDisclosed), ...records(evaluatorOnly.heldOutObservations)];
    expect(facts).toHaveLength(12);
    for (const fact of facts) {
      expect(fact.canonicalRefs).toBeInstanceOf(Array);
      expect((fact.canonicalRefs as unknown[]).length).toBeGreaterThan(0);
      for (const reference of fact.canonicalRefs as unknown[]) expect(canonicalIds.has(reference)).toBe(true);
    }
    expect(new Set(records(evaluatorOnly.heldOutObservations).map(({ observationId }) => observationId)).size).toBe(8);
  });

  it('keeps evaluator truth out of Stage 1 while accepting only the canonical blueprint for Stage 2', () => {
    const stageOne = buildDevelopmentReferenceImageSequenceStageOnePacketV2('DEV-02', 'BASELINE');
    const stageOneText = JSON.stringify(stageOne.packet);
    for (const observation of records(record(evaluator.evaluatorOnly).heldOutObservations)) {
      expect(stageOneText).not.toContain(String(observation.statement));
    }
    expect(() => assertNoEvaluatorLeakV2(evaluator)).toThrow(/Forbidden provider key/);

    const stageTwo = buildNextProviderStagePacketV2({
      previousPacket: stageOne,
      stage: 2,
      executionFormArm: 'FREE_CHOICE',
      priorArtifact: blueprint as { artifactType: string; taskId: string; [key: string]: unknown },
    });
    expect(() => assertNoEvaluatorLeakV2(stageTwo.packet)).not.toThrow();
    expect(stageTwo.packet.modelInput.priorArtifactHash).toBe(hashCanonicalJsonV1(blueprint));
    expect(JSON.stringify(stageTwo.packet)).not.toMatch(/heldOutObservations|scoringScale|basis/);
  });
});
