import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import reconciliationJson from '@/docs/editron/capability-census/editron-cap2-owner-reconciliation-media-audio-v1.json';
import inventoryJson from '@/docs/editron/capability-census/editron-cap2-source-surface-inventory-v1.json';
import {
  CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V4,
  getCap2CurrentTruthDomainEvidencePathsV4,
  hashNormalizedCap2SourceSnapshotV4,
} from '@/lib/editron/research/capability-census/cap2-current-truth-reissue-audit-v4';
import { parseCap2OwnerReconciliationArtifactV1 } from '@/lib/editron/research/capability-census/cap2-owner-reconciliation-contract-v1';
import { parseCap2SourceSurfaceInventoryV1 } from '@/lib/editron/research/capability-census/cap2-source-surface-contract-v1';

const REPOSITORY_ROOT = process.cwd();

function readSource(relativePath: string): string {
  return readFileSync(path.resolve(REPOSITORY_ROOT, relativePath), 'utf8');
}

function candidate(candidateId: string) {
  const artifact = parseCap2OwnerReconciliationArtifactV1(reconciliationJson);
  const result = artifact.candidates.find((entry) => entry.candidateId === candidateId);
  if (!result) throw new Error(`Missing media/audio reconciliation candidate ${candidateId}`);
  return result;
}

describe('CAP-2 media/audio/music/SFX owner reconciliation v1', () => {
  it('accepts the closed research artifact without claiming catalog completion', () => {
    const artifact = parseCap2OwnerReconciliationArtifactV1(reconciliationJson);
    expect(artifact.domain).toBe('MEDIA_AUDIO_MUSIC_SFX');
    expect(artifact.status).toBe('DOMAIN_RECONCILED_CATALOG_NOT_POPULATED');
    expect(artifact.candidates).toHaveLength(27);
    expect(artifact.candidates.map(({ candidateId }) => candidateId)).toEqual([
      'asset.inspect',
      'asset.list',
      'asset.resolve-placement',
      'asset.search',
      'audio.duck-bgm',
      'audio.find-moment',
      'audio.professional-mix',
      'audio.resolve-edit',
      'audio.sound-render',
      'audio.uploaded-assign',
      'media.source-identity',
      'media.upload',
      'music.analyze-conditioned-beats',
      'music.assign-background',
      'music.beat-sync',
      'music.five-track-analyze',
      'music.regenerate-bgm',
      'sfx.add',
      'sfx.atomic-form',
      'sfx.library-ingest',
      'sfx.library-search',
      'sfx.replace',
      'sfx.transition-place',
      'transcript.find-moment',
      'transcript.materialize',
      'transcript.resolve-edit',
      'transcript.resolve-sticker',
    ]);
  });

  it('binds all 23 current evidence files over immutable v1 history', () => {
    const artifact = parseCap2OwnerReconciliationArtifactV1(reconciliationJson);
    expect(artifact.sourceBinding.evidencePaths).toHaveLength(23);
    const binding = CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V4.domainBindings
      .find(({ domain }) => domain === 'MEDIA_AUDIO_MUSIC_SFX')!;
    expect(hashNormalizedCap2SourceSnapshotV4(
      getCap2CurrentTruthDomainEvidencePathsV4('MEDIA_AUDIO_MUSIC_SFX'),
    )).toBe(binding.normalizedEvidenceHash);
    expect(binding.reissueStatus).toBe('RECONCILED_CURRENT_TRUTH_V4');

    const refs = artifact.candidates.flatMap(({ evidenceRefs }) => evidenceRefs)
      .concat(artifact.domainConclusions.flatMap(({ evidenceRefs }) => evidenceRefs));
    for (const reference of refs) {
      expect(readSource(reference.path), `${reference.path}#${reference.symbol}`)
        .toContain(reference.symbol);
    }
  });

  it('retains every broad source observation as unresolved', () => {
    const artifact = parseCap2OwnerReconciliationArtifactV1(reconciliationJson);
    const inventory = parseCap2SourceSurfaceInventoryV1(inventoryJson);
    expect(artifact.sourceBinding.sourceSurfaceSnapshotHash)
      .toBe(inventory.sourceBinding.sourceSnapshotHash);
    expect(artifact.unresolvedSourceObservationIds).toEqual(inventory.unresolvedSourceIds);
  });

  it('advances only bounded read/resolver work and the one-CAS beat sync', () => {
    const artifact = parseCap2OwnerReconciliationArtifactV1(reconciliationJson);
    expect(artifact.candidates
      .filter(({ catalogDisposition }) => catalogDisposition === 'ATOMIC_CANDIDATE')
      .map(({ candidateId }) => candidateId)).toEqual([
      'asset.inspect',
      'asset.list',
      'asset.resolve-placement',
      'asset.search',
      'audio.find-moment',
      'audio.resolve-edit',
      'music.analyze-conditioned-beats',
      'music.beat-sync',
      'transcript.find-moment',
      'transcript.resolve-edit',
      'transcript.resolve-sticker',
    ]);
  });

  it('guards the measured beat path from the broken URL-as-buffer path', () => {
    expect(candidate('music.analyze-conditioned-beats').catalogDisposition).toBe('ATOMIC_CANDIDATE');
    expect(candidate('music.five-track-analyze').catalogDisposition).toBe('EXCLUDED_NON_CAPABILITY');
    expect(readSource('lib/editron/services/music-beat-grid.ts'))
      .toContain('Analyze the exact conditioned bytes');
    expect(readSource('lib/editron/services/five-track-analysis.ts'))
      .toContain('analyzeBeatsFull(audioUrl as any)');
  });

  it('keeps provider/storage/timeline workflows out of the atomic catalog', () => {
    for (const id of [
      'audio.uploaded-assign',
      'media.upload',
      'music.assign-background',
      'music.regenerate-bgm',
      'sfx.add',
      'sfx.library-ingest',
      'sfx.library-search',
      'sfx.replace',
      'sfx.transition-place',
      'transcript.materialize',
    ]) {
      expect(candidate(id).catalogDisposition).toBe('WRAPPER_ONLY');
    }
    expect(candidate('audio.duck-bgm').catalogDisposition).toBe('EXCLUDED_UNSAFE');
  });

  it('records missing source identity and professional mixing as blockers', () => {
    expect(candidate('media.source-identity').implementationStatus).toBe('MISSING');
    expect(candidate('audio.professional-mix').implementationStatus).toBe('MISSING');
    const mediaAssetSource = readSource('lib/editron/services/asset-resolver.ts');
    expect(mediaAssetSource).toContain('export interface MediaAsset');
    expect(mediaAssetSource).not.toContain('avg_frame_rate');
    expect(mediaAssetSource).not.toContain('color_primaries');
  });

  it('rejects false promotion, missing ownership and evidence-union drift', () => {
    const falseAtomic = structuredClone(reconciliationJson);
    falseAtomic.candidates.find(({ candidateId }) => candidateId === 'sfx.add')!
      .catalogDisposition = 'ATOMIC_CANDIDATE';
    expect(() => parseCap2OwnerReconciliationArtifactV1(falseAtomic)).toThrow();

    const missingOwner = structuredClone(reconciliationJson);
    missingOwner.candidates.find(({ candidateId }) => candidateId === 'music.beat-sync')!
      .chain.mutationOwners = [];
    expect(() => parseCap2OwnerReconciliationArtifactV1(missingOwner)).toThrow();

    const evidenceDrift = structuredClone(reconciliationJson);
    evidenceDrift.sourceBinding.evidencePaths.pop();
    expect(() => parseCap2OwnerReconciliationArtifactV1(evidenceDrift)).toThrow();
  });
});
