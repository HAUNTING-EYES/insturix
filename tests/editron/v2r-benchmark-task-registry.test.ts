import { readFile } from 'node:fs/promises';

import { beforeAll, describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  buildCanonicalDev03MeasuredEvidenceV2,
  type Dev03MeasuredEvidenceReceiptV2,
} from '@/lib/editron/research/open-ended-planner/dev03-measured-evidence-v2';
import {
  assertV2RBenchmarkTaskRegistryV2,
  buildV2RBenchmarkTaskRegistryV2,
  V2R_BENCHMARK_TASK_REGISTRY_VERSION,
} from '@/lib/editron/research/open-ended-planner/v2r-benchmark-task-registry';
import { buildV2RPreregistrationManifest } from '@/lib/editron/research/open-ended-planner/v2r-preregistration-manifest';

let measured: Readonly<Dev03MeasuredEvidenceReceiptV2>;

beforeAll(async () => {
  const [audioBytes, analyzerSourceBytes] = await Promise.all([
    readFile('.calibration-temp/open-ended-planner-v2/development-media/dev03-beats.wav'),
    readFile('lib/editron/services/media/beat-detection-service.ts'),
  ]);
  measured = await buildCanonicalDev03MeasuredEvidenceV2({ audioBytes, analyzerSourceBytes });
});

describe('V2R canonical benchmark task registry', () => {
  it('freezes the exact six preregistered task/condition cases', () => {
    const registry = buildV2RBenchmarkTaskRegistryV2({ dev03MeasuredEvidence: measured });
    expect(registry.version).toBe(V2R_BENCHMARK_TASK_REGISTRY_VERSION);
    expect(registry.cases.map(({ caseId }) => caseId)).toEqual([
      'DEV-01:BASELINE',
      'DEV-01:VISUAL_EVIDENCE_WITHHELD',
      'DEV-02:BASELINE',
      'DEV-03:BASELINE',
      'DEV-03:BEAT_EVIDENCE_WITHHELD',
      'DEV-04:BASELINE',
    ]);
    expect(Object.isFrozen(registry)).toBe(true);
    expect(assertV2RBenchmarkTaskRegistryV2(registry)).toBe(registry);
  });

  it('binds every case to the manifest policy and its own Stage-1 packet identity', () => {
    const registry = buildV2RBenchmarkTaskRegistryV2({ dev03MeasuredEvidence: measured });
    const manifest = buildV2RPreregistrationManifest();
    for (const entry of registry.cases) {
      const { task } = entry;
      expect(task.stageOnePacket.packet.taskId).toBe(task.taskId);
      expect(task.stageOnePacket.packet.conditionId).toBe(task.conditionId);
      expect(hashCanonicalJsonV1(task.loweringPolicy)).toBe(
        manifest.lowerer.taskPolicySha256[task.taskId as keyof typeof manifest.lowerer.taskPolicySha256],
      );
      expect(entry.expected.conditionId).toBe(task.conditionId);
    }
  });

  it('is reproducible for the same measured-evidence receipt', () => {
    const left = buildV2RBenchmarkTaskRegistryV2({ dev03MeasuredEvidence: measured });
    const right = buildV2RBenchmarkTaskRegistryV2({ dev03MeasuredEvidence: measured });
    expect(left.registrySha256).toBe(right.registrySha256);
  });

  it('rejects missing, tampered, duplicate, and mutable registries', () => {
    const registry = buildV2RBenchmarkTaskRegistryV2({ dev03MeasuredEvidence: measured });
    expect(() => assertV2RBenchmarkTaskRegistryV2(undefined)).toThrow('V2R_TASK_REGISTRY_MISSING');
    expect(() => assertV2RBenchmarkTaskRegistryV2({ ...registry, version: 'WRONG' }))
      .toThrow('V2R_TASK_REGISTRY_VERSION_DRIFT');
    expect(() => assertV2RBenchmarkTaskRegistryV2({ ...registry, registrySha256: '0'.repeat(64) }))
      .toThrow('V2R_TASK_REGISTRY_HASH_DRIFT');

    const duplicate = structuredClone(registry) as unknown as {
      cases: Array<{ caseId: string }>;
      registrySha256: string;
    };
    duplicate.cases[1].caseId = duplicate.cases[0].caseId;
    expect(() => assertV2RBenchmarkTaskRegistryV2(duplicate))
      .toThrow('V2R_TASK_REGISTRY_CASE_SET_INVALID');

    const mutable = structuredClone(registry);
    expect(() => assertV2RBenchmarkTaskRegistryV2(mutable))
      .toThrow('V2R_TASK_REGISTRY_NOT_IMMUTABLE');
  });
});
