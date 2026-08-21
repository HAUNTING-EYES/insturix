import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { materializeHoldoutMediaV2R }
  from '@/lib/editron/research/open-ended-planner/holdout-media-materializer-v2r';
import {
  buildSealedHoldoutCohortManifestV2R,
  SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-cohort-v2r';
import { preflightSealedHoldoutCohortV2R }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-preflight-v2r';
import identityJson
  from '@/tests/fixtures/editron/open-ended-planner-v2/sealed-holdout-cohort-identity-v2r.json';

const scratchRoots: string[] = [];
const PREFLIGHT_SOURCE_PATH =
  'lib/editron/research/open-ended-planner/sealed-holdout-preflight-v2r.ts';
afterEach(async () => {
  for (const root of scratchRoots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function sourceSha(): Promise<string> {
  const bytes = await readFile(path.resolve(SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R));
  return createHash('sha256').update(bytes).digest('hex');
}

async function preflightSourceSha(): Promise<string> {
  const bytes = await readFile(path.resolve(PREFLIGHT_SOURCE_PATH));
  return createHash('sha256').update(bytes).digest('hex');
}

describe('sealed holdout cohort V2R', () => {
  it('freezes eight tasks, sixteen opaque cases, and one complete tool context', async () => {
    const manifest = buildSealedHoldoutCohortManifestV2R(await sourceSha());
    expect(manifest.manifestSha256).toBe(identityJson.manifestSha256);
    expect(manifest.contractSource.sha256).toBe(identityJson.contractSourceSha256);
    expect(await preflightSourceSha()).toBe(identityJson.preflightSourceSha256);
    expect(manifest.sharedModelContextSha256).toBe(identityJson.sharedModelContextSha256);
    expect(manifest.mediaIdentity.manifestSha256).toBe(identityJson.mediaManifestSha256);
    expect(manifest.cases).toHaveLength(16);
    expect(new Set(manifest.cases.map(({ caseId }) => caseId)).size).toBe(16);
    expect(new Set(manifest.cases.map(({ publicCase }) => publicCase.taskId)).size).toBe(8);
    expect(manifest.sharedModelContext).toMatchObject({
      callableOperatorIds: expect.arrayContaining(['cut_section', 'generated_composition_program']),
      unavailableOperatorIds: expect.arrayContaining(['search_stock_footage', 'add_transition']),
    });
    expect((manifest.sharedModelContext.operatorCatalog as { operators: unknown[] }).operators)
      .toHaveLength(40);
    const hold03 = manifest.cases.find(({ caseId }) => caseId === 'HOLD-03:C1');
    const hold03Evidence = (hold03?.ownerOnly as { evidence?: Array<Record<string, unknown>> }).evidence ?? [];
    expect(hold03Evidence.find(({ evidenceId }) => evidenceId === 'EV-H03-T1')).toMatchObject({
      value: {
        returnBinding: {
          overlayId: 'ov-full', assetId: 'h03-a', coordinateDomain: 'SOURCE_FRAME',
          sourceRange: [0, 420], sourceFrameAtReturn: 270, fit: 'cover', objectPosition: [0.5, 0.5],
        },
      },
    });
    expect(JSON.stringify(hold03?.publicCase)).not.toContain('returnBinding');
    for (const entry of manifest.cases) {
      const publicText = JSON.stringify(entry.publicCase);
      expect(publicText).not.toMatch(/BASELINE|WITHHELD|NOISY|REVISION-NOISY/);
      expect(publicText).not.toMatch(/evaluatorOnly|behaviourBrief|successPredicates|allowedDispositions|activePredicateIds/);
      expect(entry.publicCase.sharedModelContextSha256).toBe(manifest.sharedModelContextSha256);
      expect(entry.publicCaseSha256).toBe(hashCanonicalJsonV1(entry.publicCase));
    }
  });

  it('passes a no-network, no-inference preflight against exact materialized bytes', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'editron-sealed-holdout-'));
    scratchRoots.push(root);
    const mediaManifest = await materializeHoldoutMediaV2R(path.join(root, 'media'));
    const manifest = buildSealedHoldoutCohortManifestV2R(await sourceSha());
    const receipt = preflightSealedHoldoutCohortV2R({ manifest, mediaManifest });
    expect(receipt).toMatchObject({
      assessment: 'PASS_READY_FOR_CREDENTIAL_PREFLIGHT',
      taskCount: 8, caseCount: 16, operatorCount: 40,
      callableOperatorCount: 33, nonCallableOperatorCount: 7,
      networkCalls: 0, inferenceCalls: 0, projectReads: 0, projectMutations: 0,
      dispatchAuthorized: false,
    });
    expect(receipt.checks).toHaveLength(16);
    expect(receipt.checks.every(({ publicPrivateSeparation, sharedToolContextEqual }) =>
      publicPrivateSeparation === 'PASS' && sharedToolContextEqual === true)).toBe(true);
    expect(receipt.receiptSha256).toBe(identityJson.preflightReceiptSha256);
  }, 180_000);

  it('fails closed on public evaluator leakage and media-byte drift', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'editron-sealed-holdout-adversarial-'));
    scratchRoots.push(root);
    const mediaManifest = await materializeHoldoutMediaV2R(path.join(root, 'media'));
    const manifest = buildSealedHoldoutCohortManifestV2R(await sourceSha());
    const leaked = structuredClone(manifest) as any;
    leaked.cases[0].publicCase.evaluatorOnly = { expected: 'secret' };
    leaked.cases[0].publicCaseSha256 = hashCanonicalJsonV1(leaked.cases[0].publicCase);
    const { manifestSha256: _oldHash, ...leakedMaterial } = leaked;
    leaked.manifestSha256 = hashCanonicalJsonV1(leakedMaterial);
    expect(() => preflightSealedHoldoutCohortV2R({ manifest: leaked, mediaManifest }))
      .toThrow(/EVALUATOR_LEAK|Forbidden provider key/);
    const alteredMedia = structuredClone(mediaManifest) as any;
    alteredMedia.artifacts[0].artifactSha256 = `sha256:${'0'.repeat(64)}`;
    expect(() => preflightSealedHoldoutCohortV2R({ manifest, mediaManifest: alteredMedia }))
      .toThrow(/MEDIA_ARTIFACT_DRIFT/);
  }, 180_000);
});
