import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { buildDevelopmentStage1BlindReviewPackV2 } from '@/lib/editron/research/open-ended-planner/development-stage1-blind-review-v2';
import type { DevelopmentCohortReceiptV2 } from '@/lib/editron/research/open-ended-planner/development-cohort-runner-v2';
import type { HashedStagePacketV2, ProviderStagePacketV2 } from '@/lib/editron/research/open-ended-planner/staged-packet-v2';

const roots: string[] = [];
const taskIds = ['DEV-01', 'DEV-02', 'DEV-03', 'DEV-04'] as const;

describe('development Stage-1 blind semantic review pack', () => {
  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
  });

  it('blinds identities while preserving packet, schema, and copied-reference evidence', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'editron-stage1-review-'));
    roots.push(root);
    const referencePath = path.join(root, 'reference.png');
    const referenceBytes = Buffer.from('owned-reference');
    await fs.writeFile(referencePath, referenceBytes);
    const packets = taskIds.map((taskId) => packet(taskId, taskId === 'DEV-02' ? { referencePath, referenceBytes } : undefined));
    const receipt = cohortReceipt(packets);
    const pack = await buildDevelopmentStage1BlindReviewPackV2({
      outputRoot: path.join(root, 'pack'), createdAt: '2026-08-16T01:00:00.000Z',
      cohortReceipt: receipt, stageOnePackets: packets,
      randomSource: () => Uint8Array.from({ length: 32 }, (_, index) => index + 1),
    });
    expect(pack.reviewStatus).toBe('AWAITING_TWO_INDEPENDENT_HUMAN_REVIEWS');
    expect(pack.stateEffects).toEqual([]);
    const reviewerFiles = await filesUnder(path.join(root, 'pack', 'reviewer'));
    const reviewerText = (await Promise.all(reviewerFiles.filter((file) => file.endsWith('.json')).map((file) => fs.readFile(file, 'utf8')))).join('\n');
    expect(reviewerText).not.toContain('OPENAI_LUNA');
    expect(reviewerText).not.toContain('OPENAI_TERRA');
    expect(reviewerText).not.toContain('gpt-5.6');
    expect(reviewerText).toContain('candidate-a');
    expect(await fs.readFile(path.join(root, 'pack', 'reviewer', 'dev-02', 'input', 'reference-01.png'))).toEqual(referenceBytes);
    const operatorKey = await fs.readFile(pack.operatorKeyPath, 'utf8');
    expect(operatorKey).toContain('OPENAI_LUNA');
    expect(operatorKey).toContain('OPENAI_TERRA');
  });

  it('rejects receipt drift and accepted artifacts that violate the bound packet', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'editron-stage1-review-bad-'));
    roots.push(root);
    const packets = taskIds.map((taskId) => packet(taskId));
    const receipt = cohortReceipt(packets);
    await expect(buildDevelopmentStage1BlindReviewPackV2({
      outputRoot: path.join(root, 'bad-receipt'), createdAt: '2026-08-16T01:00:00.000Z',
      cohortReceipt: { ...receipt, receiptHash: 'f'.repeat(64) }, stageOnePackets: packets,
    })).rejects.toThrow('COHORT_RECEIPT_INVALID');

    const invalid = structuredClone(receipt) as unknown as MutableReceipt;
    invalid.routes[0].rows[0].providerRun.artifact.taskId = 'WRONG';
    const material = { ...invalid } as Record<string, unknown>;
    delete material.receiptHash;
    invalid.receiptHash = hashCanonicalJsonV1(material);
    await expect(buildDevelopmentStage1BlindReviewPackV2({
      outputRoot: path.join(root, 'bad-artifact'), createdAt: '2026-08-16T01:00:00.000Z',
      cohortReceipt: invalid as unknown as DevelopmentCohortReceiptV2, stageOnePackets: packets,
    })).rejects.toThrow('ACCEPTED_ROW_INVALID');
  });
});

function packet(taskId: typeof taskIds[number], reference?: { referencePath: string; referenceBytes: Buffer }): HashedStagePacketV2 {
  const packetValue: ProviderStagePacketV2 = {
    packetVersion: 'EDITRON_OE_PROVIDER_STAGE_PACKET_V2', authority: 'RESEARCH_ONLY_NO_PROVIDER_DISPATCH_OR_PROJECT_MUTATION',
    stage: 1, stageName: 'TARGET_RECONSTRUCTION', taskId, conditionId: 'BASELINE',
    inputArm: reference ? 'REFERENCE_IMAGE_SEQUENCE_EVIDENCE' : 'TEXT_EVIDENCE_ONLY',
    executionFormArm: 'NOT_APPLICABLE_PRE_ROUTING', instructions: ['Reconstruct observable targets.'],
    stageBudget: { maxInputTokens: 1000, maxVisibleOutputTokens: 1000, maxReasoningTokens: 1000, maxWallClockMs: 1000, maxProviderCostUsd: 0.1 },
    modelInput: { originalRequest: `Review ${taskId}` },
    outputContract: { type: 'object', required: ['artifactType', 'taskId'], properties: { artifactType: { const: 'ReferenceBlueprintV2' }, taskId: { const: taskId } }, additionalProperties: false },
  };
  const transportAttachments = reference ? [{ assetId: `${taskId}-reference`, mimeType: 'image/png', artifactPath: reference.referencePath, artifactSha256: `sha256:${sha256(reference.referenceBytes)}`, bytes: reference.referenceBytes.byteLength, evidenceRole: 'ORDERED_REFERENCE_SAMPLE' as const, sequenceIndex: 0, timestampMilliseconds: 0 }] : [];
  return { packet: packetValue, packetHash: hashCanonicalJsonV1(packetValue), transportAttachments, transportHash: hashCanonicalJsonV1(transportAttachments) };
}

function cohortReceipt(packets: readonly HashedStagePacketV2[]): DevelopmentCohortReceiptV2 {
  const routes = ['OPENAI_LUNA', 'OPENAI_TERRA'].map((routeId) => ({
    routeId, claimedModelIdentity: routeId === 'OPENAI_LUNA' ? 'gpt-5.6-luna' : 'gpt-5.6-terra', costBasis: 'USD_METERED' as const,
    rows: packets.map((packetValue) => {
      const artifact = { artifactType: 'ReferenceBlueprintV2', taskId: packetValue.packet.taskId };
      return { taskId: packetValue.packet.taskId, stage: 1 as const, packetHash: packetValue.packetHash, transportDisposition: 'ARTIFACT_ACCEPTED' as const, providerRun: { runVersion: 'EDITRON_OE_PROVIDER_STAGE_RUN_V2', authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION', packetHash: packetValue.packetHash, disposition: 'ARTIFACT_ACCEPTED', artifact, attempts: [] }, evaluation: { disposition: 'HUMAN_REVIEW_REQUIRED' as const, diagnostics: [] } };
    }),
  }));
  const material = { receiptVersion: 'EDITRON_OE_DEVELOPMENT_COHORT_RECEIPT_V2' as const, authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION' as const, handoffMode: 'ISOLATED_COMPETENCY_WITH_EVALUATOR_APPROVED_CANONICAL_PRIOR' as const, tasks: packets.map((packetValue) => ({ taskId: packetValue.packet.taskId, conditionId: 'BASELINE', packetHashes: [{ stage: 1 as const, packetHash: packetValue.packetHash, transportHash: packetValue.transportHash }], canonicalHandoffHashes: { referenceBlueprint: 'a'.repeat(64), editorialIntent: 'b'.repeat(64), evidencePack: 'c'.repeat(64), evidenceBoundIntent: 'd'.repeat(64) }, mechanics: { taskId: packetValue.packet.taskId, authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION', stage4Disposition: 'PASS', stage5Disposition: 'PROCEED', stage6Disposition: 'PASS', stateEffects: [], evidenceRefs: [] }, mechanicsHash: 'e'.repeat(64) })), routes, actualProviderCostUsd: 0, providerCostCoverage: 'COMPLETE' as const, unpricedRouteIds: [], stage7Disposition: 'PENDING_REAL_HUMAN_REVIEW' as const, stateEffects: [] as const };
  return { ...material, receiptHash: hashCanonicalJsonV1(material) } as unknown as DevelopmentCohortReceiptV2;
}

async function filesUnder(root: string): Promise<string[]> { const result: string[] = []; for (const entry of await fs.readdir(root, { withFileTypes: true })) { const full = path.join(root, entry.name); if (entry.isDirectory()) result.push(...await filesUnder(full)); else result.push(full); } return result; }
function sha256(value: Uint8Array): string { return createHash('sha256').update(value).digest('hex'); }
type MutableReceipt = { receiptHash: string; routes: Array<{ rows: Array<{ providerRun: { artifact: Record<string, unknown> } }> }>; [key: string]: unknown };
