import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';

type JsonRecord = Record<string, unknown>;

export const SEALED_H03_TARGET_CONTRACT_VERSION_V3R =
  'EDITRON_OE_SEALED_H03_PUBLIC_TARGET_CONTRACT_V3R_1' as const;
export const SEALED_H03_REFERENCE_BLUEPRINT_ID_V3R =
  'HOLD-03-REFERENCE-BLUEPRINT-V3R-1' as const;

const material = {
  version: SEALED_H03_TARGET_CONTRACT_VERSION_V3R,
  authority: 'HASH_BOUND_REFERENCE_ANALYSIS_INPUT_NOT_EVALUATOR' as const,
  blueprintId: SEALED_H03_REFERENCE_BLUEPRINT_ID_V3R,
  referenceAsset: {
    assetId: 'h03-ref',
    disposition: 'EVIDENCE_ONLY_MUST_NOT_RENDER' as const,
  },
  protectedLiteralMaterial: {
    titleText: 'EVENT\nMOMENT',
    transferDisposition: 'COPY_EXACT_LITERAL' as const,
  },
  targetRange: { startFrame: 90, endFrame: 270 },
  allowedSourceAssetIds: ['h03-a', 'h03-b'] as const,
  layoutObservation: {
    panelCount: 6,
    geometry: 'ASYMMETRIC_NORMALIZED_BOUNDS' as const,
    gutters: true,
    panelBounds: [
      { left: 0.03, top: 0.03, width: 0.27, height: 0.39 },
      { left: 0.03, top: 0.60, width: 0.27, height: 0.37 },
      { left: 0.33, top: 0.03, width: 0.34, height: 0.29 },
      { left: 0.33, top: 0.60, width: 0.34, height: 0.37 },
      { left: 0.70, top: 0.03, width: 0.27, height: 0.39 },
      { left: 0.70, top: 0.60, width: 0.27, height: 0.37 },
    ],
    titleSafeBand: { left: 0.15, top: 0.43, width: 0.70, height: 0.14 },
  },
  motionObservation: {
    entryFrames: [0, 24],
    stableFrames: [24, 150],
    exitFrames: [150, 180],
    relationship: 'OPPOSED_HORIZONTAL_SIDES_AND_VERTICAL_CENTRE' as const,
  },
  typographyObservation: {
    alignment: 'CENTER' as const,
    fontAssetId: 'font-noto-sans-v27-regular',
  },
  continuityObservation: {
    preserveOutsideRange: true,
    returnBinding: { overlayId: 'ov-full', assetId: 'h03-a', sourceFrame: 270 },
  },
  proofRequirements: [
    'six filled asymmetric source panels',
    'protected title remains inside the measured safe band',
    'source panels do not enter the title footprint',
    'bounded entry and exit motion are visible',
    'frame 270 returns to the unchanged native source',
    'reference pixels are never rendered',
  ] as const,
};

// This is public reference-analysis evidence, not a hidden answer graph. The
// model still chooses the eligible operator and supplies the composition code.
export const SEALED_H03_PUBLIC_TARGET_CONTRACT_V3R = deepFreezeV1({
  ...material,
  contractSha256: hashCanonicalJsonV1(material),
});

export function assertSealedH03PublicTargetContractV3R(
  candidate: unknown,
): Readonly<JsonRecord> {
  if (hashCanonicalJsonV1(candidate) !== hashCanonicalJsonV1(
    SEALED_H03_PUBLIC_TARGET_CONTRACT_V3R,
  )) {
    throw new Error('SEALED_H03_PUBLIC_TARGET_CONTRACT_DRIFT');
  }
  return deepFreezeV1(candidate as JsonRecord);
}
