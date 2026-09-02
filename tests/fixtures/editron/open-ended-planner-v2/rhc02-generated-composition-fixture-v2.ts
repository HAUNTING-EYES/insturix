import {
  deepFreezeV1,
  hashCanonicalJsonV1,
} from '@/lib/editron/research/open-ended-planner/contracts-v1';
import type { GeneratedCompositionProgramV1 }
  from '@/lib/editron/research/open-ended-planner/generated-composition-program-v1';
import {
  assertStage25Rhc02PreviewMediaFixtureReceiptV2,
  type Stage25Rhc02PreviewMediaFixtureReceiptV2,
} from '@/lib/editron/research/open-ended-planner/stage25-rhc02-preview-media-fixture-v2';

import {
  RHC02_PREVIEW_ASSET_IDS_V1,
  type Rhc02PreviewFixtureIdentityV1,
} from './rhc02-preview-fixture-v1';
import {
  buildRhc02GeneratedCompositionFixtureV1,
} from './rhc02-generated-composition-fixture-v1';

export const RHC02_GENERATED_COMPOSITION_FIXTURE_VERSION_V2 =
  'EDITRON_OE_STAGE25_RHC02_GENERATED_COMPOSITION_FIXTURE_V2' as const;

export function buildRhc02PreviewIdentityFromMediaV2(
  media: Readonly<Stage25Rhc02PreviewMediaFixtureReceiptV2>,
): Readonly<Rhc02PreviewFixtureIdentityV1> {
  assertStage25Rhc02PreviewMediaFixtureReceiptV2(media);
  const assets = new Map(media.assets.map((asset) => [asset.assetId, asset]));
  const rights = new Map(media.provenance.map((receipt) => [receipt.assetId, receipt]));
  if (assets.size !== RHC02_PREVIEW_ASSET_IDS_V1.length
    || rights.size !== RHC02_PREVIEW_ASSET_IDS_V1.length
    || RHC02_PREVIEW_ASSET_IDS_V1.some((assetId) => (
      !assets.has(assetId) || !rights.has(assetId)
    ))) {
    fail('MEDIA_ASSET_SET_INVALID');
  }
  return deepFreezeV1({
    assetVersions: Object.fromEntries(RHC02_PREVIEW_ASSET_IDS_V1.map((assetId) => [
      assetId,
      `sha256:${required(assets.get(assetId)?.sha256, `ASSET_${assetId}`)}`,
    ])) as Rhc02PreviewFixtureIdentityV1['assetVersions'],
    rightsEvidenceVersions: Object.fromEntries(RHC02_PREVIEW_ASSET_IDS_V1.map((assetId) => [
      assetId,
      `sha256:${required(rights.get(assetId)?.receiptSha256, `RIGHTS_${assetId}`)}`,
    ])) as Rhc02PreviewFixtureIdentityV1['rightsEvidenceVersions'],
    fontVersion: `sha256:${media.font.sha256}`,
    fontFileSha256: media.font.sha256,
  });
}

export function buildRhc02GeneratedCompositionFixtureV2(
  media: Readonly<Stage25Rhc02PreviewMediaFixtureReceiptV2>,
) {
  assertStage25Rhc02PreviewMediaFixtureReceiptV2(media);
  const predecessor = buildRhc02GeneratedCompositionFixtureV1(
    buildRhc02PreviewIdentityFromMediaV2(media),
  );
  const evidencePack = structuredClone(predecessor.evidencePack) as {
    version: string;
    facts: Array<Record<string, unknown>>;
    proofRequirements: Array<Record<string, unknown>>;
  };
  const fontFact = evidencePack.facts.find(({ kind }) => kind === 'FONT_IDENTITY');
  if (!fontFact || fontFact.weight !== 700) fail('PREDECESSOR_FONT_FACT_INVALID');
  fontFact.weight = media.font.weight;
  evidencePack.version = RHC02_GENERATED_COMPOSITION_FIXTURE_VERSION_V2;
  evidencePack.facts.push({
    factId: 'rhc02-font-weight-correction',
    kind: 'FONT_METADATA_CORRECTION',
    mediaReceiptSha256: media.receiptSha256,
    predecessorMediaReceiptSha256: media.correction.predecessorReceiptSha256,
    metadataProofKind: media.fontMetadataProof.kind,
    os2TableSha256: media.fontMetadataProof.os2TableSha256,
    predecessorDeclaredWeight: media.correction.predecessorDeclaredWeight,
    correctedDeclaredWeight: media.correction.correctedDeclaredWeight,
  });
  const frozenEvidencePack = deepFreezeV1(evidencePack);
  const predecessorFont = predecessor.program.fontSlots[0];
  if (!predecessorFont || predecessorFont.weight !== 700) {
    fail('PREDECESSOR_PROGRAM_FONT_INVALID');
  }
  const program = deepFreezeV1({
    ...predecessor.program,
    programId: 'gcp-rhc02-hybrid-v2',
    projectBinding: {
      ...predecessor.program.projectBinding,
      evidencePackHash: hashCanonicalJsonV1(frozenEvidencePack),
    },
    fontSlots: predecessor.program.fontSlots.map((font) => ({
      ...font,
      weight: media.font.weight,
    })),
  } satisfies GeneratedCompositionProgramV1);
  const correction = deepFreezeV1({
    version: RHC02_GENERATED_COMPOSITION_FIXTURE_VERSION_V2,
    kind: 'FONT_METADATA_SUCCESSOR' as const,
    supersedes: {
      mediaFixtureVersion: media.correction.predecessorVersion,
      mediaReceiptSha256: media.correction.predecessorReceiptSha256,
      programId: predecessor.program.programId,
      programSha256: hashCanonicalJsonV1(predecessor.program),
    },
    successor: {
      mediaFixtureVersion: media.version,
      mediaReceiptSha256: media.receiptSha256,
      programId: program.programId,
      programSha256: hashCanonicalJsonV1(program),
    },
    invariant: 'BUNDLED_REGULAR_FONT_BYTES_ARE_DECLARED_AS_WEIGHT_400' as const,
  });
  return deepFreezeV1({
    ...predecessor,
    program,
    evidencePack: frozenEvidencePack,
    correction,
  });
}

function required(value: string | undefined, label: string): string {
  return value ?? fail(`${label}_MISSING`);
}

function fail(code: string): never {
  throw new Error(`RHC02_GENERATED_COMPOSITION_FIXTURE_V2_${code}`);
}
