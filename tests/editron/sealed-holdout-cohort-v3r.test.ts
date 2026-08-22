import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  SEALED_HOLDOUT_OWNER_SEMANTIC_POLICY_V3R,
  sealedHoldoutOperatorCatalogIdentityV3R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-catalog-v3r';
import {
  assertSealedHoldoutCohortManifestV2R,
  buildSealedHoldoutCohortManifestV2R,
  SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-cohort-v2r';
import {
  assertSealedHoldoutCohortManifestV3R,
  buildSealedHoldoutCohortManifestV3R,
  SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V3R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-cohort-v3r';
import v2Identity
  from '@/tests/fixtures/editron/open-ended-planner-v2/sealed-holdout-cohort-identity-v2r.json';
import v3Identity
  from '@/tests/fixtures/editron/open-ended-planner-v3/sealed-holdout-cohort-identity-v3r.json';

type JsonRecord = Record<string, unknown>;

describe('sealed holdout cohort V3R identity', () => {
  it('derives a new immutable identity without rewriting the frozen V2 cohort', async () => {
    const base = await baseManifest();
    const baseBefore = hashCanonicalJsonV1(base);
    const manifest = await v3Manifest(base);

    expect(base.manifestSha256).toBe(v2Identity.manifestSha256);
    expect(hashCanonicalJsonV1(base)).toBe(baseBefore);
    expect(manifest.baseCohortIdentity).toMatchObject({
      version: base.version, manifestSha256: base.manifestSha256,
    });
    expect(manifest.operatorCatalogIdentity)
      .toEqual(sealedHoldoutOperatorCatalogIdentityV3R());
    expect(manifest.contractSource.sha256).toBe(v3Identity.contractSourceSha256);
    expect(manifest.manifestSha256).toBe(v3Identity.manifestSha256);
    expect(manifest.sharedModelContextSha256).toBe(v3Identity.sharedModelContextSha256);
    expect(manifest.operatorCatalogIdentity.catalogSha256)
      .toBe(v3Identity.operatorCatalogSha256);
    expect(manifest.baseCohortIdentity.manifestSha256).toBe(v3Identity.baseManifestSha256);
    expect(manifest.mediaIdentity.manifestSha256).toBe(v3Identity.mediaManifestSha256);
    expect(manifest.executionPolicy.dispatchAuthorized).toBe(v3Identity.dispatchAuthorized);
    expect(manifest.manifestSha256).not.toBe(base.manifestSha256);
    expect(manifest.cases).toHaveLength(16);
    expect(assertSealedHoldoutCohortManifestV3R(manifest)).toBe(manifest);
    expect(assertSealedHoldoutCohortManifestV2R(base)).toBe(base);
  });

  it('binds explicit source duration and measured HOLD-01 start-frame evidence', async () => {
    const manifest = await v3Manifest(await baseManifest());
    const h01 = manifest.cases.find(({ caseId }) => caseId === 'HOLD-01:C1');
    const publicCase = record(h01?.publicCase);
    const media = records(publicCase.media);
    const evidence = records(record(h01?.ownerOnly).evidence);
    const visual = evidence.find(({ kind }) => kind === 'VISUAL_WINDOWS');
    const timeline = evidence.find(({ kind }) => kind === 'TIMELINE');

    expect(media).toEqual(expect.arrayContaining([
      expect.objectContaining({ assetId: 'h01-clock', durationFrames: 300 }),
      expect.objectContaining({ assetId: 'h01-dial', durationFrames: 300 }),
    ]));
    expect(visual).toMatchObject({
      value: {
        outgoing: { searchRange: [80, 150], selectedAdjacentFrame: 149 },
        incoming: { searchRange: [30, 120], validStartFrameWindow: [30, 37] },
        matchMeasurement: {
          maximumNormalizedCenterDistance: 0.03,
          measuredEligibleStartFrames: [30, 31, 32, 33, 34, 35, 36],
        },
      },
    });

    const resolve = SEALED_HOLDOUT_OWNER_SEMANTIC_POLICY_V3R.resolveVisualEdit;
    expect(resolve?.({
      arguments: {
        projectId: 'oe-hold-01',
        intent: {
          query: 'align the adjacent circular forms',
          action: 'replace_with_matching_source_range',
        },
      },
      observations: [visual, timeline].filter(isRecord),
      evidenceRefs: ['E1', 'E2'],
      project: record(publicCase.project), media, currentProjectRevision: 'R9',
    })).toMatchObject({
      targetOperatorId: 'use_matching_footage',
      arguments: {
        assetId: 'h01-dial',
        targetRange: { startFrame: 150, endFrame: 300 },
        sourceRange: { startFrame: 30, endFrame: 180 },
      },
    });
  });

  it('keeps noisy HOLD-01 evidence honestly unresolved', async () => {
    const manifest = await v3Manifest(await baseManifest());
    const h01 = manifest.cases.find(({ caseId }) => caseId === 'HOLD-01:C2');
    const publicCase = record(h01?.publicCase);
    const evidence = records(record(h01?.ownerOnly).evidence);
    const resolve = SEALED_HOLDOUT_OWNER_SEMANTIC_POLICY_V3R.resolveVisualEdit;

    expect(() => resolve?.({
      arguments: {
        projectId: 'oe-hold-01',
        intent: {
          query: 'align the adjacent circular forms',
          action: 'replace_with_matching_source_range',
        },
      },
      observations: evidence,
      evidenceRefs: evidence.map(({ evidenceRef }) => String(evidenceRef)),
      project: record(publicCase.project), media: records(publicCase.media),
      currentProjectRevision: 'R9',
    })).toThrow('SEALED_V3_VISUAL_MATCH_EVIDENCE_UNVERIFIABLE');
  });

  it('rejects semantic tampering even after an attacker recomputes nested hashes', async () => {
    const manifest = await v3Manifest(await baseManifest());
    const forgedWindow = structuredClone(manifest) as any;
    const h01 = forgedWindow.cases.find((entry: any) => entry.caseId === 'HOLD-01:C1');
    const visual = h01.ownerOnly.evidence.find((entry: any) => entry.kind === 'VISUAL_WINDOWS');
    visual.value.incoming.validStartFrameWindow = [30, 120];
    h01.ownerOnlySha256 = hashCanonicalJsonV1(h01.ownerOnly);
    refreshManifestHash(forgedWindow);
    expect(() => assertSealedHoldoutCohortManifestV3R(forgedWindow))
      .toThrow('HOLDOUT_V3_H01_EVIDENCE_DRIFT');

    const forgedDuration = structuredClone(manifest) as any;
    const first = forgedDuration.cases[0];
    first.publicCase.media[0].durationFrames += 1;
    first.publicCaseSha256 = hashCanonicalJsonV1(first.publicCase);
    refreshManifestHash(forgedDuration);
    expect(() => assertSealedHoldoutCohortManifestV3R(forgedDuration))
      .toThrow('HOLDOUT_V3_MEDIA_DURATION_DRIFT:HOLD-01:C1');

    const forgedCatalog = structuredClone(manifest) as any;
    forgedCatalog.operatorCatalogIdentity.catalogSha256 = '0'.repeat(64);
    refreshManifestHash(forgedCatalog);
    expect(() => assertSealedHoldoutCohortManifestV3R(forgedCatalog))
      .toThrow('HOLDOUT_V3_COHORT_MANIFEST_DRIFT');

    const forgedLineage = structuredClone(manifest) as any;
    forgedLineage.baseCohortIdentity.manifestSha256 = '1'.repeat(64);
    refreshManifestHash(forgedLineage);
    expect(() => assertSealedHoldoutCohortManifestV3R(forgedLineage))
      .toThrow('HOLDOUT_V3_COHORT_MANIFEST_DRIFT');

    const forgedMediaBinding = structuredClone(manifest) as any;
    const mediaCase = forgedMediaBinding.cases[0];
    mediaCase.publicCase.media[0].durationBinding.mediaManifestSha256 = '2'.repeat(64);
    mediaCase.publicCaseSha256 = hashCanonicalJsonV1(mediaCase.publicCase);
    refreshManifestHash(forgedMediaBinding);
    expect(() => assertSealedHoldoutCohortManifestV3R(forgedMediaBinding))
      .toThrow('HOLDOUT_V3_MEDIA_DURATION_DRIFT:HOLD-01:C1');
  });
});

async function baseManifest() {
  return buildSealedHoldoutCohortManifestV2R(
    await fileSha(SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R),
  );
}

async function v3Manifest(baseManifestValue: Awaited<ReturnType<typeof baseManifest>>) {
  return buildSealedHoldoutCohortManifestV3R({
    contractSourceSha256: await fileSha(SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V3R),
    baseManifest: baseManifestValue,
  });
}

async function fileSha(filePath: string): Promise<string> {
  const bytes = await readFile(path.resolve(filePath));
  return createHash('sha256').update(bytes).digest('hex');
}

function refreshManifestHash(manifest: any): void {
  const { manifestSha256: _oldHash, ...material } = manifest;
  manifest.manifestSha256 = hashCanonicalJsonV1(material);
}

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}
function record(value: unknown): JsonRecord { return isRecord(value) ? value : {}; }
function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
