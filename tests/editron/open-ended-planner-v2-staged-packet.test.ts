import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  EXECUTION_FORM_ARMS_V2,
  assertNoEvaluatorLeakV2,
  buildDevelopmentNoProviderPlanV2,
  buildDevelopmentStageOnePacketsV2,
  buildNextProviderStagePacketV2,
  type HashedStagePacketV2,
} from '@/lib/editron/research/open-ended-planner/staged-packet-v2';
import { hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';

interface FrozenPlanV2 {
  planVersion: string;
  authority: string;
  stageOnePackets: Array<{ taskId: string; conditionId: string; inputArm: string; packetHash: string; transportHash: string }>;
  branches: Array<{ branchId: string; taskId: string; conditionId: string; inputArm: string; executionFormArm: string; stageOnePacketHash: string; branchHash: string; stageStatuses: string[] }>;
  noProviderTelemetry: Record<string, unknown>;
  sourceBindings: Array<{ path: string; sha256: string }>;
  planHash: string;
}

const frozenPlan = JSON.parse(readFileSync(resolve('tests/fixtures/editron/open-ended-planner-v2/development-no-provider-plan-v2.json'), 'utf8')) as FrozenPlanV2;

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(resolve(path))).digest('hex');
}

function modelInput(packet: HashedStagePacketV2): Record<string, unknown> {
  return packet.packet.modelInput;
}

function normalizedNonMediaInput(packet: HashedStagePacketV2): Record<string, unknown> {
  const { mediaDescriptors: _descriptors, mediaPolicy: _policy, ...rest } = modelInput(packet);
  return rest;
}

function prior(artifactType: string, taskId: string): { artifactType: string; taskId: string } {
  return { artifactType, taskId };
}

describe('open-ended planner V2 staged no-provider packets', () => {
  const stageOne = buildDevelopmentStageOnePacketsV2();
  const plan = buildDevelopmentNoProviderPlanV2();

  it('builds 16 pre-routing packets and exactly six branches per packet', () => {
    expect(stageOne).toHaveLength(16);
    expect(plan.branches).toHaveLength(96);
    expect(new Set(stageOne.map(({ packetHash }) => packetHash)).size).toBe(16);
    expect(new Set(plan.branches.map(({ branchId }) => branchId)).size).toBe(96);
    for (const packet of stageOne) {
      const branches = plan.branches.filter(({ stageOnePacketHash }) => stageOnePacketHash === packet.packetHash);
      expect(branches).toHaveLength(6);
      expect(new Set(branches.map(({ executionFormArm }) => executionFormArm))).toEqual(new Set(EXECUTION_FORM_ARMS_V2));
      expect(packet.packet.executionFormArm).toBe('NOT_APPLICABLE_PRE_ROUTING');
      expect(JSON.stringify(packet.packet)).not.toMatch(/FORCED_NATIVE|FORCED_HYBRID|THRESHOLD_ABLATION/);
    }
  });

  it('keeps both modality arms equivalent except for declared media transport', () => {
    const keys = new Set(stageOne.map(({ packet }) => `${packet.taskId}/${packet.conditionId}`));
    expect(keys.size).toBe(8);
    for (const key of keys) {
      const [taskId, conditionId] = key.split('/');
      const multimodal = stageOne.find(({ packet }) => packet.taskId === taskId && packet.conditionId === conditionId && packet.inputArm === 'MULTIMODAL');
      const textOnly = stageOne.find(({ packet }) => packet.taskId === taskId && packet.conditionId === conditionId && packet.inputArm === 'TEXT_EVIDENCE_ONLY');
      expect(multimodal).toBeDefined();
      expect(textOnly).toBeDefined();
      expect(normalizedNonMediaInput(multimodal as HashedStagePacketV2)).toEqual(normalizedNonMediaInput(textOnly as HashedStagePacketV2));
      expect(multimodal?.transportAttachments.length).toBeGreaterThan(0);
      expect(textOnly?.transportAttachments).toEqual([]);
      expect(JSON.stringify(textOnly?.packet)).not.toContain('artifactPath');
      expect(JSON.stringify(textOnly?.packet)).not.toContain('.calibration-temp');
    }
  });

  it('passes only condition-visible evidence and replaces placeholder media hashes', () => {
    const visualWithheld = stageOne.find(({ packet }) => packet.taskId === 'DEV-01' && packet.conditionId === 'VISUAL_EVIDENCE_WITHHELD' && packet.inputArm === 'TEXT_EVIDENCE_ONLY');
    const beatWithheld = stageOne.find(({ packet }) => packet.taskId === 'DEV-03' && packet.conditionId === 'BEAT-EVIDENCE_WITHHELD' && packet.inputArm === 'TEXT_EVIDENCE_ONLY');
    expect(JSON.stringify(modelInput(visualWithheld as HashedStagePacketV2).evidence)).not.toContain('EV-DEV01-V1');
    expect(JSON.stringify(modelInput(beatWithheld as HashedStagePacketV2).evidence)).not.toContain('EV-DEV03-B1');
    for (const packet of stageOne) {
      expect(JSON.stringify(packet.packet)).not.toContain('sha256:oe2-generated');
      expect(packet.packet.taskId).toMatch(/^DEV-/);
      expect(JSON.stringify(packet.packet)).not.toMatch(/HOLD-0[1-8]/);
    }
  });

  it('excludes evaluator structures recursively from every provider-visible packet', () => {
    const forbiddenStrings = ['baselineDisposition', 'acceptableExecutionForms', 'requiredOperationFamilies', 'successPredicates'];
    for (const packet of stageOne) {
      expect(() => assertNoEvaluatorLeakV2(packet.packet)).not.toThrow();
      const serialized = JSON.stringify(packet.packet);
      for (const forbidden of forbiddenStrings) expect(serialized).not.toContain(forbidden);
    }
    expect(() => assertNoEvaluatorLeakV2({ nested: { evaluatorOnly: 'sentinel-secret' } })).toThrow(/Forbidden provider key/);
  });

  it('constructs stages 2-5 sequentially and narrows forced routing schemas', () => {
    const first = stageOne.find(({ packet }) => packet.taskId === 'DEV-02' && packet.conditionId === 'BASELINE' && packet.inputArm === 'MULTIMODAL') as HashedStagePacketV2;
    const second = buildNextProviderStagePacketV2({ previousPacket: first, stage: 2, executionFormArm: 'FORCED_NATIVE', priorArtifact: prior('ReferenceBlueprintV2', 'DEV-02') });
    const third = buildNextProviderStagePacketV2({ previousPacket: second, stage: 3, executionFormArm: 'FORCED_NATIVE', priorArtifact: prior('EditorialIntentGraphV2', 'DEV-02') });
    const fourth = buildNextProviderStagePacketV2({ previousPacket: third, stage: 4, executionFormArm: 'FORCED_NATIVE', priorArtifact: prior('EvidenceBoundIntentGraphV2', 'DEV-02') });
    const fifth = buildNextProviderStagePacketV2({ previousPacket: fourth, stage: 5, executionFormArm: 'FORCED_NATIVE', priorArtifact: prior('CompiledOperationGraphV2', 'DEV-02') });
    expect([second, third, fourth, fifth].map(({ packet }) => packet.stage)).toEqual([2, 3, 4, 5]);
    const executionForm = ((second.packet.outputContract.properties as Record<string, unknown>).executionForm as { enum: string[] }).enum;
    expect(executionForm).toEqual(['NATIVE', 'CAPABILITY_GAP']);
    expect(modelInput(second)).toHaveProperty('operatorCatalog');
    expect(modelInput(fourth)).toHaveProperty('operatorCatalog.fieldSchemas');
    expect(modelInput(fifth)).not.toHaveProperty('operatorCatalog');
    expect(() => buildNextProviderStagePacketV2({ previousPacket: first, stage: 3, executionFormArm: 'FREE_CHOICE', priorArtifact: prior('EditorialIntentGraphV2', 'DEV-02') })).toThrow(/sequentially/);
    expect(() => buildNextProviderStagePacketV2({ previousPacket: first, stage: 2, executionFormArm: 'FREE_CHOICE', priorArtifact: prior('ReferenceBlueprintV2', 'DEV-99') })).toThrow(/same task/);
  });

  it('allocates the complete frozen trial budget without exceeding it', () => {
    const first = stageOne[0];
    const packets = [first];
    const types = ['ReferenceBlueprintV2', 'EditorialIntentGraphV2', 'EvidenceBoundIntentGraphV2', 'CompiledOperationGraphV2'];
    for (let stage = 2; stage <= 5; stage += 1) packets.push(buildNextProviderStagePacketV2({ previousPacket: packets.at(-1) as HashedStagePacketV2, stage: stage as 2 | 3 | 4 | 5, executionFormArm: 'FREE_CHOICE', priorArtifact: prior(types[stage - 2], first.packet.taskId) }));
    const sum = (field: 'maxInputTokens' | 'maxVisibleOutputTokens' | 'maxReasoningTokens' | 'maxWallClockMs' | 'maxProviderCostUsd') => packets.reduce((total, packet) => total + packet.packet.stageBudget[field], 0);
    expect(sum('maxInputTokens')).toBe(30000);
    expect(sum('maxVisibleOutputTokens')).toBe(7000);
    expect(sum('maxReasoningTokens')).toBe(12000);
    expect(sum('maxWallClockMs')).toBe(180000);
    expect(sum('maxProviderCostUsd')).toBeCloseTo(0.5, 10);
  });

  it('freezes a reproducible plan with source and plan hashes', () => {
    expect(plan.stageOnePackets).toEqual(frozenPlan.stageOnePackets);
    expect(plan.branches).toEqual(frozenPlan.branches);
    expect(plan.noProviderTelemetry).toEqual(frozenPlan.noProviderTelemetry);
    for (const binding of frozenPlan.sourceBindings) expect(sha256File(binding.path)).toBe(binding.sha256);
    const { planHash, ...material } = frozenPlan;
    expect(hashCanonicalJsonV1(material)).toBe(planHash);
    expect(frozenPlan.noProviderTelemetry).toMatchObject({ provider: 'NO_PROVIDER', model: 'NO_MODEL', finishReason: 'NOT_DISPATCHED_V2_1B', inputTokens: 0, visibleOutputTokens: 0, reasoningTokens: 0, providerCostUsd: 0, parseStatus: 'NOT_ATTEMPTED' });
    expect(Object.keys(frozenPlan.noProviderTelemetry)).toHaveLength(18);
  });
});
